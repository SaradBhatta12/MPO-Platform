import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserResponseDto } from '../users/dto/user-response.dto';

type AuthenticatedRequest = Request & { user: UserResponseDto };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserResponseDto =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
