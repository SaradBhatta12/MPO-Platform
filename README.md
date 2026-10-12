# Merchant onboarding API

Private NestJS backend for merchant applications and risk review. **Parts 1–5 are complete locally:** the technology foundation, fictional users, session-backed authentication, merchant application lifecycle, asynchronous simulated risk processing, audit records, tests, and final delivery review. No frontend or payment processing is in scope. External GitHub submission and reviewer access remain under the author's control.

## Architecture

NestJS controllers handle HTTP, services own business rules, and TypeORM repositories persist data in PostgreSQL. Redis and BullMQ provide the `merchant-risk` queue. Submission writes the application, risk check, outbox row, and audit event in one PostgreSQL transaction. A dispatcher enqueues the risk job; the worker records its result transactionally. The API container runs migrations before accepting traffic. `/health` checks PostgreSQL and Redis.

Entity relationships:

| Relationship                               | Meaning                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| User → applications (`createdById`)        | A SALES or ADMIN user creates many applications; implemented |
| User → applications (`assignedReviewerId`) | A REVIEWER may be assigned many applications; implemented    |
| Application → decisions                    | One recorded decision per submission version; implemented    |
| Application → risk checks                  | One record per submission version; implemented               |
| Application → audit events                 | Trace of changes, risk results, and decisions; implemented   |
| Application → outbox events                | Durable pending queue dispatches; implemented                |

The implemented authentication relationships are `User → auth sessions → refresh tokens`. The explicit migrations create these tables and indexes. TypeORM schema synchronization is disabled.

## Permissions

| Action             | ADMIN        | SALES        | REVIEWER      |
| ------------------ | ------------ | ------------ | ------------- |
| Create application | Yes          | Yes          | No            |
| List and view      | All          | Own          | Assigned      |
| Edit and submit    | All eligible | Own eligible | No            |
| Assign reviewer    | Yes          | No           | No            |
| Record decision    | No           | No           | Assigned only |

An ADMIN account is not a REVIEWER, so it cannot record a decision under the assigned-reviewer rule.

## Application transitions

| From           | To             | Trigger / condition                               |
| -------------- | -------------- | ------------------------------------------------- |
| New            | DRAFT          | Create application                                |
| DRAFT          | SUBMITTED      | Submit; start a new risk version                  |
| INFO_REQUESTED | SUBMITTED      | Resubmit; start a new risk version                |
| SUBMITTED      | UNDER_REVIEW   | Reviewer assigned and current risk check finished |
| UNDER_REVIEW   | INFO_REQUESTED | Assigned reviewer requests information            |
| UNDER_REVIEW   | APPROVED       | Assigned reviewer approves                        |
| UNDER_REVIEW   | REJECTED       | Assigned reviewer rejects                         |

`DRAFT` and `INFO_REQUESTED` allow merchant detail edits. `APPROVED` and `REJECTED` are terminal. A final automated `FAILED` risk result indicates the check could not complete; it is not a merchant rejection. `FLAGGED` requires manual attention. An assigned reviewer enters `UNDER_REVIEW` after a `PASSED`, `FLAGGED`, or `FAILED` result, whether assignment or risk completion happens first.

## Setup

Use Node.js 22 and npm 10.9.9. The container image uses Node 22; `.nvmrc` selects the same major for local development, and `package.json` pins npm. If you use nvm, run `nvm install` and `nvm use` in this directory before `npm ci`. The project uses the committed `package-lock.json`; use npm rather than pnpm so installs match the Docker image and do not generate a second lockfile. If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, switch to Node 22 and run `npm ci` instead of approving pnpm builds. Selected package versions include `@nestjs/core` 11.2.7, `@nestjs/typeorm` 11.0.3, TypeORM 0.3.31, `@nestjs/bullmq` 11.0.5, BullMQ 5.81.5, `pg` 8.23.1, `@nestjs/swagger` 11.4.7, and bcrypt 6.0.0. Exact resolved versions for every dependency are in `package-lock.json`.

1. Copy `.env.example` to `.env` and replace every placeholder with local-only values. `.env` is ignored by Git.
2. Install dependencies with `npm ci`.
3. Start dependencies with `docker compose up -d postgres redis`.
4. Run `npm run migration:run`.
5. Set the five `SEED_*_PASSWORD` values to distinct passwords of at least 12 characters and at most 72 UTF-8 bytes, then run `npm run seed:dev` if fictional development users are needed.
6. Start the API with `npm run start:dev`.

`RISK_DISPATCH_INTERVAL_MS` and `RISK_RETRY_DELAY_MS` are validated millisecond settings for outbox polling and exponential retries. Their defaults are 1000 and 500. The API process hosts the dispatcher and BullMQ worker; `app.enableShutdownHooks()` and the Nest BullMQ lifecycle close them on shutdown.

Alternatively, `docker compose up --build` builds and runs all three services. The API container runs migrations on startup. To seed inside that container, run `docker compose exec api npm run seed:dev:compiled` after setting the seed variables in `.env`.

If another local PostgreSQL instance uses port 5432, set `DATABASE_PORT=5433` in `.env` before starting Compose. The API container still connects to PostgreSQL on its internal port 5432.
If port 3000 is occupied, set `PORT=3001` and `AUTH_ORIGIN=http://localhost:3001` in `.env` and use that port in the URLs below. `AUTH_ORIGIN` must exactly match the browser-facing origin, without a trailing slash.

The API health endpoint is `http://localhost:3000/health`. Swagger is at `http://localhost:3000/docs`.

## Authentication

`POST /auth/register` accepts a public email and password and creates a SALES account. Passwords must have 12–72 characters and be at most 72 UTF-8 bytes, the bcrypt input limit. A new account returns HTTP 201 with `Account created. You can sign in now.` An existing email returns HTTP 409 with `Email already registered` and its password remains unchanged. Registration sends no email and issues no access token or refresh cookie. The new account can then use `POST /auth/login`. Registration is available in development and production, but email ownership is **not verified**; add email verification before treating the email address as trusted. ADMIN and REVIEWER accounts must be provisioned separately.

`POST /auth/login` accepts a registered or seeded user's email and password. It returns `accessToken`, `tokenType`, and `expiresInSeconds` in JSON and sets an HttpOnly refresh cookie. `POST /auth/refresh` rotates that cookie and returns a new access token. `POST /auth/logout` revokes the session and clears the cookie. `GET /auth/me` requires `Authorization: Bearer <access token>` and returns only the current user's ID, email, role, and timestamps.

The access token lasts 15 minutes by default (maximum one hour). The refresh session lasts seven days by default (maximum 30 days), with a fixed expiry from login. A reused refresh token revokes its entire session, including its access tokens. Clients should make only one refresh request at a time and keep the access token in memory.

```bash
curl -i -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"new.sales@example.test","password":"<NEW_SALES_PASSWORD>"}'

curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"new.sales@example.test","password":"<NEW_SALES_PASSWORD>"}'

curl http://localhost:3000/auth/me \
  -H 'Authorization: Bearer <accessToken-from-login>'

curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh

curl -i -b cookies.txt -X POST http://localhost:3000/auth/logout
```

Replace the placeholders with your own registration password and the login response. Use the configured `PORT` instead of 3000 if different. `sales.a@example.test` is a seeded account; registering it again returns 409. The examples use fictional users. Treat `cookies.txt` and access tokens as secrets; do not commit them. In a browser, send same-origin requests so its cookie policy can protect the refresh token.

## Applications

All application routes require a bearer access token. The API accepts decimal money amounts as strings and returns two decimal places as strings. A new application starts as `DRAFT`; a submission increments `submissionVersion` and sets risk status to `PENDING`.

| Route                                | Allowed roles                         | Purpose                                                                 |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------- |
| `POST /applications`                 | ADMIN, SALES                          | Create a draft                                                          |
| `GET /applications`                  | ADMIN, SALES, REVIEWER                | List visible applications with `page`, `pageSize`, and `status` filters |
| `GET /applications/:id`              | ADMIN, owner SALES, assigned REVIEWER | View one application                                                    |
| `PATCH /applications/:id`            | ADMIN, owner SALES                    | Edit a draft or information request                                     |
| `POST /applications/:id/submit`      | ADMIN, owner SALES                    | Submit or resubmit                                                      |
| `PATCH /applications/:id/assignment` | ADMIN                                 | Assign or reassign a REVIEWER                                           |
| `POST /applications/:id/decision`    | Assigned REVIEWER                     | Approve, reject, or request information from `UNDER_REVIEW`             |

The list defaults to page 1 and 20 items, caps `pageSize` at 50, and orders by creation time descending then ID descending. Inaccessible application IDs return 404. Review decisions require a nonblank reason and are stored with the submission version.

```bash
curl -X POST http://localhost:3000/applications \
  -H 'Authorization: Bearer <sales-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"businessName":"Fictional Coffee","legalBusinessName":"Fictional Coffee Pvt Ltd","businessType":"PRIVATE_COMPANY","ownerName":"Fictional Owner","contactEmail":"owner@example.test","contactPhone":"+9779800000000","requestedMonthlyVolume":"10000.00","averageTransactionAmount":"25.50","currency":"NPR"}'

curl 'http://localhost:3000/applications?status=DRAFT&page=1&pageSize=20' \
  -H 'Authorization: Bearer <sales-access-token>'

curl -X POST http://localhost:3000/applications/<application-id>/submit \
  -H 'Authorization: Bearer <sales-access-token>'
```

## Risk processing and audit

Submitting an application atomically increments `submissionVersion` and writes a `PENDING` risk check, a pending PostgreSQL outbox row, and an audit event. The dispatcher scans pending rows at startup and every `RISK_DISPATCH_INTERVAL_MS` (default 1000 ms). It enqueues a `merchant-risk` job containing only the application ID and version, then marks the row dispatched. The job ID is `risk-<application-uuid>-v<version>`, which is compatible with BullMQ custom IDs. If Redis is unavailable, the outbox row remains pending. If enqueue succeeds but marking the row fails, retrying dispatch is safe: database version checks and row locks make repeat processing harmless even after BullMQ's retained job is removed.

The fake KYB provider uses only fictional business-name prefixes; no external service or real identity data is involved:

| Business name prefix     | Result                                              |
| ------------------------ | --------------------------------------------------- |
| `Fictional Flag`         | `FLAGGED`; manual review needed                     |
| `Fictional Transient`    | First attempt fails; retry passes                   |
| `Fictional Permanent`    | All three attempts fail; final `FAILED` risk result |
| Any other fictional name | `PASSED`                                            |

Jobs have at most three attempts with exponential backoff starting at `RISK_RETRY_DELAY_MS` (default 500 ms). BullMQ retains up to 1000 completed jobs for one day and 5000 failed jobs for seven days. A final `FAILED` check remains reviewable and never rejects an application automatically. When a current result completes, a previously assigned `SUBMITTED` application moves to `UNDER_REVIEW`. The worker ignores stale submission versions, already completed checks, and terminal application decisions. PostgreSQL uniquely identifies each risk check and outbox row by application and version; the worker writes the risk result, application state, and one audit event in a transaction.

Audit events record creation, changes, submission, assignment, risk completion or final failure, and review decisions. User actions store the actor and request ID; worker actions use a null actor and request ID. Metadata contains only allowlisted field names, status, version, attempt count, and reviewer ID; it excludes merchant contact details, decision reasons, tokens, and passwords. Audit events are stored in PostgreSQL and have no public endpoint. This polling outbox favors a small implementation over row claiming: multiple dispatchers may enqueue the same ID, which the worker tolerates. Dispatched outbox rows remain in PostgreSQL and need an operational retention policy as volume grows. The migration reconstructs only the current risk state of submissions created before Part 4; it cannot reconstruct earlier attempts or audit history. Unexpected infrastructure failures are marked `FAILED` on the final worker failure when PostgreSQL is available; production operations still need monitoring and reconciliation for failures that happen while PostgreSQL itself is unavailable.

## Commands

| Command                    | Purpose                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run build`            | Compile strict TypeScript                                                                               |
| `npm run lint`             | Check source and tests                                                                                  |
| `npm test`                 | Run unit tests                                                                                          |
| `npm run test:e2e`         | Run real authentication, application, outbox, and worker tests against a separate database and Redis DB |
| `npm run migration:run`    | Apply local TypeScript migrations                                                                       |
| `npm run migration:show`   | Show local migration status                                                                             |
| `npm run migration:revert` | Revert the most recent migration                                                                        |
| `npm run seed:dev`         | Insert fictional development users                                                                      |
| `npm run auth:prune`       | Delete expired sessions and their refresh-token history                                                 |
| `npm run auth:prune:prod`  | Run the compiled session cleanup command                                                                |

Example request: `curl http://localhost:3000/health` returns `{"status":"ok"}` when both dependencies respond.

API tests require the local PostgreSQL and Redis containers and configured `.env` values. The suite creates `merchant_onboarding_test` if needed, runs the real migrations, and uses Redis logical database 1. It refuses to run with `NODE_ENV=production`. Background assertions poll for a bounded time; tests use fictional records and remove them afterward.

## Security and trade-offs

The seed command refuses to run with `NODE_ENV=production` and refuses placeholder, short, over-72-byte, or reused passwords. It hashes seed passwords with bcrypt. Public registration hashes passwords with bcrypt cost 12, fixes the role to SALES, and rejects unknown fields such as `role`. Login also rejects passwords over 72 UTF-8 bytes so bcrypt's input truncation cannot create an alternate valid password. A database uniqueness constraint and conflict-safe insert prevent duplicate emails from changing an existing password. Registration returns 409 for existing emails, as requested. This reveals whether an email is registered; Redis limits attempts by IP and normalized email, but cannot fully prevent account enumeration. Public registration is enabled in production without email verification. Email addresses are therefore unverified identity claims; do not use them for password recovery or sensitive notices until ownership verification is implemented.

The user entity excludes `passwordHash` from default queries, and `/auth/me` maps database users to an explicit response DTO. Login returns the same generic error for unknown emails and wrong passwords and performs a bcrypt comparison on both paths. Global DTO validation rejects unknown fields, and the HTTP exception filter suppresses internal errors. Request IDs are returned in `x-request-id` and can be propagated with a UUID header.

Access tokens are HS256 JWTs containing only a user ID and session ID, with fixed issuer and audience. Every protected request checks the active database session and reloads the current role, so logout, refresh-token replay, account removal, and role changes take effect immediately. Refresh tokens are 32 random bytes, sent only as cookies; PostgreSQL stores only their SHA-256 hashes. Each refresh consumes its token and issues a replacement under a session row lock. Reuse revokes the session. Run `auth:prune:prod` on a schedule in deployment to remove expired sessions and their token history.

The production cookie uses the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`. Development uses an HttpOnly, SameSite Strict cookie on `/auth` so local HTTP works. Cookie-bearing routes reject untrusted `Origin`, `Referer`, and `Sec-Fetch-Site` headers; login and registration also require JSON. `AUTH_ORIGIN` must be the exact public HTTPS origin in production, and the API must be served over HTTPS. Cross-origin browser clients need a deliberate cookie and CSRF design change. Login, registration, and refresh limits use atomic Redis counters per 60 seconds; login and registration limit by both IP and normalized email. These routes fail closed when Redis is unavailable. Configure the application edge to pass the real client IP safely and keep database and Redis private. Do not blindly trust forwarded IP headers. All responses, including errors, use `Cache-Control: no-store` and basic browser security headers; Express's identifying header and ETags are disabled.

Application create and update DTOs exclude server-managed fields. PostgreSQL `numeric(18,2)` columns and validation keep monetary values out of JavaScript floating-point calculations. Object-level visibility is applied in SQL queries. Mutations use database row locks and transactions; a unique `(application_id, application_version)` decision constraint adds protection against duplicate decisions. Application responses use explicit field mapping and `Cache-Control: no-store`.

Keep `JWT_SECRET` in a managed secret store, use a long random value, and plan key rotation for production. Password recovery, account lockout policy, device/session management UI, and centralized monitoring are outside Part 2. A successful token design does not replace TLS, deployment hardening, or incident response.

In production, owner name, contact email, and contact phone would need field-level encryption. Keys should come from a managed key service and be rotated without placing them in Git or the database. Encryption is **not implemented**. The development Compose file binds the API, database, and Redis host ports to `127.0.0.1` for local use. Production deployment must keep PostgreSQL and Redis on private networks and expose the API only through an HTTPS edge.

This code and assignment must remain private. Do not commit `.env`, secrets, build output, or `node_modules`. Before external delivery, verify the GitHub repository is private, review the tracked files, and grant `@lbaral-vp` access only after explicit instruction. Part 5 did not create a repository, push code, or grant access.

## AI assistance and verification

OpenAI Codex assisted with the setup, authentication, application lifecycle, risk worker, outbox, audit records, tests, security review, and documentation. Earlier parts were verified incrementally with local builds, lint, migrations, seed commands, API requests, and container builds. Part 5 extracted the lifecycle, authorization scope, and risk-job rules into shared policies and added unit tests for them and for the deterministic fake provider.

Final verification on 9 October 2026 used the project's Node 22 runtime: the strict TypeScript build and lint passed; nine unit tests and 30 API integration tests passed. The API tests use a separate PostgreSQL database and Redis DB, run real migrations and the actual BullMQ worker, and cover authorization, retries, final failure, duplicate delivery, stale jobs, outbox redispatch, audit metadata, and concurrent decisions. The rebuilt API container became healthy with `/health` returning HTTP 200; its live OpenAPI document contained all ten required route paths and the bearer security scheme. A fresh `npm audit --omit=dev` reported zero production vulnerabilities. The full dependency audit reported 20 moderate findings through development-only `sprintf-js`; its published advisory has no patched release, and `npm audit fix --force` proposes a breaking Jest toolchain downgrade. Tracked-file review found no committed `.env`, build output, `node_modules`, or private-key pattern. No GitHub push or reviewer-access change was made.
