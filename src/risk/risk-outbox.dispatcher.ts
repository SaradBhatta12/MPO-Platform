import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import {
  RiskJobData,
  MERCHANT_RISK_QUEUE,
  RISK_JOB_NAME,
  RISK_MAX_ATTEMPTS,
} from './risk-job';
import { RiskOutbox } from './risk-outbox.entity';

@Injectable()
export class RiskOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RiskOutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private currentRun: Promise<number> | null = null;

  constructor(
    @InjectQueue(MERCHANT_RISK_QUEUE)
    private readonly queue: Queue<RiskJobData>,
    @InjectRepository(RiskOutbox)
    private readonly outbox: Repository<RiskOutbox>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.config.getOrThrow<number>(
      'RISK_DISPATCH_INTERVAL_MS',
    );
    this.timer = setInterval(() => {
      void this.dispatchOnce().catch(() => {
        this.logger.warn('Risk outbox dispatch failed; retrying later');
      });
    }, interval);
    this.timer.unref();
    void this.dispatchOnce().catch(() => {
      this.logger.warn('Initial risk outbox dispatch failed; retrying later');
    });
  }

  async dispatchOnce(): Promise<number> {
    if (this.currentRun) return this.currentRun;
    const run = this.dispatchPending();
    this.currentRun = run;
    try {
      return await run;
    } finally {
      this.currentRun = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.currentRun) await this.currentRun.catch(() => undefined);
  }

  private async dispatchPending(): Promise<number> {
    const pending = await this.outbox.find({
      where: { dispatchedAt: IsNull() },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 25,
    });
    let count = 0;
    for (const event of pending) {
      await this.queue.add(
        RISK_JOB_NAME,
        {
          applicationId: event.applicationId,
          submissionVersion: event.submissionVersion,
        },
        {
          jobId: event.jobId,
          attempts: RISK_MAX_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: this.config.getOrThrow<number>('RISK_RETRY_DELAY_MS'),
          },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 5000 },
        },
      );
      await this.outbox.update(
        { id: event.id, dispatchedAt: IsNull() },
        { dispatchedAt: new Date() },
      );
      count += 1;
    }
    return count;
  }
}
