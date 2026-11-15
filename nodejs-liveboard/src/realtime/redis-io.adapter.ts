import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { config } from '../infra/config';

/**
 * Socket.IO adapter backed by Redis Pub/Sub: `server.to(room).emit()` on
 * instance A reaches sockets connected to instance B. This is what lets
 * the API scale horizontally behind a load balancer.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapter: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect() {
    const pub = new Redis(config.redisUrl);
    const sub = pub.duplicate();
    this.adapter = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, cors: { origin: config.corsOrigin } });
    server.adapter(this.adapter);
    return server;
  }
}
