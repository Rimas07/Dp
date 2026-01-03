/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, NestMiddleware, NotFoundException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TenantsService } from "src/tenants/tenants.service";


@Injectable()
export class TenantsMiddleware implements NestMiddleware {

    constructor(private tenantsService: TenantsService) { }

    async use(req: Request, res: Response, next: NextFunction) {
        const tenantId = req.headers['x-tenant-id']?.toString();
        if (!tenantId) {
            throw new BadRequestException('X-TENANT-ID is not provided');
        }

        const tenantExists = await this.tenantsService.getTenantById(tenantId)
        if (!tenantExists) {
            throw new NotFoundException('tenant does not exist')
        }
      
        req['tenantId'] = tenantId;
        next();
    }
}

