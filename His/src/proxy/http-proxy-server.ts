/* eslint-disable prettier/prettier */
import express from 'express';
import axios from 'axios';
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
        this.app.use('/mongo/*', async (req, res) => {
            try {
                console.log('🔄 [HTTP Proxy] Request intercepted:', req.method, req.path);
                const authResult = await this.checkAuthentication(req);
                if (!authResult.success || !authResult.tenantId) {
                    return res.status(401).json(authResult);
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

            // Для тестирования с mock токеном - используем первый доступный тенант
            if (token === 'valid-token') {
                // Пытаемся найти первый доступный тенант из БД
                const allTenants = await this.tenantsService.getAllTenants();
                if (allTenants && allTenants.length > 0) {
                    const firstTenant = allTenants[0];
                    console.log(`🔍 [Proxy] The first tenant from the database is used: ${firstTenant.tenantId}`);
                    return {
                        success: true,
                        tenantId: firstTenant.tenantId,
                        userId: 'mock-user',
                        source: 'mock-token-first-tenant'
                    };
                }
                // Если тенантов нет, используем старый mock
                return {
                    success: true,
                    tenantId: 'tenant123',
                    userId: 'user456',
                    source: 'mock-token'
                };
            }

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

    private async checkDataLimits(req: express.Request, tenantId: string) {
        try {
            const operation = this.detectOperation(req);
            const dataSize = this.calculateDataSize(req);

            // ✅ Создаем context для audit logging
            const context = {
                requestId: `proxy-${Date.now()}`,
                method: req.method,
                endpoint: req.path,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            console.log('🔍 [Limits] Проверка лимитов:', {
                tenantId,
                operation: operation.type,
                documents: operation.documents,
                dataSizeKB: dataSize
            });

            // ✅ Передаем context в каждый check метод
            if (operation.documents > 0) {
                await this.limitsService.checkDocumentsLimit(
                    tenantId,
                    operation.documents,
                    context  // ← ДОБАВИТЬ!
                );
            }

            if (dataSize > 0) {
                await this.limitsService.checkDataSizeLimit(
                    tenantId,
                    dataSize,
                    context  // ← ДОБАВИТЬ!
                );
            }

            await this.limitsService.checkQueriesLimit(
                tenantId,
                context  // ← ДОБАВИТЬ!
            );

            console.log('✅ [Limits] Все проверки пройдены');
            return { success: true };
        } catch (error) {
            console.log('❌ [Limits] Лимит превышен:', error.message);
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
            // Получаем подключение к базе тенанта
            const connection = await (this.tenantConnectionService as any).getTenantConnection(
                tenantId
            );
            const collectionName = this.extractCollectionName(req.path);

            // Используем нативную коллекцию MongoDB (работает для всех коллекций)
            // Для пациентов можно использовать модель, но для универсальности используем collection
            const collection = connection.collection(collectionName);

            let result;
            switch (req.method) {
                case 'GET':
                case 'POST':
                    if (body.operation === 'find') {
                        // Убираем tenantId из фильтра так как мы уже в базе тенанта
                        const filter = { ...body.filter };
                        delete filter.tenantId; // tenantId уже не нужен в фильтре

                        const cursor = collection.find(filter || {});
                        if (body.limit) {
                            cursor.limit(body.limit);
                        }
                        result = await cursor.toArray();
                    } else if (body.operation === 'insertOne') {
                        // Убираем tenantId из документа если он есть (он уже в базе)
                        const document = { ...body.document };
                        delete document.tenantId;
                        result = await collection.insertOne(document);
                    } else if (body.operation === 'insertMany') {
                        // Убираем tenantId из каждого документа
                        const documents = body.documents.map((doc: any) => {
                            const cleanDoc = { ...doc };
                            delete cleanDoc.tenantId;
                            return cleanDoc;
                        });
                        result = await collection.insertMany(documents);
                    } else if (body.operation === 'updateOne') {
                        // Убираем tenantId из фильтра
                        const filter = { ...body.filter };
                        delete filter.tenantId;
                        result = await collection.updateOne(
                            filter,
                            body.update
                        );
                    } else if (body.operation === 'deleteOne') {
                        // Убираем tenantId из фильтра
                        const filter = { ...body.filter };
                        delete filter.tenantId;
                        result = await collection.deleteOne(filter);
                    } else {
                        // По умолчанию - find
                        const filter = { ...body.filter };
                        delete filter.tenantId;
                        result = await collection.find(filter || {}).toArray();
                    }
                    break;
                default:
                    throw new Error(`Unsupported method: ${req.method}`);
            }

            console.log('✅ [Proxy] MongoDB ответ получен:', {
                operation: body.operation,
                documentsCount: Array.isArray(result) ? result.length : 1,
                success: true
            });

            return {
                success: true,
                data: result,
                operation: body.operation,
                tenantId: body.filter?.tenantId
            };

        } catch (error) {
            console.error('❌ [Proxy] MongoDB ошибка:', error);
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
        let documents = 1;

        switch (operation) {
            case 'insertMany':
                documents = req.body.documents?.length || 1;
                break;
            case 'find':
                documents = 0;
                break;
            default:
                documents = 1;
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

    public start(port: number = 3001) {
        this.app.listen(port, () => {
            console.log(`🚀 [HTTP Proxy] Сервер запущен на порту ${port}`);
            console.log(`📡 [HTTP Proxy] MongoDB Proxy: http://localhost:${port}/mongo/*`);
            console.log(`🏥 [HTTP Proxy] Health Check: http://localhost:${port}/proxy/health`);
        });
    }

    public getApp() {
        return this.app;
    }
}
