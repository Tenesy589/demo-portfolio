import 'reflect-metadata';
import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from './infra/prisma.service';
import { redisConnection } from './infra/redis';
import { ActivityProcessor, NotifyProcessor } from './jobs/processors';
import { QueuesModule } from './jobs/jobs.module';

/**
 * Separate process for background jobs: scales independently of the API
 * and a slow job can never block an HTTP request or WebSocket event.
 */
@Module({
  imports: [BullModule.forRoot({ connection: redisConnection() }), QueuesModule, PrismaModule],
  providers: [ActivityProcessor, NotifyProcessor],
})
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // finishes in-flight jobs on SIGTERM
  Logger.log('👷 Worker started', 'Worker');
}

bootstrap();
