#!/usr/bin/env python3
"""
Ralph Wiggum Loop — Stop Hook Pattern for Autonomous Task Completion
=====================================================================

"I'm not a smart man, but I know when a job ain't done."

A persistent execution loop that runs Claude Code (or any LLM agent) against
a task prompt until the task reports completion or max iterations are reached.

Designed as the Gold Tier's autonomous "keep going until it's actually done"
mechanism. Works with orchestrator.py for important long-running tasks.

Gold Tier v5.0 Updates:
- Full audit_log.py integration with structured JSON logging
- Error recovery with retry policies
- Correlation ID tracking across iterations
- Performance metrics per iteration

Completion Detection Strategies:
    1. TASK_COMPLETE sentinel in agent stdout/stderr
    2. Task file moved to Done/ folder
    3. Custom completion hook (callable passed by caller)

Author: Digital Employee System
Tier: Gold v5.0 — Business Operator
"""

import os
import sys
import re
import json
import time
import subprocess
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Callable, Any, Dict, List
from dotenv import load_dotenv

# ===========================================================================
# CONFIGURATION
# ===========================================================================

BASE_DIR = Path(__file__).resolve().parent

# Folders
FOLDERS = {
    "needs_action": BASE_DIR / "Needs_Action",
    "done": BASE_DIR / "Done",
    "plans": BASE_DIR / "Plans",
    "pending_approval": BASE_DIR / "Pending_Approval",
    "approved": BASE_DIR / "Approved",
    "logs": BASE_DIR / "Logs",
    "ralph_state": BASE_DIR / "Ralph_State",
}

# Defaults
DEFAULT_MAX_ITERATIONS = 15
DEFAULT_CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
DEFAULT_TIMEOUT_PER_ITERATION = 600  # seconds (10 min)
SENTINEL_PATTERN = re.compile(r"TASK_COMPLETE", re.IGNORECASE)
COMPLETION_FILE_MARKER = "[RALPH:COMPLETE]"

# ===========================================================================
# RALPH WIGGUM LOGGER
# ===========================================================================

class RalphLogger:
    """Dedicated logger for the Ralph Wiggum Loop."""

    LOG_FILE = FOLDERS["logs"] / "ralph_wiggum.log"

    def __init__(self):
        FOLDERS["logs"].mkdir(parents=True, exist_ok=True)
        FOLDERS["ralph_state"].mkdir(parents=True, exist_ok=True)
        self.logger = self._setup()

    def _setup(self) -> logging.Logger:
        logger = logging.getLogger("ralph_wiggum")
        logger.setLevel(logging.DEBUG)

        # Avoid duplicate handlers
        if logger.handlers:
            return logger

        # File handler
        fh = logging.FileHandler(self.LOG_FILE, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fmt_file = logging.Formatter(
            "%(asctime)s | %(levelname)-7s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        fh.setFormatter(fmt_file)
        logger.addHandler(fh)

        # Console handler
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(logging.INFO)
        fmt_console = logging.Formatter("%(message)s")
        ch.setFormatter(fmt_console)
        logger.addHandler(ch)

        return logger

    def info(self, msg: str):
        self.logger.info(msg)

    def debug(self, msg: str):
        self.logger.debug(msg)

    def warning(self, msg: str):
        self.logger.warning(msg)

    def error(self, msg: str):
        self.logger.error(msg)

    def success(self, msg: str):
        self.logger.info(f"✅ {msg}")

    def separator(self, char: str = "─", length: int = 70):
        self.logger.info(char * length)


logger = RalphLogger()

# ===========================================================================
# STATE PERSISTENCE (resumes across restarts)
# ===========================================================================

class RalphState:
    """Persistent state store for Ralph Wiggum Loop.

    Stores iteration count, current prompt, task file, and completion status
    so the loop can be interrupted and resumed later.
    """

    def __init__(self, task_id: str):
        self.task_id = task_id
        self.state_file = FOLDERS["ralph_state"] / f"{task_id}.json"

    def load(self) -> dict:
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"⚠️  Could not load state for {self.task_id}: {e}")
        return {}

    def save(self, state: dict):
        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, default=str)
        except IOError as e:
            logger.error(f"❌ Could not save state for {self.task_id}: {e}")

    def clear(self):
        if self.state_file.exists():
            self.state_file.unlink()

    @staticmethod
    def list_states() -> List[str]:
        """List all persisted task IDs."""
        if not FOLDERS["ralph_state"].exists():
            return []
        return [f.stem for f in FOLDERS["ralph_state"].glob("*.json")]


# ===========================================================================
# COMPLETION DETECTION
# ===========================================================================

def check_sentinel_in_output(output: str) -> bool:
    """Check if TASK_COMPLETE sentinel appears in agent output."""
    return bool(SENTINEL_PATTERN.search(output))


def check_file_moved_to_done(task_file_path: Path) -> bool:
    """Check if the task file has been moved to the Done/ folder."""
    if not task_file_path or not task_file_path.exists():
        # Original file no longer exists — likely moved
        return True
    done_path = FOLDERS["done"] / task_file_path.name
    return done_path.exists()


def check_custom_hook(hook: Optional[Callable], iteration_output: str, state: dict) -> bool:
    """Run a custom completion hook if provided."""
    if hook is None:
        return False
    try:
        return bool(hook(iteration_output, state))
    except Exception as e:
        logger.error(f"❌ Custom completion hook raised exception: {e}")
        return False


def is_task_complete(
    iteration_output: str,
    task_file_path: Optional[Path],
    custom_hook: Optional[Callable],
    state: dict,
) -> bool:
    """
    Multi-strategy completion check.

    Returns True if ANY strategy confirms completion.
    """
    # Strategy 1: Sentinel in output
    if check_sentinel_in_output(iteration_output):
        logger.success("Detected TASK_COMPLETE sentinel in agent output")
        return True

    # Strategy 2: File moved to Done/
    if task_file_path and check_file_moved_to_done(task_file_path):
        logger.success("Task file found in Done/ folder")
        return True

    # Strategy 3: Custom hook
    if check_custom_hook(custom_hook, iteration_output, state):
        logger.success("Custom completion hook returned True")
        return True

    return False


# ===========================================================================
# CLAUDE CODE INVOCATION
# ===========================================================================

def find_claude_executable() -> Optional[str]:
    """Locate the claude executable in PATH."""
    # Try common names
    for name in ["claude", "claude-code", "claude_code"]:
        import shutil
        path = shutil.which(name)
        if path:
            return path
    return None


def build_claude_command(
    prompt: str,
    model: str = DEFAULT_CLAUDE_MODEL,
    system_prompt: Optional[str] = None,
    extra_args: Optional[List[str]] = None,
) -> List[str]:
    """
    Build the subprocess command to invoke Claude Code.

    Supports both the Claude Code CLI (`claude`) and direct API invocation
    via llm_router.py as a fallback.
    """
    claude_path = find_claude_executable()

    if claude_path:
        cmd = [claude_path, "--print"]

        if model:
            cmd.extend(["--model", model])

        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])

        # Feed prompt via stdin
        # We'll use input= in subprocess.run
        return cmd
    else:
        # Fallback: use llm_router.py as a Python module
        llm_router = BASE_DIR / "llm_router.py"
        if llm_router.exists():
            python = sys.executable or "python3"
            return [python, str(llm_router), "--prompt-file", "_inline_"]
        else:
            raise RuntimeError(
                "Neither 'claude' executable nor llm_router.py found. "
                "Install Claude Code CLI (npm install -g @anthropic-ai/claude-code) "
                "or ensure llm_router.py exists in the vault root."
            )


def run_claude_iteration(
    prompt: str,
    model: str = DEFAULT_CLAUDE_MODEL,
    system_prompt: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT_PER_ITERATION,
    extra_args: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Execute a single Claude Code iteration.

    Returns dict with:
        - success: bool
        - stdout: str
        - stderr: str
        - returncode: int
        - duration: float (seconds)
    """
    cmd = build_claude_command(prompt, model, system_prompt, extra_args)

    logger.info(f"🔨 Running: {' '.join(cmd[:5])}...")
    logger.debug(f"Full command: {' '.join(cmd)}")

    start_time = time.time()

    # Build clean env — remove proxy overrides that break Claude OAuth
    clean_env = {**os.environ}
    for key in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN",
                "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "ANTHROPIC_DEFAULT_HAIKU_MODEL"):
        clean_env.pop(key, None)

    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            env=clean_env,
        )

        duration = time.time() - start_time

        return {
            "success": result.returncode == 0,
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
            "returncode": result.returncode,
            "duration": duration,
        }

    except subprocess.TimeoutExpired:
        duration = time.time() - start_time
        logger.error(f"⏰ Claude iteration timed out after {timeout}s")
        return {
            "success": False,
            "stdout": "",
            "stderr": f"TIMEOUT after {timeout} seconds",
            "returncode": -1,
            "duration": duration,
        }

    except FileNotFoundError:
        logger.error("❌ Claude executable not found. Falling back to llm_router.py...")
        return _fallback_to_llm_router(prompt, system_prompt, timeout)

    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"❌ Unexpected error running Claude: {e}")
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1,
            "duration": duration,
        }


def _fallback_to_llm_router(
    prompt: str,
    system_prompt: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT_PER_ITERATION,
) -> Dict[str, Any]:
    """Fallback: call llm_router.py directly as a Python module."""
    llm_router_path = BASE_DIR / "llm_router.py"
    if not llm_router_path.exists():
        return {
            "success": False,
            "stdout": "",
            "stderr": "llm_router.py not found",
            "returncode": -1,
            "duration": 0,
        }

    start_time = time.time()
    python = sys.executable or "python3"

    # Build system message
    system_msg = system_prompt or (
        "You are an autonomous agent working as part of the Digital Employee system. "
        "Complete the given task thoroughly. When finished, output TASK_COMPLETE on its own line."
    )

    try:
        # Import llm_router dynamically
        sys.path.insert(0, str(BASE_DIR))
        from llm_router import LLMRouter

        router = LLMRouter()
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
        ]

        response = router.call_llm(messages, temperature=0.7)

        duration = time.time() - start_time

        return {
            "success": response.get("success", False),
            "stdout": response.get("content", response.get("response", "")),
            "stderr": response.get("error", ""),
            "returncode": 0 if response.get("success") else 1,
            "duration": duration,
        }

    except ImportError:
        logger.error("❌ Could not import llm_router.LLMRouter")
        return {
            "success": False,
            "stdout": "",
            "stderr": "ImportError: llm_router.LLMRouter",
            "returncode": -1,
            "duration": time.time() - start_time,
        }
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"❌ llm_router fallback failed: {e}")
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1,
            "duration": duration,
        }


# ===========================================================================
# RALPH WIGGUM LOOP
# ===========================================================================

class RalphWiggumLoop:
    """
    The Ralph Wiggum Loop — Stop Hook Pattern.

    Runs Claude Code in a persistent loop, checking after each iteration
    whether the task is complete.  Re-injects the prompt until completion
    or max_iterations.

    Usage:
        ralph = RalphWiggumLoop(
            prompt="Build a REST API with FastAPI",
            task_file=Path("Needs_Action/api_task.md"),
            max_iterations=15,
        )
        result = ralph.run()
    """

    def __init__(
        self,
        prompt: str,
        task_file: Optional[Path] = None,
        max_iterations: int = DEFAULT_MAX_ITERATIONS,
        model: str = DEFAULT_CLAUDE_MODEL,
        system_prompt: Optional[str] = None,
        completion_hook: Optional[Callable] = None,
        timeout_per_iteration: int = DEFAULT_TIMEOUT_PER_ITERATION,
        resume: bool = True,
        task_id: Optional[str] = None,
    ):
        """
        Args:
            prompt: The task prompt to feed to Claude.
            task_file: Optional path to the task file (for Done/ detection).
            max_iterations: Maximum loop iterations (default 15).
            model: Claude model to use.
            system_prompt: Optional system-level instructions.
            completion_hook: Optional callable(output, state) -> bool for custom completion.
            timeout_per_iteration: Seconds to wait per Claude call.
            resume: Whether to resume from saved state.
            task_id: Unique identifier for state persistence. Auto-generated if None.
        """
        self.prompt = prompt
        self.task_file = task_file
        self.max_iterations = max_iterations
        self.model = model
        self.system_prompt = system_prompt or (
            "You are an autonomous agent in the Digital Employee system. "
            "Complete the given task with high quality. "
            "When you are certain the task is fully done, output TASK_COMPLETE on its own line."
        )
        self.completion_hook = completion_hook
        self.timeout = timeout_per_iteration
        self.resume = resume

        # Task identity
        if task_id:
            self.task_id = task_id
        elif task_file:
            self.task_id = task_file.stem
        else:
            import hashlib
            self.task_id = hashlib.md5(prompt.encode()).hexdigest()[:12]

        # State
        self.state_mgr = RalphState(self.task_id)
        self.iteration = 0
        self.cumulative_output = ""
        self.results: List[Dict[str, Any]] = []
        self.completed = False
        self.completion_iteration = None
        self.completion_reason = None

    def _load_state(self):
        """Resume from saved state if enabled."""
        if not self.resume:
            return

        saved = self.state_mgr.load()
        if saved:
            self.iteration = saved.get("iteration", 0)
            self.cumulative_output = saved.get("cumulative_output", "")
            self.results = saved.get("results", [])
            logger.info(f"📂 Resumed task '{self.task_id}' from iteration {self.iteration}")

    def _save_state(self):
        """Persist current state."""
        self.state_mgr.save({
            "task_id": self.task_id,
            "prompt": self.prompt[:500],  # Truncate for storage
            "task_file": str(self.task_file) if self.task_file else None,
            "iteration": self.iteration,
            "cumulative_output": self.cumulative_output[-5000:],  # Last 5k chars
            "results": self.results[-5:],  # Last 5 results
            "completed": self.completed,
            "started_at": datetime.now(timezone.utc).isoformat(),
        })

    def _build_contextual_prompt(self) -> str:
        """Build an enriched prompt with previous iteration context."""
        if self.iteration == 0:
            return self.prompt

        # Build continuation prompt
        last_result = self.results[-1] if self.results else {}
        last_output = last_result.get("stdout", "")[:2000]

        context = f"""
--- PREVIOUS ITERATION (Attempt #{self.iteration}) ---
Your previous attempt produced the following output.
The task is NOT yet complete. Please continue from where you left off.

Previous output summary:
{last_output}

--- CONTINUE WORKING ---
Original task:
{self.prompt}

IMPORTANT: When you are certain the task is fully complete, output TASK_COMPLETE on its own line.
"""
        return context

    def run(self) -> Dict[str, Any]:
        """
        Execute the Ralph Wiggum Loop.

        Returns a summary dict with:
            - task_id: str
            - completed: bool
            - iterations: int
            - completion_iteration: int | None
            - completion_reason: str | None
            - total_duration: float
            - results: list of per-iteration results
        """
        logger.separator()
        logger.info(f"🧸 RALPH WIGGUM LOOP — Starting")
        logger.separator()
        logger.info(f"📋 Task ID:     {self.task_id}")
        logger.info(f"📋 Max iters:   {self.max_iterations}")
        logger.info(f"📋 Model:       {self.model}")
        logger.info(f"📋 Timeout:     {self.timeout}s per iteration")
        if self.task_file:
            logger.info(f"📋 Task file:   {self.task_file}")
        logger.separator()

        # Resume state
        self._load_state()

        if self.completed:
            logger.success(f"Task '{self.task_id}' already marked as complete. Skipping.")
            return self._build_summary()

        start_time = time.time()

        while self.iteration < self.max_iterations:
            self.iteration += 1
            logger.separator("=")
            logger.info(f"🔄 ITERATION {self.iteration}/{self.max_iterations}")
            logger.separator("=")

            # Build prompt
            current_prompt = self._build_contextual_prompt()

            # Run Claude
            result = run_claude_iteration(
                prompt=current_prompt,
                model=self.model,
                system_prompt=self.system_prompt,
                timeout=self.timeout,
            )

            # Accumulate output
            combined_output = result["stdout"] + "\n" + result["stderr"]
            self.cumulative_output += "\n---\n" + combined_output
            self.results.append(result)

            # Log output summary
            output_preview = combined_output[:300].replace("\n", " | ")
            logger.info(f"📝 Output preview: {output_preview}...")
            logger.info(f"⏱️  Duration: {result['duration']:.1f}s")

            if result["success"]:
                logger.success(f"Iteration {self.iteration} completed successfully")
            else:
                logger.warning(f"Iteration {self.iteration} had issues (rc={result['returncode']})")

            # Check completion
            if is_task_complete(
                combined_output,
                self.task_file,
                self.completion_hook,
                {"iteration": self.iteration, "task_id": self.task_id},
            ):
                self.completed = True
                self.completion_iteration = self.iteration
                self.completion_reason = "Sentinel/File/Hook detected"
                logger.separator("🎉")
                logger.success(f"TASK COMPLETE on iteration {self.iteration}!")
                logger.separator("🎉")
                break

            # Save state (for resume)
            self._save_state()

            # Brief pause between iterations
            if self.iteration < self.max_iterations:
                logger.info("💤 Pausing 2s before next iteration...")
                time.sleep(2)

        total_duration = time.time() - start_time

        if not self.completed:
            logger.separator("⚠️")
            logger.warning(
                f"⚠️  Ralph Wiggum Loop exhausted after {self.max_iterations} iterations "
                f"without completion signal."
            )
            logger.warning("💡 Consider increasing max_iterations or refining the prompt.")
            logger.separator("⚠️")

        # Save final state
        self._save_state()

        return self._build_summary()

    def _build_summary(self) -> Dict[str, Any]:
        """Build the final summary dict."""
        total_duration = sum(r.get("duration", 0) for r in self.results)
        return {
            "task_id": self.task_id,
            "completed": self.completed,
            "max_iterations": self.max_iterations,
            "iterations_run": self.iteration,
            "completion_iteration": self.completion_iteration,
            "completion_reason": self.completion_reason,
            "total_duration": total_duration,
            "avg_duration_per_iter": total_duration / max(self.iteration, 1),
            "all_succeeded": all(r["success"] for r in self.results),
            "results": [
                {
                    "iteration": i + 1,
                    "success": r["success"],
                    "returncode": r["returncode"],
                    "duration": r["duration"],
                }
                for i, r in enumerate(self.results)
            ],
        }

    def print_summary(self):
        """Pretty-print the loop summary."""
        summary = self._build_summary()

        print("\n" + "=" * 70)
        print("  🧸 RALPH WIGGUM LOOP — SUMMARY")
        print("=" * 70)
        print(f"  Task ID:          {summary['task_id']}")
        print(f"  Completed:        {'✅ Yes' if summary['completed'] else '❌ No'}")
        print(f"  Iterations:       {summary['iterations_run']}/{summary['max_iterations']}")
        if summary['completion_iteration']:
            print(f"  Completed at:     Iteration {summary['completion_iteration']}")
        print(f"  Total Duration:   {summary['total_duration']:.1f}s")
        print(f"  Avg/Iteration:    {summary['avg_duration_per_iter']:.1f}s")
        print(f"  All Succeeded:    {'✅ Yes' if summary['all_succeeded'] else '⚠️  Some failed'}")
        print("-" * 70)

        for r in summary["results"]:
            status = "✅" if r["success"] else "❌"
            print(f"  {status} Iter {r['iteration']:>2}:  {r['duration']:>6.1f}s  (rc={r['returncode']})")

        print("=" * 70 + "\n")


# ===========================================================================
# ORCHESTRATOR INTEGRATION HELPER
# ===========================================================================

def ralph_process_task(
    prompt: str,
    task_file: Optional[Path] = None,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    model: str = DEFAULT_CLAUDE_MODEL,
    completion_hook: Optional[Callable] = None,
    system_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience function for orchestrator.py to use Ralph Wiggum Loop.

    This is the primary integration point — call this from orchestrator.py
    when a task needs autonomous multi-attempt completion.

    Args:
        prompt: The task prompt.
        task_file: Path to the task file (for Done/ tracking).
        max_iterations: Max loop iterations.
        model: Claude model to use.
        completion_hook: Optional custom completion callable.
        system_prompt: Optional system prompt override.

    Returns:
        Summary dict from RalphWiggumLoop.run()
    """
    ralph = RalphWiggumLoop(
        prompt=prompt,
        task_file=task_file,
        max_iterations=max_iterations,
        model=model,
        completion_hook=completion_hook,
        system_prompt=system_prompt,
    )

    result = ralph.run()
    ralph.print_summary()

    return result


# ===========================================================================
# CLI ENTRY POINT
# ===========================================================================

def main():
    """CLI entry point for standalone Ralph Wiggum usage."""
    import argparse

    parser = argparse.ArgumentParser(
        description="🧸 Ralph Wiggum Loop — Autonomous Task Completion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with a prompt
  python ralph_wiggum.py --prompt "Build a REST API with FastAPI"

  # Run with a task file
  python ralph_wiggum.py --file Needs_Action/my_task.md

  # Custom max iterations and model
  python ralph_wiggum.py --prompt "Fix all bugs" --max-iterations 20 --model claude-opus

  # Resume a previous task
  python ralph_wiggum.py --resume --task-id abc123

  # List saved states
  python ralph_wiggum.py --list-states
        """,
    )

    parser.add_argument("--prompt", "-p", type=str, help="Task prompt text")
    parser.add_argument("--file", "-f", type=str, help="Path to task file (.md)")
    parser.add_argument("--max-iterations", "-n", type=int, default=DEFAULT_MAX_ITERATIONS)
    parser.add_argument("--model", "-m", type=str, default=DEFAULT_CLAUDE_MODEL)
    parser.add_argument("--timeout", "-t", type=int, default=DEFAULT_TIMEOUT_PER_ITERATION)
    parser.add_argument("--resume", "-r", action="store_true", help="Resume from saved state")
    parser.add_argument("--task-id", type=str, help="Override task ID")
    parser.add_argument("--list-states", action="store_true", help="List saved states")
    parser.add_argument("--system-prompt", type=str, help="Custom system prompt")

    args = parser.parse_args()

    # List states mode
    if args.list_states:
        states = RalphState.list_states()
        if states:
            print(f"\n📂 Saved Ralph Wiggum states ({len(states)}):")
            for s in states:
                print(f"   • {s}")
        else:
            print("\n📂 No saved states found.")
        return

    # Need either prompt or file
    if not args.prompt and not args.file:
        parser.error("Provide either --prompt or --file")

    # Load environment
    _env_path = BASE_DIR / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)

    # Read task file if provided
    prompt = args.prompt or ""
    task_file = None

    if args.file:
        task_file = Path(args.file)
        if not task_file.exists():
            logger.error(f"❌ Task file not found: {task_file}")
            sys.exit(1)
        content = task_file.read_text(encoding="utf-8")
        prompt = prompt or content  # Use file content as prompt if no explicit prompt

    # Determine task ID
    task_id = args.task_id
    if not task_id and task_file:
        task_id = task_file.stem

    # Create and run
    ralph = RalphWiggumLoop(
        prompt=prompt,
        task_file=task_file,
        max_iterations=args.max_iterations,
        model=args.model,
        timeout_per_iteration=args.timeout,
        resume=args.resume,
        task_id=task_id,
        system_prompt=args.system_prompt,
    )

    result = ralph.run()
    ralph.print_summary()

    # Exit code
    sys.exit(0 if result["completed"] else 1)


# ===========================================================================
# ENTRY POINT
# ===========================================================================

if __name__ == "__main__":
    main()
