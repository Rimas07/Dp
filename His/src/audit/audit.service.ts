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
            // Сохраняем в базу данных (это работает всегда, даже без RabbitMQ)
            const auditRecord = new this.auditModel(event);
            const savedRecord = await auditRecord.save();
            
            // Логируем в консоль
            this.logger.log(`📝 Audit: ${event.method} ${event.path} - ${event.statusCode} (${event.userId || 'anonymous'}) [${event.tenantId || 'no-tenant'}]`);
            this.logger.debug(`💾 Audit event saved to database with ID: ${savedRecord._id}`);

            // Отправляем в RabbitMQ если подключен (опционально)
            if (this.rabbitmqConnected) {
                try {
                    this.client.emit('audit-log', event).subscribe({
                        error: (err) => {
                            this.logger.warn('⚠️  Failed to send audit event to RabbitMQ:', err.message);
                        }
                    });
                } catch (rmqError) {
                    this.logger.warn('⚠️  RabbitMQ emit error (but event saved to DB):', rmqError.message);
                }
            } else {
                this.logger.debug('ℹ️  RabbitMQ not connected, event saved only to database');
            }
        } catch (error) {
            this.logger.error(`❌ Failed to emit audit event: ${error.message}`, error.stack);
            // Не бросаем ошибку, чтобы не ломать основной поток
        }
    }
}


