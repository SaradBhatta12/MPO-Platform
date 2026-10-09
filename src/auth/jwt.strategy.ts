import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  UserResponseDto,
  toUserResponse,
} from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { JWT_AUDIENCE, JWT_ISSUER } from './jwt.constants';
import { SessionsService } from './sessions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: unknown): Promise<UserResponseDto> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('sub' in payload) ||
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      !('sid' in payload) ||
      typeof payload.sid !== 'string' ||
      !isUUID(payload.sid)
    ) {
      throw new UnauthorizedException();
    }

    if (!(await this.sessions.isActive(payload.sid, payload.sub))) {
      throw new UnauthorizedException();
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    return toUserResponse(user);
  }
}
