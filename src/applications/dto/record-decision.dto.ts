import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApplicationStatus } from '../application.entity';

export enum DecisionOutcome {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  INFO_REQUESTED = 'INFO_REQUESTED',
}

export class RecordDecisionDto {
  @ApiProperty({ enum: DecisionOutcome })
  @IsEnum(DecisionOutcome)
  decision!: DecisionOutcome;

  @ApiProperty({ example: 'Please provide a fictional registration document.' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  reason!: string;
}

export function toApplicationStatus(
  outcome: DecisionOutcome,
): ApplicationStatus {
  switch (outcome) {
    case DecisionOutcome.APPROVED:
      return ApplicationStatus.APPROVED;
    case DecisionOutcome.REJECTED:
      return ApplicationStatus.REJECTED;
    case DecisionOutcome.INFO_REQUESTED:
      return ApplicationStatus.INFO_REQUESTED;
  }
}
