export const MERCHANT_RISK_QUEUE = 'merchant-risk';
export const RISK_JOB_NAME = 'check';
export const RISK_MAX_ATTEMPTS = 3;

export interface RiskJobData {
  applicationId: string;
  submissionVersion: number;
}

// BullMQ custom IDs cannot contain ':'; the prefix also avoids numeric-only IDs.
export function riskJobId(applicationId: string, version: number): string {
  return `risk-${applicationId}-v${version}`;
}
