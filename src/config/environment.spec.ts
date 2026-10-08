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
  });
});
