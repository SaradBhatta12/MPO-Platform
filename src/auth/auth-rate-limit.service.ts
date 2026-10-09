import { createHmac } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const WINDOW_SECONDS = 60;
const INCREMENT_SCRIPT = `
  local blocked = 0
  for index = 1, #KEYS do
    local attempts = redis.call('INCR', KEYS[index])
    if attempts == 1 then
      redis.call('EXPIRE', KEYS[index], ARGV[#KEYS + 1])
    end
    if attempts > tonumber(ARGV[index]) then
      blocked = 1
    end
  end
  return blocked
`;

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly keySecret: string;

  constructor(private readonly config: ConfigService) {
    this.keySecret = config.getOrThrow<string>('JWT_SECRET');
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      db: config.getOrThrow<number>('REDIS_DB'),
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async checkLogin(ip: string, email: string): Promise<void> {
    await this.check(
      [
        `auth:login:ip:${this.key(ip)}`,
        `auth:login:email:${this.key(email.trim().toLowerCase())}`,
      ],
      [
        this.config.getOrThrow<number>('LOGIN_RATE_LIMIT_IP'),
        this.config.getOrThrow<number>('LOGIN_RATE_LIMIT_EMAIL'),
      ],
    );
  }

  async checkRefresh(ip: string): Promise<void> {
    await this.check(
      [`auth:refresh:ip:${this.key(ip)}`],
      [this.config.getOrThrow<number>('REFRESH_RATE_LIMIT_IP')],
    );
  }

  private key(value: string): string {
    return createHmac('sha256', this.keySecret).update(value).digest('hex');
  }

  private async check(keys: string[], limits: number[]): Promise<void> {
    let blocked: unknown;
    try {
      blocked = await this.redis.eval(
        INCREMENT_SCRIPT,
        keys.length,
        ...keys,
        ...limits.map(String),
        String(WINDOW_SECONDS),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }

    if (blocked === 1) {
      throw new HttpException(
        'Too many authentication attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
