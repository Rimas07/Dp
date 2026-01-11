import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MonitoringService {
    constructor(
      
        @InjectMetric('http_requests_total')
        public requestCounter: Counter<string>,

        
        @InjectMetric('http_request_duration_seconds')
        public requestDuration: Histogram<string>,

        
        @InjectMetric('limit_violations_total')
        public limitViolations: Counter<string>,

        
        @InjectMetric('tenant_resource_usage')
        public resourceUsage: Gauge<string>,
    ) { }

   
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
            duration / 1000 
        );
    }

    
    recordLimitViolation(tenantId: string, limitType: string) {
        this.limitViolations.inc({
            tenant_id: tenantId,
            limit_type: limitType,
        });
    }

   
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