import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
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

  @IsString()
  @MinLength(32)
  @Matches(/^(?!replace-with-).+$/)
  JWT_SECRET!: string;

  @IsString()
  @Matches(/^\d+[smhd]$/)
  JWT_EXPIRES_IN = '1h';
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

  return environment;
}
