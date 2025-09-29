import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OrdersModule } from './orders/orders.module';

@Module({
 imports:[OrdersModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
