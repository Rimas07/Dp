import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrdersService } from './orders.service';


@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('place-order')
  create(@Body() order ) {
  return this.ordersService.placeOrder(order)
  }

  @Get()
  getOrders() {
    return this.ordersService.getOrders();
  }
}
