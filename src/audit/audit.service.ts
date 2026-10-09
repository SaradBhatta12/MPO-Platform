import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditMetadata, AuditEvent } from './audit-event.entity';

export const SAFE_APPLICATION_FIELD_NAMES = new Set([
  'businessName',
  'legalBusinessName',
  'businessType',
  'ownerName',
  'contactEmail',
  'contactPhone',
  'requestedMonthlyVolume',
  'averageTransactionAmount',
  'currency',
]);

const METADATA_KEYS: Record<AuditAction, readonly string[]> = {
  [AuditAction.APPLICATION_CREATED]: ['status'],
  [AuditAction.APPLICATION_UPDATED]: ['fields'],
  [AuditAction.APPLICATION_SUBMITTED]: ['submissionVersion'],
  [AuditAction.REVIEWER_ASSIGNED]: ['reviewerId', 'reassigned'],
  [AuditAction.RISK_COMPLETED]: ['submissionVersion', 'status', 'attemptCount'],
  [AuditAction.RISK_FAILED]: ['submissionVersion', 'status', 'attemptCount'],
  [AuditAction.REVIEW_DECIDED]: ['decision', 'submissionVersion'],
};

function positiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validMetadata(action: AuditAction, metadata: AuditMetadata): boolean {
  const expected = METADATA_KEYS[action];
  if (!expected || !metadata || typeof metadata !== 'object') return false;
  const actual = Object.keys(metadata);
  if (
    actual.length !== expected.length ||
    actual.some((key) => !expected.includes(key))
  ) {
    return false;
  }

  switch (action) {
    case AuditAction.APPLICATION_CREATED:
      return metadata.status === 'DRAFT';
    case AuditAction.APPLICATION_UPDATED:
      return (
        Array.isArray(metadata.fields) &&
        metadata.fields.every(
          (field) =>
            typeof field === 'string' &&
            SAFE_APPLICATION_FIELD_NAMES.has(field),
        )
      );
    case AuditAction.APPLICATION_SUBMITTED:
      return positiveInteger(metadata.submissionVersion);
    case AuditAction.REVIEWER_ASSIGNED:
      return (
        typeof metadata.reviewerId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          metadata.reviewerId,
        ) &&
        typeof metadata.reassigned === 'boolean'
      );
    case AuditAction.RISK_COMPLETED:
      return (
        positiveInteger(metadata.submissionVersion) &&
        positiveInteger(metadata.attemptCount) &&
        (metadata.status === 'PASSED' || metadata.status === 'FLAGGED')
      );
    case AuditAction.RISK_FAILED:
      return (
        positiveInteger(metadata.submissionVersion) &&
        positiveInteger(metadata.attemptCount) &&
        metadata.status === 'FAILED'
      );
    case AuditAction.REVIEW_DECIDED:
      return (
        positiveInteger(metadata.submissionVersion) &&
        (metadata.decision === 'APPROVED' ||
          metadata.decision === 'REJECTED' ||
          metadata.decision === 'INFO_REQUESTED')
      );
  }
}

export interface AuditInput {
  actorUserId: string | null;
  action: AuditAction;
  applicationId: string;
  requestId: string | null;
  metadata: AuditMetadata;
}

@Injectable()
export class AuditService {
  async record(manager: EntityManager, event: AuditInput): Promise<void> {
    if (!validMetadata(event.action, event.metadata)) {
      throw new Error('Invalid audit metadata');
    }
    await manager.insert(AuditEvent, event);
  }
}
