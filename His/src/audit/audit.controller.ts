/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { InjectModel } from '@nestjs/mongoose';
import { AuditEvent as AuditEventDocument } from './audit.schema';
import { Model } from 'mongoose';
import { TenantsService } from 'src/tenants/tenants.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Patient, PatientSchema } from 'src/patients/patient.schema';

@Controller('audit')
export class AuditController {
    constructor(
        @InjectModel(AuditEventDocument.name) private auditModel: Model<AuditEventDocument>,
        private tenantsService: TenantsService,
        @InjectConnection() private connection: Connection
    ) { }

    @Get()
    async getAuditEvents(
        @Query('tenantId') tenantId?: string,
        @Query('eventType') eventType?: string,
        @Query('limit') limit?: number
    ) {
        const query: any = {};
        if (tenantId) query.tenantId = tenantId;
        if (eventType) query.eventType = eventType;

        return this.auditModel
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit || 100)
            .exec();
    }

    @Get('stats')
    async getSystemStats() {
        try {
            // Получаем общее количество тенантов
            const totalTenants = await this.tenantsService.getAllTenants();

            // Подсчитываем общее количество пациентов во всех тенантах
            let totalPatients = 0;
            for (const tenant of totalTenants) {
                try {
                    const tenantDb = this.connection.useDb(`tenant_${tenant.tenantId}`);
                    // Создаем модель с правильной схемой
                    const PatientModel = tenantDb.model(Patient.name, PatientSchema);
                    const patientCount = await PatientModel.countDocuments();
                    totalPatients += patientCount;
                    console.log(`Тенант ${tenant.tenantId}: ${patientCount} пациентов`);
                } catch (error) {
                    console.log(`Ошибка подсчета пациентов для тенанта ${tenant.tenantId}:`, error.message);
                }
            }

            // Получаем общее количество аудит событий
            const totalAuditEvents = await this.auditModel.countDocuments();

            // Получаем последние 10 аудит событий
            const recentEvents = await this.auditModel
                .find()
                .sort({ timestamp: -1 })
                .limit(10)
                .exec();

            const result = {
                totalTenants: totalTenants.length,
                totalPatients,
                totalAuditEvents,
                recentEvents,
                systemStatus: 'online',
                lastUpdated: new Date(),
                debug: {
                    tenantsFound: totalTenants.length,
                    patientsCounted: totalPatients
                }
            };

            console.log('📊 Статистика системы:', result);
            return result;
        } catch (error) {
            return {
                totalTenants: 0,
                totalPatients: 0,
                totalAuditEvents: 0,
                recentEvents: [],
                systemStatus: 'error',
                error: error.message,
                lastUpdated: new Date()
            };
        }
    }
}