import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Environment } from '../config/environment';
import { AuthSession } from '../auth/auth-session.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { User } from '../users/user.entity';

type DatabaseEnvironment = Pick<
  Environment,
  | 'DATABASE_HOST'
  | 'DATABASE_PORT'
  | 'DATABASE_USER'
  | 'DATABASE_PASSWORD'
  | 'DATABASE_NAME'
>;

export function typeOrmOptions(
  environment: DatabaseEnvironment,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: environment.DATABASE_HOST,
    port: environment.DATABASE_PORT,
    username: environment.DATABASE_USER,
    password: environment.DATABASE_PASSWORD,
    database: environment.DATABASE_NAME,
    entities: [User, AuthSession, RefreshToken],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: false,
  };
}
