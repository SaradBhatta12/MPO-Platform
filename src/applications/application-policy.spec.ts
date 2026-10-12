import { SelectQueryBuilder } from 'typeorm';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from '../users/user.entity';
import {
  canEnterReview,
  canProcessRisk,
  canRecordDecision,
  canSubmit,
  isEditable,
  visibleTo,
} from './application-policy';
import {
  ApplicationStatus,
  MerchantApplication,
  RiskStatus,
} from './application.entity';

describe('application policy', () => {
  it('permits edits and resubmission only in editable states', () => {
    const editable = new Set([
      ApplicationStatus.DRAFT,
      ApplicationStatus.INFO_REQUESTED,
    ]);
    for (const status of Object.values(ApplicationStatus)) {
      expect(isEditable(status)).toBe(editable.has(status));
      expect(canSubmit(status, 1)).toBe(editable.has(status));
    }
    expect(canSubmit(ApplicationStatus.DRAFT, 2147483647)).toBe(false);
  });

  it('enters review only after a final risk result and reviewer assignment', () => {
    for (const risk of Object.values(RiskStatus)) {
      expect(
        canEnterReview(ApplicationStatus.SUBMITTED, risk, 'reviewer-id'),
      ).toBe(
        risk === RiskStatus.PASSED ||
          risk === RiskStatus.FLAGGED ||
          risk === RiskStatus.FAILED,
      );
      expect(canEnterReview(ApplicationStatus.SUBMITTED, risk, null)).toBe(
        false,
      );
    }
    expect(
      canEnterReview(
        ApplicationStatus.APPROVED,
        RiskStatus.PASSED,
        'reviewer-id',
      ),
    ).toBe(false);
    for (const status of Object.values(ApplicationStatus)) {
      expect(canRecordDecision(status)).toBe(
        status === ApplicationStatus.UNDER_REVIEW,
      );
    }
  });

  it('scopes SALES to owned applications and REVIEWER to assigned applications', () => {
    const actorId = 'fictional-actor-id';
    for (const [role, predicate] of [
      [UserRole.SALES, 'application.created_by_id = :actorId'],
      [UserRole.REVIEWER, 'application.assigned_reviewer_id = :actorId'],
    ] as const) {
      const andWhere = jest.fn().mockReturnThis();
      const query = {
        andWhere,
      } as unknown as SelectQueryBuilder<MerchantApplication>;
      const actor = { id: actorId, role } as UserResponseDto;
      expect(visibleTo(query, actor)).toBe(query);
      expect(andWhere).toHaveBeenCalledWith(predicate, { actorId });
    }

    const adminAndWhere = jest.fn().mockReturnThis();
    const adminQuery = {
      andWhere: adminAndWhere,
    } as unknown as SelectQueryBuilder<MerchantApplication>;
    expect(
      visibleTo(adminQuery, {
        id: actorId,
        role: UserRole.ADMIN,
      } as UserResponseDto),
    ).toBe(adminQuery);
    expect(adminAndWhere).not.toHaveBeenCalled();
  });

  it('ignores stale, completed, and terminal risk jobs', () => {
    expect(
      canProcessRisk(2, 2, ApplicationStatus.SUBMITTED, RiskStatus.PENDING),
    ).toBe(true);
    expect(
      canProcessRisk(
        2,
        2,
        ApplicationStatus.UNDER_REVIEW,
        RiskStatus.PROCESSING,
      ),
    ).toBe(true);
    expect(
      canProcessRisk(2, 1, ApplicationStatus.SUBMITTED, RiskStatus.PENDING),
    ).toBe(false);
    for (const status of [
      RiskStatus.PASSED,
      RiskStatus.FLAGGED,
      RiskStatus.FAILED,
    ]) {
      expect(canProcessRisk(2, 2, ApplicationStatus.SUBMITTED, status)).toBe(
        false,
      );
    }
    for (const status of [
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.INFO_REQUESTED,
    ]) {
      expect(canProcessRisk(2, 2, status, RiskStatus.PENDING)).toBe(false);
    }
  });
});
