import { validateEnvironment } from './environment';

const validValues = {
  DATABASE_PASSWORD: 'fictional-local-database-password',
  JWT_SECRET: 'fictional-local-jwt-secret-with-adequate-length',
};

describe('environment validation', () => {
  it('accepts required credentials and applies local defaults', () => {
    const environment = validateEnvironment(validValues);
    expect(environment.PORT).toBe(3000);
    expect(environment.DATABASE_PORT).toBe(5432);
    expect(environment.ACCESS_TOKEN_EXPIRES_IN).toBe('15m');
    expect(environment.REFRESH_TOKEN_EXPIRES_IN).toBe('7d');
  });

  it('rejects missing secrets and invalid ports without printing values', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Invalid environment configuration: DATABASE_PASSWORD, JWT_SECRET',
    );
    expect(() =>
      validateEnvironment({ ...validValues, REDIS_PORT: 'not-a-port' }),
    ).toThrow('Invalid environment configuration: REDIS_PORT');
    expect(() =>
      validateEnvironment({
        ...validValues,
        JWT_SECRET: 'replace-with-a-random-secret-at-least-32-characters',
      }),
    ).toThrow('Invalid environment configuration: JWT_SECRET');
    expect(() =>
      validateEnvironment({ ...validValues, NODE_ENV: 'production' }),
    ).toThrow('Invalid environment configuration: AUTH_ORIGIN');
  });
});
