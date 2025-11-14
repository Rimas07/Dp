/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuditService } from './audit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEvent } from './audit-event.dto';
import { AuditEventSchema } from './audit.schema';
import { AuditController } from './audit.controller';
import { TenantsModule } from 'src/tenants/tenants.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: AuditEvent.name, schema: AuditEventSchema }]),
        TenantsModule,
        ClientsModule.register([
            {
                name: 'AUDIT_SERVICE',
                transport: Transport.RMQ,
                options: {
                    urls: ['amqp://hisapp:hisapp123@localhost:5672'],
                    queue: 'audit-queue',
                    queueOptions: {
                        durable: true
                    },
                },
            },
        ]),
    ],
    providers: [AuditService],
    controllers: [AuditController],
    exports: [AuditService],
})
export class AuditModule { }



