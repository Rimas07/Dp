/* eslint-disable prettier/prettier */
import { Global, Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantController } from './tenants.controller';
import { Tenant, TenantSchema } from './tenants.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { tenantConnectionProvider } from 'src/providers/tenant.connection.provider';
import { UsersModule } from 'src/users/users.module'; // Import the module, not the service
import { AuthModule } from 'src/auth/auth.module';

@Global()
@Module({
  imports: [
    UsersModule,
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Tenant.name,
        schema: TenantSchema,
      },
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantsService, tenantConnectionProvider],
  exports: [TenantsService, tenantConnectionProvider],
})
export class TenantsModule { }//