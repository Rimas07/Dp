/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProxyService } from './proxy/proxy.service';

async function bootstrap() {
  const logger = new Logger('ProxyBootstrap');
  const app = await NestFactory.create(AppModule, { logger: false });
  const configService = app.get(ConfigService);
  const proxyService = app.get(ProxyService);
  const port = process.env.PORT || 3001;

  try {
    proxyService.startProxyServer(parseInt(port.toString()));
    logger.log(`🚀 [Proxy Server] Started on port ${port}`);
    logger.log(`📡 [Proxy Server] MongoDB Proxy: http://localhost:${port}/mongo/*path`);
    logger.log(`🏥 [Proxy Server] Health Check: http://localhost:${port}/proxy/health`);
  } catch (error) {
    logger.error(`❌ [Proxy Server] Failed to start: ${error.message}`);
    process.exit(1);
  }
}

bootstrap();
