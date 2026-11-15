import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthUser } from '../auth/auth.types';
import { InjectRedis } from '../infra/redis';

/**
 * Presence lives in Redis (not in process memory) so every API instance
 * sees the same list of who is on a board.
 */
@Injectable()
export class PresenceService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  private key = (boardId: string) => `presence:board:${boardId}`;

  async join(boardId: string, socketId: string, user: AuthUser) {
    await this.redis.multi().hset(this.key(boardId), socketId, JSON.stringify({ id: user.id, name: user.name })).expire(this.key(boardId), 86_400).exec();
    return this.list(boardId);
  }

  async leave(boardId: string, socketId: string) {
    await this.redis.hdel(this.key(boardId), socketId);
    return this.list(boardId);
  }

  /** Unique users (one user may have several tabs open). */
  async list(boardId: string): Promise<{ id: string; name: string }[]> {
    const raw = await this.redis.hvals(this.key(boardId));
    const users = new Map(raw.map((r) => JSON.parse(r)).map((u) => [u.id, u]));
    return [...users.values()];
  }
}
