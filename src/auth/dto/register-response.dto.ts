import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({
    example: 'Account created. You can sign in now.',
  })
  message!: string;
}
