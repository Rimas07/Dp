/* eslint-disable prettier/prettier */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UsePipes, ValidationPipe, BadRequestException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { TenantAuthenticationGuard } from 'src/guards/tenant-auth.guard';
import { CreatePatientDto, UpdatePatientDto } from './patient.dto';
import { Types } from 'mongoose';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiHeader
} from '@nestjs/swagger';

@ApiTags('Patients')
@ApiBearerAuth('bearer')
@UseGuards(TenantAuthenticationGuard)
@Controller('patients')
export class PatientsController {
  tenantConnection: any;
  constructor(
    private readonly patientsService: PatientsService,
  ) { }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некорректный формат ID пациента');
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get all patients',
    description: 'Retrieve a list of all patients for the authenticated tenant'
  })
  @ApiHeader({
    name: 'X-TENANT-ID',
    description: 'Tenant identifier',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved patients list',
    type: [CreatePatientDto]
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid tenant ID'
  })
  getPatients(@Req() req: Request) {
    const tenantId = req['tenantId'] as string;
    const context = req['limitsContext'];
    // Убрали verbose логи - контекст используется автоматически
    if (!tenantId) {
      throw new Error('Tenant ID not found in request');
    }
    return this.patientsService.getPatients(tenantId);
  }
  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({
    summary: 'Create a new patient',
    description: 'Create a new patient record for the authenticated tenant'
  })
  @ApiBody({ type: CreatePatientDto })
  @ApiHeader({
    name: 'X-TENANT-ID',
    description: 'Tenant identifier',
    required: true
  })
  @ApiResponse({
    status: 201,
    description: 'Patient successfully created',
    type: CreatePatientDto
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or tenant limits exceeded'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
  async createPatient(@Req() req: Request, @Body() body: CreatePatientDto) {
    const tenantId = req['tenantId'] as string;
    if (!tenantId) {
      throw new Error('Tenant ID not found in request');
    }
    return this.patientsService.createPatient(tenantId, body, req);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get patient by ID',
    description: 'Retrieve a specific patient by their unique identifier'
  })
  @ApiParam({
    name: 'id',
    description: 'Patient unique identifier',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiHeader({
    name: 'X-TENANT-ID',
    description: 'Tenant identifier',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Patient found successfully',
    type: CreatePatientDto
  })
  @ApiResponse({
    status: 404,
    description: 'Patient not found'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid patient ID format'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
  async getPatientById(@Req() req: Request, @Param('id') patientId: string) {
    this.validateObjectId(patientId);
    const tenantId = req['tenantId'] as string;
    if (!tenantId) {
      throw new Error('Tenant ID not found in request');
    }
    return this.patientsService.getPatientById(tenantId, patientId);
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({
    summary: 'Update patient',
    description: 'Update an existing patient record by ID'
  })
  @ApiParam({
    name: 'id',
    description: 'Patient unique identifier',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiBody({ type: UpdatePatientDto })
  @ApiHeader({
    name: 'X-TENANT-ID',
    description: 'Tenant identifier',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Patient updated successfully',
    type: CreatePatientDto
  })
  @ApiResponse({
    status: 404,
    description: 'Patient not found'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or patient ID format'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
  async updatePatient(@Req() req: Request, @Param('id') patientId: string, @Body() body: UpdatePatientDto) {
    this.validateObjectId(patientId);
    const tenantId = req['tenantId'] as string;
    if (!tenantId) {
      throw new Error('Tenant ID not found in request');
    }
    return this.patientsService.updatePatient(tenantId, patientId, body, req);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete patient',
    description: 'Delete a patient record by ID'
  })
  @ApiParam({
    name: 'id',
    description: 'Patient unique identifier',
    example: '507f1f77bcf86cd799439011'
  })
  @ApiHeader({
    name: 'X-TENANT-ID',
    description: 'Tenant identifier',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Patient deleted successfully',
    type: CreatePatientDto
  })
  @ApiResponse({
    status: 404,
    description: 'Patient not found'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid patient ID format'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token'
  })
  async deletePatient(@Req() req: Request, @Param('id') patientId: string) {
    this.validateObjectId(patientId);
    const tenantId = req['tenantId'] as string;
    if (!tenantId) {
      throw new Error('Tenant ID not found in request');
    }
    return this.patientsService.deletePatient(tenantId, patientId, req);
  }


}
