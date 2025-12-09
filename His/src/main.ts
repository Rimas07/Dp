/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LimitsContextInterceptor } from './limits/limits.interceptor';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from './monitoring/monitoring.service';
import { MonitoringInterceptor } from './monitoring/monitoring.interceptor';
import { ProxyService } from './proxy/proxy.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const monitoringService = app.get(MonitoringService);
     app.useGlobalInterceptors(new MonitoringInterceptor(monitoringService));
  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    credentials: true
  });
  const config = new DocumentBuilder()
    .setTitle('HIS - Hospital Information System')
    .setDescription('Multi-tenant hospital information management system API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();


  const document = SwaggerModule.createDocument(app, config)

  SwaggerModule.setup('api', app, document) // documetnation which can be accesed from http://localhost:3000/api#/ 
  app.useGlobalInterceptors(new LimitsContextInterceptor());
  app.useGlobalInterceptors(new MonitoringInterceptor(monitoringService));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  
  const port = configService.get<number>('server.port') || 3000;
  await app.listen(port);
  
  logger.log(`🏥 HIS Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation available at: http://localhost:${port}/api`);
  logger.log(`🗄️  Database: ${configService.get<string>('database.connectionString')}`);
  logger.log(`🐰 RabbitMQ: ${configService.get<string>('rabbitmq.url')} (audit logs)`);
  
  // Автоматический запуск HTTP Proxy сервера на порту 3001
  try {
    const proxyService = app.get(ProxyService);
    proxyService.startProxyServer(3001);
    logger.log(`🚀 HTTP Proxy Server started on: http://localhost:3001`);
    logger.log(`📡 MongoDB Proxy: http://localhost:3001/mongo/*path`);
  } catch (error) {
    logger.warn(`⚠️  Failed to start HTTP Proxy Server: ${error.message}`);
  }
}
bootstrap();
