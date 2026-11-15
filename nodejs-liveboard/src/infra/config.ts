import { hostname } from 'node:os';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

/** Fail fast on boot instead of failing on the first request. */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: required('JWT_SECRET'),
  jwtTtl: process.env.JWT_TTL ?? '12h',
  corsOrigin: (process.env.CORS_ORIGIN ?? '*').split(','),
  instanceId: process.env.INSTANCE_ID ?? hostname(),
} as const;
