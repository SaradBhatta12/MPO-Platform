import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    response.vary('Origin');
    response.vary('Sec-Fetch-Site');

    const site = request.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new ForbiddenException('Untrusted request origin');
    }

    const expectedOrigin = this.config.getOrThrow<string>('AUTH_ORIGIN');
    const origin = request.header('origin');
    if (origin && origin !== expectedOrigin) {
      throw new ForbiddenException('Untrusted request origin');
    }

    const referer = request.header('referer');
    if (!origin && referer) {
      try {
        if (new URL(referer).origin !== expectedOrigin) {
          throw new ForbiddenException('Untrusted request origin');
        }
      } catch {
        throw new ForbiddenException('Untrusted request origin');
      }
    }
    return true;
  }
}
