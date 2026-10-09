import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRiskAndAudit1791700000000 implements MigrationInterface {
  name = 'CreateRiskAndAudit1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "risk_checks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "submission_version" integer NOT NULL,
        "status" varchar(20) NOT NULL,
        "result_summary" varchar(100) NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "started_at" timestamptz NULL,
        "completed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "risk_checks_version_positive" CHECK ("submission_version" > 0),
        CONSTRAINT "risk_checks_attempts_nonnegative" CHECK ("attempt_count" >= 0),
        CONSTRAINT "risk_checks_status_valid" CHECK ("status" IN ('PENDING','PROCESSING','PASSED','FLAGGED','FAILED')),
        CONSTRAINT "risk_checks_application_version_unique" UNIQUE ("application_id", "submission_version")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "risk_outbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "submission_version" integer NOT NULL,
        "job_id" varchar(80) NOT NULL UNIQUE,
        "dispatched_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "risk_outbox_version_positive" CHECK ("submission_version" > 0),
        CONSTRAINT "risk_outbox_application_version_unique" UNIQUE ("application_id", "submission_version")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "risk_outbox_pending_idx"
      ON "risk_outbox" ("created_at", "id") WHERE "dispatched_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_user_id" uuid NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "action" varchar(40) NOT NULL,
        "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE RESTRICT,
        "request_id" uuid NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "audit_events_action_valid" CHECK ("action" IN (
          'APPLICATION_CREATED','APPLICATION_UPDATED','APPLICATION_SUBMITTED',
          'REVIEWER_ASSIGNED','RISK_COMPLETED','RISK_FAILED','REVIEW_DECIDED'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "audit_events_application_idx"
      ON "audit_events" ("application_id", "created_at" DESC, "id" DESC)
    `);

    // Earlier versions predate risk-check persistence and cannot be reconstructed.
    await queryRunner.query(`
      INSERT INTO "risk_checks" (
        "application_id", "submission_version", "status", "result_summary",
        "started_at", "completed_at"
      )
      SELECT "id", "submission_version", "risk_status", 'LEGACY_IMPORT',
        CASE WHEN "risk_status" = 'PROCESSING' THEN "updated_at" ELSE NULL END,
        CASE WHEN "risk_status" IN ('PASSED','FLAGGED','FAILED') THEN "updated_at" ELSE NULL END
      FROM "applications"
      WHERE "submission_version" > 0 AND "risk_status" <> 'NOT_STARTED'
    `);
    await queryRunner.query(`
      INSERT INTO "risk_outbox" ("application_id", "submission_version", "job_id")
      SELECT "id", "submission_version", 'risk-' || "id"::text || '-v' || "submission_version"::text
      FROM "applications"
      WHERE "submission_version" > 0 AND "risk_status" IN ('PENDING','PROCESSING')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_events"');
    await queryRunner.query('DROP TABLE "risk_outbox"');
    await queryRunner.query('DROP TABLE "risk_checks"');
  }
}
