import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  RiskJobData,
  RISK_JOB_NAME,
  MERCHANT_RISK_QUEUE,
  RISK_MAX_ATTEMPTS,
  riskJobId,
} from './risk-job';
import { RiskProcessingService } from './risk-processing.service';

@Processor(MERCHANT_RISK_QUEUE, { concurrency: 4 })
export class RiskWorker extends WorkerHost {
  private readonly logger = new Logger(RiskWorker.name);

  constructor(private readonly processing: RiskProcessingService) {
    super();
  }

  async process(job: Job<RiskJobData>): Promise<void> {
    if (
      job.name !== RISK_JOB_NAME ||
      typeof job.data?.applicationId !== 'string' ||
      !Number.isSafeInteger(job.data.submissionVersion) ||
      job.data.submissionVersion < 1
    ) {
      throw new UnrecoverableError('Invalid risk job');
    }
    const outcome = await this.processing.handle(job.data);
    if (outcome === 'retry') {
      throw new Error('Simulated KYB check unavailable');
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobData> | undefined): Promise<void> {
    if (
      !job ||
      typeof job.data?.applicationId !== 'string' ||
      !Number.isSafeInteger(job.data.submissionVersion) ||
      job.id !==
        riskJobId(job.data.applicationId, job.data.submissionVersion) ||
      job.attemptsMade < RISK_MAX_ATTEMPTS
    ) {
      return;
    }
    try {
      await this.processing.finalizeUnexpectedFailure(
        job.data,
        job.attemptsMade,
      );
    } catch {
      this.logger.error('Could not persist final risk failure');
    }
  }
}
