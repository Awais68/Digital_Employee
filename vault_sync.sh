#!/bin/bash
# vault_sync.sh — syncs vault state to git
cd "$(dirname "$0")"
git add "Needs_Action/" "Pending_Approval/" "Approved/" "Done/" "Plans/" "Logs/" "Briefings/" "Draft/" "Signals/" "Dashboard.md" "Company_Handbook.md" 2>/dev/null
git diff --cached --quiet || git commit -m "Vault sync: $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main 2>/dev/null || true
