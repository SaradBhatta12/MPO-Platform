import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestWithId, resolveRequestId } from './request-id.interceptor';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeMessage =
      exception instanceof HttpException && status < 500
        ? exception.message
        : 'Internal server error';
    const requestId =
      request.requestId ?? resolveRequestId(request.header('x-request-id'));
    response.setHeader('x-request-id', requestId);

    response.status(status).json({
      statusCode: status,
      message: safeMessage,
      path: (request as Request).path,
      requestId,
    });
  }
}
