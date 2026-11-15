# Deploying the demo

Production: https://demo.glowly.uz — a shared server that also runs another product, so the
demo uses the lean overlay `compose.prod.yaml` (≈0.6 GB RAM, memory limits, `oom_score_adj`).

## Continuous deployment (GitHub Actions)

Every push to `main`: CI builds the images → pushes `ghcr.io/<owner>/<name>:<sha>` → the
`deploy` job rsyncs the compose files and runs `deploy.sh` on the server → smoke-tests the URLs.

One-time setup:

1. **Server** — install the gate and the restricted deploy key (as the `deploy` user):
   ```sh
   mkdir -p ~/.local/bin && install -m 755 ~/demo/deploy/deploy-gate.sh ~/.local/bin/demo-deploy-gate
   echo 'command="/home/deploy/.local/bin/demo-deploy-gate",restrict <PUBLIC KEY>' >> ~/.ssh/authorized_keys
   ```
   The key can only rsync into `~/demo` and run `deploy.sh` with validated arguments
   (see `deploy-gate.sh`). Revoke it by deleting that line.
2. **GitHub secrets**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (private key),
   `DEPLOY_KNOWN_HOSTS` (pinned host key); **variable** `DEPLOY_ENABLED=true`.

## Manual deploy

Build `linux/amd64` images, `docker save | ssh <server> docker load`, then on the server:
`sh ~/demo/deploy/deploy.sh`. Secrets (`JWT_SECRET`, `PULSE_ADMIN_TOKEN`, …) are generated
once into `deploy/.env` on the server and never leave it.

## First-time nginx + TLS

`sudo sh ~/demo/deploy/setup-nginx.sh` — adds a separate vhost for `*.demo.<domain>` and a
Let's Encrypt certificate; never touches other sites.
