# Merchant onboarding API

Private NestJS backend for merchant applications and risk review. This repository currently implements **Part 1: the technology foundation**. Authentication, application workflows, risk processing, and audit behavior are planned for Parts 2–4; the tests and final submission review are Part 5. No frontend or payment processing is in scope.

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

Only the `users` table and its explicit migration exist in Part 1. TypeORM schema synchronization is disabled.

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

## Part 1 setup

Use Node.js 22 and npm. The container image uses Node 22; `.nvmrc` selects the same major for local development. Selected package versions include `@nestjs/core` 11.2.7, `@nestjs/typeorm` 11.0.3, TypeORM 0.3.31, `@nestjs/bullmq` 11.0.5, BullMQ 5.81.5, `pg` 8.23.1, `@nestjs/swagger` 11.4.7, and bcrypt 6.0.0. Exact resolved versions for every dependency are in `package-lock.json`.

1. Copy `.env.example` to `.env` and replace every placeholder with local-only values. `.env` is ignored by Git.
2. Install dependencies with `npm ci`.
3. Start dependencies with `docker compose up -d postgres redis`.
4. Run `npm run migration:run`.
5. Set the five `SEED_*_PASSWORD` values to distinct passwords of at least 12 characters, then run `npm run seed:dev` if fictional development users are needed.
6. Start the API with `npm run start:dev`.

Alternatively, `docker compose up --build` builds and runs all three services. The API container runs migrations on startup. To seed inside that container, run `docker compose exec api npm run seed:dev:compiled` after setting the seed variables in `.env`.

If another local PostgreSQL instance uses port 5432, set `DATABASE_PORT=5433` in `.env` before starting Compose. The API container still connects to PostgreSQL on its internal port 5432.

The API health endpoint is `http://localhost:3000/health`. Swagger is at `http://localhost:3000/docs`. Swagger's bearer scheme is configured; protected endpoints arrive in Part 2.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile strict TypeScript |
| `npm run lint` | Check source and tests |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run API tests once the test database is configured |
| `npm run migration:run` | Apply local TypeScript migrations |
| `npm run migration:show` | Show local migration status |
| `npm run migration:revert` | Revert the most recent migration |
| `npm run seed:dev` | Insert fictional development users |

Example request: `curl http://localhost:3000/health` returns `{"status":"ok"}` when both dependencies respond. Merchant application examples will be added with Part 3.

## Security and trade-offs

The seed command refuses to run with `NODE_ENV=production` and refuses placeholder or short passwords. It hashes seed passwords with bcrypt. The user entity excludes `passwordHash` from default queries. Global DTO validation rejects unknown fields, and the HTTP exception filter suppresses internal errors. Request IDs are returned in `x-request-id` and can be propagated with a UUID header.

In production, owner name, contact email, and contact phone would need field-level encryption. Keys should come from a managed key service and be rotated without placing them in Git or the database. Encryption is **not implemented** in Part 1. The development Compose file publishes database and Redis ports for local tools; production deployment would keep them private.

This code and assignment must remain private. Do not commit `.env`, secrets, build output, or `node_modules`. Do not create a GitHub repository or grant reviewer access without explicit instruction.

## AI assistance and verification

OpenAI Codex assisted with the Part 1 architecture, package setup, infrastructure configuration, migration, and documentation. Part 1 verification: local build and lint passed; two configuration tests passed; a fresh PostgreSQL 16 database applied the migration; both source and compiled development seeds ran; the Node 22 API container became healthy; `/health` and Swagger returned HTTP 200; the production dependency audit found zero vulnerabilities. The remaining 20 moderate audit findings are in development dependencies. The full API/worker integration suite belongs to later parts and has not run.
