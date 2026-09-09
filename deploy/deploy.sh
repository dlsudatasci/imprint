#!/usr/bin/env bash
#
# Builds locally and ships the standalone output to the VM over SSH.
#
# Building here rather than on the VM keeps the toolchain (and ~800MB of dev
# dependencies) off the server, and means a broken build never reaches it.
#
#   ./deploy/deploy.sh user@vm-host
#
# First run only: see DEPLOYMENT.md for the one-time VM setup (node, nginx,
# the service user, and .env).

set -euo pipefail

TARGET="${1:-}"
REMOTE_DIR="${REMOTE_DIR:-/srv/imprint}"
SERVICE="${SERVICE:-imprint}"

if [[ -z "$TARGET" ]]; then
  echo "usage: $0 user@vm-host" >&2
  exit 1
fi

echo "==> Building"
npm run build:ui          # design system, consumed by the app build
npm run build

if [[ ! -d .next/standalone ]]; then
  echo "No .next/standalone — is output:'standalone' still set in next.config.js?" >&2
  exit 1
fi

echo "==> Assembling bundle"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# server.js and its pruned node_modules, plus the two trees standalone omits.
cp -R .next/standalone/. "$STAGE"/
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"

# .env is deliberately NOT shipped — it lives on the VM and is not overwritten.

echo "==> Uploading to $TARGET:$REMOTE_DIR"
# --delete keeps stale chunks from accumulating across deploys; .env is
# excluded so a deploy can never clobber the server's secrets.
rsync -az --delete --exclude='.env' "$STAGE"/ "$TARGET:$REMOTE_DIR/"

echo "==> Restarting $SERVICE"
ssh "$TARGET" "sudo systemctl restart $SERVICE && sleep 3 && systemctl is-active $SERVICE"

echo "==> Health check"
if ssh "$TARGET" "curl -fsS --max-time 10 http://127.0.0.1:3000/api/health"; then
  echo
  echo "Deployed."
else
  echo
  echo "Health check FAILED. Logs:" >&2
  ssh "$TARGET" "journalctl -u $SERVICE -n 40 --no-pager" >&2
  exit 1
fi
