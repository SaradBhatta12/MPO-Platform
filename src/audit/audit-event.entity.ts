import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export enum AuditAction {
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_UPDATED = 'APPLICATION_UPDATED',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  REVIEWER_ASSIGNED = 'REVIEWER_ASSIGNED',
  RISK_COMPLETED = 'RISK_COMPLETED',
  RISK_FAILED = 'RISK_FAILED',
  REVIEW_DECIDED = 'REVIEW_DECIDED',
}

export type AuditMetadata = Record<
  string,
  string | number | boolean | string[]
>;

@Entity('audit_events')
export class AuditEvent {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  action!: AuditAction;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'jsonb' })
  metadata!: AuditMetadata;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
