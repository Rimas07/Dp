/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuditService } from './audit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEvent } from './audit-event.dto';
import { AuditEventSchema } from './audit.schema';
import { AuditController } from './audit.controller';
import { TenantsModule } from 'src/tenants/tenants.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: AuditEvent.name, schema: AuditEventSchema }]),
        TenantsModule,
        // ✅ ИСПРАВЛЕНО: Используем ConfigService для получения RABBITMQ_URL из .env
        ClientsModule.registerAsync([
            {
                name: 'AUDIT_SERVICE',
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        // Читаем URL из переменной окружения
                        // Для Docker: amqp://admin:admin123@rabbitmq:5672
                        // Для локального запуска: amqp://admin:admin123@localhost:5672
                        urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
                        queue: 'audit-queue',
                        queueOptions: {
                            durable: true, // Очередь сохраняется при перезапуске RabbitMQ
                        },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [AuditService],
    controllers: [AuditController],
    exports: [AuditService],
})
export class AuditModule { }



