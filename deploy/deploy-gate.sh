#!/bin/sh
# Forced command for the GitHub Actions deploy key. Installed on the server as
#   ~/.local/bin/demo-deploy-gate
# and referenced from ~/.ssh/authorized_keys:
#   command="/home/deploy/.local/bin/demo-deploy-gate",restrict ssh-ed25519 AAAA... github-actions-demo-deploy
#
# With that key a client can only:
#   1. rsync into ~/demo
#   2. run ~/demo/deploy/deploy.sh with validated arguments
# No shell, no port forwarding, nothing outside the demo.
set -eu
cmd=${SSH_ORIGINAL_COMMAND:-}

case "$cmd" in
  "rsync --server "*" . demo/")
    exec $cmd
    ;;
  "demo-deploy "*)
    set -- $cmd
    [ $# -eq 4 ] || { echo "usage: demo-deploy <ghcr prefix> <sha> <user>" >&2; exit 2; }
    echo "$2" | grep -Eq '^ghcr\.io/[a-z0-9-]+$' || { echo "bad image prefix" >&2; exit 2; }
    echo "$3" | grep -Eq '^[0-9a-f]{40}$'        || { echo "bad image tag" >&2; exit 2; }
    echo "$4" | grep -Eq '^[A-Za-z0-9-]{1,39}$'  || { echo "bad registry user" >&2; exit 2; }
    cd "$HOME/demo"
    exec env IMAGE_PREFIX="$2" IMAGE_TAG="$3" REGISTRY_USER="$4" sh deploy/deploy.sh
    ;;
  *)
    echo "denied: this key may only deploy the demo" >&2
    exit 1
    ;;
esac
