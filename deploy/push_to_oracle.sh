#!/bin/bash
# push_to_oracle.sh — run LOCALLY to deploy current code to the Oracle VM.
#
# What it does:
#   1. Builds the frontend (vite build)
#   2. Packs ONLY code (server/, dist/, *.py, package files) — never vault data or .env
#   3. Uploads to the VM and runs remote_deploy.sh (backup → deploy → health check → rollback on failure)
#
# Usage:
#   ./deploy/push_to_oracle.sh                 # full deploy
#   ./deploy/push_to_oracle.sh --skip-build    # skip vite build (server-only change)
#
# Config via env (or defaults below):
#   ORACLE_HOST, ORACLE_USER, ORACLE_SSH_KEY
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
VC_DIR="$ROOT_DIR/vault-control"

ORACLE_HOST="${ORACLE_HOST:-144.24.142.167}"
ORACLE_USER="${ORACLE_USER:-ubuntu}"
ORACLE_SSH_KEY="${ORACLE_SSH_KEY:-$HOME/Downloads/oracle-new-key}"
SSH_OPTS="-i $ORACLE_SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

log() { echo "[push $(date +%H:%M:%S)] $*"; }

[ -f "$ORACLE_SSH_KEY" ] || { echo "ERROR: SSH key not found at $ORACLE_SSH_KEY (set ORACLE_SSH_KEY)"; exit 1; }

# ─── 1. Build frontend ───
if [ "${1:-}" != "--skip-build" ]; then
  log "Building frontend (vite)"
  cd "$VC_DIR"
  npx vite build --logLevel error
else
  log "Skipping frontend build (--skip-build)"
fi

# ─── 2. Pack code-only tarball ───
# Paths are relative to Digital_Employee root, matching the VM layout.
log "Packing code tarball"
TARBALL=$(mktemp /tmp/digitalfte_deploy_XXXX.tar.gz)
cd "$ROOT_DIR"
tar -czf "$TARBALL" \
  --exclude='vault-control/node_modules' \
  --exclude='vault-control/.env' \
  --exclude='vault-control/whatsapp_session' \
  --exclude='vault-control/server/.secrets.enc' \
  --exclude='__pycache__' \
  vault-control/server \
  vault-control/dist \
  vault-control/package.json \
  vault-control/package-lock.json \
  vault-control/nginx.conf \
  $(ls *.py 2>/dev/null) \
  deploy/remote_deploy.sh

log "Tarball: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

# ─── 3. Upload ───
log "Uploading to $ORACLE_USER@$ORACLE_HOST"
scp $SSH_OPTS "$TARBALL" "$ORACLE_USER@$ORACLE_HOST:/tmp/digitalfte_deploy.tar.gz"
rm -f "$TARBALL"

# ─── 4. Run remote deploy (backup → extract → restart → health check → rollback) ───
log "Running remote deploy"
ssh $SSH_OPTS "$ORACLE_USER@$ORACLE_HOST" \
  "tar -xzf /tmp/digitalfte_deploy.tar.gz -C ~/Digital_Employee deploy/remote_deploy.sh && chmod +x ~/Digital_Employee/deploy/remote_deploy.sh && ~/Digital_Employee/deploy/remote_deploy.sh"

log "✅ Deploy finished — verify: http://$ORACLE_HOST/api/health"
