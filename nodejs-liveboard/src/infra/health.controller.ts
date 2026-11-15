import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../auth/jwt.guard';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { InjectRedis } from './redis';

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, @InjectRedis() private readonly redis: Redis) {}

  @Get()
  async check() {
    const checks = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    const [db, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'up' : 'down'));
    const body = { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', instance: config.instanceId, db, redis, uptime: process.uptime() };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
