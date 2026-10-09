import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { configureApp } from '../src/app-setup';
import {
  ApplicationStatus,
  MerchantApplication,
  RiskStatus,
} from '../src/applications/application.entity';
import { ReviewDecision } from '../src/applications/review-decision.entity';
import { validateEnvironment } from '../src/config/environment';
import { typeOrmOptions } from '../src/database/typeorm-options';
import { User, UserRole } from '../src/users/user.entity';

const testDatabaseName = 'merchant_onboarding_test';
const fixtureId = randomUUID();
const testPassword = 'fictional-application-test-password-1234';
const fields = {
  businessName: 'Fictional Coffee',
  legalBusinessName: 'Fictional Coffee Pvt Ltd',
  businessType: 'PRIVATE_COMPANY',
  ownerName: 'Fictional Owner',
  contactEmail: 'owner@example.test',
  contactPhone: '+9779800000000',
  requestedMonthlyVolume: '1000',
  averageTransactionAmount: '12.50',
  currency: 'NPR',
};

type Actor = 'admin' | 'salesA' | 'salesB' | 'reviewerA' | 'reviewerB';

function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a response object');
  }
  return value as Record<string, unknown>;
}

function applicationId(value: unknown): string {
  const id = body(value).id;
  if (typeof id !== 'string') throw new Error('Expected application ID');
  return id;
}

describe('application lifecycle and authorization API', () => {
  let app: INestApplication;
  let server: App;
  let dataSource: DataSource;
  const users = {} as Record<Actor, User>;
  const tokens = {} as Record<Actor, string>;

  const auth = (actor: Actor): string => `Bearer ${tokens[actor]}`;

  async function create(
    actor: Actor = 'salesA',
  ): Promise<Record<string, unknown>> {
    const response = await request(server)
      .post('/applications')
      .set('Authorization', auth(actor))
      .send(fields)
      .expect(201);
    return body(response.body);
  }

  async function readyForReview(
    id: string,
    reviewer: Actor = 'reviewerA',
  ): Promise<void> {
    await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(200);
    // Part 4 will replace this database step with the BullMQ risk worker.
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id }, { riskStatus: RiskStatus.PASSED });
    await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users[reviewer].id })
      .expect(200);
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API integration tests cannot run in production');
    }
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_NAME = testDatabaseName;
    process.env.REDIS_DB = '1';
    process.env.AUTH_ORIGIN = 'http://localhost:3000';
    process.env.LOGIN_RATE_LIMIT_IP = '1000';
    process.env.LOGIN_RATE_LIMIT_EMAIL = '10';
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
    const passwordHash = await bcrypt.hash(testPassword, 12);
    const roles: Record<Actor, UserRole> = {
      admin: UserRole.ADMIN,
      salesA: UserRole.SALES,
      salesB: UserRole.SALES,
      reviewerA: UserRole.REVIEWER,
      reviewerB: UserRole.REVIEWER,
    };
    for (const actor of Object.keys(roles) as Actor[]) {
      users[actor] = await dataSource.getRepository(User).save({
        email: `${actor.toLowerCase()}.${fixtureId}@example.test`,
        passwordHash,
        role: roles[actor],
      });
    }

    const { AppModule } = await import('../src/app.module');
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;

    for (const actor of Object.keys(roles) as Actor[]) {
      const login = await request(server)
        .post('/auth/login')
        .send({ email: users[actor].email, password: testPassword })
        .expect(200);
      const token = body(login.body).accessToken;
      if (typeof token !== 'string') throw new Error('Expected access token');
      tokens[actor] = token;
    }
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      const userIds = Object.values(users).map((user) => user.id);
      if (userIds.length > 0) {
        const applications = await dataSource
          .getRepository(MerchantApplication)
          .findBy({ createdById: In(userIds) });
        const ids = applications.map((application) => application.id);
        if (ids.length > 0) {
          await dataSource
            .getRepository(ReviewDecision)
            .delete({ applicationId: In(ids) });
          await dataSource
            .getRepository(MerchantApplication)
            .delete({ id: In(ids) });
        }
        await dataSource.getRepository(User).delete({ id: In(userIds) });
      }
      await dataSource.destroy();
    }
  });

  it('requires authentication, validates fields, and creates a safe draft', async () => {
    await request(server).post('/applications').send(fields).expect(401);
    await request(server)
      .post('/applications')
      .set('Authorization', auth('reviewerA'))
      .send(fields)
      .expect(403);
    await request(server)
      .post('/applications')
      .set('Authorization', auth('salesA'))
      .send({ ...fields, createdById: users.salesB.id })
      .expect(400);
    await request(server)
      .post('/applications')
      .set('Authorization', auth('salesA'))
      .send({ ...fields, requestedMonthlyVolume: -1 })
      .expect(400);
    await request(server)
      .post('/applications')
      .set('Authorization', auth('salesA'))
      .send({ ...fields, currency: 'npr' })
      .expect(400);
    await request(server)
      .post('/applications')
      .set('Authorization', auth('salesA'))
      .send({ ...fields, businessName: '   ' })
      .expect(400);

    const draft = await create();
    expect(draft).toMatchObject({
      createdById: users.salesA.id,
      assignedReviewerId: null,
      applicationStatus: ApplicationStatus.DRAFT,
      riskStatus: RiskStatus.NOT_STARTED,
      submissionVersion: 0,
      requestedMonthlyVolume: '1000.00',
      averageTransactionAmount: '12.50',
    });
    expect(Object.keys(draft)).not.toContain('passwordHash');
  });

  it('filters every read and mutation by owner or assignment', async () => {
    const own = await create('salesA');
    const other = await create('salesB');
    const ownId = applicationId(own);
    const otherId = applicationId(other);

    await request(server)
      .get(`/applications/${otherId}`)
      .set('Authorization', auth('salesA'))
      .expect(404);
    await request(server)
      .patch(`/applications/${otherId}`)
      .set('Authorization', auth('salesA'))
      .send({ businessName: 'Unauthorized' })
      .expect(404);
    await request(server)
      .post(`/applications/${otherId}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(404);
    await request(server)
      .get(`/applications/${ownId}`)
      .set('Authorization', auth('reviewerA'))
      .expect(404);

    const salesList = await request(server)
      .get('/applications?status=DRAFT&pageSize=50')
      .set('Authorization', auth('salesA'))
      .expect(200);
    const salesItems = body(salesList.body).items;
    expect(Array.isArray(salesItems)).toBe(true);
    expect(JSON.stringify(salesItems)).toContain(ownId);
    expect(JSON.stringify(salesItems)).not.toContain(otherId);

    const reviewerList = await request(server)
      .get('/applications')
      .set('Authorization', auth('reviewerA'))
      .expect(200);
    expect(body(reviewerList.body).total).toBe(0);
    const adminGet = await request(server)
      .get(`/applications/${otherId}`)
      .set('Authorization', auth('admin'))
      .expect(200);
    expect(applicationId(adminGet.body)).toBe(otherId);
  });

  it('caps pagination and blocks server-managed fields and invalid transitions', async () => {
    const draft = await create();
    const id = applicationId(draft);
    await request(server)
      .get('/applications?pageSize=51')
      .set('Authorization', auth('salesA'))
      .expect(400);
    await request(server)
      .get('/applications?status=UNKNOWN')
      .set('Authorization', auth('salesA'))
      .expect(400);
    await request(server)
      .get('/applications?page=1000001')
      .set('Authorization', auth('salesA'))
      .expect(400);
    await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('salesA'))
      .send({ applicationStatus: 'APPROVED' })
      .expect(400);
    await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('salesA'))
      .send({})
      .expect(400);
    const updated = await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('admin'))
      .send({ requestedMonthlyVolume: '2000.5' })
      .expect(200);
    expect(body(updated.body).requestedMonthlyVolume).toBe('2000.50');

    const submitted = await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(200);
    expect(body(submitted.body)).toMatchObject({
      applicationStatus: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PENDING,
      submissionVersion: 1,
    });
    await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(409);
    await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('salesA'))
      .send({ businessName: 'Too late' })
      .expect(409);
  });

  it('paginates visible drafts in deterministic order', async () => {
    const first = await create('salesB');
    const second = await create('salesB');
    const firstPage = await request(server)
      .get('/applications?status=DRAFT&pageSize=1&page=1')
      .set('Authorization', auth('salesB'))
      .expect(200);
    const secondPage = await request(server)
      .get('/applications?status=DRAFT&pageSize=1&page=2')
      .set('Authorization', auth('salesB'))
      .expect(200);
    const itemsOne = body(firstPage.body).items;
    const itemsTwo = body(secondPage.body).items;
    if (!Array.isArray(itemsOne) || !Array.isArray(itemsTwo)) {
      throw new Error('Expected application lists');
    }
    expect(itemsOne).toHaveLength(1);
    expect(itemsTwo).toHaveLength(1);
    expect(applicationId(itemsOne[0])).toBe(applicationId(second));
    expect(applicationId(itemsTwo[0])).toBe(applicationId(first));
    expect(body(firstPage.body)).toMatchObject({ page: 1, pageSize: 1 });
  });

  it('restricts assignment and decisions to the correct roles and state', async () => {
    const draft = await create();
    const id = applicationId(draft);
    await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('salesA'))
      .send({ reviewerId: users.reviewerA.id })
      .expect(403);
    await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users.salesB.id })
      .expect(400);
    await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users.reviewerA.id })
      .expect(200);
    await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('reviewerA'))
      .send({ decision: 'APPROVED', reason: 'Premature' })
      .expect(409);
    await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(200);
    await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('reviewerA'))
      .send({ decision: 'APPROVED', reason: 'Risk pending' })
      .expect(409);
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id }, { riskStatus: RiskStatus.FLAGGED });
    const assigned = await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users.reviewerA.id })
      .expect(200);
    expect(body(assigned.body).applicationStatus).toBe(
      ApplicationStatus.UNDER_REVIEW,
    );
    await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('reviewerB'))
      .send({ decision: 'REJECTED', reason: 'Unassigned' })
      .expect(404);
    await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('admin'))
      .send({ decision: 'APPROVED', reason: 'Admin is not reviewer' })
      .expect(403);
    await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('salesA'))
      .send({ decision: 'APPROVED', reason: 'Sales cannot decide' })
      .expect(403);

    const decided = await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('reviewerA'))
      .send({ decision: 'APPROVED', reason: 'Manual review passed' })
      .expect(200);
    expect(body(decided.body).applicationStatus).toBe(
      ApplicationStatus.APPROVED,
    );
    expect(body(decided.body).reviewedAt).toEqual(expect.any(String));
    const decisions = await dataSource
      .getRepository(ReviewDecision)
      .findBy({ applicationId: id });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      reviewerId: users.reviewerA.id,
      decision: ApplicationStatus.APPROVED,
      applicationVersion: 1,
    });
    await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('admin'))
      .send({ businessName: 'Too late' })
      .expect(409);
    await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users.reviewerB.id })
      .expect(409);
  });

  it('allows editing and resubmission after an information request', async () => {
    const draft = await create();
    const id = applicationId(draft);
    await readyForReview(id);
    const requested = await request(server)
      .post(`/applications/${id}/decision`)
      .set('Authorization', auth('reviewerA'))
      .send({
        decision: 'INFO_REQUESTED',
        reason: 'More fictional detail needed',
      })
      .expect(200);
    expect(body(requested.body).applicationStatus).toBe(
      ApplicationStatus.INFO_REQUESTED,
    );
    await request(server)
      .patch(`/applications/${id}`)
      .set('Authorization', auth('salesA'))
      .send({ businessName: 'Fictional Coffee Updated' })
      .expect(200);
    const resubmitted = await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(200);
    expect(body(resubmitted.body)).toMatchObject({
      applicationStatus: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PENDING,
      submissionVersion: 2,
      reviewedAt: null,
      assignedReviewerId: users.reviewerA.id,
    });
  });

  it('treats an automated failure as a reviewable result, not rejection', async () => {
    const draft = await create();
    const id = applicationId(draft);
    await request(server)
      .post(`/applications/${id}/submit`)
      .set('Authorization', auth('salesA'))
      .expect(200);
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id }, { riskStatus: RiskStatus.FAILED });
    const assigned = await request(server)
      .patch(`/applications/${id}/assignment`)
      .set('Authorization', auth('admin'))
      .send({ reviewerId: users.reviewerA.id })
      .expect(200);
    expect(body(assigned.body)).toMatchObject({
      riskStatus: RiskStatus.FAILED,
      applicationStatus: ApplicationStatus.UNDER_REVIEW,
    });
  });

  it('serializes concurrent decisions and saves only one decision record', async () => {
    const draft = await create();
    const id = applicationId(draft);
    await readyForReview(id);
    const responses = await Promise.all([
      request(server)
        .post(`/applications/${id}/decision`)
        .set('Authorization', auth('reviewerA'))
        .send({ decision: 'APPROVED', reason: 'First fictional decision' }),
      request(server)
        .post(`/applications/${id}/decision`)
        .set('Authorization', auth('reviewerA'))
        .send({ decision: 'REJECTED', reason: 'Second fictional decision' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const decisions = await dataSource
      .getRepository(ReviewDecision)
      .findBy({ applicationId: id });
    expect(decisions).toHaveLength(1);
  });
});
