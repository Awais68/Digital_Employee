#!/usr/bin/env python3
"""Ralph Wiggum Stop Hook — adapted for FLAT vault structure"""
import sys, os, json, subprocess
from pathlib import Path

VAULT = Path(os.getenv('VAULT_PATH', '.'))
MAX_ITER = int(os.getenv('MAX_ITERATIONS', '15'))
LOG_FILE = VAULT / 'Logs' / 'ralph_wiggum_loop.log'
# Persist the iteration counter to disk: each Stop-hook invocation is a fresh
# process, so mutating os.environ (as the old version did) never carried across
# runs — MAX_ITER could never trip and the loop ran forever. This file is the
# durable counter instead.
ITER_FILE = VAULT / 'Logs' / '.ralph_iteration'

def read_iter():
    try:
        return int(ITER_FILE.read_text().strip())
    except Exception:
        return 0

def write_iter(n):
    try:
        ITER_FILE.parent.mkdir(parents=True, exist_ok=True)
        ITER_FILE.write_text(str(n))
    except Exception:
        pass

CURR_ITER = read_iter()

def log(msg):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        from datetime import datetime
        f.write(f"[{datetime.now().isoformat()}] {msg}\n")

def frontmatter_status(text):
    """Return the status value from a file's OWN leading YAML frontmatter only.

    Plans embed the original email (which carries its own `status: pending`), so
    a naive substring search over the whole file counted already-handled plans
    forever. Restrict the check to the first --- ... --- block.
    """
    if not text.startswith('---'):
        return None
    end = text.find('\n---', 3)
    fm = text[:end] if end != -1 else text
    for line in fm.split('\n'):
        line = line.strip()
        if line.lower().startswith('status:'):
            return line.split(':', 1)[1].strip().lower()
    return None

def get_pending():
    """FLAT vault: check Needs_Action/ at root level"""
    needs_action = VAULT / 'Needs_Action'
    pending = list(needs_action.glob('*.md')) if needs_action.exists() else []
    plans = VAULT / 'Plans'
    unexecuted_plans = []
    if plans.exists():
        for f in plans.glob('*.md'):
            try:
                status = frontmatter_status(f.read_text(encoding='utf-8', errors='replace'))
            except Exception:
                continue
            if status in ('pending', 'in_progress', 'in progress'):
                unexecuted_plans.append(f)
    return pending, unexecuted_plans

def main():
    try:
        hook_input = sys.stdin.read()
        input_data = json.loads(hook_input) if hook_input.strip() else {}
    except:
        input_data = {}

    pending, unexecuted = get_pending()
    total_work = len(pending) + len(unexecuted)

    log(f"Iter {CURR_ITER}/{MAX_ITER} | Needs_Action: {len(pending)} | Unexecuted plans: {len(unexecuted)}")

    if total_work == 0:
        log("All tasks complete — allowing Claude to exit")
        write_iter(0)  # reset so the next real run starts fresh
        print(json.dumps({"decision": "approve"}))
        sys.exit(0)

    if CURR_ITER >= MAX_ITER:
        log(f"Max iterations ({MAX_ITER}) reached — forcing exit to prevent infinite loop")
        write_iter(0)  # reset the counter for the next run
        print(json.dumps({"decision": "approve"}))
        sys.exit(0)

    next_iter = CURR_ITER + 1

    pending_list = '\n'.join([f"  - {f.name}" for f in pending[:5]])
    if len(pending) > 5:
        pending_list += f"\n  ... and {len(pending)-5} more"

    continuation_prompt = f"""
RALPH WIGGUM LOOP — Iteration {next_iter}/{MAX_ITER}

STATUS: {total_work} items still need processing.

NEEDS_ACTION files ({len(pending)}):
{pending_list if pending_list else '  (none)'}

UNEXECUTED PLANS ({len(unexecuted)}): {len(unexecuted)} plans with status: pending

YOUR TASK:
1. Process each file in Needs_Action/ — create Plans/, create Pending_Approval/ requests
2. For any approved actions in Approved/ — execute them and move to Done/
3. Update Dashboard.md with current status
4. When ALL Needs_Action files are processed and moved/deleted, write EXACTLY: TASK_COMPLETE

DO NOT STOP until Needs_Action/ is empty or you write TASK_COMPLETE.
"""

    write_iter(next_iter)  # persist across processes; env vars do not survive

    result = {
        "decision": "block",
        "reason": f"{total_work} tasks remaining (iter {next_iter}/{MAX_ITER})",
        "continue_with": continuation_prompt
    }
    print(json.dumps(result))
    log(f"Blocking exit — re-injecting continuation prompt (iter {next_iter})")
    sys.exit(2)

if __name__ == '__main__':
    main()
