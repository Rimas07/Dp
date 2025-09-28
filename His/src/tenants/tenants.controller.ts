/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

import { Controller, Post, Body, } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { Tenant } from './tenants.schema';
import CreateCompanyDto from './create-company.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantsService) { }

  @Post('create-company')
  @ApiOperation({
    summary: 'Create new company',
    description: 'Create a new medical organization with administrator user'
  })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({
    status: 201,
    description: 'Company successfully created',
    type: Tenant
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or user already exists'
  })
  async createCompany(@Body() createCompanyDto: CreateCompanyDto): Promise<Tenant> {
    return this.tenantService.createCompany(createCompanyDto);
  }

}