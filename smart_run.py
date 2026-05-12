#!/usr/bin/env python3
"""
smart_run.py — Intelligent launcher for AI Employee system.

Automatically detects available tools and runs the right system:
  - Claude Code available → use existing hooks + MCP (best experience)
  - Anthropic API key → use Claude API directly
  - OpenAI key → use GPT-4o
  - Gemini key → use Gemini 2.0-flash
"""

import os, sys, subprocess
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).parent))

from utils.ai_provider import detect_provider, get_provider_info

def print_banner(info: dict):
    provider = info['active_provider']
    icons = {
        'claude_code': 'Claude Code (hooks + MCP)',
        'anthropic':   'Anthropic API (claude-sonnet)',
        'openai':      'OpenAI API (gpt-4o)',
        'gemini':      'Gemini API (gemini-2.0-flash)',
        'none':        'No AI provider configured'
    }
    print("\n" + "="*55)
    print(f"  AI Employee — Smart Launcher")
    print(f"  Provider:    {icons.get(provider, provider)}")
    print(f"  MCP:         {'Yes' if info['mcp_configured'] else 'No'}")
    print(f"  Hooks:       {'Yes' if info['hooks_configured'] else 'No'}")
    print(f"  DRY_RUN:     {os.getenv('DRY_RUN', 'true')}")
    print("="*55 + "\n")

def run_with_claude_code(task: str):
    """Existing Claude Code hooks + MCP path"""
    print("[Claude Code] Using existing hooks + MCP servers")
    print("[Claude Code] Running: claude with vault context")
    result = subprocess.run(
        ['claude', '-p', task,
         '--allowedTools', 'Read,Write,List,Bash',
         '--max-turns', '20'],
        cwd=str(Path(__file__).parent)
    )
    return result.returncode

def run_with_api(task: str):
    """Universal orchestrator path for non-Claude-Code providers"""
    from universal_orchestrator import ralph_wiggum_loop
    print(f"[Universal] Running Ralph Wiggum loop via Python")
    ralph_wiggum_loop()

def main():
    import argparse
    parser = argparse.ArgumentParser(description='AI Employee Smart Launcher')
    parser.add_argument('--task', default='process_all',
                        help='Task to run (default: process all Needs_Action files)')
    parser.add_argument('--provider', default=None,
                        help='Force provider: claude_code|anthropic|openai|gemini')
    parser.add_argument('--test', action='store_true',
                        help='Run self-test of all tools in DRY_RUN mode')
    args = parser.parse_args()

    if args.provider:
        os.environ['AI_PROVIDER'] = args.provider

    info     = get_provider_info()
    provider = info['active_provider']
    print_banner(info)

    if args.test:
        print("[Test] Running universal_tool_executor self-test...")
        from universal_tool_executor import tools
        tools.email.send_email("test@test.com", "Test", "Hello")
        tools.social.post_twitter("Test tweet")
        print("[Test] Done. Check Logs/ for results.")
        return

    if provider == 'none':
        print("[ERROR] No AI provider configured!")
        print("Add one of these to .env:")
        print("  ANTHROPIC_API_KEY=sk-ant-...")
        print("  OPENAI_API_KEY=sk-...")
        print("  GEMINI_API_KEY=AIza...")
        sys.exit(1)

    task = (
        "Process all files in Needs_Action/. "
        "For each file: create a Plan in Plans/, "
        "create approval requests in Pending_Approval/ for sensitive actions, "
        "move processed files to Done/. "
        "Update Dashboard.md. "
        "Write TASK_COMPLETE when done."
        if args.task == 'process_all' else args.task
    )

    if provider == 'claude_code':
        run_with_claude_code(task)
    else:
        run_with_api(task)

if __name__ == '__main__':
    main()
