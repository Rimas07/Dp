/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { LimitsModule } from '../limits/limits.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
       
        TenantsModule,
        AuthModule,
        LimitsModule,
        AuditModule,
        UsersModule,
        JwtModule // JwtModule уже глобальный, но явно импортируем для ясности
    ],
    controllers: [ProxyController],
    providers: [ProxyService, 
    ],
    exports: [ProxyService]
})
export class ProxyModule { }

















