import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class Environment {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT = 5432;

  @IsString()
  @IsNotEmpty()
  DATABASE_USER = 'merchant';

  @IsString()
  @MinLength(12)
  @Matches(/^(?!replace-with-).+$/)
  DATABASE_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME = 'merchant_onboarding';

  @IsString()
  @IsNotEmpty()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT = 6379;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(15)
  REDIS_DB = 0;

  @IsString()
  @MinLength(32)
  @Matches(/^(?!replace-with-).+$/)
  JWT_SECRET!: string;

  @IsString()
  @Matches(/^[1-9]\d*[smhd]$/)
  ACCESS_TOKEN_EXPIRES_IN = '15m';

  @IsString()
  @Matches(/^[1-9]\d*[smhd]$/)
  REFRESH_TOKEN_EXPIRES_IN = '7d';

  @IsUrl({ require_tld: false, require_protocol: true })
  AUTH_ORIGIN = 'http://localhost:3000';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  LOGIN_RATE_LIMIT_IP = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  LOGIN_RATE_LIMIT_EMAIL = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  REGISTER_RATE_LIMIT_IP = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  REGISTER_RATE_LIMIT_EMAIL = 3;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  REFRESH_RATE_LIMIT_IP = 60;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  RISK_DISPATCH_INTERVAL_MS = 1000;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  RISK_RETRY_DELAY_MS = 500;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): Environment {
  const environment = plainToInstance(Environment, values, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(environment, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${errors.map((error) => error.property).join(', ')}`,
    );
  }

  const authOrigin = new URL(environment.AUTH_ORIGIN);
  if (
    authOrigin.origin !== environment.AUTH_ORIGIN ||
    authOrigin.pathname !== '/' ||
    authOrigin.search ||
    authOrigin.hash ||
    authOrigin.username ||
    authOrigin.password ||
    (environment.NODE_ENV === 'production' && authOrigin.protocol !== 'https:')
  ) {
    throw new Error('Invalid environment configuration: AUTH_ORIGIN');
  }

  return environment;
}
