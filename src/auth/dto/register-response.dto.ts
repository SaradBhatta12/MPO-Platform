import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({
    example: 'If the email is eligible, the account is ready for sign in.',
  })
  message!: string;
}
