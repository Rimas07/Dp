  import { BadRequestException, Injectable } from '@nestjs/common';// bad request for http problem, injectable pozvolayet vnedrit komponenety
  import { InjectConnection, InjectModel } from '@nestjs/mongoose';
  import { Connection, Model } from 'mongoose';
  import { Tenant } from './tenants.schema';
  import CreateCompanyDto from './create-company.dto';
  import { UsersService } from 'src/users/users.service';
  import { nanoid } from 'nanoid';
  import { AuthService } from 'src/auth/auth.service';
  import { DataLimit, DataLimitSchema } from 'src/limits/limits.schema';

  @Injectable()
  export class TenantsService {
    constructor(
      @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
      private usersService: UsersService,
      private authService: AuthService,
      @InjectConnection() private readonly connection: Connection,
    ) { }

    async getTenantById(tenantId: string) {
      return this.tenantModel.findOne({ tenantId })
    }

    async getAllTenants() {
      return this.tenantModel.find().exec()
    }

    async createCompany(companyData: CreateCompanyDto) {
      const user = await this.usersService.getUserByEmail(companyData.user.email);
      {
        if (user) {
          throw new BadRequestException('User exist and belongs to')
        }
      }// if the user typedd an email that already exist then will inform him that exist
      const tenantId = nanoid(12)// nanoid generates unique id when  creating a tenant
      await this.usersService.createUser(companyData.user, tenantId)// create user

      await this.authService.createSecretKeyForNewTenant(tenantId)
      const LimitsModel = this.connection.models[DataLimit.name] || this.connection.model(DataLimit.name, DataLimitSchema);
      await LimitsModel.create({
        tenantId,
        maxDocuments: 1000,
        maxDataSizeKB: 51200,
        monthlyQueries: 1000,
      });// after creating tenant we give him limits/this limitis can be modified via req 
      return this.tenantModel.create({
        companyName: companyData.companyName,
        tenantId,
      })
    }
  }
