/* eslint-disable prettier/prettier */
import { Injectable, ForbiddenException } from '@nestjs/common';
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

/**
 * 🔒 LIMITS SERVICE with ATOMIC OPERATIONS
 * 
 * ✅ ИСПРАВЛЕНО: Race Conditions устранены через atomic MongoDB operations
 * 
 * Основные улучшения:
 * 1. checkDocumentsLimit - атомарная проверка + обновление через findOneAndUpdate
 * 2. checkDataSizeLimit - то же самое для размера данных
 * 3. checkQueriesLimit - атомарное обновление счетчика запросов
 * 4. Валидация отрицательных значений в updateUsage
 */
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

    /**
     * ✅ ИСПРАВЛЕНО: Проверка лимита документов через ATOMIC OPERATION
     * 
     * СТАРАЯ ПРОБЛЕМА:
     * - Проверка и обновление были раздельными операциями
     * - Два параллельных запроса могли обойти лимит
     * 
     * НОВОЕ РЕШЕНИЕ:
     * - Используем findOneAndUpdate с условием
     * - MongoDB гарантирует атомарность
     * - Невозможно обойти лимит параллельными запросами
     * 
     * @param tenantId - ID tenant'а
     * @param incomingDocsCount - Количество добавляемых документов
     * @param context - Контекст запроса для audit
     */
    async checkDocumentsLimit(
        tenantId: string,
        incomingDocsCount: number = 1,
        context?: RequestContext
    ): Promise<void> {
        // Валидация входных данных
        if (incomingDocsCount < 0) {
            throw new ForbiddenException('Document count cannot be negative');
        }

        if (incomingDocsCount > 1000) {
            throw new ForbiddenException('Cannot add more than 1000 documents at once');
        }

        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            // Если нет лимитов - пропускаем проверку
            return;
        }

        // ✅ ATOMIC OPERATION: Проверка + обновление за одну операцию
        // MongoDB гарантирует что это выполнится атомарно
        const updatedUsage = await this.usageModel.findOneAndUpdate(
            {
                tenantId,
                // УСЛОВИЕ: Можно ли добавить документы?
                documentsCount: { $lte: limit.maxDocuments - incomingDocsCount }
            },
            {
                // ДЕЙСТВИЕ: Увеличить счетчик
                $inc: { documentsCount: incomingDocsCount }
            },
            {
                new: true,  // Вернуть обновленный документ
                upsert: false  // Не создавать если не существует
            }
        ).exec();

        // Если updatedUsage === null, значит условие не выполнилось (лимит превышен)
        if (!updatedUsage) {
            // Получаем текущее использование для деталей ошибки
            const currentUsage = await this.usageModel.findOne({ tenantId }).exec() ||
                await this.usageModel.create({ tenantId });

            const percentage = Math.round(
                ((currentUsage.documentsCount + incomingDocsCount) / limit.maxDocuments) * 100
            );

            // Логируем нарушение лимита
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

        // Проверка на 90% для warning
        const percentage = Math.round((updatedUsage.documentsCount / limit.maxDocuments) * 100);

        if (percentage >= 90 && (updatedUsage.documentsCount - incomingDocsCount) < limit.maxDocuments * 0.9) {
            await this.emitLimitWarning(tenantId, 'DOCUMENTS', {
                currentValue: updatedUsage.documentsCount,
                limitValue: limit.maxDocuments,
                percentage
            }, context);
        }
    }

    /**
     * ✅ ИСПРАВЛЕНО: Проверка лимита размера данных через ATOMIC OPERATION
     * 
     * Аналогично checkDocumentsLimit, но для размера данных в KB
     */
    async checkDataSizeLimit(
        tenantId: string,
        incomingDataSizeKB: number,
        context?: RequestContext
    ): Promise<void> {
        // Валидация входных данных
        if (incomingDataSizeKB < 0) {
            throw new ForbiddenException('Data size cannot be negative');
        }

        if (incomingDataSizeKB > 10240) {  // 10MB max за раз
            throw new ForbiddenException('Cannot add more than 10MB at once');
        }

        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            return;
        }

        // ✅ ATOMIC OPERATION
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

        // Warning на 90%
        const percentage = Math.round((updatedUsage.dataSizeKB / limit.maxDataSizeKB) * 100);

        if (percentage >= 90 && (updatedUsage.dataSizeKB - incomingDataSizeKB) < limit.maxDataSizeKB * 0.9) {
            await this.emitLimitWarning(tenantId, 'DATA_SIZE', {
                currentValue: updatedUsage.dataSizeKB,
                limitValue: limit.maxDataSizeKB,
                percentage
            }, context);
        }
    }

    /**
     * ✅ ИСПРАВЛЕНО: Проверка лимита запросов через ATOMIC OPERATION
     * 
     * Проверяет и увеличивает счетчик запросов атомарно
     */
    async checkQueriesLimit(tenantId: string, context?: RequestContext): Promise<void> {
        const limit = await this.limitsModel.findOne({ tenantId }).exec();

        if (!limit) {
            return;
        }

        // ✅ ATOMIC OPERATION
        const updatedUsage = await this.usageModel.findOneAndUpdate(
            {
                tenantId,
                queriesCount: { $lt: limit.monthlyQueries }  // Строго меньше
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

        // Warning на 90%
        const percentage = Math.round((updatedUsage.queriesCount / limit.monthlyQueries) * 100);

        if (percentage >= 90 && (updatedUsage.queriesCount - 1) < limit.monthlyQueries * 0.9) {
            await this.emitLimitWarning(tenantId, 'QUERIES', {
                currentValue: updatedUsage.queriesCount,
                limitValue: limit.monthlyQueries,
                percentage
            }, context);
        }
    }

    /**
     * Логирует нарушение лимита в audit систему
     */
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

    /**
     * Логирует предупреждение о приближении к лимиту
     */
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

    /**
     * Обновляет лимиты для tenant'а
     */
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

    /**
     * ⚠️ DEPRECATED: Этот метод больше не используется!
     * 
     * Обновление usage теперь происходит атомарно внутри check* методов.
     * Оставлено для обратной совместимости, но использовать НЕ рекомендуется.
     * 
     * @deprecated Используйте check* методы вместо этого
     */
    async updateUsage(tenantId: string, docsCount: number, dataSizeKB: number): Promise<void> {
        // ✅ Валидация: защита от отрицательных значений
        if (docsCount < 0 || dataSizeKB < 0) {
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

    /**
     * Получает лимиты для tenant'а
     */
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

    /**
     * Получает текущее использование для tenant'а
     */
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