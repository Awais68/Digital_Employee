#!/usr/bin/env python3
"""
Universal Orchestrator — Ralph Wiggum loop for any AI provider.

When Claude Code is available:
  → .claude/hooks/stop.py handles the loop automatically
  → This file is NOT needed (but harmless to run)

When Claude Code is NOT available:
  → This file runs the same loop using OpenAI/Gemini/Anthropic API
  → Same vault structure, same file operations, same HITL workflow
"""

import os, sys, time, json, re, logging
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent))
from utils.ai_provider import call_ai, detect_provider, get_provider_info

# ── Config ────────────────────────────────────────────────────
VAULT      = Path(os.getenv('VAULT_PATH', '.'))
DRY_RUN    = os.getenv('DRY_RUN', 'true').lower() == 'true'
MAX_ITER   = int(os.getenv('MAX_LOOP_ITERATIONS', '15'))
SLEEP_SECS = int(os.getenv('LOOP_SLEEP_SECONDS', '3'))

# ── Logging ───────────────────────────────────────────────────
log_dir = VAULT / 'Logs'
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [ORCHESTRATOR] %(message)s',
    handlers=[
        logging.FileHandler(log_dir / 'universal_orchestrator.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── Vault helpers ─────────────────────────────────────────────

def get_pending_files() -> list:
    na = VAULT / 'Needs_Action'
    return sorted(na.glob('*.md')) if na.exists() else []

def read_handbook() -> str:
    hb = VAULT / 'Company_Handbook.md'
    return hb.read_text()[:2000] if hb.exists() else ''

def read_goals() -> str:
    g = VAULT / 'Business_Goals.md'
    return g.read_text()[:1000] if g.exists() else ''

def write_vault_file(folder: str, filename: str, content: str) -> Path:
    target = VAULT / folder / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if not DRY_RUN:
        target.write_text(content)
        log.info(f"[Created] {folder}/{filename}")
    else:
        log.info(f"[DRY RUN] Would create: {folder}/{filename}")
    return target

def move_to_done(file_path: Path):
    done_dir = VAULT / 'Done'
    done_dir.mkdir(parents=True, exist_ok=True)
    dest = done_dir / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file_path.name}"
    if not DRY_RUN:
        file_path.rename(dest)
        log.info(f"[Moved to Done] {file_path.name}")
    else:
        log.info(f"[DRY RUN] Would move to Done: {file_path.name}")

def update_dashboard(pending: int, done_today: int, provider: str):
    content = f"""# AI Employee Dashboard
Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
AI Provider: {provider}
DRY_RUN: {DRY_RUN}

## Current Status
| Item | Count |
|------|-------|
| Needs Action | {pending} |
| Done Today | {done_today} |

## System
- Orchestrator: Universal (Python loop)
- Ralph Wiggum: {'Hook (Claude Code)' if Path('.claude/hooks/stop.py').exists() else 'Loop (Python)'}
- MCP: {'Configured' if Path('.mcp.json').exists() else 'Not configured'}
"""
    if not DRY_RUN:
        (VAULT / 'Dashboard.md').write_text(content)

def log_iteration(iteration: int, pending: int, response: str, provider: str):
    log_file = log_dir / f"{datetime.now().strftime('%Y-%m-%d')}_loop.json"
    entries  = json.loads(log_file.read_text()) if log_file.exists() else []
    entries.append({
        'timestamp': datetime.now(datetime.UTC).isoformat(),
        'iteration': iteration,
        'provider':  provider,
        'pending_count': pending,
        'dry_run':   DRY_RUN,
        'response_preview': response[:300]
    })
    log_file.write_text(json.dumps(entries, indent=2))

# ── AI response parser ────────────────────────────────────────

def parse_and_execute(response: str, processed_files: list):
    """
    AI response se instructions parse karo aur execute karo.
    Plan files, Approval requests, Done moves.
    """
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Plans banana
    if 'PLAN_' in response or 'Plans/' in response or 'plan' in response.lower():
        for f in processed_files:
            plan_name = f"PLAN_{f.stem}_{ts}.md"
            plan_content = f"""---
created: {datetime.now().isoformat()}
source: {f.name}
status: pending
ai_provider: {detect_provider()}
dry_run: {DRY_RUN}
---

## Plan

{response[:1500]}

## Steps
- [ ] Review AI analysis above
- [ ] Execute approved actions
- [ ] Move to Done when complete
"""
            write_vault_file('Plans', plan_name, plan_content)

    # Approval requests banana
    needs_approval = any(word in response.lower() for word in [
        'send email', 'post to', 'payment', 'invoice',
        'approval', 'pending_approval', 'requires human'
    ])
    if needs_approval:
        for f in processed_files:
            approval_name = f"APPROVAL_{f.stem}_{ts}.md"
            approval_content = f"""---
created: {datetime.now().isoformat()}
source: {f.name}
action: review_required
status: pending_approval
ai_provider: {detect_provider()}
requires_human: true
expires: {datetime.now().isoformat()}
---

## Action Requires Your Approval

{response[:1000]}

## How to Approve
Move this file to the Approved/ folder.

## How to Reject
Move this file to the Rejected/ folder.
"""
            write_vault_file('Pending_Approval', approval_name, approval_content)
            log.info(f"[Approval Request Created] {approval_name}")

    # Processed files Done mein move karo
    if 'TASK_COMPLETE' in response or 'processed' in response.lower():
        for f in processed_files:
            if f.exists():
                move_to_done(f)

# ── Main Ralph Wiggum Loop ────────────────────────────────────

def ralph_wiggum_loop():
    """
    Pure Python Ralph Wiggum loop.
    Kaam karta hai jab Claude Code nahi hai.
    Claude Code ke saath .claude/hooks/stop.py use hota hai.
    """
    provider = detect_provider()
    info     = get_provider_info()

    log.info("=" * 60)
    log.info("Universal Orchestrator starting")
    log.info(f"Provider:    {provider}")
    log.info(f"Claude Code: {'Available' if info['claude_code_available'] else 'Not available'}")
    log.info(f"MCP:         {'Configured' if info['mcp_configured'] else 'Not configured'}")
    log.info(f"DRY_RUN:     {DRY_RUN}")
    log.info("=" * 60)

    if provider == 'claude_code':
        log.info(
            "Claude Code detected + hooks configured.\n"
            "Ralph Wiggum hooks will handle the loop automatically.\n"
            "Run: claude 'Process all Needs_Action files' inside project."
        )
        return

    if provider == 'none':
        log.error(
            "No AI provider found!\n"
            "Set one of these in .env:\n"
            "  ANTHROPIC_API_KEY=sk-ant-...\n"
            "  OPENAI_API_KEY=sk-...\n"
            "  GEMINI_API_KEY=AIza..."
        )
        sys.exit(1)

    handbook    = read_handbook()
    goals       = read_goals()
    done_today  = 0

    system_prompt = f"""You are an autonomous AI employee assistant.
Your vault path: {VAULT}
AI Provider: {provider}
DRY_RUN mode: {DRY_RUN}

{f"Company rules:{chr(10)}{handbook}" if handbook else ""}
{f"Business goals:{chr(10)}{goals}" if goals else ""}

Your responsibilities:
1. Read each task file from Needs_Action/
2. Analyze and create a Plan file in Plans/
3. For safe actions (read, analyze, summarize): execute directly
4. For sensitive actions (send email, post on social, payment):
   create an approval file in Pending_Approval/ — NEVER execute directly
5. Move processed files to Done/
6. Update Dashboard.md

When Needs_Action/ is empty, respond with exactly: TASK_COMPLETE
If DRY_RUN is true, describe what you would do but don't actually do it.
"""

    for iteration in range(1, MAX_ITER + 1):
        pending = get_pending_files()

        if not pending:
            log.info(f"[Iter {iteration}] Needs_Action/ is empty — loop complete!")
            break

        log.info(f"[Iter {iteration}/{MAX_ITER}] {len(pending)} pending | provider: {provider}")

        # Max 5 files per iteration (token limit)
        batch = pending[:5]
        context_parts = []
        for f in batch:
            try:
                content = f.read_text()[:1500]
                context_parts.append(f"=== FILE: {f.name} ===\n{content}")
            except Exception as e:
                log.warning(f"Could not read {f.name}: {e}")

        if not context_parts:
            log.warning("No readable files in batch, skipping")
            time.sleep(SLEEP_SECS)
            continue

        files_info = (
            f"Showing {len(batch)} of {len(pending)}"
            if len(pending) > 5 else f"All {len(pending)}"
        )

        user_prompt = f"""Process these tasks ({files_info}):

{chr(10).join(context_parts)}

For each file:
1. Analyze the task
2. Create a Plan in Plans/
3. If action is safe: describe execution (DRY_RUN={DRY_RUN})
4. If action is sensitive: create Pending_Approval/ file
5. Confirm each file processed

If all files are processed, end with: TASK_COMPLETE
"""

        try:
            response = call_ai(system_prompt, user_prompt, provider=provider)
            log.info(f"  AI response: {response[:150]}...")
        except Exception as e:
            log.error(f"  AI call failed: {e}")
            time.sleep(10)
            continue

        parse_and_execute(response, batch)
        log_iteration(iteration, len(pending), response, provider)
        done_today += len(batch)

        if 'TASK_COMPLETE' in response:
            log.info(f"[Loop] TASK_COMPLETE at iteration {iteration}")
            break

        # Re-check actual files
        still_pending = get_pending_files()
        if not still_pending:
            log.info(f"[Loop] All cleared at iteration {iteration}")
            break

        time.sleep(SLEEP_SECS)

    update_dashboard(len(get_pending_files()), done_today, provider)
    log.info("[Loop] Universal orchestrator finished.")

# ── Entry point ───────────────────────────────────────────────
if __name__ == '__main__':
    ralph_wiggum_loop()
