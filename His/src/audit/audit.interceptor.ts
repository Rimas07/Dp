import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuditService } from './audit.service';
import { AuditEvent } from './audit-event.dto';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(
        private readonly audit: AuditService,
        private readonly monitoring: MonitoringService, // ← ДОБАВИЛИ
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const start = Date.now();
        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();

        const tenantId = (req as any).tenantId || 'unknown';
        const userId = (req as any).user?.id;

        // Служебные эндпоинты, которые не нужно логировать в audit
        const ignoredPaths = ['/metrics', '/proxy/metrics', '/proxy/health', '/proxy/rate-limit-stats', '/health'];
        const requestPath = req.originalUrl || req.url || '';
        const shouldSkipAudit = ignoredPaths.some(path => requestPath.includes(path));

        return next.handle().pipe(
            tap((data) => {
                const duration = Date.now() - start;

                // Записываем в Prometheus (всегда записываем метрики)
                this.monitoring.recordRequest(
                    tenantId,
                    req.method,
                    req.originalUrl || req.url,
                    res.statusCode,
                    duration
                );

                // Пропускаем audit логирование для служебных эндпоинтов
                if (shouldSkipAudit) {
                    return;
                }

                // Оригинальное audit логирование
                const event: AuditEvent = {
                    timestamp: new Date().toISOString(),
                    level: 'info',
                    requestId: req.headers['x-request-id'] as string,
                    userId,
                    tenantId,
                    method: req.method,
                    path: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    durationMs: duration,
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    message: 'HTTP request completed',
                    requestBody: sanitize(req.body),
                };
                this.audit.emit(event);
            }),
            catchError((err) => {
                const duration = Date.now() - start;

                // Записываем ошибку в Prometheus (всегда записываем метрики)
                this.monitoring.recordRequest(
                    tenantId,
                    req.method,
                    req.originalUrl || req.url,
                    (err as any)?.status || 500,
                    duration
                );

                // Пропускаем audit логирование для служебных эндпоинтов
                if (!shouldSkipAudit) {
                    // Оригинальное audit логирование ошибки
                    const event: AuditEvent = {
                        timestamp: new Date().toISOString(),
                        level: 'error',
                        requestId: req.headers['x-request-id'] as string,
                        userId,
                        tenantId,
                        method: req.method,
                        path: req.originalUrl || req.url,
                        statusCode: (err as any)?.status || 500,
                        durationMs: duration,
                        ip: req.ip,
                        userAgent: req.headers['user-agent'],
                        message: 'HTTP request failed',
                        requestBody: sanitize(req.body),
                        error: { name: err.name, message: err.message },
                    };
                    this.audit.emit(event);
                }
                return throwError(() => err);
            }),
        );
    }
}

function sanitize(body: any) {
    if (!body || typeof body !== 'object') return body;
    const clone: any = { ...body };
    for (const key of ['password', 'token', 'secret']) {
        if (key in clone) clone[key] = '[REDACTED]';
    }
    return clone;
}