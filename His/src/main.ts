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
    origin: true, // Разрешаем все источники для облачного деплоя
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-TENANT-ID'],
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
  
  // Интеграция HTTP Proxy в основное приложение (для работы в облаке)
  try {
    const proxyService = app.get(ProxyService);
    const proxyApp = proxyService.getProxyApp();
    // Монтируем Express app прокси в основное приложение
    app.use('/mongo', proxyApp);
    logger.log(`🚀 HTTP Proxy integrated into main application`);
    logger.log(`📡 MongoDB Proxy: http://localhost:${configService.get<number>('server.port') || 3000}/mongo/*path`);
  } catch (error) {
    logger.warn(`⚠️  Failed to integrate HTTP Proxy: ${error.message}`);
  }

  const port = configService.get<number>('server.port') || 3000;
  await app.listen(port);
  
  logger.log(`🏥 HIS Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation available at: http://localhost:${port}/api`);
  logger.log(`🗄️  Database: ${configService.get<string>('database.connectionString')}`);
  logger.log(`🐰 RabbitMQ: ${configService.get<string>('rabbitmq.url')} (audit logs)`);
}
bootstrap();
