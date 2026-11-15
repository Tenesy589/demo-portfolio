# Demo Portfolio: six projects behind one `docker compose up`

Five services in five technologies, each built around what its language or framework does best, plus a platform that runs them together.

```bash
make up            # or: docker compose -f platform/compose.yaml up -d --build
open http://localhost:7100
```

| # | Project | Stack | What it demonstrates | URL |
|---|---------|-------|----------------------|-----|
| 1 | [**LiveBoard**](nodejs-liveboard) | Node.js · NestJS | Event loop & async I/O: WebSockets, Redis pub/sub across 2 replicas, BullMQ worker, streaming CSV | [:7101/docs](http://localhost:7101/docs) |
| 2 | [**InsightAPI**](python-insight) | Python · FastAPI | Data & ML: pandas analytics, cohort retention, forecasting, churn model + explanations, Celery | [:7103/docs](http://localhost:7103/docs) |
| 3 | [**PulseCheck**](go-pulsecheck) | Go | Concurrency & performance: goroutines, bidirectional gRPC stream, SSE, Prometheus, 12 MB `scratch` images, CLI | [:7105](http://localhost:7105) |
| 4 | [**TaskFlow**](react-taskflow) | React 19 | Interactive UI: drag & drop, optimistic updates, live sync, presence, code splitting | [:7102](http://localhost:7102) |
| 5 | [**AdminHub**](angular-adminhub) | Angular 20 | Enterprise UI: zoneless Signals, RxJS, typed reactive forms, RBAC guards, runtime i18n | [:7104](http://localhost:7104) |
| 6 | [**DevPlatform**](platform) | Docker · nginx | Compose `include`, gateway, cross-service monitoring, Grafana, GitHub Actions CI | [:7100](http://localhost:7100) |

```
                    ┌──────────── Gateway (nginx :7100) ────────────┐
                    │                                               │
   React TaskFlow ──┤── WebSocket ──► Node LiveBoard ×2 ──► Postgres, Redis, BullMQ worker
 Angular AdminHub ──┤── REST ───────► Python InsightAPI ──► Postgres, Redis, Celery worker + beat
                    └── SSE ────────► Go PulseCheck API ══gRPC stream══► Go Prober
                                           │
                                Prometheus ◄─ scrapes Node, Python, Go ─► Grafana
```

## Demo accounts

| App | Login | Password |
|-----|-------|----------|
| TaskFlow / LiveBoard | `demo@liveboard.dev` (also `alice@`, `bob@`) | `demo1234` |
| AdminHub / InsightAPI | `admin@insight.dev` · `manager@insight.dev` · `viewer@insight.dev` | `admin1234` · `manager1234` · `viewer1234` |
| Grafana | anonymous viewer (admin / admin) | |

## Running one project on its own

Every folder has its own `compose.yaml`. Frontends pull in their backend automatically:

```bash
cd react-taskflow && docker compose up -d --build     # TaskFlow + full LiveBoard stack
cd angular-adminhub && docker compose up -d --build   # AdminHub + full InsightAPI stack
cd go-pulsecheck && docker compose up -d --build      # PulseCheck + Prometheus + Grafana
```

Stop the platform first (`make down`), because a standalone stack uses the same ports.

## Shared engineering standards

- Multi-stage Dockerfiles, non-root runtime users, healthchecks, `tini`/graceful shutdown
- One-shot `migrate` containers: the app starts only after migrations and seed succeed (`service_completed_successfully`)
- 12-factor config through env vars, validated at boot
- Prometheus metrics labelled by route template, which keeps label cardinality bounded
- Seeded demo data on first start: each app is useful within seconds
- CI: per-language build/lint jobs, then a matrix of Docker builds with a GHA layer cache and a push to GHCR

Ports used: 7100–7107. Change them with `GATEWAY_PORT`, `LIVEBOARD_PORT`, `TASKFLOW_PORT`, `INSIGHT_PORT`, `ADMINHUB_PORT`, `PULSE_PORT`, `GRAFANA_PORT`, `PROMETHEUS_PORT`.
