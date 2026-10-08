import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function resolveRequestId(supplied?: string): string {
  return supplied &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      supplied,
    )
    ? supplied
    : randomUUID();
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = resolveRequestId(request.header('x-request-id'));

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    return next.handle();
  }
}
