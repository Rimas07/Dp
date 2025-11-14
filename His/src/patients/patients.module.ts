/* eslint-disable prettier/prettier */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { TenantsMiddleware } from 'src/middlewares/tenants.middleware';
import { TenantsModule } from 'src/tenants/tenants.module';
import { tenantConnectionProvider } from 'src/providers/tenant.connection.provider';
import { tenantModels } from 'src/providers/tenant-model-provider';
import { AuthModule } from 'src/auth/auth.module';
import { LimitsModule } from 'src/limits/limits.module';
import { AuditModule } from 'src/audit/audit.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [TenantsModule, AuthModule, LimitsModule, AuditModule, UsersModule],
  controllers: [PatientsController],
  providers: [PatientsService,
    tenantModels.PatientModel
  ],
})
export class PatientsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantsMiddleware).forRoutes(PatientsController);
  }
}
