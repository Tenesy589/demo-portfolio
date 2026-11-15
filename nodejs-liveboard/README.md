# LiveBoard: real-time collaborative Kanban backend (Node.js)

The kind of workload Node.js was built for: many concurrent long-lived connections and I/O-bound work on a single-threaded event loop.

```bash
docker compose up -d --build     # → http://localhost:7101/docs
```

## What's inside

| Feature | Where |
|---|---|
| **WebSockets** (Socket.IO): rooms per board, presence, ephemeral "X is editing" signals | `src/realtime/board.gateway.ts` |
| **Horizontal scaling**: 2 API replicas behind nginx; the Redis adapter broadcasts across instances, and presence is stored in Redis | `src/realtime/redis-io.adapter.ts`, `presence.service.ts` |
| **Background jobs**: a separate worker process (BullMQ) with retries, exponential backoff and a rate-limited mailer | `src/worker.ts`, `src/jobs/` |
| **Streams**: CSV export with keyset pagination, so memory stays flat at any board size | `boards.service.ts → exportCsv` |
| **Domain event bus** (RxJS): services publish, while the gateway and job producer subscribe independently | `src/common/board-events.ts` |
| **Optimistic concurrency**: compare-and-swap on `version`, returning 409 with the current state | `cards.service.ts → update` |
| **Fractional indexing**: moving a card is a single-row UPDATE | `cards.service.ts → move` |
| JWT auth, global guard with `@Public()` opt-out, throttling on login, validation, Prisma error mapping | `src/auth/`, `all-exceptions.filter.ts` |
| Swagger, `/health` (DB and Redis), Prometheus `/metrics`, an `X-Instance` header showing which replica served the request | `src/infra/` |

## Try it

```bash
# Call it several times and watch X-Instance alternate between replicas
curl -si localhost:7101/health | grep X-Instance
```

Open the React TaskFlow app in two windows and move a card: the change appears in the other window instantly, even when the two windows are connected to different replicas.

**Stack:** NestJS 11 · TypeScript · Socket.IO · Redis · BullMQ · Prisma · PostgreSQL 17 · nginx
