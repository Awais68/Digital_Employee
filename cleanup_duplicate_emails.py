#!/usr/bin/env python3
"""
Cleanup duplicate email task files in Needs_Action/.
Keeps only the oldest file per unique email_id, removes the rest.
Also fixes the cron job conflict (stops cron, ensures tmux).

Usage:
    python3 cleanup_duplicate_emails.py          # Dry run (preview only)
    python3 cleanup_duplicate_emails.py --force  # Actually delete duplicates
    python3 cleanup_duplicate_emails.py --fix-cron  # Remove cron + ensure tmux
"""

import os
import sys
import re
import subprocess
from pathlib import Path

VAULT_ROOT = Path(__file__).parent.resolve()
NEEDS_ACTION = VAULT_ROOT / "Needs_Action"
LOGS_DIR = VAULT_ROOT / "Logs"
TMUX_SESSION = "gmail_watcher"

DRY_RUN = "--force" not in sys.argv
FIX_CRON = "--fix-cron" in sys.argv


def parse_email_id(filepath: Path):
    """Extract email_id from a markdown file's YAML frontmatter."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.search(r'^email_id:\s*(\S+)', content, re.MULTILINE)
        if match:
            return match.group(1)
        # Fallback: try to find email_id anywhere in content
        match = re.search(r'email_id[=:]\s*(\S+)', content[:500])
        if match:
            return match.group(1)
    except Exception:
        pass
    return None


def cleanup_needs_action():
    """Remove duplicate email files from Needs_Action, keeping the oldest."""
    if not NEEDS_ACTION.exists():
        print(f"[!] Directory not found: {NEEDS_ACTION}")
        return

    files = sorted(NEEDS_ACTION.glob("*.md"))
    email_files = [f for f in files if f.name.startswith("20") and "email_" in f.name]

    if not email_files:
        print("[*] No email task files found.")
        return

    # Group by email_id
    groups = {}
    for f in email_files:
        eid = parse_email_id(f)
        if eid:
            groups.setdefault(eid, []).append(f)

    total_removed = 0
    total_kept = 0

    for eid, file_list in groups.items():
        file_list.sort(key=lambda p: p.name)  # Sort by name (timestamp-based)
        keep = file_list[0]  # Keep the oldest one
        duplicates = file_list[1:]

        if duplicates:
            total_kept += 1
            print(f"\n[email_id: {eid[:20]}...]")
            print(f"  KEEP   : {keep.name}")
            for dup in duplicates:
                if DRY_RUN:
                    print(f"  DELETE : {dup.name} (dry run)")
                else:
                    dup.unlink()
                    print(f"  DELETED: {dup.name}")
                total_removed += 1

    # Also handle files without email_id but same subject pattern
    no_id_files = [f for f in email_files if parse_email_id(f) is None]
    if no_id_files:
        subj_groups = {}
        for f in no_id_files:
            subj = "_".join(f.name.split("_")[2:])  # Extract subject part
            subj_groups.setdefault(subj, []).append(f)

        for subj, file_list in subj_groups.items():
            if len(file_list) <= 1:
                continue
            file_list.sort(key=lambda p: p.name)
            keep = file_list[0]
            for dup in file_list[1:]:
                if DRY_RUN:
                    print(f"\n  DELETE : {dup.name} (no email_id, dry run)")
                else:
                    dup.unlink()
                    print(f"\n  DELETED: {dup.name} (no email_id)")
                total_removed += 1

    print(f"\n{'='*50}")
    if DRY_RUN:
        print(f"[DRY RUN] Would remove {total_removed} duplicate file(s), keep {total_kept}")
        print("[DRY RUN] Run with --force to actually delete")
    else:
        print(f"[✓] Removed {total_removed} duplicate file(s), kept {total_kept}")


def fix_cron():
    """Remove gmail_watcher from cron (tmux handles it continuously)."""
    print("\n[*] Checking crontab...")

    try:
        result = subprocess.run(
            ["crontab", "-l"],
            capture_output=True, text=True, timeout=5
        )
    except Exception as e:
        print(f"[!] Could not read crontab: {e}")
        return

    if result.returncode != 0:
        print("[*] No crontab found.")
        return

    lines = result.stdout.splitlines()
    filtered = [
        line for line in lines
        if "gmail_watcher" not in line and "GMAIL_WATCHER" not in line
    ]

    if len(filtered) == len(lines):
        print("[*] No gmail_watcher cron job found.")

        # But check if there's a general orchestrator cron running gmail_watcher
        for line in lines:
            if "gmail" in line.lower() or "watcher" in line.lower():
                print(f"  Found related line: {line.strip()}")
                filtered = [l for l in lines if l != line]
                lines = filtered  # update for next check

        if len(filtered) == len(lines):
            return

    new_crontab = "\n".join(filtered) + "\n"
    try:
        proc = subprocess.run(
            ["crontab", "-"],
            input=new_crontab, text=True, capture_output=True, timeout=5
        )
        if proc.returncode == 0:
            print(f"[✓] Removed {len(lines) - len(filtered)} gmail_watcher line(s) from crontab")
        else:
            print(f"[!] Failed to update crontab: {proc.stderr}")
    except Exception as e:
        print(f"[!] Error updating crontab: {e}")

    # Now ensure tmux is running
    ensure_tmux_running()


def ensure_tmux_running():
    """Ensure the tmux gmail_watcher session is running, start if not."""
    print(f"\n[*] Checking tmux session '{TMUX_SESSION}'...")

    try:
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION],
            capture_output=True, timeout=3
        )
        if result.returncode == 0:
            print(f"[✓] Tmux session '{TMUX_SESSION}' is running")
            return
    except FileNotFoundError:
        print("[!] tmux not installed. Install with: sudo apt install tmux")
        return
    except Exception as e:
        print(f"[!] Error checking tmux: {e}")

    print(f"[*] Tmux session not found. Starting '{TMUX_SESSION}'...")
    script_path = VAULT_ROOT / "gmail_watcher.py"
    try:
        subprocess.run([
            "tmux", "new-session", "-d", "-s", TMUX_SESSION,
            "-c", str(VAULT_ROOT),
            "python3", str(script_path), "--continuous"
        ], check=True, timeout=5)
        print(f"[✓] Started tmux session '{TMUX_SESSION}'")
    except Exception as e:
        print(f"[!] Failed to start tmux session: {e}")


def main():
    print("=" * 50)
    if DRY_RUN and not FIX_CRON:
        print("  EMAIL DUPLICATE CLEANUP — DRY RUN")
    else:
        print("  EMAIL DUPLICATE CLEANUP")
    print("=" * 50)

    cleanup_needs_action()

    if FIX_CRON:
        print("\n" + "=" * 50)
        print("  CRON FIX")
        print("=" * 50)
        fix_cron()

    print("\n" + "=" * 50)
    print("  DONE")
    print("=" * 50)


if __name__ == "__main__":
    main()
