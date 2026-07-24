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
# durable counter instead. It is scoped per conversation/session so a brand-new
# turn starts from 0 rather than inheriting a stale count left over from a prior
# turn (e.g. a value stuck at 9 after a runaway would otherwise near-instantly
# re-trip MAX_ITER on the next unrelated turn).
ITER_FILE = VAULT / 'Logs' / '.ralph_iteration'

def read_iter(session_id):
    """Return the persisted iteration for THIS session only.

    State file schema: {"session_id": ..., "iteration": N}. When the stored
    session differs from the current one (a genuinely new turn/conversation),
    the counter resets to 0 instead of carrying a stale value forward.
    """
    try:
        data = json.loads(ITER_FILE.read_text())
        if data.get("session_id") == session_id:
            return int(data.get("iteration", 0))
        return 0
    except Exception:
        return 0

def write_iter(session_id, n):
    try:
        ITER_FILE.parent.mkdir(parents=True, exist_ok=True)
        ITER_FILE.write_text(json.dumps({"session_id": session_id, "iteration": n}))
    except Exception:
        pass

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

# Statuses that mean "this plan is deliberately parked waiting on a human", not
# "unprocessed work". Kept lowercase; frontmatter_status() already lowercases.
GATE_STATUSES = {'awaiting_approval', 'needs_approval', 'blocked', 'on_hold'}
# Frontmatter keys whose truthy value marks a plan as human-gated.
GATE_KEYS = ('requires_approval', 'human_gate', 'gated')
_TRUTHY = {'true', 'yes', '1', 'on'}

def is_approval_gated(text):
    """True if a plan's OWN leading frontmatter marks it as gated on human
    approval — either an approval-wait status or a truthy gate key. Such a plan
    is blocked on user input, not stalled, so it must NOT count as remaining
    work that forces the loop to keep re-firing."""
    if not text.startswith('---'):
        return False
    end = text.find('\n---', 3)
    fm = text[:end] if end != -1 else text
    for line in fm.split('\n'):
        line = line.strip()
        if not line or ':' not in line:
            continue
        key, val = line.split(':', 1)
        key = key.strip().lower(); val = val.strip().lower()
        if key == 'status' and val in GATE_STATUSES:
            return True
        if key in GATE_KEYS and val in _TRUTHY:
            return True
    return False

def get_pending():
    """FLAT vault: check Needs_Action/ at root level"""
    needs_action = VAULT / 'Needs_Action'
    pending = list(needs_action.glob('*.md')) if needs_action.exists() else []
    plans = VAULT / 'Plans'
    unexecuted_plans = []
    if plans.exists():
        for f in plans.glob('*.md'):
            try:
                text = f.read_text(encoding='utf-8', errors='replace')
            except Exception:
                continue
            status = frontmatter_status(text)
            if status in ('pending', 'in_progress', 'in progress'):
                # Skip plans deliberately parked on a human-approval gate — they
                # are waiting on the user, not stalled, so counting them would
                # keep the loop re-firing forever against work it cannot finish.
                if is_approval_gated(text):
                    continue
                unexecuted_plans.append(f)
    return pending, unexecuted_plans

def main():
    try:
        hook_input = sys.stdin.read()
        input_data = json.loads(hook_input) if hook_input.strip() else {}
    except:
        input_data = {}

    session_id = input_data.get("session_id", "")
    curr_iter = read_iter(session_id)

    # A Stop hook is already active for this turn (e.g. Claude is legitimately
    # paused waiting on typed human approval, not idling). Re-blocking here just
    # fights the CLI and spins the iteration counter, which is exactly the
    # runaway this hook must avoid. Approve immediately and reset the counter.
    if input_data.get("stop_hook_active"):
        log("stop_hook_active=true — approving exit without re-blocking")
        write_iter(session_id, 0)
        print(json.dumps({"decision": "approve"}))
        sys.exit(0)

    pending, unexecuted = get_pending()
    total_work = len(pending) + len(unexecuted)

    log(f"Iter {curr_iter}/{MAX_ITER} | Needs_Action: {len(pending)} | Unexecuted plans: {len(unexecuted)}")

    if total_work == 0:
        log("All tasks complete — allowing Claude to exit")
        write_iter(session_id, 0)  # reset so the next real run starts fresh
        print(json.dumps({"decision": "approve"}))
        sys.exit(0)

    if curr_iter >= MAX_ITER:
        log(f"Max iterations ({MAX_ITER}) reached — forcing exit to prevent infinite loop")
        write_iter(session_id, 0)  # reset the counter for the next run
        print(json.dumps({"decision": "approve"}))
        sys.exit(0)

    next_iter = curr_iter + 1

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

    write_iter(session_id, next_iter)  # persist across processes; env vars do not survive

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
