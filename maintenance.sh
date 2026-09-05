#!/usr/bin/env bash
# Daily housekeeping. Runs from cron; safe to run by hand at any time.
#
# Disk pressure was the multiplier behind several "random" failures here:
# `[Errno 28] No space left on device` has previously killed LinkedIn posts and
# outgoing email mid-run. Both filesystems sit above 90%, so this keeps the
# repo's own growth (logs, plans, state files) bounded.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO" || exit 1

LOG_MAX_BYTES=$((20 * 1024 * 1024))   # rotate any log past 20 MB
ARCHIVE_DAYS=14                        # keep 2 weeks of rotated logs
STATE_DAYS=30                          # keep a month of plans / run state

log() { echo "[$(date '+%F %T')] $*"; }

freed_before=$(df -B1 --output=avail "$REPO" | tail -1)

# ── 1. Rotate oversized logs ────────────────────────────────────────────────
# Truncate in place rather than delete: a live process holding the fd keeps
# writing to the same inode, so unlinking would leak the space until restart.
while IFS= read -r -d '' f; do
  size=$(stat -c%s "$f")
  [ "$size" -le "$LOG_MAX_BYTES" ] && continue
  log "rotating $(basename "$f") ($((size / 1024 / 1024))MB)"
  tail -c $((LOG_MAX_BYTES / 4)) "$f" > "$f.rotated" 2>/dev/null
  gzip -f "$f.rotated" 2>/dev/null
  : > "$f"
done < <(find Logs -maxdepth 2 -type f -name '*.log' -print0 2>/dev/null)

# ── 2. Drop old rotated archives ────────────────────────────────────────────
find Logs -type f \( -name '*.gz' -o -name '*.old' -o -name '*.log.[0-9]*' \) \
  -mtime +"$ARCHIVE_DAYS" -delete 2>/dev/null
find Logs/audit -type f -name '*.json' -mtime +"$ARCHIVE_DAYS" -delete 2>/dev/null

# ── 3. Prune finished plans and run state ───────────────────────────────────
for dir in Plans Ralph_State Done; do
  [ -d "$dir" ] || continue
  before=$(find "$dir" -type f | wc -l)
  find "$dir" -type f -mtime +"$STATE_DAYS" -delete 2>/dev/null
  after=$(find "$dir" -type f | wc -l)
  [ "$before" -ne "$after" ] && log "$dir: pruned $((before - after)) file(s), $after left"
done

# ── 4. Generated post images ────────────────────────────────────────────────
find vault-control/public/generated vault-control/public/uploads \
  -type f \( -name '*.png' -o -name '*.jpg' \) -mtime +7 -delete 2>/dev/null

# ── 5. PM2's own logs ───────────────────────────────────────────────────────
if command -v pm2 >/dev/null 2>&1; then
  pm2 flush >/dev/null 2>&1 && log "pm2 logs flushed"
fi

# ── 6. Stale puppeteer/chrome crash dumps inside the WhatsApp profile ───────
find vault-control/whatsapp_session -type f \
  \( -name 'BrowserMetrics*' -o -name '*.pma' -o -name 'Crashpad*' \) \
  -mtime +3 -delete 2>/dev/null

freed_after=$(df -B1 --output=avail "$REPO" | tail -1)
freed=$(( (freed_after - freed_before) / 1024 / 1024 ))
log "maintenance done — ${freed}MB reclaimed, $(df -h "$REPO" | tail -1 | awk '{print $4}') free"
