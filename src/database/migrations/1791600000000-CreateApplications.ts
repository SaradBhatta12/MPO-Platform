import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplications1791600000000 implements MigrationInterface {
  name = 'CreateApplications1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_name" varchar(200) NOT NULL,
        "legal_business_name" varchar(200) NOT NULL,
        "business_type" varchar(64) NOT NULL,
        "owner_name" varchar(200) NOT NULL,
        "contact_email" varchar(320) NOT NULL,
        "contact_phone" varchar(32) NOT NULL,
        "requested_monthly_volume" numeric(18,2) NOT NULL,
        "average_transaction_amount" numeric(18,2) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "application_status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "risk_status" varchar(20) NOT NULL DEFAULT 'NOT_STARTED',
        "submission_version" integer NOT NULL DEFAULT 0,
        "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "assigned_reviewer_id" uuid NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "submitted_at" timestamptz NULL,
        "reviewed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "applications_requested_volume_nonnegative" CHECK ("requested_monthly_volume" >= 0),
        CONSTRAINT "applications_average_amount_nonnegative" CHECK ("average_transaction_amount" >= 0),
        CONSTRAINT "applications_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "applications_submission_version_nonnegative" CHECK ("submission_version" >= 0),
        CONSTRAINT "applications_status_valid" CHECK ("application_status" IN ('DRAFT','SUBMITTED','UNDER_REVIEW','INFO_REQUESTED','APPROVED','REJECTED')),
        CONSTRAINT "applications_risk_status_valid" CHECK ("risk_status" IN ('NOT_STARTED','PENDING','PROCESSING','PASSED','FLAGGED','FAILED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "applications_created_by_list_idx"
      ON "applications" ("created_by_id", "created_at" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "applications_reviewer_list_idx"
      ON "applications" ("assigned_reviewer_id", "created_at" DESC, "id" DESC)
      WHERE "assigned_reviewer_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "applications_status_list_idx"
      ON "applications" ("application_status", "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "review_decisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE RESTRICT,
        "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "decision" varchar(20) NOT NULL,
        "reason" varchar(2000) NOT NULL,
        "application_version" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "review_decisions_outcome_valid" CHECK ("decision" IN ('APPROVED','REJECTED','INFO_REQUESTED')),
        CONSTRAINT "review_decisions_version_positive" CHECK ("application_version" > 0),
        CONSTRAINT "review_decisions_application_version_unique" UNIQUE ("application_id", "application_version")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "review_decisions_application_idx"
      ON "review_decisions" ("application_id", "created_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "review_decisions"');
    await queryRunner.query('DROP TABLE "applications"');
  }
}
