/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Req, Res, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Proxy')
@Controller('proxy')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) { }

    /**
     * Health check для Proxy Service
     */
    @Get('health')
    @ApiOperation({
        summary: 'Proxy health check',
        description: 'Проверка состояния Data-Limiting MongoDB Proxy'
    })
    @ApiResponse({
        status: 200,
        description: 'Proxy работает нормально'
    })
    health() {
        return this.proxyService.health();
    }

    @Post('mongo/*')
    @ApiOperation({
        summary: 'HTTP Proxy to MongoDB',
        description: 'Настоящий HTTP Proxy который перехватывает и пересылает запросы в MongoDB'
    })
    async proxyToMongoDB(@Req() req: Request, @Res() res: Response, @Body() body: any) {
        try {
            console.log('🔄 [ProxyController] Перехвачен запрос к MongoDB:', req.method, req.path);

            const proxyApp = this.proxyService.getProxyApp();
            proxyApp(req, res);

        } catch (error) {
            console.error('❌ [ProxyController] Ошибка:', error);
            res.status(500).json({
                success: false,
                error: 'Proxy controller error',
                message: error.message
            });
        }
    }

    /**
     * Тестовый endpoint для проверки Proxy
     * 
     * Требует:
     * - X-Tenant-ID header
     * - Authorization: Bearer <token>
     */
    @Post('test')
    @ApiOperation({
        summary: 'Test Proxy validation',
        description: 'Тестовая функция для проверки работы Data-Limiting Proxy'
    })
    @ApiResponse({
        status: 200,
        description: 'Проверка прошла успешно'
    })
    async testProxy(@Req() req: Request) {
        try {
            console.log('\n═══════════════════════════════════════');
            console.log('🔍 ТЕСТ ПРОКСИ НАЧАЛСЯ');
            console.log('═══════════════════════════════════════\n');

            const result = await this.proxyService.processRequest(req);

            console.log('\n═══════════════════════════════════════');
            console.log('✅ ТЕСТ ПРОКСИ ЗАВЕРШЁН УСПЕШНО');
            console.log('═══════════════════════════════════════\n');

            return {
                success: true,
                message: 'Proxy validation passed!',
                result: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.log('\n═══════════════════════════════════════');
            console.log('❌ ТЕСТ ПРОКСИ ПРОВАЛЕН');
            console.log('═══════════════════════════════════════\n');

            return {
                success: false,
                error: error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            };
        }
    }

    @Post('start')
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
                    mongo: 'http://localhost:3001/mongo/*',
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





