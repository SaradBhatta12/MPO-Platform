import { RiskStatus } from '../applications/application.entity';
import { FakeKybProvider } from './fake-kyb.provider';

describe('FakeKybProvider', () => {
  const provider = new FakeKybProvider();

  it('maps fictional names to the documented results and retry behavior', () => {
    expect(provider.evaluate('Fictional Coffee', 1)).toMatchObject({
      kind: 'result',
      status: RiskStatus.PASSED,
    });
    expect(provider.evaluate('Fictional Flagged Shop', 1)).toMatchObject({
      kind: 'result',
      status: RiskStatus.FLAGGED,
    });
    expect(provider.evaluate('Fictional Transient Shop', 1)).toEqual({
      kind: 'failure',
    });
    expect(provider.evaluate('Fictional Transient Shop', 2)).toMatchObject({
      kind: 'result',
      status: RiskStatus.PASSED,
    });
    for (const attempt of [1, 2, 3]) {
      expect(provider.evaluate('Fictional Permanent Shop', attempt)).toEqual({
        kind: 'failure',
      });
    }
  });
});
