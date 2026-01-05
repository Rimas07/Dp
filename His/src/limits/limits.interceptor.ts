
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { RequestContext } from './limits.service';

@Injectable()
export class LimitsContextInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const http = context.switchToHttp();
        const req = http.getRequest<Request>();

        const limitsContext: RequestContext = {
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
            userId: (req as any).user?.id,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            endpoint: req.originalUrl || req.url,
            method: req.method,
        };
        (req as any).limitsContext = limitsContext;

        return next.handle();
    }
}