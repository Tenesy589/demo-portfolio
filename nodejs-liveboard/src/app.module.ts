import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { BoardEventBus } from './common/board-events';
import { HealthController } from './infra/health.controller';
import { MetricsController } from './infra/metrics';
import { PrismaModule } from './infra/prisma.service';
import { RedisModule, redisConnection } from './infra/redis';
import { JobsModule } from './jobs/jobs.module';
import { RealtimeModule } from './realtime/realtime.module';

@Global()
@Module({ providers: [BoardEventBus], exports: [BoardEventBus] })
class EventsModule {}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BullModule.forRoot({ connection: redisConnection() }),
    PrismaModule,
    RedisModule,
    EventsModule,
    AuthModule,
    BoardsModule,
    RealtimeModule,
    JobsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
