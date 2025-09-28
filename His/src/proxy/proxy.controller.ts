/* eslint-disable prettier/prettier */
import { Controller, Get } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller('proxy')
export class ProxyController {
    constructor(private readonly proxyService: ProxyService) { }

    @Get('health')
    health() {
        return this.proxyService.health();
    }
}





