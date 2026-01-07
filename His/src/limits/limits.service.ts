/* eslint-disable prettier/prettier */
import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DataLimit, DataLimitSchema } from './limits.schema';
import { DataUsage, DataUsageSchema } from './usage.schema';
import { AuditService } from '../audit/audit.service';
import { AuditEvent, LimitViolationEvent, LimitWarningEvent } from '../audit/audit-event.dto';
import { MonitoringService } from '../monitoring/monitoring.service'; // ← ДОБАВЬ ЭТУ СТРОКУ

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
        private readonly auditService: AuditService,
        private readonly monitoring: MonitoringService, // ← ДОБАВЬ ЭТУ СТРОКУ
    ) {
        this.limitsModel = this.connection.model(DataLimit.name, DataLimitSchema);
        this.usageModel = this.connection.model(DataUsage.name, DataUsageSchema);
    }

   
    async checkDocumentsLimit(
        tenantId: string,
        incomingDocsCount: number = 1,
        context?: RequestContext
    ): Promise<void> {
        
        if (incomingDocsCount < 0) {
            throw new ForbiddenException('Document count cannot be negative');
        }

        if (incomingDocsCount > 1000) {
            throw new ForbiddenException('Cannot add more than 1000 documents at once');
        }

        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            return;
        }

   
        let currentUsage = await this.usageModel.findOne({ tenantId }).exec();
        if (!currentUsage) {
            currentUsage = await this.usageModel.create({ tenantId });
        }


        if (currentUsage.documentsCount + incomingDocsCount > limit.maxDocuments) {
            const percentage = Math.round(
                ((currentUsage.documentsCount + incomingDocsCount) / limit.maxDocuments) * 100
            );
            this.monitoring.recordLimitViolation(tenantId, 'DOCUMENTS');
            await this.emitLimitViolation(tenantId, 'DOCUMENTS', {
                currentValue: currentUsage.documentsCount,
                limitValue: limit.maxDocuments,
                attemptedValue: incomingDocsCount,
                percentage
            }, context);
            throw new ForbiddenException({
                message: `Document limit exceeded. Current: ${currentUsage.documentsCount}, Limit: ${limit.maxDocuments}, Attempted to add: ${incomingDocsCount}`,
                error: 'DOCUMENT_LIMIT_EXCEEDED',
                details: {
                    current: currentUsage.documentsCount,
                    limit: limit.maxDocuments,
                    attempted: incomingDocsCount,
                    percentage
                }
            });
        }

        const updatedUsage = await this.usageModel.findOneAndUpdate(
            {
                tenantId,
                documentsCount: { $lte: limit.maxDocuments - incomingDocsCount }
            },
            {
                $inc: { documentsCount: incomingDocsCount }
            },
            {
                new: true,
                upsert: false
            }
        ).exec();

        if (!updatedUsage) {
            const finalUsage = await this.usageModel.findOne({ tenantId }).exec();
          
            if (finalUsage.documentsCount + incomingDocsCount > limit.maxDocuments) {
                const percentage = Math.round(
                    ((finalUsage.documentsCount + incomingDocsCount) / limit.maxDocuments) * 100
                );
                this.monitoring.recordLimitViolation(tenantId, 'DOCUMENTS');
                await this.emitLimitViolation(tenantId, 'DOCUMENTS', {
                    currentValue: finalUsage.documentsCount,
                    limitValue: limit.maxDocuments,
                    attemptedValue: incomingDocsCount,
                    percentage
                }, context);
                throw new ForbiddenException({
                    message: `Document limit exceeded. Current: ${finalUsage.documentsCount}, Limit: ${limit.maxDocuments}, Attempted to add: ${incomingDocsCount}`,
                    error: 'DOCUMENT_LIMIT_EXCEEDED',
                    details: {
                        current: finalUsage.documentsCount,
                        limit: limit.maxDocuments,
                        attempted: incomingDocsCount,
                        percentage
                    }
                });
            }
            // Если лимит все еще не превышен, пробуем еще раз атомарно
            const retryUpdate = await this.usageModel.findOneAndUpdate(
                {
                    tenantId,
                    documentsCount: { $lte: limit.maxDocuments - incomingDocsCount }
                },
                {
                    $inc: { documentsCount: incomingDocsCount }
                },
                {
                    new: true,
                    upsert: false
                }
            ).exec();
            
            if (!retryUpdate) {
                // Если все еще не получилось, значит лимит превышен
                const finalCheck = await this.usageModel.findOne({ tenantId }).exec();
                const percentage = Math.round(
                    ((finalCheck.documentsCount + incomingDocsCount) / limit.maxDocuments) * 100
                );
                this.monitoring.recordLimitViolation(tenantId, 'DOCUMENTS');
                await this.emitLimitViolation(tenantId, 'DOCUMENTS', {
                    currentValue: finalCheck.documentsCount,
                    limitValue: limit.maxDocuments,
                    attemptedValue: incomingDocsCount,
                    percentage
                }, context);
                throw new ForbiddenException({
                    message: `Document limit exceeded. Current: ${finalCheck.documentsCount}, Limit: ${limit.maxDocuments}, Attempted to add: ${incomingDocsCount}`,
                    error: 'DOCUMENT_LIMIT_EXCEEDED',
                    details: {
                        current: finalCheck.documentsCount,
                        limit: limit.maxDocuments,
                        attempted: incomingDocsCount,
                        percentage
                    }
                });
            }
            
            // Успешно обновлено после retry
            this.monitoring.recordResourceUsage(
                tenantId,
                'documents',
                retryUpdate.documentsCount,
                limit.maxDocuments
            );
            return;
        }

        
        this.monitoring.recordResourceUsage(
            tenantId,
            'documents',
            updatedUsage.documentsCount,
            limit.maxDocuments
        );

        
        const percentage = Math.round((updatedUsage.documentsCount / limit.maxDocuments) * 100);

        console.log('🔍 [Limits] Checking warning threshold:', {
            percentage,
            currentDocs: updatedUsage.documentsCount,
            previousDocs: updatedUsage.documentsCount - incomingDocsCount,
            maxDocs: limit.maxDocuments,
            threshold80: limit.maxDocuments * 0.8,
            condition1: percentage >= 80,
            condition2: (updatedUsage.documentsCount - incomingDocsCount) <= limit.maxDocuments * 0.8
        });

        if (percentage >= 80 && (updatedUsage.documentsCount - incomingDocsCount) <= limit.maxDocuments * 0.8) {
            console.log('⚠️ [Limits] EMITTING WARNING - 80% threshold reached!');
            await this.emitLimitWarning(tenantId, 'DOCUMENTS', {
                currentValue: updatedUsage.documentsCount,
                limitValue: limit.maxDocuments,
                percentage
            }, context);
        }
    }

   
    async checkDataSizeLimit(
        tenantId: string,
        incomingDataSizeKB: number,
        context?: RequestContext
    ): Promise<void> {
        if (incomingDataSizeKB < 0) {
            throw new ForbiddenException('Data size cannot be negative');
        }

        if (incomingDataSizeKB > 10240) {
            throw new ForbiddenException('Cannot add more than 10MB at once');
        }

        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            return;
        }

       
        const updatedUsage = await this.usageModel.findOneAndUpdate(
            {
                tenantId,
                dataSizeKB: { $lte: limit.maxDataSizeKB - incomingDataSizeKB }
            },
            {
                $inc: { dataSizeKB: incomingDataSizeKB }
            },
            {
                new: true,
                upsert: false
            }
        ).exec();

        if (!updatedUsage) {
            const currentUsage = await this.usageModel.findOne({ tenantId }).exec() ||
                await this.usageModel.create({ tenantId });

            const percentage = Math.round(
                ((currentUsage.dataSizeKB + incomingDataSizeKB) / limit.maxDataSizeKB) * 100
            );

            this.monitoring.recordLimitViolation(tenantId, 'DATA_SIZE');

            await this.emitLimitViolation(tenantId, 'DATA_SIZE', {
                currentValue: currentUsage.dataSizeKB,
                limitValue: limit.maxDataSizeKB,
                attemptedValue: incomingDataSizeKB,
                percentage
            }, context);

            throw new ForbiddenException({
                message: `Data size limit exceeded. Current: ${currentUsage.dataSizeKB}KB, Limit: ${limit.maxDataSizeKB}KB, Attempted: ${incomingDataSizeKB}KB`,
                error: 'DATA_SIZE_LIMIT_EXCEEDED',
                details: {
                    current: currentUsage.dataSizeKB,
                    limit: limit.maxDataSizeKB,
                    attempted: incomingDataSizeKB,
                    percentage
                }
            });
        }
        this.monitoring.recordResourceUsage(
            tenantId,
            'data_size_kb',
            updatedUsage.dataSizeKB,
            limit.maxDataSizeKB
        );
        const percentage = Math.round((updatedUsage.dataSizeKB / limit.maxDataSizeKB) * 100);

        if (percentage >= 80 && (updatedUsage.dataSizeKB - incomingDataSizeKB) <= limit.maxDataSizeKB * 0.8) {
            await this.emitLimitWarning(tenantId, 'DATA_SIZE', {
                currentValue: updatedUsage.dataSizeKB,
                limitValue: limit.maxDataSizeKB,
                percentage
            }, context);
        }
    }

   
    async checkQueriesLimit(tenantId: string, context?: RequestContext): Promise<void> {
        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            return;
        }

        
        const updatedUsage = await this.usageModel.findOneAndUpdate(
            {
                tenantId,
                queriesCount: { $lt: limit.monthlyQueries }
            },
            {
                $inc: { queriesCount: 1 }
            },
            {
                new: true,
                upsert: false
            }
        ).exec();

        if (!updatedUsage) {
            const currentUsage = await this.usageModel.findOne({ tenantId }).exec() ||
                await this.usageModel.create({ tenantId });

            const percentage = Math.round(
                ((currentUsage.queriesCount + 1) / limit.monthlyQueries) * 100
            );

            this.monitoring.recordLimitViolation(tenantId, 'QUERIES');

            await this.emitLimitViolation(tenantId, 'QUERIES', {
                currentValue: currentUsage.queriesCount,
                limitValue: limit.monthlyQueries,
                attemptedValue: 1,
                percentage
            }, context);

            throw new ForbiddenException({
                message: `Query limit exceeded. Current: ${currentUsage.queriesCount}, Limit: ${limit.monthlyQueries}`,
                error: 'QUERY_LIMIT_EXCEEDED',
                details: {
                    current: currentUsage.queriesCount,
                    limit: limit.monthlyQueries,
                    attempted: 1,
                    percentage
                }
            });
        }

       
        this.monitoring.recordResourceUsage(
            tenantId,
            'queries',
            updatedUsage.queriesCount,
            limit.monthlyQueries
        );

       
        const percentage = Math.round((updatedUsage.queriesCount / limit.monthlyQueries) * 100);

        if (percentage >= 80 && (updatedUsage.queriesCount - 1) <= limit.monthlyQueries * 0.8) {
            await this.emitLimitWarning(tenantId, 'QUERIES', {
                currentValue: updatedUsage.queriesCount,
                limitValue: limit.monthlyQueries,
                percentage
            }, context);
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
            console.log('📢 [Limits] Emitting limit warning:', {
                tenantId,
                limitType,
                limitData
            });

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
                message: `${limitType} limit warning (80% reached) for tenant ${tenantId}`,
                eventType: 'LIMIT_WARNING',
                limitType,
                limitData,
                metadata: {
                    service: 'LimitsService',
                    action: 'checkLimit',
                    severity: 'MEDIUM'
                }
            };

            await this.auditService.emit(event);
            console.log('✅ [Limits] Warning event emitted successfully');
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
        
        const currentUsage = await this.usageModel.findOne({ tenantId }).exec() ||
            await this.usageModel.create({ tenantId, documentsCount: 0, dataSizeKB: 0, queriesCount: 0 });

        
        const newDocsCount = currentUsage.documentsCount + docsCount;
        const newDataSizeKB = currentUsage.dataSizeKB + dataSizeKB;

        if (newDocsCount < 0 || newDataSizeKB < 0) {
            throw new ForbiddenException('Usage values cannot be negative');
        }

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