import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import {
  canEnterReview,
  canProcessRisk,
} from '../applications/application-policy';
import {
  ApplicationStatus,
  MerchantApplication,
  RiskStatus,
} from '../applications/application.entity';
import { FakeKybProvider } from './fake-kyb.provider';
import { RiskCheck } from './risk-check.entity';
import { RISK_MAX_ATTEMPTS, RiskJobData } from './risk-job';

export type RiskAttemptOutcome = 'done' | 'retry' | 'ignored';

@Injectable()
export class RiskProcessingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly provider: FakeKybProvider,
    private readonly audit: AuditService,
  ) {}

  async handle(data: RiskJobData): Promise<RiskAttemptOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(MerchantApplication)
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id: data.applicationId })
        .getOne();
      if (
        !application ||
        application.submissionVersion !== data.submissionVersion
      ) {
        return 'ignored';
      }
      const risk = await manager
        .getRepository(RiskCheck)
        .createQueryBuilder('risk')
        .setLock('pessimistic_write')
        .where('risk.application_id = :id', { id: data.applicationId })
        .andWhere('risk.submission_version = :version', {
          version: data.submissionVersion,
        })
        .getOne();
      if (!risk) throw new Error('Current risk check is missing');
      if (
        !canProcessRisk(
          application.submissionVersion,
          data.submissionVersion,
          application.applicationStatus,
          risk.status,
        )
      ) {
        return 'ignored';
      }
      if (risk.attemptCount >= RISK_MAX_ATTEMPTS) return 'retry';

      const now = new Date();
      const attempt = risk.attemptCount + 1;
      risk.attemptCount = attempt;
      risk.startedAt ??= now;
      const outcome = this.provider.evaluate(application.businessName, attempt);
      if (outcome.kind === 'failure') {
        if (attempt < RISK_MAX_ATTEMPTS) {
          risk.status = RiskStatus.PROCESSING;
          application.riskStatus = RiskStatus.PROCESSING;
          await manager.save(risk);
          await manager.save(application);
          return 'retry';
        }
        risk.status = RiskStatus.FAILED;
        risk.resultSummary = 'SIMULATED_PROVIDER_FAILURE';
      } else {
        risk.status = outcome.status;
        risk.resultSummary = outcome.summary;
      }
      risk.completedAt = now;
      application.riskStatus = risk.status;
      if (
        canEnterReview(
          application.applicationStatus,
          risk.status,
          application.assignedReviewerId,
        )
      ) {
        application.applicationStatus = ApplicationStatus.UNDER_REVIEW;
      }
      await manager.save(risk);
      await manager.save(application);
      await this.audit.record(manager, {
        actorUserId: null,
        action:
          risk.status === RiskStatus.FAILED
            ? AuditAction.RISK_FAILED
            : AuditAction.RISK_COMPLETED,
        applicationId: application.id,
        requestId: null,
        metadata: {
          submissionVersion: risk.submissionVersion,
          status: risk.status,
          attemptCount: risk.attemptCount,
        },
      });
      return outcome.kind === 'failure' ? 'retry' : 'done';
    });
  }

  async finalizeUnexpectedFailure(
    data: RiskJobData,
    attemptCount: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(MerchantApplication)
        .createQueryBuilder('application')
        .setLock('pessimistic_write')
        .where('application.id = :id', { id: data.applicationId })
        .getOne();
      if (
        !application ||
        application.submissionVersion !== data.submissionVersion
      ) {
        return;
      }
      const risk = await manager.getRepository(RiskCheck).findOneBy({
        applicationId: data.applicationId,
        submissionVersion: data.submissionVersion,
      });
      if (
        !risk ||
        !canProcessRisk(
          application.submissionVersion,
          data.submissionVersion,
          application.applicationStatus,
          risk.status,
        )
      ) {
        return;
      }
      risk.status = RiskStatus.FAILED;
      risk.resultSummary = 'WORKER_ATTEMPTS_EXHAUSTED';
      risk.attemptCount = Math.max(risk.attemptCount, attemptCount);
      risk.startedAt ??= new Date();
      risk.completedAt = new Date();
      application.riskStatus = RiskStatus.FAILED;
      if (
        canEnterReview(
          application.applicationStatus,
          risk.status,
          application.assignedReviewerId,
        )
      ) {
        application.applicationStatus = ApplicationStatus.UNDER_REVIEW;
      }
      await manager.save(risk);
      await manager.save(application);
      await this.audit.record(manager, {
        actorUserId: null,
        action: AuditAction.RISK_FAILED,
        applicationId: application.id,
        requestId: null,
        metadata: {
          submissionVersion: risk.submissionVersion,
          status: RiskStatus.FAILED,
          attemptCount: risk.attemptCount,
        },
      });
    });
  }
}
