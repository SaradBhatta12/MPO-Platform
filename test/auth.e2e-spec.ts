import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/app-setup';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { validateEnvironment } from '../src/config/environment';
import { typeOrmOptions } from '../src/database/typeorm-options';
import { User, UserRole } from '../src/users/user.entity';

const testDatabaseName = 'merchant_onboarding_test';
const testEmail = `auth.${randomUUID()}@example.test`;
const unknownEmail = `unknown.${randomUUID()}@example.test`;
const testPassword = 'fictional-integration-password-1234';
const registrationEmail = `registration.${randomUUID()}@example.test`;
const registrationPassword = 'fictional-registration-password-1234';
const boundaryEmail = `boundary.${randomUUID()}@example.test`;
const boundaryPassword = 'a'.repeat(72);

function responseBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object response');
  }
  return value as Record<string, unknown>;
}

function accessToken(value: unknown): string {
  const token = responseBody(value).accessToken;
  if (typeof token !== 'string') {
    throw new Error('Expected an access token');
  }
  return token;
}

function refreshCookie(values: string[] | undefined): {
  pair: string;
  header: string;
} {
  const header = values?.find((value) => value.startsWith('merchant_refresh='));
  if (!header) throw new Error('Expected a refresh cookie');
  return { pair: header.split(';')[0], header };
}

describe('authentication API', () => {
  let app: INestApplication;
  let server: App;
  let dataSource: DataSource;
  let userId: string;

  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API integration tests cannot run in production');
    }
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_NAME = testDatabaseName;
    process.env.REDIS_DB = '1';
    process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';
    process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
    process.env.AUTH_ORIGIN = 'http://localhost:3000';
    process.env.LOGIN_RATE_LIMIT_IP = '1000';
    process.env.LOGIN_RATE_LIMIT_EMAIL = '10';
    process.env.REGISTER_RATE_LIMIT_IP = '1000';
    process.env.REGISTER_RATE_LIMIT_EMAIL = '3';
    process.env.REFRESH_RATE_LIMIT_IP = '1000';
    const environment = validateEnvironment(process.env);

    const admin = new DataSource({
      ...typeOrmOptions({ ...environment, DATABASE_NAME: 'postgres' }),
      entities: [],
      migrations: [],
    });
    await admin.initialize();
    try {
      const rows = await admin.query<unknown[]>(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [testDatabaseName],
      );
      if (rows.length === 0) {
        await admin.query('CREATE DATABASE "merchant_onboarding_test"');
      }
    } finally {
      await admin.destroy();
    }

    dataSource = new DataSource(typeOrmOptions(environment));
    await dataSource.initialize();
    await dataSource.runMigrations();
    const users = dataSource.getRepository(User);
    await users.upsert(
      {
        email: testEmail,
        role: UserRole.SALES,
        passwordHash: await bcrypt.hash(testPassword, 12),
      },
      ['email'],
    );
    const user = await users.findOneByOrFail({ email: testEmail });
    userId = user.id;

    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.getRepository(User).delete({ email: testEmail });
      await dataSource.getRepository(User).delete({ email: registrationEmail });
      await dataSource.getRepository(User).delete({ email: boundaryEmail });
      await dataSource.destroy();
    }
  });

  it('registers a SALES account without issuing tokens', async () => {
    const response = await request(server)
      .post('/auth/register')
      .send({
        email: registrationEmail.toUpperCase(),
        password: registrationPassword,
      })
      .expect(201);

    expect(response.body).toEqual({
      message: 'Account created. You can sign in now.',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');

    const user = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: registrationEmail })
      .getOneOrFail();
    expect(user.role).toBe(UserRole.SALES);
    expect(user.passwordHash).not.toBe(registrationPassword);
    expect(await bcrypt.compare(registrationPassword, user.passwordHash)).toBe(
      true,
    );

    const login = await request(server)
      .post('/auth/login')
      .send({ email: registrationEmail, password: registrationPassword })
      .expect(200);
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken(login.body)}`)
      .expect(200);
    expect(responseBody(me.body)).toMatchObject({
      email: registrationEmail,
      role: UserRole.SALES,
    });
  });

  it('reports an existing account without changing its password', async () => {
    const before = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: registrationEmail })
      .getOneOrFail();
    const response = await request(server)
      .post('/auth/register')
      .send({
        email: registrationEmail.toUpperCase(),
        password: 'another-fictional-password-1234',
      })
      .expect(409);
    expect(responseBody(response.body).message).toBe(
      'Email already registered',
    );
    const after = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: registrationEmail })
      .getOneOrFail();
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).toBe(before.passwordHash);
    await request(server)
      .post('/auth/login')
      .send({ email: registrationEmail, password: registrationPassword })
      .expect(200);
    await request(server)
      .post('/auth/login')
      .send({
        email: registrationEmail,
        password: 'another-fictional-password-1234',
      })
      .expect(401);
    await request(server)
      .post('/auth/register')
      .send({ email: testEmail, password: registrationPassword })
      .expect(409);
  });

  it('rejects role injection, weak passwords, and passwords exceeding bcrypt input', async () => {
    await request(server)
      .post('/auth/register')
      .send({
        email: `admin-attempt.${randomUUID()}@example.test`,
        password: registrationPassword,
        role: UserRole.ADMIN,
      })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ email: registrationEmail, password: 'too-short' })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ email: registrationEmail, password: 'x'.repeat(73) })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ email: registrationEmail, password: 'é'.repeat(40) })
      .expect(400);
  });

  it('requires trusted browser origins and JSON registration bodies', async () => {
    await request(server)
      .post('/auth/register')
      .set('Origin', 'https://attacker.example.test')
      .send({ email: registrationEmail, password: registrationPassword })
      .expect(403);
    await request(server)
      .post('/auth/register')
      .type('form')
      .send({ email: registrationEmail, password: registrationPassword })
      .expect(415);
  });

  it('limits repeated registration attempts for one email', async () => {
    const target = `registration-limit.${randomUUID()}@example.test`;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(server)
          .post('/auth/register')
          .send({ email: target, password: registrationPassword })
          .expect(attempt === 0 ? 201 : 409);
      }
      await request(server)
        .post('/auth/register')
        .send({ email: target, password: registrationPassword })
        .expect(429);
    } finally {
      await dataSource.getRepository(User).delete({ email: target });
    }
  }, 15000);

  it('logs in and returns only safe user fields', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail.toUpperCase(), password: testPassword })
      .expect(200);

    const loginBody = responseBody(login.body);
    expect(typeof loginBody.accessToken).toBe('string');
    expect(loginBody.tokenType).toBe('Bearer');
    expect(loginBody.expiresInSeconds).toBe(900);
    expect(Object.keys(loginBody).sort()).toEqual(
      ['accessToken', 'expiresInSeconds', 'tokenType'].sort(),
    );

    const payload = await app
      .get(JwtService)
      .verifyAsync<{ sub: string; sid: string; iat: number; exp: number }>(
        accessToken(login.body),
      );
    expect(payload.sub).toBe(userId);
    expect(payload.sid).toEqual(expect.any(String));
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload).not.toHaveProperty('role');

    const cookie = refreshCookie(login.headers['set-cookie']);
    expect(cookie.header).toContain('HttpOnly');
    expect(cookie.header).toContain('SameSite=Strict');
    expect(cookie.header).toContain('Path=/auth');
    const rawRefreshToken = cookie.pair.split('=')[1];
    const stored = await dataSource.getRepository(RefreshToken).findOneBy({
      tokenHash: createHash('sha256').update(rawRefreshToken).digest('hex'),
    });
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(rawRefreshToken);

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken(login.body)}`)
      .expect(200);

    const meBody = responseBody(me.body);
    expect(meBody).toMatchObject({
      id: userId,
      email: testEmail,
      role: UserRole.SALES,
    });
    expect(Object.keys(meBody).sort()).toEqual(
      ['createdAt', 'email', 'id', 'role', 'updatedAt'].sort(),
    );
  });

  it('uses the same error for unknown email and wrong password', async () => {
    const unknown = await request(server)
      .post('/auth/login')
      .send({ email: unknownEmail, password: testPassword })
      .expect(401);
    const wrongPassword = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: 'wrong-password' })
      .expect(401);

    expect(responseBody(unknown.body).message).toBe('Invalid credentials');
    expect(responseBody(wrongPassword.body).message).toBe(
      'Invalid credentials',
    );
  });

  it('rejects a suffix beyond the bcrypt input limit', async () => {
    await dataSource.getRepository(User).insert({
      email: boundaryEmail,
      role: UserRole.SALES,
      passwordHash: await bcrypt.hash(boundaryPassword, 12),
    });
    await request(server)
      .post('/auth/login')
      .send({ email: boundaryEmail, password: boundaryPassword })
      .expect(200);
    const extended = await request(server)
      .post('/auth/login')
      .send({ email: boundaryEmail, password: `${boundaryPassword}extra` })
      .expect(401);
    expect(responseBody(extended.body).message).toBe('Invalid credentials');
  });

  it('sets safe response headers for success and errors', async () => {
    for (const response of [
      await request(server).get('/health').expect(200),
      await request(server).get('/auth/me').expect(401),
    ]) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers.etag).toBeUndefined();
    }
  });

  it('rejects unknown login fields and missing or invalid tokens', async () => {
    await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword, role: 'ADMIN' })
      .expect(400);
    await request(server).get('/auth/me').expect(401);
    await request(server)
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    const payload = await app
      .get(JwtService)
      .verifyAsync<{ sid: string }>(accessToken(login.body));
    const expired = await app
      .get(JwtService)
      .signAsync({ sub: userId, sid: payload.sid }, { expiresIn: -1 });
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('uses the current database role after a token is issued', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    const token = accessToken(login.body);

    await dataSource
      .getRepository(User)
      .update({ id: userId }, { role: UserRole.REVIEWER });
    try {
      const me = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(responseBody(me.body).role).toBe(UserRole.REVIEWER);
    } finally {
      await dataSource
        .getRepository(User)
        .update({ id: userId }, { role: UserRole.SALES });
    }
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    const original = refreshCookie(login.headers['set-cookie']);

    const refreshed = await request(server)
      .post('/auth/refresh')
      .set('Cookie', original.pair)
      .expect(200);
    const replacement = refreshCookie(refreshed.headers['set-cookie']);
    expect(replacement.pair).not.toBe(original.pair);

    const newAccessToken = accessToken(refreshed.body);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`)
      .expect(200);

    await request(server)
      .post('/auth/refresh')
      .set('Cookie', original.pair)
      .expect(401);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${newAccessToken}`)
      .expect(401);
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', replacement.pair)
      .expect(401);
  });

  it('revokes access immediately on logout', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    const cookie = refreshCookie(login.headers['set-cookie']);
    const token = accessToken(login.body);

    const logout = await request(server)
      .post('/auth/logout')
      .set('Cookie', cookie.pair)
      .expect(204);
    expect(refreshCookie(logout.headers['set-cookie']).header).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookie.pair)
      .expect(401);
  });

  it('allows only one concurrent rotation', async () => {
    const login = await request(server)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);
    const cookie = refreshCookie(login.headers['set-cookie']);

    const responses = await Promise.all([
      request(server).post('/auth/refresh').set('Cookie', cookie.pair),
      request(server).post('/auth/refresh').set('Cookie', cookie.pair),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const winner = responses.find((response) => response.status === 200);
    if (!winner) throw new Error('Expected one successful refresh');
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken(winner.body)}`)
      .expect(401);
  });

  it('rejects untrusted origins and missing refresh cookies', async () => {
    await request(server)
      .post('/auth/login')
      .set('Origin', 'https://attacker.example.test')
      .send({ email: testEmail, password: testPassword })
      .expect(403);
    await request(server)
      .post('/auth/refresh')
      .set('Sec-Fetch-Site', 'same-site')
      .expect(403);
    await request(server).post('/auth/refresh').expect(401);
    await request(server)
      .post('/auth/login')
      .type('form')
      .send({ email: testEmail, password: testPassword })
      .expect(415);
  });

  it('limits repeated login attempts for one email', async () => {
    const target = `throttle.${randomUUID()}@example.test`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(server)
        .post('/auth/login')
        .send({ email: target, password: testPassword })
        .expect(401);
    }
    await request(server)
      .post('/auth/login')
      .send({ email: target, password: testPassword })
      .expect(429);
  }, 15000);
});
