import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class ApplicationFieldsDto {
  @ApiProperty({ example: 'Fictional Coffee' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  businessName!: string;

  @ApiProperty({ example: 'Fictional Coffee Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  legalBusinessName!: string;

  @ApiProperty({ example: 'PRIVATE_COMPANY' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(64)
  businessType!: string;

  @ApiProperty({ example: 'Fictional Owner' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  ownerName!: string;

  @ApiProperty({ example: 'owner@example.test' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  contactEmail!: string;

  @ApiProperty({ example: '+9779800000000' })
  @IsString()
  @Matches(/^\+?[0-9][0-9 ()-]{5,30}$/)
  @MaxLength(32)
  contactPhone!: string;

  @ApiProperty({
    example: '10000.00',
    type: String,
    pattern: MONEY_PATTERN.source,
  })
  @IsString()
  @Matches(MONEY_PATTERN)
  requestedMonthlyVolume!: string;

  @ApiProperty({
    example: '25.50',
    type: String,
    pattern: MONEY_PATTERN.source,
  })
  @IsString()
  @Matches(MONEY_PATTERN)
  averageTransactionAmount!: string;

  @ApiProperty({ example: 'NPR', pattern: '^[A-Z]{3}$' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
