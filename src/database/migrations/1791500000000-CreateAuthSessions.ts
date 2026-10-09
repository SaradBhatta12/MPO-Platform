import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1791500000000 implements MigrationInterface {
  name = 'CreateAuthSessions1791500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id")',
    );
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL UNIQUE,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "refresh_tokens_hash_length_check" CHECK (length("token_hash") = 64)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "refresh_tokens_one_active_per_session"
      ON "refresh_tokens" ("session_id") WHERE "consumed_at" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "refresh_tokens"');
    await queryRunner.query('DROP TABLE "auth_sessions"');
  }
}
