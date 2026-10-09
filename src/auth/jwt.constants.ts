export const JWT_ISSUER = 'merchant-onboarding-api';
export const JWT_AUDIENCE = 'merchant-onboarding-api';

const secondsPerUnit = { s: 1, m: 60, h: 3600, d: 86400 } as const;

export function tokenExpirySeconds(
  value: string,
  maximumSeconds: number,
): number {
  const match = /^([1-9]\d*)([smhd])$/.exec(value);
  if (!match) {
    throw new Error('Token expiry must be a positive duration');
  }

  const unit = match[2] as keyof typeof secondsPerUnit;
  const seconds = Number(match[1]) * secondsPerUnit[unit];
  if (!Number.isSafeInteger(seconds) || seconds > maximumSeconds) {
    throw new Error('Token expiry exceeds the configured maximum');
  }
  return seconds;
}
