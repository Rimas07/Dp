import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { TenantAuthenticationGuard } from 'src/guards/tenant-auth.guard';
import { LimitsService } from './limits.service';

@Controller('limits')
@UseGuards(TenantAuthenticationGuard)
export class LimitsController {
    constructor(private readonly limitsService: LimitsService) { }

    @Get(':tenantId')
    async getLimits(@Param('tenantId') tenantId: string) {

        return this.limitsService.getLimitsForTenant(tenantId);
    }

    @Put(':tenantId')
    async setLimits(@Param('tenantId') tenantId: string, @Body() newLimits: any) {

        return this.limitsService.setLimitsForTenant(tenantId, newLimits);
    }

    @Get('usage/:tenantId')
    async getUsage(@Param('tenantId') tenantId: string) {

        return this.limitsService.getUsageForTenant(tenantId);
    }
}