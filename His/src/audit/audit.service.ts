/* eslint-disable prettier/prettier */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuditEvent } from './audit-event.dto';
import { AuditEvent as AuditEventDocument } from './audit.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';


@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);
    private rabbitmqConnected = false;

    constructor(
        @Inject('AUDIT_SERVICE') private readonly client: ClientProxy,
        @InjectModel(AuditEventDocument.name) private auditModel: Model<AuditEventDocument>
    ) {
        this.connectToRabbitMQ();
    }

    private async connectToRabbitMQ() {
        try {
            await this.client.connect();
            this.rabbitmqConnected = true;
            this.logger.log('✅ Successfully connected to RabbitMQ');
        } catch (error) {
            this.rabbitmqConnected = false;
            this.logger.warn('⚠️  Failed to connect to RabbitMQ, will only log to database');
        }
    }

    async emit(event: AuditEvent) {
        try {
            // Сохраняем в базу данных
            const auditRecord = new this.auditModel(event);
            await auditRecord.save();

            // Логируем в консоль
            this.logger.log(`📝 Audit: ${event.method} ${event.path} - ${event.statusCode} (${event.userId || 'anonymous'}) [${event.tenantId || 'no-tenant'}]`);

            // Отправляем в RabbitMQ если подключен
            if (this.rabbitmqConnected) {
                this.client.emit('audit-log', event).subscribe();
            }
        } catch (error) {
            this.logger.error('Failed to emit audit event:', error.message);
        }
    }
}


