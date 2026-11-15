#!/bin/sh
# Run ONCE on the server with sudo:  sudo sh /home/deploy/demo/deploy/setup-nginx.sh
# Adds a separate vhost for *.demo.glowly.uz and gets a certificate for it.
# Does not touch the existing glowly config.
set -eu
DOMAIN=${DOMAIN:-demo.glowly.uz}
NAMES="$DOMAIN taskflow.$DOMAIN admin.$DOMAIN liveboard.$DOMAIN insight.$DOMAIN pulse.$DOMAIN"

install -m 644 "$(dirname "$0")/nginx-demo.conf" /etc/nginx/sites-available/demo
sed -i "s/demo\.glowly\.uz/$DOMAIN/g" /etc/nginx/sites-available/demo
ln -sf /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/demo

# Validate before reloading: a broken config must never take glowly down.
nginx -t
systemctl reload nginx

args=""
for n in $NAMES; do args="$args -d $n"; done
certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring --cert-name "$DOMAIN" $args

nginx -t && systemctl reload nginx
echo "Done: https://$DOMAIN"
