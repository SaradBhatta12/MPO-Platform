# Merchant onboarding API

Private NestJS backend for merchant applications and risk review. **Parts 1 and 2 are implemented:** the technology foundation, fictional users, and session-backed access and refresh tokens. Application workflows, risk processing, and audit behavior are planned for Parts 3–4; the final test and submission review is Part 5. No frontend or payment processing is in scope.

## Architecture

NestJS controllers handle HTTP, services will own business rules, and TypeORM repositories persist data in PostgreSQL. Redis and BullMQ provide the `merchant-risk` queue. The planned application submission flow will write the application and an outbox row in one PostgreSQL transaction; a dispatcher will enqueue the risk job. The API container runs migrations before accepting traffic. `/health` checks PostgreSQL and Redis.

Planned relationships:

| Relationship | Meaning |
| --- | --- |
| User → applications (`createdById`) | One SALES user creates many applications |
| User → applications (`assignedReviewerId`) | One REVIEWER may be assigned many applications |
| Application → risk checks | One record per submission version |
| Application → decisions | Review history for an application |
| Application → audit events | Trace of changes and decisions |
| Application → outbox events | Durable pending queue dispatches |

The implemented authentication relationships are `User → auth sessions → refresh tokens`. The explicit migrations create these tables and indexes. TypeORM schema synchronization is disabled.

## Planned permissions

| Action | ADMIN | SALES | REVIEWER |
| --- | --- | --- | --- |
| Create application | Yes | Yes | No |
| List and view | All | Own | Assigned |
| Edit and submit | All eligible | Own eligible | No |
| Assign reviewer | Yes | No | No |
| Record decision | No | No | Assigned only |

An ADMIN account is not a REVIEWER, so it cannot record a decision under the assigned-reviewer rule.

## Planned application transitions

| From | To | Trigger / condition |
| --- | --- | --- |
| New | DRAFT | Create application |
| DRAFT | SUBMITTED | Submit; start a new risk version |
| INFO_REQUESTED | SUBMITTED | Resubmit; start a new risk version |
| SUBMITTED | UNDER_REVIEW | Reviewer assigned and current risk check finished |
| UNDER_REVIEW | INFO_REQUESTED | Assigned reviewer requests information |
| UNDER_REVIEW | APPROVED | Assigned reviewer approves |
| UNDER_REVIEW | REJECTED | Assigned reviewer rejects |

`DRAFT` and `INFO_REQUESTED` allow merchant detail edits. `APPROVED` and `REJECTED` are terminal. A final automated `FAILED` risk result indicates the check could not complete; it is not a merchant rejection. `FLAGGED` requires manual attention.

## Setup

Use Node.js 22 and npm. The container image uses Node 22; `.nvmrc` selects the same major for local development. Selected package versions include `@nestjs/core` 11.2.7, `@nestjs/typeorm` 11.0.3, TypeORM 0.3.31, `@nestjs/bullmq` 11.0.5, BullMQ 5.81.5, `pg` 8.23.1, `@nestjs/swagger` 11.4.7, and bcrypt 6.0.0. Exact resolved versions for every dependency are in `package-lock.json`.

1. Copy `.env.example` to `.env` and replace every placeholder with local-only values. `.env` is ignored by Git.
2. Install dependencies with `npm ci`.
3. Start dependencies with `docker compose up -d postgres redis`.
4. Run `npm run migration:run`.
5. Set the five `SEED_*_PASSWORD` values to distinct passwords of at least 12 characters, then run `npm run seed:dev` if fictional development users are needed.
6. Start the API with `npm run start:dev`.

Alternatively, `docker compose up --build` builds and runs all three services. The API container runs migrations on startup. To seed inside that container, run `docker compose exec api npm run seed:dev:compiled` after setting the seed variables in `.env`.

If another local PostgreSQL instance uses port 5432, set `DATABASE_PORT=5433` in `.env` before starting Compose. The API container still connects to PostgreSQL on its internal port 5432.
If port 3000 is occupied, set `PORT=3001` and `AUTH_ORIGIN=http://localhost:3001` in `.env` and use that port in the URLs below. `AUTH_ORIGIN` must exactly match the browser-facing origin, without a trailing slash.

The API health endpoint is `http://localhost:3000/health`. Swagger is at `http://localhost:3000/docs`.

## Authentication

`POST /auth/login` accepts a seeded user's email and password. It returns `accessToken`, `tokenType`, and `expiresInSeconds` in JSON and sets an HttpOnly refresh cookie. `POST /auth/refresh` rotates that cookie and returns a new access token. `POST /auth/logout` revokes the session and clears the cookie. `GET /auth/me` requires `Authorization: Bearer <access token>` and returns only the current user's ID, email, role, and timestamps. There is no public registration.

The access token lasts 15 minutes by default (maximum one hour). The refresh session lasts seven days by default (maximum 30 days), with a fixed expiry from login. A reused refresh token revokes its entire session, including its access tokens. Clients should make only one refresh request at a time and keep the access token in memory.

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sales.a@example.test","password":"<SEED_SALES_A_PASSWORD>"}'

curl http://localhost:3000/auth/me \
  -H 'Authorization: Bearer <accessToken-from-login>'

curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh

curl -i -b cookies.txt -X POST http://localhost:3000/auth/logout
```

Replace the placeholders with values from your local `.env` and login response. The examples use fictional users. Treat `cookies.txt` and access tokens as secrets; do not commit them. In a browser, send same-origin requests so its cookie policy can protect the refresh token.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile strict TypeScript |
| `npm run lint` | Check source and tests |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run real authentication API tests against a separate database |
| `npm run migration:run` | Apply local TypeScript migrations |
| `npm run migration:show` | Show local migration status |
| `npm run migration:revert` | Revert the most recent migration |
| `npm run seed:dev` | Insert fictional development users |
| `npm run auth:prune` | Delete expired sessions and their refresh-token history |
| `npm run auth:prune:prod` | Run the compiled session cleanup command |

Example request: `curl http://localhost:3000/health` returns `{"status":"ok"}` when both dependencies respond. Merchant application examples will be added with Part 3.

API tests require the local PostgreSQL and Redis containers and configured `.env` values. The suite creates `merchant_onboarding_test` if needed, runs the real migration, and uses Redis logical database 1. It refuses to run with `NODE_ENV=production`.

## Security and trade-offs

The seed command refuses to run with `NODE_ENV=production` and refuses placeholder or short passwords. It hashes seed passwords with bcrypt. The user entity excludes `passwordHash` from default queries, and `/auth/me` maps database users to an explicit response DTO. Login returns the same generic error for unknown emails and wrong passwords and performs a bcrypt comparison on both paths. Global DTO validation rejects unknown fields, and the HTTP exception filter suppresses internal errors. Request IDs are returned in `x-request-id` and can be propagated with a UUID header.

Access tokens are HS256 JWTs containing only a user ID and session ID, with fixed issuer and audience. Every protected request checks the active database session and reloads the current role, so logout, refresh-token replay, account removal, and role changes take effect immediately. Refresh tokens are 32 random bytes, sent only as cookies; PostgreSQL stores only their SHA-256 hashes. Each refresh consumes its token and issues a replacement under a session row lock. Reuse revokes the session. Run `auth:prune:prod` on a schedule in deployment to remove expired sessions and their token history.

The production cookie uses the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`. Development uses an HttpOnly, SameSite Strict cookie on `/auth` so local HTTP works. Cookie-bearing routes reject untrusted `Origin`, `Referer`, and `Sec-Fetch-Site` headers; login also requires JSON. `AUTH_ORIGIN` must be the exact public HTTPS origin in production, and the API must be served over HTTPS. Cross-origin browser clients need a deliberate cookie and CSRF design change. Login and refresh limits use atomic Redis counters per 60 seconds; login limits by both IP and normalized email. Login and refresh fail closed when Redis is unavailable. Configure the application edge to pass the real client IP safely and keep database and Redis private. Do not blindly trust forwarded IP headers.

Keep `JWT_SECRET` in a managed secret store, use a long random value, and plan key rotation for production. Password recovery, account lockout policy, device/session management UI, and centralized monitoring are outside Part 2. A successful token design does not replace TLS, deployment hardening, or incident response.

In production, owner name, contact email, and contact phone would need field-level encryption. Keys should come from a managed key service and be rotated without placing them in Git or the database. Encryption is **not implemented** in Part 1. The development Compose file publishes database and Redis ports for local tools; production deployment would keep them private.

This code and assignment must remain private. Do not commit `.env`, secrets, build output, or `node_modules`. Do not create a GitHub repository or grant reviewer access without explicit instruction.

## AI assistance and verification

OpenAI Codex assisted with the Part 1 architecture, package setup, infrastructure configuration, migration, and documentation, and with Part 2 authentication code and tests. Part 1 verification: local build and lint passed; a fresh PostgreSQL 16 database applied the migration; both source and compiled development seeds ran; the Node 22 API container became healthy; `/health` and Swagger returned HTTP 200. Part 2 verification: build, lint, three unit tests, and nine real API tests passed against a separate PostgreSQL database and Redis configuration. The rebuilt Node 22 API container became healthy, applied the authentication migration, and passed login, refresh, logout, and access revocation checks. The compiled cleanup command ran successfully. The production dependency audit during the image build found zero vulnerabilities; the build dependency audit reported 20 moderate findings. The application and worker integration suite belongs to later parts and has not run.
