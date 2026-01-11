import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
    constructor(private readonly monitoringService: MonitoringService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        const startTime = Date.now();
        const method = request.method;
        const path = request.route?.path || request.url;

     
        const tenantId =
            request.headers['x-tenant-id'] ||
            request.user?.tenantId ||
            request.tenantId ||
            'unknown';

       
        return next.handle().pipe(
            tap({
                next: () => {
                    const duration = Date.now() - startTime;
                    const statusCode = response.statusCode;
                   
                    this.monitoringService.recordRequest(
                        tenantId,
                        method,
                        path,
                        statusCode,
                        duration
                    );
                },
                error: (error) => {
                    const duration = Date.now() - startTime;
                    const statusCode = error.status || 500;
                   
                    if (statusCode >= 500) {
                        console.error('❌ [Monitoring] Server error:', {
                            tenantId,
                            method,
                            path,
                            statusCode,
                            duration,
                        });
                    }
                    this.monitoringService.recordRequest(
                        tenantId,
                        method,
                        path,
                        statusCode,
                        duration
                    );
                },
            }),
        );
    }
}