import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check PostgreSQL and Redis connectivity' })
  @ApiResponse({ status: 200, description: 'Dependencies are ready' })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable' })
  async check(): Promise<{ status: 'ok' }> {
    const redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.getOrThrow<number>('REDIS_PORT'),
      db: this.config.getOrThrow<number>('REDIS_DB'),
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await this.dataSource.query('SELECT 1');
      await redis.connect();
      if ((await redis.ping()) !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependency unavailable');
    } finally {
      redis.disconnect();
    }
  }
}
