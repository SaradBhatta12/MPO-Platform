import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('risk_outbox')
export class RiskOutbox {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'submission_version', type: 'integer' })
  submissionVersion!: number;

  @Column({ name: 'job_id', type: 'varchar', length: 80 })
  jobId!: string;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
