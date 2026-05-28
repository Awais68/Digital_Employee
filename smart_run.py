"""
smart_run.py — Universal launcher for AI Employee system.

Auto-detects provider and routes to correct execution path:

PATH A (Claude Code):
  claude CLI available + ANTHROPIC_API_KEY set
  → runs via: claude -p "..." --allowedTools ...
  → Ralph Wiggum: .claude/hooks/stop.py handles looping (existing)
  → Tools: .mcp.json MCP servers (existing)

PATH B (API-only: Anthropic/OpenAI/Gemini):
  No claude CLI OR different provider key
  → runs via: universal_orchestrator.py
  → Ralph Wiggum: Python while-loop (new)
  → Tools: universal_tool_executor.py (new)
"""
import os, sys, shutil, subprocess, logging
from pathlib import Path
from provider_config import detect_provider, get_model_name

VAULT   = Path(os.getenv('VAULT_PATH', '.'))
DRY_RUN = os.getenv('DRY_RUN', 'true').lower() == 'true'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [SMART_RUN] %(message)s',
    handlers=[
        logging.FileHandler(VAULT / 'Logs' / 'smart_run.log'),
        logging.StreamHandler()
    ]
)

def print_banner(provider, path):
    print("\n" + "="*58)
    print("  AI Employee — Smart Launcher")
    print("="*58)
    print(f"  Provider : {provider}")
    print(f"  Model    : {get_model_name(provider)}")
    print(f"  Path     : {path}")
    print(f"  Vault    : {VAULT}")
    print(f"  DRY_RUN  : {DRY_RUN}")
    print("="*58 + "\n")

def run_path_a_claude_code(task=None):
    """
    PATH A: Claude Code CLI
    Uses existing hooks + MCP — nothing changes here.
    """
    default_task = """Process all files in Needs_Action/ directory.
For each file: create a Plan in Plans/, create approval requests 
in Pending_Approval/ for sensitive actions.
Update Dashboard.md when done.
When Needs_Action/ is empty, write: TASK_COMPLETE"""

    prompt = task or default_task

    hb = VAULT / 'Company_Handbook.md'
    if hb.exists():
        prompt = f"Rules from Company_Handbook.md apply.\n\n{prompt}"

    cmd = [
        'claude', '-p', prompt,
        '--allowedTools', 'Read,Write,Edit,Bash,computer',
        '--max-turns', str(os.getenv('MAX_ITERATIONS', '15'))
    ]

    logging.info("Running via Claude Code CLI (Path A)")
    logging.info("Ralph Wiggum hooks active (.claude/hooks/stop.py)")
    logging.info("MCP servers active (.mcp.json)")

    result = subprocess.run(cmd, cwd=str(VAULT))
    return result.returncode

def run_path_b_universal(task=None):
    """
    PATH B: Universal orchestrator (OpenAI/Gemini/Anthropic API)
    Uses universal_orchestrator.py + universal_tool_executor.py
    """
    from universal_orchestrator import ralph_wiggum_loop
    logging.info("Running via Universal Orchestrator (Path B)")
    logging.info("Ralph Wiggum Python loop active")
    logging.info("Universal tool executor active")
    ralph_wiggum_loop()

def main():
    provider, key = detect_provider()

    if not provider:
        print("\n[ERROR] No AI provider detected!")
        print("Set one of these in your .env file:")
        print("  ANTHROPIC_API_KEY=sk-ant-...")
        print("  OPENAI_API_KEY=sk-...")
        print("  GEMINI_API_KEY=AIza...")
        sys.exit(1)

    claude_cli = shutil.which('claude')
    use_claude_code = (
        claude_cli is not None and
        provider in ('claude_code', 'anthropic')
    )

    task = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else None

    if use_claude_code:
        print_banner(provider, "PATH A — Claude Code (hooks + MCP)")
        logging.info("Claude Code CLI found — using Path A")
        sys.exit(run_path_a_claude_code(task))
    else:
        path_label = f"PATH B — Universal Orchestrator ({provider})"
        print_banner(provider, path_label)
        if claude_cli and provider not in ('claude_code', 'anthropic'):
            logging.info(f"Claude CLI found but using {provider} key — Path B")
        else:
            logging.info("Claude CLI not found — using Path B")
        run_path_b_universal(task)

if __name__ == '__main__':
    main()
