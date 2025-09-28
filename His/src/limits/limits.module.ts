import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LimitsService } from './limits.service';
import { LimitsController } from './limits.controller';
import { DataLimit, DataLimitSchema } from './limits.schema';
import { DataUsage, DataUsageSchema } from './usage.schema';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DataLimit.name, schema: DataLimitSchema },
      { name: DataUsage.name, schema: DataUsageSchema },
    ]),
    AuthModule, 
    AuditModule, 
  ],
  controllers: [LimitsController],
  providers: [LimitsService],
  exports: [LimitsService],
})
export class LimitsModule { }