import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from './config';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);

/** Parse a redis:// URL into BullMQ connection options. */
export function redisConnection() {
  const url = new URL(config.redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined };
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@InjectRedis() private readonly redis: Redis) {}
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: () => new Redis(config.redisUrl) }, RedisShutdown],
  exports: [REDIS],
})
export class RedisModule {}
