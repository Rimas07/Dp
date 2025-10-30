/* eslint-disable prettier/prettier */
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuditEvent } from './audit-event.dto';
import { AuditEvent as AuditEventDocument } from './audit.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';


@Injectable()
export class AuditService {
    constructor(
        @Inject('AUDIT_SERVICE') private readonly client: ClientProxy,
        @InjectModel(AuditEventDocument.name) private auditModel: Model<AuditEventDocument>
    ) { }

    async emit(event: AuditEvent) {
        const auditRecord = new this.auditModel(event);
        await auditRecord.save();
        this.client.emit('audit-log', event);
    }
}


