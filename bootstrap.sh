#!/usr/bin/env bash
# Idempotent "make sure everything is running" script.
#
# The old systemd unit put WorkingDirectory= on the external drive and guarded
# it with ExecCondition. At boot the drive is not mounted yet, so the unit
# failed with 200/CHDIR (or was silently skipped) and — being Type=oneshot with
# Restart=no — never tried again. Nothing auto-started, ever.
#
# This script instead *waits* for the mount, then converges state. It is safe to
# run repeatedly, which is what the accompanying .timer does every 5 minutes.
set -uo pipefail

REPO="/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"
WAIT_SECONDS="${BOOTSTRAP_WAIT:-600}"   # up to 10 min for the drive to appear
LOG="/tmp/digital_employee_bootstrap.log"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

# Make node/pm2 reachable regardless of how systemd invoked us.
for d in "$HOME"/.nvm/versions/node/*/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"
export PM2_HOME="${PM2_HOME:-$HOME/.pm2}"

waited=0
until [ -f "$REPO/ecosystem.config.js" ]; do
  if [ "$waited" -ge "$WAIT_SECONDS" ]; then
    log "ABORT: repo never appeared after ${WAIT_SECONDS}s (drive not mounted)"
    exit 1
  fi
  [ "$waited" -eq 0 ] && log "Waiting for external drive to mount..."
  sleep 10
  waited=$((waited + 10))
done
[ "$waited" -gt 0 ] && log "Drive available after ${waited}s"

cd "$REPO" || { log "ABORT: cannot cd into repo"; exit 1; }

if ! command -v pm2 >/dev/null 2>&1; then
  log "ABORT: pm2 not found on PATH ($PATH)"
  exit 1
fi

log "Converging PM2 state..."
pm2 startOrReload ecosystem.config.js --update-env >>"$LOG" 2>&1
rc=$?
pm2 save --force >>"$LOG" 2>&1
log "pm2 startOrReload exit=$rc"
pm2 list --no-color 2>/dev/null | tee -a "$LOG" >/dev/null

online=$(pm2 jlist 2>/dev/null | grep -o '"status":"online"' | wc -l)
log "Online processes: $online"
exit 0
