/* eslint-disable prettier/prettier */
export class AuditEvent {
    timestamp!: string;
    level!: 'info' | 'warn' | 'error';
    requestId?: string;
    userId?: string;
    tenantId?: string;
    method!: string;
    path!: string;
    statusCode!: number;
    durationMs!: number;
    ip?: string;
    userAgent?: string;
    message!: string;
    requestBody?: unknown;
    responseBody?: unknown;
    error?: { name: string; message: string; stack?: string };

    eventType?: 'LIMIT_EXCEEDED' | 'LIMIT_WARNING' | 'LIMIT_UPDATED' | 'USAGE_SPIKE' | 'PATIENT_READ';
    limitType?: 'DOCUMENTS' | 'DATA_SIZE' | 'QUERIES';
    limitData?: {
        currentValue: number;
        limitValue: number;
        attemptedValue?: number;
        percentage?: number;
    };
    metadata?: Record<string, any>;
}

export interface LimitViolationEvent extends AuditEvent {
    eventType: 'LIMIT_EXCEEDED';
    limitType: 'DOCUMENTS' | 'DATA_SIZE' | 'QUERIES';
    limitData: {
        currentValue: number;
        limitValue: number;
        attemptedValue: number;
        percentage: number;
    };
}

export interface LimitWarningEvent extends AuditEvent {
    eventType: 'LIMIT_WARNING';
    limitType: 'DOCUMENTS' | 'DATA_SIZE' | 'QUERIES';
    limitData: {
        currentValue: number;
        limitValue: number;
        percentage: number;
    };
}