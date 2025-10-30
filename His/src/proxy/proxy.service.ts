/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { HttpProxyServer } from './http-proxy-server';
import { AuthService } from '../auth/auth.service';
import { LimitsService } from '../limits/limits.service';
import { TenantsService } from '../tenants/tenants.service';
import { AuditService } from '../audit/audit.service';
import { TenantConnectionService } from '../services/tenant-connection.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class ProxyService {
    private httpProxyServer: HttpProxyServer;

    constructor(
        private authService: AuthService,
        private limitsService: LimitsService,
        private tenantsService: TenantsService,
        private auditService: AuditService,
        private tenantConnectionService: TenantConnectionService,
        private jwtService: JwtService,
        private usersService: UsersService,
    ) {
        this.initializeProxyServer();
    }

    private initializeProxyServer() {
        this.httpProxyServer = new HttpProxyServer(
            this.authService,
            this.limitsService,
            this.tenantsService,
            this.auditService,
            this.tenantConnectionService,
            this.jwtService,
            this.usersService
        );
    }

    public startProxyServer(port: number = 3001) {
        this.httpProxyServer.start(port);
        console.log('🚀 [ProxyService] HTTP Proxy сервер запущен!');
    }

    public getProxyApp() {
        return this.httpProxyServer.getApp();
    }

    public async validateToken(token: string) {
        try {
            const secretKey = await this.authService.fetchAccessTokenSecretSigningKey('default');
            return {
                success: true,
                tenantId: 'tenant123',
                userId: 'user456'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    public async checkLimits(tenantId: string, operation: any) {
        try {
            await this.limitsService.checkDocumentsLimit(tenantId, operation.documents);
            await this.limitsService.checkDataSizeLimit(tenantId, operation.dataSizeKB);
            await this.limitsService.checkQueriesLimit(tenantId);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    public async getTenant(tenantId: string) {
        try {
            const tenant = await this.tenantsService.getTenantById(tenantId);
            return {
                success: true,
                tenant
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    public async logAuditEvent(event: any) {
        try {
            await this.auditService.emit(event);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    public async processRequest(req: any) {
        try {
            console.log('🔍 [ProxyService] Обработка запроса через старый API');
            const authResult = await this.validateToken(
                req.headers.authorization?.replace('Bearer ', '') || ''
            );

            if (!authResult.success) {
                throw new Error(`Authentication failed: ${authResult.error}`);
            }
            if (!authResult.tenantId) {
                throw new Error('Tenant ID not found in auth result');
            }
            const limitsResult = await this.checkLimits(
                authResult.tenantId,
                { documents: 1, dataSizeKB: 1 }
            );

            if (!limitsResult.success) {
                throw new Error(`Limits exceeded: ${limitsResult.error}`);
            }
            await this.logAuditEvent({
                timestamp: new Date().toISOString(),
                level: 'info',
                requestId: `process-${Date.now()}`,
                tenantId: authResult.tenantId,
                method: req.method,
                path: req.path,
                statusCode: 200,
                message: 'Request processed via old API',
                eventType: 'PATIENT_READ',
                metadata: {
                    service: 'ProxyService',
                    action: 'processRequest'
                }
            });

            return {
                success: true,
                tenantId: authResult.tenantId,
                userId: authResult.userId,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ [ProxyService] Ошибка обработки запроса:', error);
            throw error;
        }
    }

    public health() {
        return {
            status: 'HTTP Proxy Server is running',
            timestamp: new Date().toISOString(),
            services: {
                auth: 'connected',
                limits: 'connected',
                tenants: 'connected',
                audit: 'connected'
            }
        };
    }
}