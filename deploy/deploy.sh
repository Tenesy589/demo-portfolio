#!/bin/sh
# Runs ON the server from /opt/demo. Images are built elsewhere and loaded
# beforehand (docker load), so the server never compiles anything.
set -eu
cd "$(dirname "$0")/.."

# Refuse to start when the disk is nearly full — this box also runs production apps.
avail_kb=$(df -Pk / | awk 'NR==2 {print $4}')
[ "$avail_kb" -ge 4194304 ] || { echo "Less than 4 GB free on / — not deploying" >&2; df -h / >&2; exit 1; }

# Secrets are generated once on the server and never leave it.
ENV=deploy/.env
touch "$ENV"; chmod 600 "$ENV"
ensure_secret() {
  grep -q "^$1=..*" "$ENV" && return 0
  sed -i "/^$1=/d" "$ENV"
  printf '%s=%s\n' "$1" "$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$ENV"
  echo "Generated $1"
}
ensure_secret JWT_SECRET
ensure_secret PULSE_ADMIN_TOKEN       # open https://pulse.<domain>/?admin=<token> once to manage monitors
ensure_secret GRAFANA_ADMIN_PASSWORD  # used only with --profile full

compose() { docker compose -p demo --env-file "$ENV" -f platform/compose.yaml -f deploy/compose.prod.yaml "$@"; }

# CI mode: IMAGE_PREFIX/IMAGE_TAG point at GHCR and a short-lived registry token
# arrives on stdin (never on the command line, never written to disk).
if [ -n "${IMAGE_PREFIX:-}" ]; then
  export IMAGE_PREFIX IMAGE_TAG
  IFS= read -r REGISTRY_TOKEN || true
  if [ -n "${REGISTRY_TOKEN:-}" ]; then
    DOCKER_CONFIG=$(mktemp -d); export DOCKER_CONFIG
    trap 'rm -rf "$DOCKER_CONFIG"' EXIT HUP INT TERM
    printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io -u "${REGISTRY_USER:-github}" --password-stdin >/dev/null
    unset REGISTRY_TOKEN
  fi
  compose pull --quiet liveboard-api liveboard-worker liveboard-migrate taskflow-web insight-api insight-worker insight-migrate adminhub-web pulse-api pulse-prober
fi

compose up -d --no-build --remove-orphans
# rsync replaces nginx.conf with a new inode; a single-file bind mount keeps the old one,
# so recreate the gateway (a couple of seconds) to make it read the current config.
compose up -d --no-build --force-recreate gateway

attempt=0
until curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:${GATEWAY_PORT:-7100}/; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 60 ] || { echo "Gateway did not come up" >&2; compose ps >&2; exit 1; }
  sleep 2
done
compose ps --format '{{.Service}}\t{{.Status}}'
# Remove previous demo releases only — never other apps' images on this shared server.
if [ -n "${IMAGE_PREFIX:-}" ]; then
  docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$IMAGE_PREFIX/" | grep -v ":$IMAGE_TAG$" | xargs -r docker rmi >/dev/null 2>&1 || true
fi
docker image prune -f >/dev/null
df -h / | tail -1 | awk '{print "Disk: " $4 " free of " $2}'
