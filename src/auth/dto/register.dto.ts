import { ApiProperty } from '@nestjs/swagger';
import { MaxLength, MinLength } from 'class-validator';
import { LoginDto } from './login.dto';

export class RegisterDto extends LoginDto {
  @ApiProperty({
    example: 'fictional-registration-password',
    format: 'password',
    minLength: 12,
    maxLength: 72,
  })
  @MinLength(12)
  @MaxLength(72)
  declare password: string;
}
