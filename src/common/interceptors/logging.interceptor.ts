import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, originalUrl, body } = request;

    this.logger.log(
      `[REQ] ${method} ${originalUrl} - Body: ${JSON.stringify(body)}`,
    );

    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        // Log when the request finishes
        this.logger.log(
          `[RES] ${method} ${originalUrl} - Completed in ${Date.now() - now}ms`,
        );
      }),
    );
  }
}
