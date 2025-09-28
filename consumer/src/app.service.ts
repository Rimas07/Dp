import { Injectable } from '@nestjs/common';
import { OrderDto } from './order.dto';
import { Ctx, RmqContext } from '@nestjs/microservices';

@Injectable()
export class AppService {

  orders: OrderDto[] = [];


  handleOrderPlaced(order: OrderDto) {
    console.log(`received a order - customer: ${order.email}`)
    this.orders.push(order)
  }

  getOrders() {
  
    return this.orders
}

}
