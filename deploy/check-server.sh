#!/bin/sh
# Read-only: prints what the demo deployment needs to know. Changes nothing.
echo "== arch / os";      uname -m; . /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
echo "== cpu / ram";      nproc; free -h | sed -n '1,2p'
echo "== disk";           df -h / | tail -1
echo "== docker";         docker --version; docker compose version
echo "== docker usage";   docker system df 2>/dev/null
echo "== running";        docker ps --format '{{.Names}}\t{{.Status}}' | head -30
echo "== listening";      ss -ltnp 2>/dev/null | awk 'NR>1 {print $4}' | sort -u | tr '\n' ' '; echo
echo "== reverse proxy"
for p in nginx caddy traefik apache2 httpd; do pgrep -x "$p" >/dev/null && echo "running: $p"; done
ls /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
ls /etc/caddy 2>/dev/null
echo "== domains served"
grep -rhoE 'server_name[^;]+' /etc/nginx/ 2>/dev/null | sort -u
grep -hoE '^[a-zA-Z0-9.*-]+\.[a-z]{2,}[^{]*\{' /etc/caddy/Caddyfile 2>/dev/null
echo "== tls";            ls /etc/letsencrypt/live 2>/dev/null; command -v certbot
echo "== /opt";           ls /opt
