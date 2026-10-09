import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { tokenExpirySeconds } from './jwt.constants';
import { SessionsService } from './sessions.service';

// Cost-matched fictional hash keeps unknown-email and wrong-password paths comparable.
const DUMMY_BCRYPT_HASH =
  '$2b$12$9M2dsd5G4PfloGW/qWVFX.IK3xY1HJdZonQKalng8tmNkJQU9ATqq';

export interface AuthTokensResult {
  response: LoginResponseDto;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
  ) {}

  async login({ email, password }: LoginDto): Promise<AuthTokensResult> {
    const user = await this.users.findByEmailForLogin(email);
    const matches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
    if (!user || !matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.sessions.create(
      user.id,
      this.refreshLifetimeSeconds(),
    );
    return this.issueTokens(session);
  }

  async register({ email, password }: RegisterDto): Promise<void> {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds 72 UTF-8 bytes');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await this.users.createSales(email, passwordHash);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResult> {
    const session = await this.sessions.rotate(refreshToken);
    return this.issueTokens(session);
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revokeByRefreshToken(refreshToken);
  }

  private async issueTokens(session: {
    sessionId: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<AuthTokensResult> {
    try {
      return {
        response: {
          accessToken: await this.jwt.signAsync({
            sub: session.userId,
            sid: session.sessionId,
          }),
          tokenType: 'Bearer',
          expiresInSeconds: tokenExpirySeconds(
            this.config.getOrThrow<string>('ACCESS_TOKEN_EXPIRES_IN'),
            3600,
          ),
        },
        refreshToken: session.refreshToken,
        refreshExpiresAt: session.expiresAt,
      };
    } catch (error) {
      await this.sessions.revokeById(session.sessionId);
      throw error;
    }
  }

  private refreshLifetimeSeconds(): number {
    return tokenExpirySeconds(
      this.config.getOrThrow<string>('REFRESH_TOKEN_EXPIRES_IN'),
      30 * 86400,
    );
  }
}
