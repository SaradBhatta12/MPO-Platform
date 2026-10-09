import { Injectable } from '@nestjs/common';
import { RiskStatus } from '../applications/application.entity';

export type FakeKybResult =
  | {
      kind: 'result';
      status: RiskStatus.PASSED | RiskStatus.FLAGGED;
      summary: string;
    }
  | { kind: 'failure' };

@Injectable()
export class FakeKybProvider {
  evaluate(businessName: string, attempt: number): FakeKybResult {
    const name = businessName.trim().toLowerCase();
    if (name.startsWith('fictional permanent')) return { kind: 'failure' };
    if (name.startsWith('fictional transient') && attempt === 1) {
      return { kind: 'failure' };
    }
    if (name.startsWith('fictional flag')) {
      return {
        kind: 'result',
        status: RiskStatus.FLAGGED,
        summary: 'SIMULATED_MANUAL_REVIEW',
      };
    }
    return {
      kind: 'result',
      status: RiskStatus.PASSED,
      summary: 'SIMULATED_CLEAR',
    };
  }
}
