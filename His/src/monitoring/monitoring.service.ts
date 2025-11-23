import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MonitoringService {
    constructor(
        // Счетчики запросов по tenant
        @InjectMetric('http_requests_total')
        public requestCounter: Counter<string>,

        // Время обработки запросов
        @InjectMetric('http_request_duration_seconds')
        public requestDuration: Histogram<string>,

        // Количество превышений лимитов
        @InjectMetric('limit_violations_total')
        public limitViolations: Counter<string>,

        // Текущее использование ресурсов
        @InjectMetric('tenant_resource_usage')
        public resourceUsage: Gauge<string>,
    ) { }

    // Метод для записи HTTP запроса
    recordRequest(tenantId: string, method: string, path: string, statusCode: number, duration: number) {
        this.requestCounter.inc({
            tenant_id: tenantId,
            method: method,
            path: path,
            status_code: statusCode.toString(),
        });

        this.requestDuration.observe(
            {
                tenant_id: tenantId,
                method: method,
                path: path,
            },
            duration / 1000 // конвертируем в секунды
        );
    }

    // Метод для записи превышения лимита
    recordLimitViolation(tenantId: string, limitType: string) {
        this.limitViolations.inc({
            tenant_id: tenantId,
            limit_type: limitType,
        });
    }

    // Метод для записи использования ресурсов
    recordResourceUsage(tenantId: string, resourceType: string, value: number, limit: number) {
        const percentage = (value / limit) * 100;
        this.resourceUsage.set(
            {
                tenant_id: tenantId,
                resource_type: resourceType,
            },
            percentage
        );
    }
}