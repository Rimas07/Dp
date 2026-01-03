import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantsModule } from './tenants/tenants.module';
import { PatientsModule } from './patients/patients.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { ProxyModule } from './proxy/proxy.module';
import { LimitsModule } from './limits/limits.module';
import { TenantsMiddleware } from './middlewares/tenants.middleware';
import { LimitsController } from './limits/limits.controller';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ProxyController } from './proxy/proxy.controller';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),

    ThrottlerModule.forRoot([{
      ttl: 60000, 
      limit: 50, 
    }]),

    JwtModule.register({
      global: true
      
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        const uri = config.get<string>('database.connectionString');
        return {
          uri: uri || 'mongodb://localhost:27017/defaultdb',
        };
      },
      inject: [ConfigService],
    }),

    MonitoringModule,
    TenantsModule,
    PatientsModule,
    UsersModule,
    AuthModule,
    AuditModule,
    ProxyModule,
    LimitsModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantsMiddleware)
      .forRoutes(LimitsController, ProxyController);
  }
}
