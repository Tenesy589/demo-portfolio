# DevPlatform: everything together

```bash
docker compose up -d --build     # → http://localhost:7100
```

- **Compose `include`** composes the four project stacks (21 containers) without duplicating their config. Each stack still runs standalone.
- **nginx gateway** with host-based routing: `taskflow.localhost`, `admin.localhost`, `liveboard.localhost`, `insight.localhost`, `pulse.localhost`, `grafana.localhost` (all on `:7100`).
- **Cross-service monitoring**: PulseCheck gets every service's health endpoint through `pulse.env`, and Prometheus scrapes the Node, Python and Go metrics.
- **Landing page** with live UP/DOWN indicators taken from PulseCheck.
- **CI** (`.github/workflows/ci.yml`): per-language build/lint, then a matrix of Docker builds with a GHA cache and a push to GHCR.
