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
        
        const globalLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 минута
            max: 10, 
            message: {
                success: false,
                error: 'Too many requests from this IP',
                message: 'Please try again later'
            },
            standardHeaders: true, 
            legacyHeaders: false, 
        });

      
        this.app.use('/mongo', globalLimiter);

     
        this.app.use('/mongo', async (req, res) => {
            const startTime = Date.now();
            const method = req.method;
            const path = req.originalUrl || req.url;
            let tenantId = 'unknown';
            let statusCode = 500;

            try {
                console.log('🔄 [HTTP Proxy] Request intercepted:', req.method, req.originalUrl || req.url);

                const authResult = await this.checkAuthentication(req);
                if (!authResult.success || !authResult.tenantId) {
                    statusCode = 401;
                    return res.status(401).json(authResult);
                }

                tenantId = authResult.tenantId;

                const limitsResult = await this.checkDataLimits(req, authResult.tenantId);
                if (!limitsResult.success) {
                    statusCode = 403;
                    return res.status(403).json(limitsResult);
                }
                const modifiedBody = this.modifyRequest(req, authResult.tenantId);

                const mongoResponse = await this.forwardToMongoDB(req, authResult.tenantId, modifiedBody);

                statusCode = 200;
                await this.logRequest(req, authResult.tenantId, mongoResponse, startTime, statusCode);
                res.json(mongoResponse);

            } catch (error) {
                console.error('❌ [HTTP Proxy] Error:', error);
                statusCode = error.status || 500;
                await this.logRequest(req, tenantId, null, startTime, statusCode);
                res.status(statusCode).json({
                    success: false,
                    error: 'Proxy error',
                    message: error.message
                });
            } finally {

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
        });
        this.app.get('/proxy/health', (req, res) => {
            res.json({ status: 'HTTP Proxy Server is running!' });
        });
        this.app.get('/proxy/rate-limit-stats', (req, res) => {
            res.json({
                success: true,
                message: 'Rate limiting is handled by express-rate-limit middleware',
                note: 'For NestJS endpoints, rate limiting is handled by @nestjs/throttler',
                expressServerLimit: '5 requests per minute per IP'
            });
        });

        this.app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (error) {
                res.status(500).end(error);
            }
        });
    }

    private async checkAuthentication(req: express.Request) {
        try {
            if (!req.headers) {
                console.error('❌ [Proxy] req.headers is undefined');
                return { success: false, error: 'Request headers are missing' };
            }

           
            const headerTenantId = (req.headers['x-tenant-id'] ||
                req.headers['X-TENANT-ID'] ||
                req.headers['X-Tenant-ID']) as string;

            if (headerTenantId) {
                console.log(`🔍 [Proxy] Uses tenantId from header: ${headerTenantId}`);
                const tenant = await this.tenantsService.getTenantById(headerTenantId);
                if (tenant) {
                    return {
                        success: true,
                        tenantId: headerTenantId,
                        userId: 'from-header',
                        source: 'header'
                    };
                } else {
                    console.log(`⚠️ [Proxy] Tenant not found: ${headerTenantId}`);
                }
            }

          
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return { success: false, error: 'No valid token provided. Use Authorization: Bearer <token> or X-Tenant-ID header' };
            }

            const token = authHeader.substring(7);

            
            const validationResult = await this.authService.validateToken(token);

            if (validationResult.success) {
                console.log(`🔍 [Proxy] The tenantId from the JWT token is used: ${validationResult.tenantId}`);
                return {
                    success: true,
                    tenantId: validationResult.tenantId,
                    userId: validationResult.userId,
                    source: 'jwt-token'
                };
            }

            return { success: false, error: validationResult.error || 'Invalid token' };
        } catch (error) {
            console.error('❌ [Proxy] Authentication error:', error);
            return { success: false, error: `Authentication failed: ${error.message}` };
        }
    }

    private async checkDataLimits(req: express.Request, tenantId: string) {
        try {
            const operation = this.detectOperation(req);
            const dataSize = this.calculateDataSize(req);

            const context = {
                requestId: `proxy-${Date.now()}`,
                method: req.method,
                endpoint: req.path,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const isReadOperation = ['find', 'findOne', 'findById', 'count', 'countDocuments'].includes(operation.type);

   
            if (operation.documents > 0) {
                await this.limitsService.checkDocumentsLimit(tenantId, operation.documents, context);
            }
            
         
            if (!isReadOperation && dataSize > 0) {
                await this.limitsService.checkDataSizeLimit(tenantId, dataSize, context);
            }
   
            await this.limitsService.checkQueriesLimit(tenantId, context);

            return { success: true };
        } catch (error) {
            console.log('❌ [Limits] LIMIT EXCEEDED:', error.message);
            return {
                success: false,
                error: 'Data limit exceeded',
              
                
            };
        }
    }

    private modifyRequest(req: express.Request, tenantId: string): any {
        
        const modifiedBody = req.method === 'GET' ? { operation: 'find' } : { ...req.body };

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

        console.log('🔧 [Proxy] Modified request:', {
            method: req.method,
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

                
                case 'findOne':
                case 'findById': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    result = await collection.findOne(filter);
                    break;
                }

                
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

                
                case 'updateOne':
                case 'update': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                    
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    const update = body.update || { $set: body.data };
                    const updateResult = await collection.updateOne(filter, update);

                    
                    const updatedDoc = await collection.findOne(filter);

                    result = {
                        matchedCount: updateResult.matchedCount,
                        modifiedCount: updateResult.modifiedCount,
                        acknowledged: updateResult.acknowledged,
                        document: updatedDoc
                    };
                    break;
                }

                
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

               
                case 'deleteOne':
                case 'delete': {
                    const filter = { ...body.filter };
                    delete filter.tenantId;

                   
                    if (body.id) {
                        filter._id = new (await import('mongodb')).ObjectId(body.id);
                    }

                    
                    const docToDelete = await collection.findOne(filter);

                    const deleteResult = await collection.deleteOne(filter);

                    result = {
                        deletedCount: deleteResult.deletedCount,
                        acknowledged: deleteResult.acknowledged,
                        document: docToDelete
                    };
                    break;
                }

                
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

    private async logRequest(req: express.Request, tenantId: string, response: any, startTime: number, statusCode: number) {
        try {
           
            const ignoredPaths = ['/metrics', '/proxy/metrics', '/proxy/health', '/proxy/rate-limit-stats'];
            const requestPath = req.path || req.url;

            if (ignoredPaths.some(path => requestPath.includes(path))) {
                console.log(`🔇 [Audit] Skipping audit log for service endpoint: ${requestPath}`);
                return;
            }

            const operation = this.detectOperation(req);
            const eventType = this.mapOperationToEventType(operation.type);

            await this.auditService.emit({
                timestamp: new Date().toISOString(),
                level: statusCode >= 400 ? 'error' : 'info',
                requestId: `proxy-${Date.now()}`,
                tenantId: tenantId,
                method: req.method,
                path: req.path,
                statusCode: statusCode,
                durationMs: Date.now() - startTime,
                message: `Proxy request processed for tenant ${tenantId}`,
                eventType: eventType,
                requestBody: req.body,
                responseBody: response,
                metadata: {
                    service: 'HttpProxyServer',
                    action: 'forwardRequest',
                    operation: operation.type
                }
            });
        } catch (error) {
            console.error('❌ [Audit] Logging error:', error);
        }
    }

    private mapOperationToEventType(operation: string): 'PATIENT_READ' | 'PATIENT_CREATE' | 'PATIENT_UPDATE' | 'PATIENT_DELETE' {
        const mapping: Record<string, 'PATIENT_READ' | 'PATIENT_CREATE' | 'PATIENT_UPDATE' | 'PATIENT_DELETE'> = {
            'insertOne': 'PATIENT_CREATE',
            'create': 'PATIENT_CREATE',
            'insertMany': 'PATIENT_CREATE',
            'createMany': 'PATIENT_CREATE',
            'updateOne': 'PATIENT_UPDATE',
            'update': 'PATIENT_UPDATE',
            'updateMany': 'PATIENT_UPDATE',
            'deleteOne': 'PATIENT_DELETE',
            'delete': 'PATIENT_DELETE',
            'deleteMany': 'PATIENT_DELETE'
        };
        return mapping[operation] || 'PATIENT_READ';
    }

    private detectOperation(req: express.Request) {
        const operation = req.method === 'GET' ? 'find' : (req.body.operation || 'find');
        let documents = 0;

        switch (operation) {
            case 'insertOne':
            case 'create':
                documents = 1;
                break;
            case 'insertMany':
            case 'createMany':
                documents = req.body.documents?.length || 0;
                console.log('📦 [detectOperation] insertMany detected:', {
                    operation,
                    documentsArray: req.body.documents,
                    documentsCount: documents
                });
                break;
            case 'updateOne':
            case 'update':
            case 'deleteOne':
            case 'delete':
                documents = 0;
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
                documents = 0;
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
        const parts = path.split('/').filter(p => p);
        const collectionName = parts[parts.length - 1] || 'default';

        console.log(`🔍 [Proxy] Extracted collection name from path ${path}: ${collectionName}`);
        return collectionName;
    }

    public start(port: number = 3001) {
        this.app.listen(port, () => {
            console.log(`🚀 [HTTP Proxy] Server started on port ${port}`);
            console.log(`📡 [HTTP Proxy] MongoDB Proxy: http://localhost:${port}/mongo/*path`);
            console.log(`🏥 [HTTP Proxy] Health Check: http://localhost:${port}/proxy/health`);
            console.log(`🚦 [HTTP Proxy] Rate Limit Stats: http://localhost:${port}/proxy/rate-limit-stats`);
            console.log(`⚡ [HTTP Proxy] Rate Limiting active:`);
            console.log(`   - Express server limit: 5 requests/min per IP`);
            console.log(`   - NestJS endpoints: 5 requests/min (via @nestjs/throttler)`);
        });
    }

    public getApp() {
        return this.app;
    }


    public async handleRequest(req: express.Request, res: express.Response) {
        const startTime = Date.now();
        const method = req.method;
        let fullPath = req.originalUrl || req.url;
        if (fullPath.startsWith('/proxy/mongo')) {
            fullPath = fullPath.replace('/proxy/mongo', '/mongo');
        }
        const path = fullPath;
        const originalPath = req.path;
        Object.defineProperty(req, 'path', {
            value: fullPath.split('?')[0],
            writable: true,
            configurable: true
        });
        let tenantId = 'unknown';
        let statusCode = 500;

        try {
            console.log('🔄 [HTTP Proxy] Request intercepted via NestJS:', req.method, path);

            const authResult = await this.checkAuthentication(req);
            if (!authResult.success || !authResult.tenantId) {
                statusCode = 401;
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(401).json(authResult);
            }

            tenantId = authResult.tenantId;

            const limitsResult = await this.checkDataLimits(req, authResult.tenantId);
            if (!limitsResult.success) {
                statusCode = 403;
                Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
                return res.status(403).json(limitsResult);
            }
            const modifiedBody = this.modifyRequest(req, authResult.tenantId);

            const mongoResponse = await this.forwardToMongoDB(req, authResult.tenantId, modifiedBody);

            statusCode = 200;
            await this.logRequest(req, authResult.tenantId, mongoResponse, startTime, statusCode);
            res.json(mongoResponse);

        } catch (error) {
            console.error('❌ [HTTP Proxy] Error:', error);
            statusCode = error.status || 500;
            Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
            await this.logRequest(req, tenantId, null, startTime, statusCode);
            res.status(statusCode).json({
                success: false,
                error: 'Proxy error',
                message: error.message
            });
        } finally {
            Object.defineProperty(req, 'path', { value: originalPath, writable: true, configurable: true });
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
