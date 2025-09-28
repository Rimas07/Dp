import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AuditEvent extends Document {
    @Prop({ required: true })
    timestamp: string;

    @Prop({ required: true, enum: ['info', 'warn', 'error'] })
    level: string;

    @Prop()
    requestId?: string;

    @Prop()
    userId?: string;

    @Prop()
    tenantId?: string;

    @Prop({ required: true })
    method: string;

    @Prop({ required: true })
    path: string;

    @Prop({ required: true })
    statusCode: number;

    @Prop({ required: true })
    durationMs: number;

    @Prop()
    ip?: string;

    @Prop()
    userAgent?: string;

    @Prop({ required: true })
    message: string;

    @Prop({ type: Object })
    requestBody?: unknown;

    @Prop({ type: Object })
    responseBody?: unknown;

    @Prop({ type: Object })
    error?: { name: string; message: string; stack?: string };

    // Поля для лимитов
    @Prop({ enum: ['LIMIT_EXCEEDED', 'LIMIT_WARNING', 'LIMIT_UPDATED', 'USAGE_SPIKE'] })
    eventType?: string;

    @Prop({ enum: ['DOCUMENTS', 'DATA_SIZE', 'QUERIES'] })
    limitType?: string;

    @Prop({ type: Object })
    limitData?: {
        currentValue: number;
        limitValue: number;
        attemptedValue?: number;
        percentage?: number;
    };

    @Prop({ type: Object })
    metadata?: Record<string, any>;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);