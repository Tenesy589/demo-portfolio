import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { config } from './infra/config';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix('api', { exclude: ['health', 'metrics'] });
  app.enableCors({ origin: config.corsOrigin, exposedHeaders: ['X-Instance'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks(); // SIGTERM → close sockets, drain DB pool, quit Redis
  // Shows which replica served the request — handy when demoing load balancing.
  app.use((_: Request, res: Response, next: NextFunction) => (res.setHeader('X-Instance', config.instanceId), next()));

  const adapter = new RedisIoAdapter(app);
  await adapter.connect();
  app.useWebSocketAdapter(adapter);

  const doc = new DocumentBuilder()
    .setTitle('LiveBoard API')
    .setDescription('Real-time collaborative Kanban. WebSocket events: `board:join`, `board:event`, `presence`, `card:editing`.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`🚀 LiveBoard [${config.instanceId}] on :${config.port} — docs at /docs`, 'Bootstrap');
}

bootstrap();
