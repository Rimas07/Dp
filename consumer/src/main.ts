import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  // ✅ ИСПРАВЛЕНО: Читаем RABBITMQ_URL из переменных окружения
  // Для Docker: amqp://admin:admin123@rabbitmq:5672
  // Для локального запуска: amqp://admin:admin123@localhost:5672
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  console.log('🔌 [Consumer] Connecting to RabbitMQ:', rabbitmqUrl);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'audit-queue',
        queueOptions: {
          durable: true, // Очередь сохраняется при перезапуске RabbitMQ
        },
      },
    },
  );

  await app.listen();
  console.log('✅ [Consumer] Successfully connected to RabbitMQ and listening for messages...');
}

bootstrap();
