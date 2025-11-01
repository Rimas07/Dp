/* eslint-disable prettier/prettier */

/* eslint-disable @typescript-eslint/require-await */


/* eslint-disable prettier/prettier */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { ThrottlerModule } from '@nestjs/throttler';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),

    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,  // 1 second
        limit: 3,   // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20,  // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantsMiddleware)
      .forRoutes(LimitsController);
  }
}
