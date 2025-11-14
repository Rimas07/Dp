import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrderDto } from './order.dto';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) { }

  @EventPattern("order-placed")
  handleOrderPlaced(@Payload() order: OrderDto) {
    this.logger.log(`[ORDER-PLACED] Received order: ${order.id}`);
    return this.appService.handleOrderPlaced(order);
  }

  @EventPattern('audit-log')
  handleAuditLog(@Payload() payload: any) {
    const timestamp = new Date().toISOString();
    this.logger.log(`[AUDIT] ${timestamp} - ${payload.method} ${payload.path} - Status: ${payload.statusCode} - Duration: ${payload.durationMs}ms`);
    if (payload.level === 'error') {
      this.logger.error(`[AUDIT-ERROR] ${JSON.stringify(payload.error)}`);
    }
  }


  @MessagePattern({ cmd: 'fetch-orders' })
  getOrders() {
    return this.appService.getOrders();
  }
}
