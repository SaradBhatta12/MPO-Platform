import { SelectQueryBuilder } from 'typeorm';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/user.entity';
import {
  ApplicationStatus,
  MerchantApplication,
  RiskStatus,
} from './application.entity';

const MAX_SUBMISSION_VERSION = 2147483647;

export function visibleTo(
  query: SelectQueryBuilder<MerchantApplication>,
  actor: UserResponseDto,
): SelectQueryBuilder<MerchantApplication> {
  if (actor.role === UserRole.SALES) {
    return query.andWhere('application.created_by_id = :actorId', {
      actorId: actor.id,
    });
  }
  if (actor.role === UserRole.REVIEWER) {
    return query.andWhere('application.assigned_reviewer_id = :actorId', {
      actorId: actor.id,
    });
  }
  return query;
}

export function isEditable(status: ApplicationStatus): boolean {
  return (
    status === ApplicationStatus.DRAFT ||
    status === ApplicationStatus.INFO_REQUESTED
  );
}

export function canSubmit(
  status: ApplicationStatus,
  submissionVersion: number,
): boolean {
  return isEditable(status) && submissionVersion < MAX_SUBMISSION_VERSION;
}

export function isFinalRiskStatus(status: RiskStatus): boolean {
  return (
    status === RiskStatus.PASSED ||
    status === RiskStatus.FLAGGED ||
    status === RiskStatus.FAILED
  );
}

export function canEnterReview(
  status: ApplicationStatus,
  riskStatus: RiskStatus,
  assignedReviewerId: string | null,
): boolean {
  return (
    status === ApplicationStatus.SUBMITTED &&
    assignedReviewerId !== null &&
    isFinalRiskStatus(riskStatus)
  );
}

export function canRecordDecision(status: ApplicationStatus): boolean {
  return status === ApplicationStatus.UNDER_REVIEW;
}

export function canProcessRisk(
  applicationVersion: number,
  jobVersion: number,
  applicationStatus: ApplicationStatus,
  riskStatus: RiskStatus,
): boolean {
  return (
    applicationVersion === jobVersion &&
    (applicationStatus === ApplicationStatus.SUBMITTED ||
      applicationStatus === ApplicationStatus.UNDER_REVIEW) &&
    !isFinalRiskStatus(riskStatus)
  );
}
