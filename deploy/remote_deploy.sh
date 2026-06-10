#!/bin/bash
# remote_deploy.sh — runs ON the Oracle VM (144.24.142.167)
# Receives /tmp/digitalfte_deploy.tar.gz, deploys it safely with backup + rollback.
#
# SAFETY GUARANTEES:
#   - Never touches vault data (Pending_Approval, Needs_Action, Done, Logs, Metrics, .env)
#   - Backs up current code before replacing
#   - Health check after restart; automatic rollback on failure
set -euo pipefail

APP_DIR="$HOME/Digital_Employee"
VC_DIR="$APP_DIR/vault-control"
TARBALL="/tmp/digitalfte_deploy.tar.gz"
BACKUP_ROOT="$HOME/deploy_backups"
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$TS"
SERVICE="digitalfte-server"
# Read actual port from .env (server reads PORT from dotenv)
ACTUAL_PORT=$(grep -oP '^PORT=\K\d+' "$VC_DIR/.env" 2>/dev/null || echo "3000")
HEALTH_URL="http://localhost:$ACTUAL_PORT/api/health"
log "Target health endpoint: $HEALTH_URL"

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

[ -f "$TARBALL" ] || { echo "ERROR: $TARBALL not found"; exit 1; }

# ─── 1. Backup current code (code only, not vault data) ───
log "Backing up current code to $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r "$VC_DIR/server" "$BACKUP_DIR/server"
[ -d "$VC_DIR/dist" ] && cp -r "$VC_DIR/dist" "$BACKUP_DIR/dist"
cp "$VC_DIR/package.json" "$BACKUP_DIR/package.json" 2>/dev/null || true
cp "$VC_DIR/package-lock.json" "$BACKUP_DIR/package-lock.json" 2>/dev/null || true
mkdir -p "$BACKUP_DIR/root_py"
cp "$APP_DIR"/*.py "$BACKUP_DIR/root_py/" 2>/dev/null || true

# Keep only last 5 backups
ls -dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

# ─── 2. Detect if npm install will be needed ───
OLD_LOCK_HASH=$(md5sum "$VC_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo "none")

# ─── 3. Extract new code over the app dir ───
# Tarball contains ONLY code paths (built dist, server/, *.py, package files)
log "Extracting new code"
tar -xzf "$TARBALL" -C "$APP_DIR"

# ─── 4. npm install only if lockfile changed ───
NEW_LOCK_HASH=$(md5sum "$VC_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo "none")
if [ "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ]; then
  log "package-lock.json changed — running npm ci (production deps)"
  cd "$VC_DIR"
  export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
  export PUPPETEER_SKIP_DOWNLOAD=true
  npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3
else
  log "Dependencies unchanged — skipping npm install"
fi

# ─── 5. Stop service + kill lingering processes, then start ───
log "Stopping $SERVICE"
sudo systemctl stop "$SERVICE" 2>/dev/null || true
sleep 2
# Kill any lingering node processes on ports 3000-3003
for port in 3000 3001 3002 3003; do
  pid=$(lsof -ti :"$port" 2>/dev/null) && kill -9 $pid 2>/dev/null && log "  killed lingering process on port $port" || true
done

log "Starting $SERVICE"
sudo systemctl start "$SERVICE"

# ─── 6. Health check with retries ───
log "Health check: $HEALTH_URL"
HEALTHY=false
for i in $(seq 1 12); do
  sleep 5
  if curl -sf -m 5 "$HEALTH_URL" > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  log "  attempt $i/12 — not healthy yet"
done

if [ "$HEALTHY" = "true" ]; then
  log "✅ DEPLOY SUCCESSFUL — service healthy"
  rm -f "$TARBALL"
  exit 0
fi

# ─── 7. ROLLBACK ───
log "❌ Health check FAILED — rolling back to backup $TS"
rm -rf "$VC_DIR/server" "$VC_DIR/dist"
cp -r "$BACKUP_DIR/server" "$VC_DIR/server"
[ -d "$BACKUP_DIR/dist" ] && cp -r "$BACKUP_DIR/dist" "$VC_DIR/dist"
cp "$BACKUP_DIR/package.json" "$VC_DIR/package.json" 2>/dev/null || true
cp "$BACKUP_DIR/package-lock.json" "$VC_DIR/package-lock.json" 2>/dev/null || true
cp "$BACKUP_DIR/root_py/"*.py "$APP_DIR/" 2>/dev/null || true

sudo systemctl restart "$SERVICE"
sleep 8
if curl -sf -m 5 "$HEALTH_URL" > /dev/null 2>&1; then
  log "↩️  Rollback successful — old version restored and healthy"
else
  log "🚨 CRITICAL: rollback restart also unhealthy — manual intervention needed"
fi
exit 1
