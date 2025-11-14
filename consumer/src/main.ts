import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Consumer');
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
  
  try {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
      AppModule,
      {
        transport: Transport.RMQ,
        options: {
          urls: [rabbitmqUrl],
          queue: 'audit-queue',
          queueOptions: {
            durable: true
          },
        },
      },
    );
    
    await app.listen();
    logger.log(`🐰 Consumer microservice is listening on RabbitMQ`);
    logger.log(`📡 Connected to: ${rabbitmqUrl}`);
    logger.log(`📮 Queue: audit-queue`);
  } catch (error) {
    logger.error('❌ Failed to start consumer microservice:', error.message);
    process.exit(1);
  }
}
bootstrap();
