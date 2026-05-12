#!/usr/bin/env bash
# deploy_linkedin_fix.sh
# Run this from your Digital_Employee directory.
# ─────────────────────────────────────────────────────────────────────────────

set -e
SKILL_DIR="Agent_Skills"
SKILL_FILE="SKILL_LInkedin_Playwright_MCP.py"
BACKUP_FILE="${SKILL_FILE}.bak_$(date +%Y%m%d_%H%M%S)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LinkedIn Skill Deployment (v2 → v3)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: backup old skill ──────────────────────────────────────────────────
echo "[1] Backing up old skill..."
cp "${SKILL_DIR}/${SKILL_FILE}" "${SKILL_DIR}/${BACKUP_FILE}"
echo "    Saved → ${SKILL_DIR}/${BACKUP_FILE}"

# ── Step 2: copy new skill ────────────────────────────────────────────────────
echo "[2] Installing v3 skill..."
cp "$(dirname "$0")/SKILL_LInkedin_Playwright_MCP.py" "${SKILL_DIR}/${SKILL_FILE}"
echo "    Installed → ${SKILL_DIR}/${SKILL_FILE}"

# ── Step 3: copy diagnostic ───────────────────────────────────────────────────
echo "[3] Installing diagnostic script..."
cp "$(dirname "$0")/linkedin_diagnose.py" ./linkedin_diagnose.py
echo "    Installed → ./linkedin_diagnose.py"

# ── Step 4: check session ─────────────────────────────────────────────────────
echo ""
echo "[4] Checking LinkedIn session..."
python3 "${SKILL_DIR}/${SKILL_FILE}" test
SESSION_OK=$?

if [ $SESSION_OK -ne 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Session expired — re-login required"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  A browser window will open. Log in to LinkedIn."
    echo "  Press Enter when ready..."
    read -r
    python3 "${SKILL_DIR}/${SKILL_FILE}" save
fi

# ── Step 5: run diagnostic ────────────────────────────────────────────────────
echo ""
echo "[5] Running full diagnostic (no post sent)..."
python3 ./linkedin_diagnose.py

# ── Step 6: optional smoke test ───────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Send a REAL test post to LinkedIn? (y/N) " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    TEST_CONTENT="Testing our automated posting system. This is a verification post — feel free to ignore it! 🤖 #Automation #Testing"
    echo ""
    echo "Sending: ${TEST_CONTENT}"
    echo ""
    python3 "${SKILL_DIR}/${SKILL_FILE}" post "$TEST_CONTENT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Backup:       ${SKILL_DIR}/${BACKUP_FILE}"
echo "  Debug shots:  Logs/linkedin_debug/"
echo ""
echo "  If a post still fails:"
echo "    1. Check Logs/linkedin_debug/*.png for screenshots"
echo "    2. If session expired: python3 ${SKILL_DIR}/${SKILL_FILE} save"
echo "    3. If selectors broken: python3 linkedin_diagnose.py (shows which step fails)"
