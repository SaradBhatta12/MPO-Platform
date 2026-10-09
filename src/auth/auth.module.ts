import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSession } from './auth-session.entity';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JWT_AUDIENCE, JWT_ISSUER, tokenExpirySeconds } from './jwt.constants';
import { JwtStrategy } from './jwt.strategy';
import { JsonBodyGuard } from './json-body.guard';
import { RefreshToken } from './refresh-token.entity';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([AuthSession, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: tokenExpirySeconds(
            config.getOrThrow<string>('ACCESS_TOKEN_EXPIRES_IN'),
            3600,
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    AuthRateLimitService,
    CookieOriginGuard,
    JsonBodyGuard,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
