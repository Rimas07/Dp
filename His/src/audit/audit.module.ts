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
        ConfigModule,
        MongooseModule.forFeature([{ name: AuditEvent.name, schema: AuditEventSchema }]),
        TenantsModule,
        ClientsModule.registerAsync([
            {
                name: 'AUDIT_SERVICE',
                imports: [ConfigModule],
                useFactory: async (configService: ConfigService) => {
                    const rabbitmqUrl = configService.get<string>('rabbitmq.url');
                    const queue = configService.get<string>('rabbitmq.queue') || 'audit-queue';
                    
                    // Если RabbitMQ URL не указан или это localhost, делаем опциональным подключение
                    if (!rabbitmqUrl || rabbitmqUrl.includes('localhost')) {
                        console.log('[AuditModule] RabbitMQ URL not configured or is localhost, RabbitMQ will be optional');
                        return {
                            transport: Transport.RMQ,
                            options: {
                                urls: [rabbitmqUrl || 'amqp://localhost:5672'],
                                queue: queue,
                                queueOptions: {
                                    durable: true
                                },
                                // Не падаем, если не можем подключиться
                                socketOptions: {
                                    reconnectTimeInSeconds: 5,
                                }
                            },
                        };
                    }
                    
                    return {
                        transport: Transport.RMQ,
                        options: {
                            urls: [rabbitmqUrl],
                            queue: queue,
                            queueOptions: {
                                durable: true
                            },
                        },
                    };
                },
                inject: [ConfigService],
            },
        ]),
    ],
    providers: [AuditService],
    controllers: [AuditController],
    exports: [AuditService],
})
export class AuditModule { }



