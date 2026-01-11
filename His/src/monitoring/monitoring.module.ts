import { Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeHistogramProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { MonitoringService } from './monitoring.service';
import { MonitoringInterceptor } from './monitoring.interceptor';

@Module({
    imports: [
        PrometheusModule.register({
            path: '/metrics',
            defaultMetrics: {
                enabled: true,
            },
        }),
    ],
    providers: [
        MonitoringService,
        MonitoringInterceptor,

        
        makeCounterProvider({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['tenant_id', 'method', 'path', 'status_code'],
        }),

       
        makeHistogramProvider({
            name: 'http_request_duration_seconds',
            help: 'HTTP request duration in seconds',
            labelNames: ['tenant_id', 'method', 'path'],
            buckets: [0.1, 0.5, 1, 2, 5], 
        }),

        
        makeCounterProvider({
            name: 'limit_violations_total',
            help: 'Total number of limit violations',
            labelNames: ['tenant_id', 'limit_type'],
        }),

        
        makeGaugeProvider({
            name: 'tenant_resource_usage',
            help: 'Tenant resource usage percentage',
            labelNames: ['tenant_id', 'resource_type'],
        }),
    ],
    exports: [MonitoringService, MonitoringInterceptor],
})
export class MonitoringModule { }