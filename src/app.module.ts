import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsModule } from './applications/applications.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment';
import { typeOrmOptions } from './database/typeorm-options';
import { HealthController } from './health.controller';
import { RiskModule } from './risk/risk.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...typeOrmOptions({
          DATABASE_HOST: config.getOrThrow<string>('DATABASE_HOST'),
          DATABASE_PORT: config.getOrThrow<number>('DATABASE_PORT'),
          DATABASE_USER: config.getOrThrow<string>('DATABASE_USER'),
          DATABASE_PASSWORD: config.getOrThrow<string>('DATABASE_PASSWORD'),
          DATABASE_NAME: config.getOrThrow<string>('DATABASE_NAME'),
        }),
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          db: config.getOrThrow<number>('REDIS_DB'),
        },
      }),
    }),
    AuthModule,
    UsersModule,
    ApplicationsModule,
    RiskModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
