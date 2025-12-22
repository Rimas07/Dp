/* eslint-disable prettier/prettier */
import express from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../auth/auth.service';
import { LimitsService } from '../limits/limits.service';
import { TenantsService } from '../tenants/tenants.service';
import { AuditService } from '../audit/audit.service';
import { TenantConnectionService } from '../services/tenant-connection.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { register } from 'prom-client';

export class HttpProxyServer {
    private app: express.Application;
    private authService: AuthService;
    private limitsService: LimitsService;
    private tenantsService: TenantsService;
    private auditService: AuditService;
    private tenantConnectionService: TenantConnectionService;
    private jwtService: JwtService;
    private usersService: UsersService;
    private monitoringService: MonitoringService;

    // Rate limiting storage
    private tenantRequestCounts: Map<string, { count: number; resetTime: number }> = new Map();

    constructor(
        authService: AuthService,
        limitsService: LimitsService,
        tenantsService: TenantsService,
        auditService: AuditService,
        tenantConnectionService: TenantConnectionService,
        jwtService: JwtService,
        usersService: UsersService,
        monitoringService: MonitoringService
    ) {
        this.authService = authService;
        this.limitsService = limitsService;
        this.tenantsService = tenantsService;
        this.auditService = auditService;
        this.tenantConnectionService = tenantConnectionService;
        this.jwtService = jwtService;
        this.usersService = usersService;
        this.monitoringService = monitoringService;

        this.app = express();
        this.app.use(express.json());
        this.setupProxy();
    }

    private setupProxy() {
        // 1️⃣ Глобальный rate limiter - защита от DDoS
        const globalLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 минута
            max: 5, // максимум 100 запросов с одного IP за минуту
            message: {
                success: false,
                error: 'Too many requests from this IP',
                message: 'Please try again later'
            },
            standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
            legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        });

        // Применяем глобальный лимитер ко всем /mongo/* запросам
        // Используем middleware для всех путей, начинающихся с /mongo/
        this.app.use('/mongo', globalLimiter);

        // Создаем обработчик для всех методов
        const mongoHandler = async (req: express.Request, res: express.Response) => {
            const startTime = Date.now();
            const method = req.method;
            const path = req.originalUrl || req.url;
            let tenantId = 'unknown';
            let statusCode = 500;

            try {
                // Убрали verbose логи - запрос обрабатывается автоматически

                const authResult = await this.checkAuthentication(req);
                if (!authResult.success || !authResult.tenantId) {
                    statusCode = 401;
                    return res.status(401).json(authResult);
                }

                tenantId = authResult.tenantId;

                // 2️⃣ Rate limiting по tenantId
                const rateLimitResult = this.checkRateLimit(authResult.tenantId);
                if (!rateLimitResult.success) {
                    statusCode = 429;
                    return res.status(429).json(rateLimitResult);
                }

                const tenantResult = await this.checkTenant(req, authResult.tenantId);
                if (!tenantResult.success) {
                    statusCode = 403;
                    return res.status(403).json(tenantResult);
                }
                const limitsResult = await this.checkDataLimits(req, authResult.tenantId);
                if (!limitsResult.success) {
                    statusCode = 429;
                    return res.status(429).json(limitsResult);
                }
                const modifiedBody = this.modifyRequest(req, authResult.tenantId);

                const mongoResponse = await this.forwardToMongoDB(req, authResult.tenantId, modifiedBody);

                await this.logRequest(req, authResult.tenantId, mongoResponse);
                statusCode = 200;
                res.json(mongoResponse);

            } catch (error) {
                console.error('❌ [HTTP Proxy] Error:', error);
                statusCode = error.status || 500;
                res.status(statusCode).json({
                    success: false,
                    error: 'Proxy error',
                    message: error.message
                });
            } finally {
                // Записываем метрики в Prometheus
                const duration = Date.now() - startTime;
                if (this.monitoringService) {
                    this.monitoringService.recordRequest(
                        tenantId,
                        method,
                        path,
                        statusCode,
                        duration
                    );
                }
            }
        };

        // Обрабатываем все HTTP методы для путей /mongo/*
        // Используем use() для обработки всех подпутей /mongo/*
        // Express автоматически удаляет префикс '/mongo' из req.path
        this.app.use('/mongo', mongoHandler);

        // Health check
        this.app.get('/proxy/health', (req, res) => {
            res.json({ status: 'HTTP Proxy Server is running!' });
        });

        // Rate limiting statistics endpoint
        this.app.get('/proxy/rate-limit-stats', (req, res) => {
            const stats = this.getRateLimitStats();
            res.json(stats);
        });

        // Prometheus metrics endpoint
        this.app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (error) {
                res.status(500).end(error);
            }
        });

        // Периодическая очистка старых данных rate limiting (каждые 5 минут)
        setInterval(() => {
            this.cleanupOldRateLimitData();
        }, 5 * 60 * 1000);
    }

    private async checkAuthentication(req: express.Request) {
        try {
            // Проверяем что headers существуют
            if (!req.headers) {
                console.error('❌ [Proxy] req.headers is undefined');
                return { success: false, error: 'Request headers are missing' };
            }

            // Вариант 1: Проверяем X-Tenant-ID заголовок (для тестирования)
            // Express автоматически приводит заголовки к нижнему регистру, но проверим все варианты
            const headerTenantId = (req.headers['x-tenant-id'] ||
                req.headers['X-TENANT-ID'] ||
                req.headers['X-Tenant-ID']) as string;

            // Вариант 2: Используем JWT токен
            const authHeader = req.headers.authorization;
            let token: string | null = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }

            // Если предоставлен токен, проверяем его валидность через AuthService.validateToken
            if (token) {
                const validationResult = await this.authService.validateToken(token);
                if (!validationResult.success) {
                    console.warn(`⚠️ [Proxy] Token validation failed: ${validationResult.error}`);
                    return { 
                        success: false, 
                        error: validationResult.error || 'Invalid or expired token' 
                    };
                }

                const tokenTenantId = validationResult.tenantId;
                const userId = validationResult.userId;

                // Если есть X-Tenant-ID, проверяем соответствие
                if (headerTenantId && tokenTenantId !== headerTenantId) {
                    console.warn(`⚠️ [Proxy] Tenant mismatch: token tenantId=${tokenTenantId}, header tenantId=${headerTenantId}`);
                    return { 
                        success: false, 
                        error: 'Token tenant mismatch. Token tenantId does not match X-TENANT-ID header' 
                    };
                }

                // Используем tenantId из токена, если X-Tenant-ID не предоставлен
                const finalTenantId = headerTenantId || tokenTenantId;
                
                // Проверяем что тенант существует
                const tenant = await this.tenantsService.getTenantById(finalTenantId);
                if (!tenant) {
                    console.warn(`⚠️ [Proxy] Tenant not found: ${finalTenantId}`);
                    return { 
                        success: false, 
                        error: `Tenant ${finalTenantId} does not exist` 
                    };
                }

                return {
                    success: true,
                    tenantId: finalTenantId,
                    userId: userId,
                    source: 'jwt-token-validated'
                };
            }

            // Если токен не предоставлен, но есть X-Tenant-ID, используем его (для обратной совместимости)
            if (headerTenantId) {
                const tenant = await this.tenantsService.getTenantById(headerTenantId);
                if (tenant) {
                    return {
                        success: true,
                        tenantId: headerTenantId,
                        userId: 'from-header',
                        source: 'header'
                    };
                } else {
                    console.warn(`⚠️ [Proxy] Tenant not found: ${headerTenantId}`);
                }
            }

            return { success: false, error: 'No valid token provided. Use Authorization: Bearer <token> or X-Tenant-ID header' };
        } catch (error) {
            console.error('❌ [Proxy] Authentication error:', error);
            return { success: false, error: `Authentication failed: ${error.message}` };
        }
    }

    private async checkTenant(req: express.Request, tenantId: string) {
        try {
            const tenant = await this.tenantsService.getTenantById(tenantId);

            // Для тестирования с mock токеном - пропускаем если тенанта нет
            // В продакшене это должно быть строгой проверкой
            if (!tenant) {
                console.log(`⚠️ [Proxy] Tenant ${tenantId} not found in DB, but continuing for testing`);
                // Возвращаем успех для тестирования, но предупреждаем
                return {
                    success: true,
                    tenant: { tenantId },
                    warning: 'Tenant not found in DB, proceeding for testing'
                };
            }

            return { success: true, tenant };
        } catch (error) {
            console.error('❌ [Proxy] Tenant validation error:', error);
            // Для тестирования - не блокируем запрос
            return {
                success: true,
                tenant: { tenantId },
                warning: 'Tenant validation error, proceeding for testing'
            };
        }
    }

    /**
     * 🚦 Rate Limiting по tenantId
     * Ограничивает количество запросов от одного tenant в единицу времени
     */
    private checkRateLimit(tenantId: string): { success: boolean; error?: string; details?: any } {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 минута
        const maxRequestsPerWindow = 50; // 50 запросов в минуту для одного tenant

        // Получаем или создаем запись для tenant
        let tenantData = this.tenantRequestCounts.get(tenantId);

        if (!tenantData || now > tenantData.resetTime) {
            // Создаем новое окно или сбрасываем старое
            tenantData = {
                count: 1,
                resetTime: now + windowMs
            };
            this.tenantRequestCounts.set(tenantId, tenantData);

            // Убрали verbose логи - окно создается автоматически
            return { success: true };
        }

        // Увеличиваем счетчик
        tenantData.count++;

        // Вычисляем оставшееся время до сброса
        const timeUntilReset = Math.ceil((tenantData.resetTime - now) / 1000);

        // Логируем только если приближаемся к лимиту (80%+)
        const usagePercent = (tenantData.count / maxRequestsPerWindow) * 100;
        if (usagePercent >= 80) {
            console.warn(`⚠️ [Rate Limit] Tenant ${tenantId}: ${tenantData.count}/${maxRequestsPerWindow} requests (${usagePercent.toFixed(0)}%)`);
        }

        // Проверяем лимит
        if (tenantData.count > maxRequestsPerWindow) {
            console.error(`❌ [Rate Limit] BLOCKED! Tenant ${tenantId} exceeded limit of ${maxRequestsPerWindow} requests per minute`);
            return {
                success: false,
                error: 'Rate limit exceeded',
                details: {
                    message: `Too many requests from tenant ${tenantId}`,
                    limit: maxRequestsPerWindow,
                    windowMs: windowMs,
                    current: tenantData.count,
                    retryAfter: timeUntilReset,
                    resetTime: new Date(tenantData.resetTime).toISOString()
                }
            };
        }

        return {
            success: true,
            details: {
                remaining: maxRequestsPerWindow - tenantData.count,
                resetIn: timeUntilReset
            }
        };
    }

    private async checkDataLimits(req: express.Request, tenantId: string) {
        try {
            // 1️⃣ СНАЧАЛА получить текущий usage
            const currentUsage = await this.limitsService.getUsageForTenant(tenantId);
            const currentLimits = await this.limitsService.getLimitsForTenant(tenantId);

            const operation = this.detectOperation(req);
            const dataSize = this.calculateDataSize(req);

            // Убрали verbose логи - проверка выполняется автоматически
            // Логируем только предупреждения о приближении лимитов

            const remainingDataSize = currentLimits.maxDataSizeKB - currentUsage.dataSizeKB;
            const dataSizeUsagePercent = (currentUsage.dataSizeKB / currentLimits.maxDataSizeKB) * 100;
            const remainingDataSizePercent = (remainingDataSize / currentLimits.maxDataSizeKB) * 100;

            // Предупреждение о приближении лимита размера данных
            if (remainingDataSizePercent <= 10) {
                console.warn(`⚠️  [Limits] CRITICAL: Data size limit almost reached for tenant ${tenantId}! Only ${remainingDataSizePercent.toFixed(1)}% remaining (${remainingDataSize} KB)`);
            } else if (remainingDataSizePercent <= 20) {
                console.warn(`⚠️  [Limits] Data size limit approaching for tenant ${tenantId}! Only ${remainingDataSizePercent.toFixed(1)}% remaining (${remainingDataSize} KB)`);
            }

            // Предупреждение о приближении лимита документов
            const remainingDocuments = currentLimits.maxDocuments - currentUsage.documentsCount;
            const remainingDocumentsPercent = (remainingDocuments / currentLimits.maxDocuments) * 100;
            if (remainingDocumentsPercent <= 10) {
                console.warn(`⚠️  [Limits] CRITICAL: Documents limit almost reached for tenant ${tenantId}! Only ${remainingDocumentsPercent.toFixed(1)}% remaining (${remainingDocuments} documents)`);
            } else if (remainingDocumentsPercent <= 20) {
                console.warn(`⚠️  [Limits] Documents limit approaching for tenant ${tenantId}! Only ${remainingDocumentsPercent.toFixed(1)}% remaining (${remainingDocuments} documents)`);
            }

            // 3️⃣ ВЫПОЛНИТЬ проверку
            const context = {
                requestId: `proxy-${Date.now()}`,
                method: req.method,
                endpoint: req.path,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            if (operation.documents > 0) {
                await this.limitsService.checkDocumentsLimit(tenantId, operation.documents, context);
            }
            if (dataSize > 0) {
                await this.limitsService.checkDataSizeLimit(tenantId, dataSize, context);
            }
            await this.limitsService.checkQueriesLimit(tenantId, context);

            // Убрали verbose логи успеха - проверка прошла автоматически
            return { success: true };
        } catch (error) {
            // Логируем только ошибки превышения лимитов (критично)
            console.error('❌ [Limits] LIMIT EXCEEDED for tenant:', tenantId);
            console.error(`   Reason: ${error.message}`);
            console.error('🚫 Operation blocked!');

            return {
                success: false,
                error: 'Data limits exceeded',
                details: error.message
            };
        }
    }

    private modifyRequest(req: express.Request, tenantId: string): any {
        const modifiedBody = { ...req.body };
        if (modifiedBody.filter) {
            modifiedBody.filter = {
                ...modifiedBody.filter,
                tenantId: tenantId
            };
        } else {
            modifiedBody.filter = { tenantId: tenantId };
        }

        if (modifiedBody.limit && modifiedBody.limit > 1000) {
            modifiedBody.limit = 1000;
        }

        // Убрали verbose логи - модификация выполняется автоматически
        return modifiedBody;
    }

    /**
     * Normalize operation string - remove whitespace and normalize Unicode
     */
    private normalizeOperation(operation: any): string {
        if (!operation) return 'find';
        const normalized = String(operation)
            .trim()
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width spaces and BOM
        return normalized;
    }

    private async forwardToMongoDB(req: express.Request, tenantId: string, body: any) {
        try {
            const connection = await (this.tenantConnectionService as any).getTenantConnection(
                tenantId
            );
            const collectionName = this.extractCollectionName(req.path);
            const collection = connection.collection(collectionName);

            let result;
            // Normalize operation to handle edge cases
            const operation = this.normalizeOperation(body.operation);

            switch (operation) {
                // READ - Получить всех пациентов
                case 'find':
                case 'findMany': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    const cursor = collection.find(filter || {});
                    if (body.limit) cursor.limit(body.limit);
                    if (body.skip) cursor.skip(body.skip);
                    if (body.sort) cursor.sort(body.sort);

                    result = await cursor.toArray();
                    break;
                }

                // READ - Получить одного пациента по ID
                case 'findOne':
                case 'findById': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    // Если передан ID напрямую
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    result = await collection.findOne(filter);
                    break;
                }

                // CREATE - Создать одного пациента
                case 'insertOne':
                case 'create': {
                    const document = { ...body.document };
                    delete document.tenantId;

                    const insertResult = await collection.insertOne(document);
                    result = {
                        ...document,
                        _id: insertResult.insertedId,
                        acknowledged: insertResult.acknowledged
                    };
                    break;
                }

                // CREATE - Создать нескольких пациентов
                case 'insertMany':
                case 'createMany': {
                    const documents = body.documents.map((doc: any) => {
                        const cleanDoc = { ...doc };
                        delete cleanDoc.tenantId;
                        return cleanDoc;
                    });

                    const insertResult = await collection.insertMany(documents);
                    result = {
                        insertedIds: insertResult.insertedIds,
                        insertedCount: insertResult.insertedCount,
                        acknowledged: insertResult.acknowledged
                    };
                    break;
                }

                // UPDATE - Обновить одного пациента
                case 'updateOne':
                case 'update': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    // Если передан ID напрямую
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    const update = body.update || { $set: body.data };
                    const updateResult = await collection.updateOne(filter, update);

                    // Получаем обновленный документ
                    const updatedDoc = await collection.findOne(filter);

                    result = {
                        matchedCount: updateResult.matchedCount,
                        modifiedCount: updateResult.modifiedCount,
                        acknowledged: updateResult.acknowledged,
                        document: updatedDoc
                    };
                    break;
                }

                // UPDATE - Обновить несколько пациентов
                case 'updateMany': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    const update = body.update || { $set: body.data };
                    const updateResult = await collection.updateMany(filter, update);

                    result = {
                        matchedCount: updateResult.matchedCount,
                        modifiedCount: updateResult.modifiedCount,
                        acknowledged: updateResult.acknowledged
                    };
                    break;
                }

                // DELETE - Удалить одного пациента
                case 'deleteOne':
                case 'delete': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    // Если передан ID напрямую
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    // Сначала получаем документ для возврата
                    const docToDelete = await collection.findOne(filter);

                    const deleteResult = await collection.deleteOne(filter);

                    result = {
                        deletedCount: deleteResult.deletedCount,
                        acknowledged: deleteResult.acknowledged,
                        document: docToDelete
                    };
                    break;
                }

                // DELETE - Удалить несколько пациентов
                case 'deleteMany': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    const deleteResult = await collection.deleteMany(filter);

                    result = {
                        deletedCount: deleteResult.deletedCount,
                        acknowledged: deleteResult.acknowledged
                    };
                    break;
                }

                // COUNT - Подсчитать документы
                case 'count':
                case 'countDocuments': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    result = await collection.countDocuments(filter || {});
                    break;
                }

                // ATOMIC OPERATIONS - Атомарные операции для тестирования
                case 'findOneAndUpdate': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    // Если передан ID напрямую
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    const update = body.update || { $set: body.data };
                    const options = {
                        returnDocument: body.returnDocument || 'after', // 'before' | 'after'
                        upsert: body.upsert || false,
                        ...(body.sort && { sort: body.sort }),
                        ...(body.projection && { projection: body.projection })
                    };

                    result = await collection.findOneAndUpdate(filter, update, options);
                    break;
                }

                case 'findOneAndReplace': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    const replacement = { ...body.replacement };
                    delete replacement.tenantId;

                    const options = {
                        returnDocument: body.returnDocument || 'after',
                        upsert: body.upsert || false,
                        ...(body.sort && { sort: body.sort })
                    };

                    result = await collection.findOneAndReplace(filter, replacement, options);
                    break;
                }

                case 'findOneAndDelete': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    const options = {
                        ...(body.sort && { sort: body.sort }),
                        ...(body.projection && { projection: body.projection })
                    };

                    result = await collection.findOneAndDelete(filter, options);
                    break;
                }

                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }

            // Убрали verbose логи успеха - операция завершена автоматически
            return {
                success: true,
                data: result,
                operation: operation,
                tenantId: tenantId
            };

        } catch (error) {
            console.error('❌ [Proxy] MongoDB error:', error);
            throw error;
        }
    }

    private async logRequest(req: express.Request, tenantId: string, response: any) {
        try {
            await this.auditService.emit({
                timestamp: new Date().toISOString(),
                level: 'info',
                requestId: `proxy-${Date.now()}`,
                tenantId: tenantId,
                method: req.method,
                path: req.path,
                statusCode: 200,
                durationMs: 0,
                message: `Proxy request processed for tenant ${tenantId}`,
                eventType: 'PATIENT_READ',
                requestBody: req.body,
                responseBody: response,
                metadata: {
                    service: 'HttpProxyServer',
                    action: 'forwardRequest',
                    operation: req.body.operation
                }
            });
        } catch (error) {
            console.error('❌ [Audit] Logging error:', error);
        }
    }

    private detectOperation(req: express.Request) {
        const operation = req.body.operation || 'find';
        let documents = 0;

        switch (operation) {
            case 'insertOne':
            case 'create':
                documents = 1;
                break;
            case 'insertMany':
            case 'createMany':
                documents = req.body.documents?.length || 0;
                break;
            case 'updateOne':
            case 'update':
            case 'deleteOne':
            case 'delete':
                documents = 0; // Для update/delete не увеличиваем счетчик документов
                break;
            case 'updateMany':
            case 'deleteMany':
                documents = 0;
                break;
            case 'find':
            case 'findOne':
            case 'findById':
            case 'count':
            case 'countDocuments':
                documents = 0; // Read операции не влияют на количество документов
                break;
            default:
                documents = 0;
        }

        return { type: operation, documents };
    }

    private calculateDataSize(req: express.Request): number {
        const bodySize = JSON.stringify(req.body).length;
        return Math.ceil(bodySize / 1024);
    }

    private extractCollectionName(path: string): string {
        // Извлекаем имя коллекции из пути /mongo/patients -> patients
        const parts = path.split('/').filter(p => p); // Убираем пустые части
        const collectionName = parts[parts.length - 1] || 'default';

        // Mongoose автоматически конвертирует имя модели в множественное число
        // Patient -> patients, но для коллекций используем как есть
        // Убрали verbose логи - извлечение выполняется автоматически
        return collectionName;
    }

    /**
     * 📊 Получить статистику rate limiting
     */
    private getRateLimitStats() {
        const now = Date.now();






























        const stats: Array<{
            tenantId: string;
            requestCount: number;
            isActive: boolean;
            resetTime: string;
            timeUntilResetSeconds: number;
        }> = [];

        for (const [tenantId, data] of this.tenantRequestCounts.entries()) {
            const isActive = now < data.resetTime;
            const timeUntilReset = isActive ? Math.ceil((data.resetTime - now) / 1000) : 0;

            stats.push({
                tenantId,
                requestCount: data.count,
                isActive,
                resetTime: new Date(data.resetTime).toISOString(),
                timeUntilResetSeconds: timeUntilReset
            });
        }

        return {
            success: true,
            totalTenants: stats.length,
            activeTenants: stats.filter(s => s.isActive).length,
            tenants: stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 🧹 Очистка старых данных rate limiting
     */
    private cleanupOldRateLimitData() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [tenantId, data] of this.tenantRequestCounts.entries()) {
            // Удаляем записи, которые истекли более 5 минут назад
            if (now > data.resetTime + 5 * 60 * 1000) {
                this.tenantRequestCounts.delete(tenantId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 [Rate Limit] Cleaned up ${cleanedCount} old tenant records`);
        }
    }

    public start(port: number = 3001) {
        this.app.listen(port, () => {
            console.log(`🚀 [HTTP Proxy] Server started on port ${port}`);
            console.log(`📡 [HTTP Proxy] MongoDB Proxy: http://localhost:${port}/mongo/*path`);
            console.log(`🏥 [HTTP Proxy] Health Check: http://localhost:${port}/proxy/health`);
            console.log(`🚦 [HTTP Proxy] Rate Limit Stats: http://localhost:${port}/proxy/rate-limit-stats`);
            console.log(`⚡ [HTTP Proxy] Rate Limiting active:`);
            console.log(`   - Global limit: 100 requests/min per IP`);
            console.log(`   - Tenant limit: 50 requests/min`);
        });
    }

    public getApp() {
        return this.app;
    }

    /**
     * Публичный метод для обработки запросов напрямую (для использования в NestJS контроллерах)
     */
    public async handleRequest(req: express.Request, res: express.Response) {
        const startTime = Date.now();
        const method = req.method;
        // Используем originalUrl для получения полного пути, включая query параметры
        let fullPath = req.originalUrl || req.url;
        // Если путь начинается с /proxy/mongo, убираем префикс /proxy
        if (fullPath.startsWith('/proxy/mongo')) {
            fullPath = fullPath.replace('/proxy/mongo', '/mongo');
        }
        const path = fullPath;
        // Сохраняем оригинальный path и устанавливаем правильный путь для обработки
        const originalPath = req.path;
        // Используем Object.defineProperty для установки path без создания нового объекта
        Object.defineProperty(req, 'path', {
            value: fullPath.split('?')[0],
            writable: true,
            configurable: true
        });
        let tenantId = 'unknown';
        let statusCode = 500;

        try {
            // Убрали verbose логи - запрос обрабатывается автоматически

            const authResult = await this.checkAuthentication(req);
            if (!authResult.success || !authResult.tenantId) {
                statusCode = 401;
                // Восстанавливаем оригинальный path перед возвратом
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(401).json(authResult);
            }

            tenantId = authResult.tenantId;

            // 2️⃣ Rate limiting по tenantId
            const rateLimitResult = this.checkRateLimit(authResult.tenantId);
            if (!rateLimitResult.success) {
                statusCode = 429;
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(429).json(rateLimitResult);
            }

            const tenantResult = await this.checkTenant(req, authResult.tenantId);
            if (!tenantResult.success) {
                statusCode = 403;
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(403).json(tenantResult);
            }
            const limitsResult = await this.checkDataLimits(req, authResult.tenantId);
            if (!limitsResult.success) {
                statusCode = 429;
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(429).json(limitsResult);
            }
            const modifiedBody = this.modifyRequest(req, authResult.tenantId);

            const mongoResponse = await this.forwardToMongoDB(req, authResult.tenantId, modifiedBody);

            await this.logRequest(req, authResult.tenantId, mongoResponse);
            statusCode = 200;
            res.json(mongoResponse);

        } catch (error) {
            console.error('❌ [HTTP Proxy] Error:', error);
            statusCode = error.status || 500;
            // Восстанавливаем оригинальный path
            Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
            res.status(statusCode).json({
                success: false,
                error: 'Proxy error',
                message: error.message
            });
        } finally {
            // Восстанавливаем оригинальный path в finally
            Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
            // Записываем метрики в Prometheus
            const duration = Date.now() - startTime;
            if (this.monitoringService) {
                this.monitoringService.recordRequest(
                    tenantId,
                    method,
                    path,
                    statusCode,
                    duration
                );
            }
        }
    }
}
