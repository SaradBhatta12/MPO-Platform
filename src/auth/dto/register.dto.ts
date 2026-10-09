import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'new.sales@example.test' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: 'fictional-registration-password',
    format: 'password',
    minLength: 12,
    maxLength: 72,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}
