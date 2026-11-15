# PulseCheck: high-throughput uptime monitoring (Go)

What Go is famous for: cheap concurrency, network services, gRPC, tiny static binaries.

```bash
docker compose up -d --build     # dashboard → http://localhost:7105 · Grafana → http://localhost:7106
docker compose run --rm pulsectl check https://go.dev https://github.com https://example.com
```

## Architecture

```
scheduler (api) ──ProbeRequest──►  ╔═ bidirectional gRPC stream ═╗  ──► prober
                ◄──ProbeResult───  ╚═════════════════════════════╝      ├─ goroutine per check
     │                                                                  └─ semaphore (128 in flight)
     ├─► ring buffer per monitor (uptime, avg, p95)
     ├─► broker[T] ──► SSE ──► live dashboard (embedded via go:embed)
     ├─► Prometheus metrics ──► Grafana
     └─► Postgres: only state *transitions* become incidents
```

## What's inside

| Feature | Where |
|---|---|
| **Bidirectional gRPC streaming**: fan-out to goroutines, fan-in through a single sender (`Send` isn't goroutine-safe) | `internal/probe/server.go` |
| **Reconnecting stream client** with exponential backoff | `internal/scheduler` |
| **Generic pub/sub** `Broker[T]`, non-blocking publish (slow clients can't stall the pipeline) | `internal/broker` |
| **Server-Sent Events** with keep-alive | `httpapi.events` |
| **errgroup + SetLimit**: bounded concurrent ad-hoc checks, order preserved | `httpapi.adhocCheck`, `cmd/pulsectl` |
| **Per-IP token-bucket rate limiter** with a janitor goroutine | `httpapi/middleware.go` |
| Stdlib router (Go 1.22+ patterns), `slog` JSON logs, graceful shutdown, gRPC health and reflection | |
| **pgx v5**, embedded SQL schema, partial unique index (at most one open incident per monitor) | `internal/store` |
| **`FROM scratch` images**: API 17 MB, prober 12 MB, non-root | `Dockerfile` |
| **Cobra CLI**: `list`, `add`, `check` | `cmd/pulsectl` |
| Provisioned Grafana dashboard (status, p95, availability, TLS expiry, goroutines) | `deploy/grafana` |

`make proto` regenerates the gRPC code inside Docker, so no local Go or protoc install is needed.

**Stack:** Go 1.26 · gRPC · Protocol Buffers · pgx · Prometheus · Grafana · cobra
