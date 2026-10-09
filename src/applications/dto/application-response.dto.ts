import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MerchantApplication,
  ApplicationStatus,
  RiskStatus,
} from '../application.entity';

export class ApplicationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty() legalBusinessName!: string;
  @ApiProperty() businessType!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty() contactEmail!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty({ type: String }) requestedMonthlyVolume!: string;
  @ApiProperty({ type: String }) averageTransactionAmount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ApplicationStatus })
  applicationStatus!: ApplicationStatus;
  @ApiProperty({ enum: RiskStatus }) riskStatus!: RiskStatus;
  @ApiProperty() submissionVersion!: number;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) assignedReviewerId!:
    string | null;
  @ApiPropertyOptional({ nullable: true }) submittedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reviewedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ApplicationPageDto {
  @ApiProperty({ type: [ApplicationResponseDto] })
  items!: ApplicationResponseDto[];

  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export function toApplicationResponse(
  application: MerchantApplication,
): ApplicationResponseDto {
  return {
    id: application.id,
    businessName: application.businessName,
    legalBusinessName: application.legalBusinessName,
    businessType: application.businessType,
    ownerName: application.ownerName,
    contactEmail: application.contactEmail,
    contactPhone: application.contactPhone,
    requestedMonthlyVolume: application.requestedMonthlyVolume,
    averageTransactionAmount: application.averageTransactionAmount,
    currency: application.currency,
    applicationStatus: application.applicationStatus,
    riskStatus: application.riskStatus,
    submissionVersion: application.submissionVersion,
    createdById: application.createdById,
    assignedReviewerId: application.assignedReviewerId,
    submittedAt: application.submittedAt,
    reviewedAt: application.reviewedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}
