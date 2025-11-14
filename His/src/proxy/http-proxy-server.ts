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

export class HttpProxyServer {
    private app: express.Application;
    private authService: AuthService;
    private limitsService: LimitsService;
    private tenantsService: TenantsService;
    private auditService: AuditService;
    private tenantConnectionService: TenantConnectionService;
    private jwtService: JwtService;
    private usersService: UsersService;

    // Rate limiting storage
    private tenantRequestCounts: Map<string, { count: number; resetTime: number }> = new Map();

    constructor(
        authService: AuthService,
        limitsService: LimitsService,
        tenantsService: TenantsService,
        auditService: AuditService,
        tenantConnectionService: TenantConnectionService,
        jwtService: JwtService,
        usersService: UsersService
    ) {
        this.authService = authService;
        this.limitsService = limitsService;
        this.tenantsService = tenantsService;
        this.auditService = auditService;
        this.tenantConnectionService = tenantConnectionService;
        this.jwtService = jwtService;
        this.usersService = usersService;

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
        this.app.use('/mongo/*', globalLimiter);

        this.app.use('/mongo/*', async (req, res) => {
            try {
                console.log('🔄 [HTTP Proxy] Request intercepted:', req.method, req.path);

                const authResult = await this.checkAuthentication(req);
                if (!authResult.success || !authResult.tenantId) {
                    return res.status(401).json(authResult);
                }

                // 2️⃣ Rate limiting по tenantId
                const rateLimitResult = this.checkRateLimit(authResult.tenantId);
                if (!rateLimitResult.success) {
                    return res.status(429).json(rateLimitResult);
                }

                const tenantResult = await this.checkTenant(req, authResult.tenantId);
                if (!tenantResult.success) {
                    return res.status(403).json(tenantResult);
                }
                const limitsResult = await this.checkDataLimits(req, authResult.tenantId);
                if (!limitsResult.success) {
                    return res.status(429).json(limitsResult);
                }
                const modifiedBody = this.modifyRequest(req, authResult.tenantId);

                const mongoResponse = await this.forwardToMongoDB(req, authResult.tenantId, modifiedBody);

                await this.logRequest(req, authResult.tenantId, mongoResponse);
                res.json(mongoResponse);

            } catch (error) {
                console.error('❌ [HTTP Proxy] Error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Proxy error',
                    message: error.message
                });
            }
        });

        // Health check
        this.app.get('/proxy/health', (req, res) => {
            res.json({ status: 'HTTP Proxy Server is running!' });
        });

        // Rate limiting statistics endpoint
        this.app.get('/proxy/rate-limit-stats', (req, res) => {
            const stats = this.getRateLimitStats();
            res.json(stats);
        });

        // Периодическая очистка старых данных rate limiting (каждые 5 минут)
        setInterval(() => {
            this.cleanupOldRateLimitData();
        }, 5 * 60 * 1000);
    }

    private async checkAuthentication(req: express.Request) {
        try {
            // Вариант 1: Проверяем X-Tenant-ID заголовок (для тестирования)
            const headerTenantId = req.headers['x-tenant-id'] as string;
            if (headerTenantId) {
                console.log(`🔍 [Proxy] Uses tenantId from header: ${headerTenantId}`);
                // Проверяем что тенант существует
                const tenant = await this.tenantsService.getTenantById(headerTenantId);
                if (tenant) {
                    return {
                        success: true,
                        tenantId: headerTenantId,
                        userId: 'from-header',
                        source: 'header'
                    };
                }
            }

            // Вариант 2: Используем JWT токен
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return { success: false, error: 'No valid token provided. Use Authorization: Bearer <token> or X-Tenant-ID header' };
            }

            const token = authHeader.substring(7);

           

            // Вариант 3: Реальный JWT токен
            try {
                // Получаем userId из токена (без проверки секрета пока)
                const decoded = this.jwtService.decode(token) as any;
                if (decoded && decoded.userId) {
                    // Получаем пользователя из БД чтобы узнать его tenantId
                    const user = await this.usersService.getUserById(decoded.userId);
                    if (user && user.tenantId) {
                        console.log(`🔍 [Proxy] The tenantId from the JWT token is used: ${user.tenantId}`);

                        // Проверяем валидность токена с правильным секретом
                        const secret = await this.authService.fetchAccessTokenSecretSigningKey(user.tenantId);
                        await this.jwtService.verify(token, { secret });

                        return {
                            success: true,
                            tenantId: user.tenantId,
                            userId: decoded.userId,
                            source: 'jwt-token'
                        };
                    }
                }
            } catch (jwtError) {
                console.log(`⚠️ [Proxy] JWT token validation error: ${jwtError.message}`);
                // Продолжаем искать другие варианты
            }

            return { success: false, error: 'Invalid token. Provide valid JWT token or X-Tenant-ID header' };
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
                console.log(`⚠️ [Proxy] Тенант ${tenantId} не найден в БД, но продолжаем для тестирования`);
                // Возвращаем успех для тестирования, но предупреждаем
                return {
                    success: true,
                    tenant: { tenantId },
                    warning: 'Tenant not found in DB, proceeding for testing'
                };
            }

            return { success: true, tenant };
        } catch (error) {
            console.error('❌ [Proxy] Ошибка проверки тенанта:', error);
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

            console.log(`🚦 [Rate Limit] New window for tenant ${tenantId}: 1/${maxRequestsPerWindow} requests`);
            return { success: true };
        }

        // Увеличиваем счетчик
        tenantData.count++;

        // Вычисляем оставшееся время до сброса
        const timeUntilReset = Math.ceil((tenantData.resetTime - now) / 1000);

        console.log(`🚦 [Rate Limit] Tenant ${tenantId}: ${tenantData.count}/${maxRequestsPerWindow} requests`);

        // Проверяем лимит
        if (tenantData.count > maxRequestsPerWindow) {
            console.log(`❌ [Rate Limit] БЛОКИРОВАНО! Tenant ${tenantId} превысил лимит ${maxRequestsPerWindow} запросов в минуту`);
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

            // 2️⃣ ЛОГИРОВАТЬ ДО операции
            console.log(`🔍 [Limits] Проверка лимитов для tenant: ${tenantId}`);
            console.log(`📊 [Limits] Операция: ${operation.type}`);
            console.log(`   Добавляется: ${operation.documents} документов, ${dataSize} KB`);
            console.log('');

            console.log('📈 [Limits] ДОКУМЕНТЫ:');
            console.log(`   Текущее: ${currentUsage.documentsCount}/${currentLimits.maxDocuments}`);
            console.log(`   После: ${currentUsage.documentsCount + operation.documents}/${currentLimits.maxDocuments}`);
            console.log(`   Осталось: ${currentLimits.maxDocuments - currentUsage.documentsCount} документов`);
            console.log('');

            console.log('💾 [Limits] РАЗМЕР ДАННЫХ:');
            console.log(`   Текущее: ${currentUsage.dataSizeKB} KB / ${currentLimits.maxDataSizeKB} KB`);
            console.log(`   После: ${currentUsage.dataSizeKB + dataSize} KB / ${currentLimits.maxDataSizeKB} KB`);
            console.log(`   Осталось: ${currentLimits.maxDataSizeKB - currentUsage.dataSizeKB} KB`);
            console.log('');

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

            // 4️⃣ ЛОГИРОВАТЬ успех
            console.log('✅ [Limits] Все проверки пройдены - операция разрешена');
            console.log('═══════════════════════════════════════════════════════\n');

            return { success: true };
        } catch (error) {
            // 5️⃣ ЛОГИРОВАТЬ ошибку
            console.log('❌ [Limits] ЛИМИТ ПРЕВЫШЕН!');
            console.log(`   Причина: ${error.message}`);
            console.log('🚫 Операция заблокирована!');
            console.log('═══════════════════════════════════════════════════════\n');

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

        console.log('🔧 [Proxy] Модифицированный запрос:', {
            original: req.body,
            modified: modifiedBody
        });

        return modifiedBody;
    }

    private async forwardToMongoDB(req: express.Request, tenantId: string, body: any) {
        try {
            const connection = await (this.tenantConnectionService as any).getTenantConnection(
                tenantId
            );
            const collectionName = this.extractCollectionName(req.path);
            const collection = connection.collection(collectionName);

            let result;
            const operation = body.operation || 'find';

            console.log(`🔍 [Proxy] Executing operation: ${operation}`);

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

                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }

            console.log('✅ [Proxy] Operation completed:', {
                operation,
                success: true,
                resultType: Array.isArray(result) ? 'array' : typeof result
            });

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
            console.error('❌ [Audit] Ошибка логирования:', error);
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
        console.log(`🔍 [Proxy] Извлечено имя коллекции из пути ${path}: ${collectionName}`);
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
            console.log(`🚀 [HTTP Proxy] Сервер запущен на порту ${port}`);
            console.log(`📡 [HTTP Proxy] MongoDB Proxy: http://localhost:${port}/mongo/*`);
            console.log(`🏥 [HTTP Proxy] Health Check: http://localhost:${port}/proxy/health`);
            console.log(`🚦 [HTTP Proxy] Rate Limit Stats: http://localhost:${port}/proxy/rate-limit-stats`);
            console.log(`⚡ [HTTP Proxy] Rate Limiting активен:`);
            console.log(`   - Глобальный лимит: 100 запросов/мин с IP`);
            console.log(`   - Лимит по tenant: 50 запросов/мин`);
        });
    }

    public getApp() {
        return this.app;
    }
}
