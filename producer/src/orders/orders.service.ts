import { Inject, Injectable } from '@nestjs/common';
import { OrderDto } from './order.dto';
import { ClientProxy } from '@nestjs/microservices';


@Injectable()
export class OrdersService {
  constructor(@Inject("ORDERS_SERVICE") private rabbitClient:ClientProxy){}
  placeOrder(order: OrderDto) {
    this.rabbitClient.emit('order-placed', order)
    return { message: 'Order Placed' };
  }
  

  getOrders() {
    return this.rabbitClient.send({cmd:'fetch-orders'}, {})
  }
}
