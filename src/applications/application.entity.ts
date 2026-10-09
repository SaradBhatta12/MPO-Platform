import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  INFO_REQUESTED = 'INFO_REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RiskStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PASSED = 'PASSED',
  FLAGGED = 'FLAGGED',
  FAILED = 'FAILED',
}

@Entity('applications')
export class MerchantApplication {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ name: 'business_name', type: 'varchar', length: 200 })
  businessName!: string;

  @Column({ name: 'legal_business_name', type: 'varchar', length: 200 })
  legalBusinessName!: string;

  @Column({ name: 'business_type', type: 'varchar', length: 64 })
  businessType!: string;

  @Column({ name: 'owner_name', type: 'varchar', length: 200 })
  ownerName!: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 320 })
  contactEmail!: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32 })
  contactPhone!: string;

  @Column({
    name: 'requested_monthly_volume',
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  requestedMonthlyVolume!: string;

  @Column({
    name: 'average_transaction_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  averageTransactionAmount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'application_status', type: 'varchar', length: 20 })
  applicationStatus!: ApplicationStatus;

  @Column({ name: 'risk_status', type: 'varchar', length: 20 })
  riskStatus!: RiskStatus;

  @Column({ name: 'submission_version', type: 'integer', default: 0 })
  submissionVersion!: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById!: string;

  @Column({ name: 'assigned_reviewer_id', type: 'uuid', nullable: true })
  assignedReviewerId!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
