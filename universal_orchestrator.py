"""
universal_orchestrator.py

Ralph Wiggum loop WITHOUT Claude Code CLI.
Used automatically when claude CLI is not available.
When Claude Code IS available, .claude/hooks/stop.py handles looping instead.

DO NOT run this manually if Claude Code is working — it will run automatically
via smart_run.py when needed.
"""
import os, time, json, re, logging
from pathlib import Path
from datetime import datetime
from provider_config import call_ai, detect_provider

# ── Config ────────────────────────────────────────────────────
VAULT     = Path(os.getenv('VAULT_PATH', '.'))
DRY_RUN   = os.getenv('DRY_RUN', 'true').lower() == 'true'
MAX_ITER  = int(os.getenv('MAX_ITERATIONS', '15'))
LOG_DIR   = VAULT / 'Logs'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [ORCHESTRATOR] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'universal_orchestrator.log'),
        logging.StreamHandler()
    ]
)

# ── Helpers ───────────────────────────────────────────────────
def get_pending():
    na = VAULT / 'Needs_Action'
    return list(na.glob('*.md')) if na.exists() else []

def get_handbook():
    hb = VAULT / 'Company_Handbook.md'
    return hb.read_text()[:2000] if hb.exists() else ''

def get_approved():
    ap = VAULT / 'Approved'
    return list(ap.glob('*.md')) if ap.exists() else []

def move_to_done(filepath):
    done = VAULT / 'Done'
    done.mkdir(parents=True, exist_ok=True)
    dest = done / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filepath.name}"
    if not DRY_RUN:
        filepath.rename(dest)
        logging.info(f"Moved to Done: {filepath.name}")
    else:
        logging.info(f"[DRY RUN] Would move to Done: {filepath.name}")

def write_file(folder, filename, content):
    target = VAULT / folder / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if not DRY_RUN:
        target.write_text(content)
        logging.info(f"Created: {folder}/{filename}")
    else:
        logging.info(f"[DRY RUN] Would create: {folder}/{filename}")
    return target

def log_action(action, status, details=''):
    log_file = LOG_DIR / f"{datetime.now().strftime('%Y-%m-%d')}.json"
    logs = []
    if log_file.exists():
        try: logs = json.loads(log_file.read_text())
        except: pass
    provider, _ = detect_provider()
    logs.append({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "action": action, "status": status,
        "provider": provider, "dry_run": DRY_RUN,
        "details": details
    })
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file.write_text(json.dumps(logs, indent=2))

def update_dashboard(iteration, pending_count):
    dash = VAULT / 'Dashboard.md'
    done = VAULT / 'Done'
    done_count = len(list(done.glob('*.md'))) if done.exists() else 0
    provider, _ = detect_provider()
    content = f"""# AI Employee Dashboard
Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
Provider: {provider} | DRY_RUN: {DRY_RUN}

## Status
| | Count |
|---|---|
| Needs Action | {pending_count} |
| Done | {done_count} |
| Loop iteration | {iteration} |

## Active Mode
{"🤖 Universal Orchestrator (non-Claude Code path)" }
"""
    if not DRY_RUN:
        dash.write_text(content)

# ── Main: process pending tasks ───────────────────────────────
def process_pending(pending_files, iteration):
    if not pending_files:
        return True  # done

    handbook = get_handbook()
    system_prompt = f"""You are an autonomous AI employee assistant.
Vault path: {VAULT}
DRY_RUN: {DRY_RUN}

Company rules:
{handbook}

Instructions:
- Analyze each task file provided
- For each task: determine required action
- Safe actions (analyze, summarize, log): describe what you would do
- Sensitive actions (send email, post, payment): specify exactly what file 
  to create in Pending_Approval/ with full details
- Specify which files to move to Done/
- If all tasks processed: end your response with exactly: TASK_COMPLETE
- Format your response as JSON:
{{
  "actions": [
    {{
      "source_file": "filename.md",
      "action_type": "create_plan|create_approval|move_to_done|execute",
      "target_folder": "Plans|Pending_Approval|Done",
      "target_filename": "OUTPUT_filename.md",
      "content": "full markdown content to write",
      "reasoning": "why this action"
    }}
  ],
  "status": "in_progress|TASK_COMPLETE"
}}"""

    # Build context from pending files
    files_context = []
    for f in pending_files[:5]:
        try:
            text = f.read_text()[:1200]
            files_context.append(f"=== {f.name} ===\n{text}")
        except Exception as e:
            logging.warning(f"Could not read {f.name}: {e}")

    user_prompt = f"""Iteration {iteration}/{MAX_ITER}
Process these {len(pending_files)} pending tasks:

{chr(10).join(files_context)}
{"(Showing 5 of " + str(len(pending_files)) + ")" if len(pending_files) > 5 else ""}

Respond with the JSON action plan."""

    try:
        response, provider = call_ai(system_prompt, user_prompt)
        logging.info(f"Got response from {provider} ({len(response)} chars)")
    except Exception as e:
        logging.error(f"AI call failed: {e}")
        log_action("ai_call", "error", str(e))
        time.sleep(10)
        return False

    # Parse and execute actions
    json_match = re.search(r'\{.*\}', response, re.DOTALL)
    if not json_match:
        logging.warning("No JSON in response — treating as free text")
        log_action("parse", "warning", "no JSON found")
        return False

    try:
        plan = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        logging.error(f"JSON parse error: {e}")
        log_action("parse", "error", str(e))
        return False

    executed = 0
    for action in plan.get('actions', []):
        try:
            src  = action.get('source_file', '')
            typ  = action.get('action_type', '')
            fold = action.get('target_folder', 'Plans')
            fn   = action.get('target_filename', f'AUTO_{datetime.now().strftime("%H%M%S")}.md')
            cont = action.get('content', '')

            if typ in ('create_plan', 'create_approval', 'execute') and cont:
                write_file(fold, fn, cont)
                log_action(typ, "success" if not DRY_RUN else "dry_run", fn)
                executed += 1

            if typ in ('move_to_done', 'create_plan', 'create_approval'):
                src_path = VAULT / 'Needs_Action' / src
                if src_path.exists():
                    move_to_done(src_path)

        except Exception as e:
            logging.error(f"Action execution error: {e}")
            log_action("execute", "error", str(e))

    logging.info(f"Executed {executed} actions from AI plan")
    return plan.get('status') == 'TASK_COMPLETE'

# ── Process approved tasks (local executor role) ──────────────
def process_approved():
    approved = get_approved()
    if not approved:
        return
    logging.info(f"Found {len(approved)} approved tasks")
    for f in approved:
        logging.info(f"Processing approved: {f.name}")
        log_action("approved_execution", "dry_run" if DRY_RUN else "pending", f.name)
        # Actual execution (email send, post etc.) goes here
        # For now: move to Done as acknowledged
        move_to_done(f)

# ── Ralph Wiggum loop ─────────────────────────────────────────
def ralph_wiggum_loop():
    provider, _ = detect_provider()
    logging.info(f"Ralph Wiggum Loop starting (provider: {provider})")
    logging.info(f"Vault: {VAULT} | DRY_RUN: {DRY_RUN} | MAX_ITER: {MAX_ITER}")

    for iteration in range(1, MAX_ITER + 1):
        pending = get_pending()
        approved = get_approved()

        logging.info(f"--- Iteration {iteration}/{MAX_ITER} "
                     f"| Pending: {len(pending)} | Approved: {len(approved)} ---")

        update_dashboard(iteration, len(pending))

        if not pending and not approved:
            logging.info("All tasks complete — loop finished normally")
            break

        # Process approved first (higher priority)
        if approved:
            process_approved()

        # Then process pending
        if pending:
            done = process_pending(pending, iteration)
            if done:
                logging.info("AI signaled TASK_COMPLETE")
                break

        time.sleep(2)

    update_dashboard(MAX_ITER, 0)
    logging.info("Ralph Wiggum loop finished")

if __name__ == '__main__':
    ralph_wiggum_loop()
