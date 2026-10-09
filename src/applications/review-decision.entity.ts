import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ApplicationStatus } from './application.entity';

@Entity('review_decisions')
export class ReviewDecision {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId!: string;

  @Column({ type: 'varchar', length: 20 })
  decision!: ApplicationStatus;

  @Column({ type: 'varchar', length: 2000 })
  reason!: string;

  @Column({ name: 'application_version', type: 'integer' })
  applicationVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
