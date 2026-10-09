import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JsonBodyGuard } from './json-body.guard';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  @Post('login')
  @UseGuards(CookieOriginGuard, JsonBodyGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Issue an access token and a refresh cookie' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({ description: 'Untrusted browser origin' })
  @ApiTooManyRequestsResponse({ description: 'Login limit exceeded' })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  async login(
    @Body() credentials: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    await this.rateLimit.checkLogin(this.clientIp(request), credentials.email);
    const tokens = await this.auth.login(credentials);
    setRefreshCookie(
      response,
      this.config,
      tokens.refreshToken,
      tokens.refreshExpiresAt,
    );
    return tokens.response;
  }

  @Post('refresh')
  @UseGuards(CookieOriginGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Rotate the refresh cookie and issue a new access token',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, or reused refresh token',
  })
  @ApiForbiddenResponse({ description: 'Untrusted browser origin' })
  @ApiTooManyRequestsResponse({ description: 'Refresh limit exceeded' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    await this.rateLimit.checkRefresh(this.clientIp(request));
    const refreshToken = readRefreshCookie(request, this.config);
    if (!refreshToken) {
      clearRefreshCookie(response, this.config);
      throw new UnauthorizedException('Invalid refresh token');
    }

    try {
      const tokens = await this.auth.refresh(refreshToken);
      setRefreshCookie(
        response,
        this.config,
        tokens.refreshToken,
        tokens.refreshExpiresAt,
      );
      return tokens.response;
    } catch (error) {
      clearRefreshCookie(response, this.config);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(CookieOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Untrusted browser origin' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = readRefreshCookie(request, this.config);
    if (refreshToken) await this.auth.logout(refreshToken);
    clearRefreshCookie(response, this.config);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired token',
  })
  me(@CurrentUser() user: UserResponseDto): UserResponseDto {
    return user;
  }

  private clientIp(request: Request): string {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
