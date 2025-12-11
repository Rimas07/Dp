/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Proxy')
@Controller()
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) { }

    /**
     * Health check 
     */
    @Get('proxy/health')
    @ApiOperation({
        summary: 'Proxy health check',
        description: 'Checking the Status of the  Proxy'
    })
    @ApiResponse({
        status: 200,
        description: 'The proxy is working fine.'
    })
    health() {
        return this.proxyService.health();
    }

    /**
     * MongoDB Proxy через /mongo/*path (для совместимости с localhost:3001)
     */
    @Post('mongo/*path')
    @ApiOperation({
        summary: 'HTTP Proxy to MongoDB (direct path)',
        description: 'MongoDB Proxy через /mongo/*path'
    })
    async proxyToMongoDBDirect(@Req() req: Request, @Res() res: Response, @Body() body: any) {
        try {
            console.log('🔄 [ProxyController] Direct MongoDB request:', req.method, req.path);
            console.log('📋 [ProxyController] Headers:', {
                'x-tenant-id': req.headers['x-tenant-id'],
                'X-TENANT-ID': req.headers['x-tenant-id'],
                'authorization': req.headers['authorization'] ? 'present' : 'missing',
                'all-headers': Object.keys(req.headers)
            });
            await this.proxyService.handleProxyRequest(req, res);
        } catch (error) {
            console.error('❌ [ProxyController] error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Proxy controller error',
                    message: error.message
                });
            }
        }
    }

    /**
     * MongoDB Proxy через /proxy/mongo/*path
     */
    @Post('proxy/mongo/*path')
    @ApiOperation({
        summary: 'HTTP Proxy to MongoDB',
        description: 'Настоящий HTTP Proxy который перехватывает и пересылает запросы в MongoDB'
    })
    async proxyToMongoDB(@Req() req: Request, @Res() res: Response, @Body() body: any) {
        try {
            console.log('🔄 [ProxyController] Intercepted request to MongoDB:', req.method, req.path, req.params);
            console.log('📋 [ProxyController] Headers:', {
                'x-tenant-id': req.headers['x-tenant-id'],
                'X-TENANT-ID': req.headers['x-tenant-id'],
                'authorization': req.headers['authorization'] ? 'present' : 'missing',
                'all-headers': Object.keys(req.headers)
            });

            // Используем прямой метод обработки запроса
            await this.proxyService.handleProxyRequest(req, res);

        } catch (error) {
            console.error('❌ [ProxyController] error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Proxy controller error',
                    message: error.message
                });
            }
        }
    }

    /**
     * Тестовый endpoint для проверки Proxy
     * 
     * Требует:
     * - X-Tenant-ID header
     * - Authorization: Bearer <token>
     */
    @Post('proxy/test')
    @ApiOperation({
        summary: 'Test Proxy validation',
        description: 'Test function for checking the operation of Data-Limiting Proxy'
    })
    @ApiResponse({
        status: 200,
        description: 'the test was successful'
    })
    async testProxy(@Req() req: Request) {
        try {
            console.log('\n═══════════════════════════════════════');
            console.log('🔍 THE PROXY TEST HAS STARTED');
            console.log('═══════════════════════════════════════\n');

            const result = await this.proxyService.processRequest(req);

            console.log('\n═══════════════════════════════════════');
            console.log('✅ PROXY TEST COMPLETED SUCCESSFULLY');
            console.log('═══════════════════════════════════════\n');

            return {
                success: true,
                message: 'Proxy validation passed!',
                result: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.log('\n═══════════════════════════════════════');
            console.log('❌ PROXY TEST FAILED');
            console.log('═══════════════════════════════════════\n');

            return {
                success: false,
                error: error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            };
        }
    }

    @Post('proxy/start')
    @ApiOperation({
        summary: 'Start HTTP Proxy Server',
        description: 'Запускает отдельный HTTP Proxy сервер на порту 3001'
    })
    async startProxyServer() {
        try {
            this.proxyService.startProxyServer(3001);
            return {
                success: true,
                message: 'HTTP Proxy server started on port 3001',
                endpoints: {
                    health: 'http://localhost:3001/proxy/health',
                    mongo: 'http://localhost:3001/mongo/*path',
                    test: 'http://localhost:3001/proxy/test'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to start proxy server',
                message: error.message
            };
        }
    }
}





