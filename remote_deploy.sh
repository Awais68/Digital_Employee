#!/bin/bash
# Runs ON the Oracle VM (as the ubuntu user) after CI has extracted the tarball
# into ~/Digital_Employee. PM2 is the single supervisor: ecosystem.config.js
# owns vault-control, gmail-watcher, email-mcp and the orchestrator cron. The
# old `systemctl restart digitalfte-server` path started a second copy of the
# backend on :3001 with its own schedulers, which doubled emails and posts.
set -eo pipefail

PROJECT=/home/ubuntu/Digital_Employee
VENV=$PROJECT/venv
LOG=/tmp/remote_deploy.log
STAMP_DIR=$PROJECT/.deploy-stamps
mkdir -p "$STAMP_DIR"

echo "🚀 Deploy started at $(date)" | tee "$LOG"
cd "$PROJECT"

# Re-install deps only when the lockfile / requirements actually changed. A
# full `npm ci` on a 1 GB box takes minutes and briefly pushes memory into swap.
changed() { # $1 = file, $2 = stamp name
  local sum; sum=$(sha256sum "$1" | cut -d' ' -f1)
  if [ -f "$STAMP_DIR/$2" ] && [ "$(cat "$STAMP_DIR/$2")" = "$sum" ]; then return 1; fi
  echo "$sum" > "$STAMP_DIR/$2.pending"; return 0
}
commit_stamp() { mv -f "$STAMP_DIR/$1.pending" "$STAMP_DIR/$1" 2>/dev/null || true; }

# 1. Python dependencies
if changed requirements.txt py; then
  echo "📦 Installing Python deps..." | tee -a "$LOG"
  "$VENV/bin/pip" install -q -r requirements.txt 2>&1 | tail -5 | tee -a "$LOG"
  commit_stamp py
else
  echo "📦 Python deps unchanged" | tee -a "$LOG"
fi

# 2. Node dependencies for vault-control
if changed vault-control/package-lock.json node; then
  echo "📦 Installing Node deps..." | tee -a "$LOG"
  (cd vault-control && npm ci --no-audit --no-fund --omit=dev 2>&1 | tail -5 | tee -a "$LOG")
  commit_stamp node
else
  echo "📦 Node deps unchanged" | tee -a "$LOG"
fi

# 3. Make sure the legacy systemd unit stays out of the way.
if systemctl list-unit-files digitalfte-server.service >/dev/null 2>&1 \
   && systemctl is-enabled --quiet digitalfte-server 2>/dev/null; then
  echo "🧹 Disabling legacy digitalfte-server systemd unit" | tee -a "$LOG"
  sudo systemctl disable --now digitalfte-server || true
fi

# 4. Reload under PM2 (starts missing apps, restarts changed ones, re-reads .env)
echo "🔄 pm2 startOrReload ecosystem.config.js" | tee -a "$LOG"
chmod +x "$PROJECT"/*.sh 2>/dev/null || true
export PATH="$HOME/.npm-global/bin:/usr/local/bin:$PATH"
pm2 startOrReload ecosystem.config.js --update-env 2>&1 | tail -15 | tee -a "$LOG"
pm2 save >/dev/null

# 5. Health check against the port nginx proxies to
for i in $(seq 1 15); do
  if curl -sf -m 5 http://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; then
    echo "✅ vault-control healthy on :3000" | tee -a "$LOG"
    pm2 ls | tee -a "$LOG"
    echo "✅ Deploy complete at $(date)" | tee -a "$LOG"
    exit 0
  fi
  sleep 2
done

echo "❌ vault-control did not become healthy on :3000" | tee -a "$LOG"
pm2 ls | tee -a "$LOG"
pm2 logs vault-control --lines 40 --nostream | tee -a "$LOG"
exit 1
