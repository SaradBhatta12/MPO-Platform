import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

const DEVELOPMENT_COOKIE = 'merchant_refresh';
const PRODUCTION_COOKIE = '__Host-merchant_refresh';

export function refreshCookieName(config: ConfigService): string {
  return config.getOrThrow<string>('NODE_ENV') === 'production'
    ? PRODUCTION_COOKIE
    : DEVELOPMENT_COOKIE;
}

function cookieOptions(config: ConfigService): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
} {
  const production = config.getOrThrow<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: production ? '/' : '/auth',
  };
}

export function setRefreshCookie(
  response: Response,
  config: ConfigService,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(refreshCookieName(config), token, {
    ...cookieOptions(config),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearRefreshCookie(
  response: Response,
  config: ConfigService,
): void {
  response.clearCookie(refreshCookieName(config), cookieOptions(config));
}

export function readRefreshCookie(
  request: Request,
  config: ConfigService,
): string | null {
  const name = `${refreshCookieName(config)}=`;
  const matches = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .filter((item) => item.startsWith(name));
  if (!matches || matches.length !== 1) return null;

  const token = matches[0].slice(name.length);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
