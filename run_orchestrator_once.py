#!/usr/bin/env python3
"""
Run Orchestrator Once - Cron Wrapper

Lightweight script to run the orchestrator a single time.
Designed for cron scheduling with:
- Timestamp logging
- Graceful error handling
- Minimal overhead
- Clear success/failure output

Usage:
    python3 run_orchestrator_once.py

Cron Example (every 5 minutes):
    */5 * * * * cd /path/to/Digital_Employee && python3 run_orchestrator_once.py >> Logs/cron_orchestrator.log 2>&1
"""

import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent
LOGS_DIR = BASE_DIR / "Logs"

def main():
    """Run the orchestrator once with timestamp and error handling."""
    # Print timestamp when script starts
    start_time = datetime.now(timezone.utc)
    timestamp = start_time.strftime("%Y-%m-%d %H:%M:%S %Z")
    
    print("\n" + "=" * 70)
    print(f"  🤖 ORCHESTRATOR CRON RUN - {timestamp}")
    print("=" * 70 + "\n")
    
    try:
        # Import orchestrator's main function
        from orchestrator import main as orchestrator_main
        
        # Run orchestrator in 'once' mode
        orchestrator_main(run_mode="once")
        
        # Print completion timestamp
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        completion_timestamp = end_time.strftime("%Y-%m-%d %H:%M:%S %Z")
        
        print("\n" + "=" * 70)
        print(f"  ✅ ORCHESTRATOR COMPLETED - {completion_timestamp}")
        print(f"  ⏱️  Duration: {duration:.2f} seconds")
        print("=" * 70 + "\n")
        
        return 0  # Success exit code
        
    except ImportError as e:
        print(f"\n❌ ERROR: Failed to import orchestrator")
        print(f"   Details: {e}")
        print(f"   Make sure orchestrator.py exists in: {BASE_DIR}")
        print(f"\n   Stack trace:")
        traceback.print_exc()
        return 1  # Error exit code
        
    except KeyboardInterrupt:
        print("\n\n⚠️  ORCHESTRATOR INTERRUPTED by user (Ctrl+C)")
        print(f"   Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print("=" * 70 + "\n")
        return 130  # Standard exit code for Ctrl+C
        
    except SystemExit as e:
        print(f"\n⚠️  ORCHESTRATOR EXITED with code: {e.code}")
        print(f"   Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print("=" * 70 + "\n")
        return e.code if isinstance(e.code, int) else 1
        
    except Exception as e:
        # Catch-all for any other errors
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        error_timestamp = end_time.strftime("%Y-%m-%d %H:%M:%S %Z")
        
        print(f"\n❌ ORCHESTRATOR FAILED - {error_timestamp}")
        print(f"   Error: {e}")
        print(f"   Duration before failure: {duration:.2f} seconds")
        print("\n   Full stack trace:")
        print("─" * 70)
        traceback.print_exc()
        print("─" * 70)
        print("=" * 70 + "\n")
        
        # Log error to cron log file
        try:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            cron_log = LOGS_DIR / "cron_orchestrator_errors.log"
            with open(cron_log, "a", encoding="utf-8") as f:
                f.write(f"\n## ❌ Error - {error_timestamp}\n\n")
                f.write(f"**Error:** {e}\n\n")
                f.write(f"**Stack Trace:**\n```\n")
                f.write(traceback.format_exc())
                f.write("```\n\n---\n")
        except Exception:
            pass  # Don't fail if we can't write the log
        
        return 1  # Error exit code


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
