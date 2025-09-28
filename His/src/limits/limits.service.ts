/* eslint-disable prettier/prettier */
import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DataLimit, DataLimitSchema } from './limits.schema';
import { DataUsage, DataUsageSchema } from './usage.schema';
import { AuditService } from '../audit/audit.service';
import { AuditEvent, LimitViolationEvent, LimitWarningEvent } from '../audit/audit-event.dto';

export interface RequestContext {
    requestId?: string;
    userId?: string;
    userAgent?: string;
    ipAddress?: string;
    endpoint?: string;
    method?: string;
}

@Injectable()
export class LimitsService {
    private readonly limitsModel;
    private readonly usageModel;

    constructor(
        @InjectConnection() private connection: Connection,
        private readonly auditService: AuditService
    ) {
        this.limitsModel = this.connection.model(DataLimit.name, DataLimitSchema);
        this.usageModel = this.connection.model(DataUsage.name, DataUsageSchema);
    }

    async checkDocumentsLimit(
        tenantId: string,
        incomingDocsCount: number = 1,
        context?: RequestContext
    ): Promise<void> {
        const limit = await this.limitsModel.findOne({ tenantId }).exec();
        const usage = await this.usageModel.findOne({ tenantId }).exec() ||
            await this.usageModel.create({ tenantId });

        if (!limit) {
            return;
        }

        const newTotal = usage.documentsCount + incomingDocsCount;
        const percentage = Math.round((newTotal / limit.maxDocuments) * 100);

        if (newTotal >= limit.maxDocuments * 0.9 && usage.documentsCount < limit.maxDocuments * 0.9) {
            await this.emitLimitWarning(tenantId, 'DOCUMENTS', {
                currentValue: usage.documentsCount,
                limitValue: limit.maxDocuments,
                percentage: Math.round((usage.documentsCount / limit.maxDocuments) * 100)
            }, context);
        }

        if (newTotal > limit.maxDocuments) {
            await this.emitLimitViolation(tenantId, 'DOCUMENTS', {
                currentValue: usage.documentsCount,
                limitValue: limit.maxDocuments,
                attemptedValue: incomingDocsCount,
                percentage: percentage
            }, context);

            throw new ForbiddenException({
                message: `Document limit exceeded. Current: ${usage.documentsCount}, Limit: ${limit.maxDocuments}, Attempted to add: ${incomingDocsCount}`,
                error: 'DOCUMENT_LIMIT_EXCEEDED',
                details: {
                    current: usage.documentsCount,
                    limit: limit.maxDocuments,
                    attempted: incomingDocsCount,
                    percentage: percentage
                }
            });
        }
    }


    async checkDataSizeLimit(
        tenantId: string,
        incomingDataSizeKB: number,
        context?: RequestContext
    ): Promise<void> {
        console.log('🔍 [DEBUG] checkDataSizeLimit - START');
        console.log('🔍 [DEBUG] Tenant:', tenantId, 'Incoming size:', incomingDataSizeKB);

        const limit = await this.limitsModel.findOne({ tenantId }).exec();
        const usage = await this.usageModel.findOne({ tenantId }).exec() ||
            await this.usageModel.create({ tenantId });

        console.log('🔍 [DEBUG] Limit from DB:', limit);
        console.log('🔍 [DEBUG] Usage from DB:', usage);

        if (!limit) {
            console.log('🔍 [DEBUG] No limits set, skipping check');
            return;
        }

        const newTotal = usage.dataSizeKB + incomingDataSizeKB;
        const percentage = Math.round((newTotal / limit.maxDataSizeKB) * 100);

        console.log('🔍 [DEBUG] Calculation:');
        console.log('🔍 [DEBUG] - Current usage:', usage.dataSizeKB, 'KB');
        console.log('🔍 [DEBUG] - Incoming size:', incomingDataSizeKB, 'KB');
        console.log('🔍 [DEBUG] - New total:', newTotal, 'KB');
        console.log('🔍 [DEBUG] - Limit:', limit.maxDataSizeKB, 'KB');
        console.log('🔍 [DEBUG] - Percentage:', percentage, '%');

        if (newTotal >= limit.maxDataSizeKB * 0.9 && usage.dataSizeKB < limit.maxDataSizeKB * 0.9) {
            console.log('🔍 [DEBUG] ⚠️  Emitting limit warning (90%)');
            await this.emitLimitWarning(tenantId, 'DATA_SIZE', {
                currentValue: usage.dataSizeKB,
                limitValue: limit.maxDataSizeKB,
                percentage: Math.round((usage.dataSizeKB / limit.maxDataSizeKB) * 100)
            }, context);
        }

        if (newTotal > limit.maxDataSizeKB) {
            console.log('🔍 [DEBUG] ❌ LIMIT EXCEEDED! Throwing exception');
            await this.emitLimitViolation(tenantId, 'DATA_SIZE', {
                currentValue: usage.dataSizeKB,
                limitValue: limit.maxDataSizeKB,
                attemptedValue: incomingDataSizeKB,
                percentage: percentage
            }, context);

            throw new ForbiddenException({
                message: `Data size limit exceeded. Current: ${usage.dataSizeKB}KB, Limit: ${limit.maxDataSizeKB}KB, Attempted: ${incomingDataSizeKB}KB`,
                error: 'DATA_SIZE_LIMIT_EXCEEDED',
                details: {
                    current: usage.dataSizeKB,
                    limit: limit.maxDataSizeKB,
                    attempted: incomingDataSizeKB,
                    percentage: percentage
                }
            });
        }

        console.log('🔍 [DEBUG] ✅ Limit check passed');
        console.log('🔍 [DEBUG] checkDataSizeLimit - END');
    }

    async checkQueriesLimit(tenantId: string, context?: RequestContext): Promise<void> {
        const limit = await this.limitsModel.findOne({ tenantId }).exec();
        const usage = await this.usageModel.findOne({ tenantId }).exec() ||
            await this.usageModel.create({ tenantId });

        if (!limit) {
            return;
        }

        const newTotal = usage.queriesCount + 1;
        const percentage = Math.round((newTotal / limit.monthlyQueries) * 100);

        if (newTotal >= limit.monthlyQueries * 0.9 && usage.queriesCount < limit.monthlyQueries * 0.9) {
            await this.emitLimitWarning(tenantId, 'QUERIES', {
                currentValue: usage.queriesCount,
                limitValue: limit.monthlyQueries,
                percentage: Math.round((usage.queriesCount / limit.monthlyQueries) * 100)
            }, context);
        }

        if (newTotal > limit.monthlyQueries) {
            await this.emitLimitViolation(tenantId, 'QUERIES', {
                currentValue: usage.queriesCount,
                limitValue: limit.monthlyQueries,
                attemptedValue: 1,
                percentage: percentage
            }, context);

            throw new ForbiddenException({
                message: `Query limit exceeded. Maximum allowed: ${limit.monthlyQueries} queries per month`,
                error: 'QUERY_LIMIT_EXCEEDED',
                details: {
                    current: usage.queriesCount,
                    limit: limit.monthlyQueries,
                    percentage: percentage
                }
            });
        }
    }

    private async emitLimitViolation(
        tenantId: string,
        limitType: 'DOCUMENTS' | 'DATA_SIZE' | 'QUERIES',
        limitData: any,
        context?: RequestContext
    ): Promise<void> {
        try {
            const event: LimitViolationEvent = {
                timestamp: new Date().toISOString(),
                level: 'error',
                requestId: context?.requestId || `limit-${Date.now()}`,
                userId: context?.userId,
                tenantId,
                method: context?.method || 'INTERNAL',
                path: context?.endpoint || '/limits/check',
                statusCode: 403,
                durationMs: 0,
                ip: context?.ipAddress,
                userAgent: context?.userAgent,
                message: `${limitType} limit exceeded for tenant ${tenantId}`,
                eventType: 'LIMIT_EXCEEDED',
                limitType,
                limitData,
                metadata: {
                    service: 'LimitsService',
                    action: 'checkLimit',
                    severity: 'HIGH'
                }
            };

            this.auditService.emit(event);
        } catch (error) {
            console.error('Failed to emit limit violation audit event:', error);
        }
    }

    private async emitLimitWarning(
        tenantId: string,
        limitType: 'DOCUMENTS' | 'DATA_SIZE' | 'QUERIES',
        limitData: any,
        context?: RequestContext
    ): Promise<void> {
        try {
            const event: LimitWarningEvent = {
                timestamp: new Date().toISOString(),
                level: 'warn',
                requestId: context?.requestId || `limit-warning-${Date.now()}`,
                userId: context?.userId,
                tenantId,
                method: context?.method || 'INTERNAL',
                path: context?.endpoint || '/limits/check',
                statusCode: 200,
                durationMs: 0,
                ip: context?.ipAddress,
                userAgent: context?.userAgent,
                message: `${limitType} limit warning (90% reached) for tenant ${tenantId}`,
                eventType: 'LIMIT_WARNING',
                limitType,
                limitData,
                metadata: {
                    service: 'LimitsService',
                    action: 'checkLimit',
                    severity: 'MEDIUM'
                }
            };

            this.auditService.emit(event);
        } catch (error) {
            console.error('Failed to emit limit warning audit event:', error);
        }
    }

    async setLimitsForTenant(tenantId: string, newLimits: any, context?: RequestContext): Promise<any> {
        const oldLimits = await this.limitsModel.findOne({ tenantId }).exec();

        const result = await this.limitsModel.findOneAndUpdate(
            { tenantId },
            newLimits,
            { upsert: true, new: true }
        ).exec();

        try {
            const event: AuditEvent = {
                timestamp: new Date().toISOString(),
                level: 'info',
                requestId: context?.requestId || `limit-update-${Date.now()}`,
                userId: context?.userId,
                tenantId,
                method: context?.method || 'PUT',
                path: context?.endpoint || `/limits/${tenantId}`,
                statusCode: 200,
                durationMs: 0,
                ip: context?.ipAddress,
                userAgent: context?.userAgent,
                message: `Limits updated for tenant ${tenantId}`,
                eventType: 'LIMIT_UPDATED',
                requestBody: newLimits,
                responseBody: result,
                metadata: {
                    service: 'LimitsService',
                    action: 'updateLimits',
                    oldLimits: oldLimits?.toObject() || null,
                    newLimits: result.toObject()
                }
            };

            this.auditService.emit(event);
        } catch (error) {
            console.error('Failed to emit limit update audit event:', error);
        }

        return result;
    }

    async updateUsage(tenantId: string, docsCount: number, dataSizeKB: number): Promise<void> {
        await this.usageModel.findOneAndUpdate(
            { tenantId },
            {
                $inc: {
                    documentsCount: docsCount,
                    dataSizeKB: dataSizeKB,
                    queriesCount: 1
                }
            },
            { upsert: true }
        ).exec();
    }

    async getLimitsForTenant(tenantId: string): Promise<any> {
        let limits = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limits) {
            limits = await this.limitsModel.create({
                tenantId,
                maxDocuments: 1000,
                maxDataSizeKB: 51200,
                monthlyQueries: 1000
            });
        }

        return limits;
    }

    async getUsageForTenant(tenantId: string): Promise<any> {
        let usage = await this.usageModel.findOne({ tenantId }).exec();

        if (!usage) {
            usage = await this.usageModel.create({
                tenantId,
                documentsCount: 0,
                dataSizeKB: 0,
                queriesCount: 0
            });
        }

        return usage;
    }
}