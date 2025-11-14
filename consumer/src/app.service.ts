import { Injectable, Logger } from '@nestjs/common';
import { OrderDto } from './order.dto';
import { Ctx, RmqContext } from '@nestjs/microservices';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  orders: OrderDto[] = [];


  handleOrderPlaced(order: OrderDto) {
    this.logger.log(`Received order - customer: ${order.email}`);
    this.orders.push(order);
  }

  getOrders() {
    this.logger.log(`Fetching all orders. Total: ${this.orders.length}`);
    return this.orders;
  }

}
