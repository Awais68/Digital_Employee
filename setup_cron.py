#!/usr/bin/env python3
"""
setup_cron.py - Automated Cron Setup for Digital Employee

This script sets up cron jobs for automated execution of the Digital Employee
orchestrator and watchers.

Features:
- Automatic cron job installation
- Backup existing crontab
- Verify cron installation
- Cross-platform support (Linux, macOS)
- Uninstall option

Usage:
    python setup_cron.py              # Install cron jobs
    python setup_cron.py --uninstall  # Remove cron jobs
    python setup_cron.py --status     # Check cron status
    python setup_cron.py --backup     # Backup existing crontab

Author: Digital Employee System
Version: 1.0
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path
from datetime import datetime


# =============================================================================
# Configuration
# =============================================================================

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = BASE_DIR / "Scripts"
LOGS_DIR = BASE_DIR / "Logs"

# Ensure directories exist
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Cron job configuration
ORCHESTRATOR_CRON = "*/5 * * * *"  # Every 5 minutes
GMAIL_WATCHER_INTERVAL = 30  # seconds (handled by script, not cron)

# Log files
CRON_LOG = LOGS_DIR / "cron_orchestrator.log"
GMAIL_WATCHER_LOG = LOGS_DIR / "gmail_watcher_cron.log"


# =============================================================================
# Cron Management Functions
# =============================================================================

def check_cron_installed() -> bool:
    """Check if cron is installed and running."""
    try:
        # Check if crontab command exists
        result = subprocess.run(
            ["which", "crontab"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print("✗ crontab command not found")
            return False

        # Check if cron service is running
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", "cron"],
            capture_output=True
        )
        if result.returncode != 0:
            # Try alternative service name
            result = subprocess.run(
                ["systemctl", "is-active", "--quiet", "crond"],
                capture_output=True
            )
            if result.returncode != 0:
                print("⚠ Cron service may not be running (continuing anyway)")

        return True

    except Exception as e:
        print(f"✗ Error checking cron: {e}")
        return False


def get_current_crontab() -> str:
    """Get current user's crontab content."""
    try:
        result = subprocess.run(
            ["crontab", "-l"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout
        return ""
    except Exception:
        return ""


def backup_crontab() -> Path:
    """Backup current crontab to file."""
    backup_path = SCRIPTS_DIR / f"crontab_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    
    current_crontab = get_current_crontab()
    if current_crontab:
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(current_crontab)
        print(f"✅ Crontab backed up to: {backup_path}")
        return backup_path
    else:
        print("ℹ️  No existing crontab to backup")
        return None


def generate_crontab() -> str:
    """Generate new crontab content for Digital Employee."""
    # Get existing crontab (to preserve other jobs)
    existing = get_current_crontab()
    
    # Remove any existing Digital Employee cron jobs
    lines = existing.split('\n')
    filtered_lines = [
        line for line in lines
        if 'Digital_Employee' not in line and 'orchestrator.py' not in line
        and 'gmail_watcher.py' not in line
    ]
    existing_cleaned = '\n'.join(filtered_lines)
    
    # Build new crontab
    crontab_content = f"""{existing_cleaned}

# =============================================================================
# Digital Employee - Automated Cron Jobs
# Added: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
# =============================================================================

# Orchestrator - Runs every 5 minutes to process tasks
{ORCHESTRATOR_CRON} cd {BASE_DIR} && python3 orchestrator.py >> {CRON_LOG} 2>&1

# Gmail Watcher - Runs every minute (monitors every {GMAIL_WATCHER_INTERVAL}s internally)
* * * * * cd {BASE_DIR} && python3 gmail_watcher.py >> {GMAIL_WATCHER_LOG} 2>&1

# Daily log rotation at midnight
0 0 * * * find {LOGS_DIR} -name "*.log" -mtime +7 -delete

# =============================================================================
"""
    return crontab_content


def install_crontab() -> bool:
    """Install new crontab."""
    crontab_content = generate_crontab()
    
    try:
        # Write crontab using echo and pipe (more reliable)
        process = subprocess.Popen(
            ["crontab", "-"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = process.communicate(input=crontab_content)
        
        if process.returncode == 0:
            print("✅ Crontab installed successfully")
            return True
        else:
            print(f"✗ Failed to install crontab: {stderr}")
            return False
            
    except Exception as e:
        print(f"✗ Error installing crontab: {e}")
        return False


def uninstall_crontab() -> bool:
    """Remove Digital Employee cron jobs."""
    current = get_current_crontab()
    
    # Remove Digital Employee related lines
    lines = current.split('\n')
    filtered_lines = [
        line for line in lines
        if 'Digital_Employee' not in line and 'orchestrator.py' not in line
        and 'gmail_watcher.py' not in line
        and '# Digital Employee' not in line and '# Orchestrator' not in line
        and '# Gmail Watcher' not in line
        and '# Daily log rotation' not in line and '# =========' not in line
        and 'Added:' not in line
    ]
    
    # Remove empty lines at the end
    while filtered_lines and not filtered_lines[-1].strip():
        filtered_lines.pop()
    
    new_crontab = '\n'.join(filtered_lines)
    
    try:
        if new_crontab.strip():
            process = subprocess.Popen(
                ["crontab", "-"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(input=new_crontab)
            
            if process.returncode == 0:
                print("✅ Digital Employee cron jobs removed")
                return True
            else:
                print(f"✗ Failed to remove cron jobs: {stderr}")
                return False
        else:
            # No remaining jobs, remove crontab
            subprocess.run(["crontab", "-r"], check=False)
            print("✅ Crontab removed (no remaining jobs)")
            return True
            
    except Exception as e:
        print(f"✗ Error removing cron jobs: {e}")
        return False


def show_status() -> None:
    """Show current cron status."""
    print("=" * 70)
    print("  DIGITAL EMPLOYEE - CRON STATUS")
    print("=" * 70)
    
    # Check if cron is installed
    if not check_cron_installed():
        print("\n✗ Cron is not installed or not accessible")
        print("\nTo install cron:")
        print("  Ubuntu/Debian: sudo apt install cron")
        print("  Arch: sudo pacman -S cronie")
        print("  macOS: cron is pre-installed")
        return
    
    print("\n✅ Cron is installed")
    
    # Show current crontab
    current = get_current_crontab()
    
    if current:
        print("\n📋 Current Crontab:")
        print("-" * 70)
        
        # Highlight Digital Employee jobs
        for line in current.split('\n'):
            if 'Digital_Employee' in line or 'orchestrator.py' in line or \
               'gmail_watcher.py' in line:
                print(f"  🤖 {line}")
            elif line.strip() and not line.startswith('#'):
                print(f"     {line}")

        print("-" * 70)
    else:
        print("\nℹ️  No crontab configured")

    # Check if tmux watchers are running
    print("\n📊 Watcher Status:")

    try:
        result = subprocess.run(
            ["tmux", "list-sessions"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            sessions = result.stdout.split('\n')
            for session in sessions:
                if 'gmail_watcher' in session:
                    print(f"  ✅ {session.strip()}")
    except Exception:
        pass
    
    print("\n💡 Tip: Use 'crontab -e' to manually edit cron jobs")


def verify_installation() -> bool:
    """Verify cron installation was successful."""
    current = get_current_crontab()
    
    has_orchestrator = 'orchestrator.py' in current
    has_gmail = 'gmail_watcher.py' in current
    
    if has_orchestrator and has_gmail:
        print("✅ Verification: All cron jobs installed correctly")
        return True
    elif has_orchestrator:
        print("⚠️  Verification: Orchestrator installed, Gmail watcher missing")
        return False
    else:
        print("✗ Verification: Cron jobs not installed correctly")
        return False


# =============================================================================
# Tmux Helper Functions
# =============================================================================

def start_tmux_watchers() -> None:
    """Start watchers in tmux sessions."""
    print("\n🚀 Starting tmux watchers...")
    
    # Start Gmail watcher
    try:
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", "gmail_watcher",
             "-c", str(BASE_DIR),
             "python3", "gmail_watcher.py", "--continuous"],
            check=True
        )
        print("✅ Gmail watcher started in tmux session 'gmail_watcher'")
    except Exception as e:
        print(f"⚠️  Could not start Gmail watcher: {e}")


def stop_tmux_watchers() -> None:
    """Stop watchers in tmux sessions."""
    print("\n🛑 Stopping tmux watchers...")

    for session_name in ["gmail_watcher"]:
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", session_name],
                check=False
            )
            print(f"✅ Stopped tmux session '{session_name}'")
        except Exception:
            pass


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Setup cron jobs for Digital Employee",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python setup_cron.py              # Install cron jobs
  python setup_cron.py --uninstall  # Remove cron jobs
  python setup_cron.py --status     # Check status
  python setup_cron.py --backup     # Backup existing crontab
  python setup_cron.py --start-tmux # Start tmux watchers
        """
    )
    
    parser.add_argument(
        '--uninstall',
        action='store_true',
        help='Remove Digital Employee cron jobs'
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Show current cron status'
    )
    parser.add_argument(
        '--backup',
        action='store_true',
        help='Backup existing crontab'
    )
    parser.add_argument(
        '--start-tmux',
        action='store_true',
        help='Start watchers in tmux sessions'
    )
    parser.add_argument(
        '--stop-tmux',
        action='store_true',
        help='Stop watchers in tmux sessions'
    )
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='Skip backup when installing'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("  DIGITAL EMPLOYEE - CRON SETUP UTILITY")
    print("=" * 70)
    print(f"  Base Directory: {BASE_DIR}")
    print("=" * 70)
    
    # Handle commands
    if args.status:
        show_status()
        
    elif args.backup:
        backup_crontab()
        
    elif args.uninstall:
        print("\n🗑️  Removing Digital Employee cron jobs...")
        uninstall_crontab()
        
    elif args.start_tmux:
        start_tmux_watchers()
        
    elif args.stop_tmux:
        stop_tmux_watchers()
        
    else:
        # Default: Install cron jobs
        print("\n📋 Installing Digital Employee cron jobs...")
        
        # Check prerequisites
        if not check_cron_installed():
            print("\n✗ Cron is not installed. Please install cron first:")
            print("  Ubuntu/Debian: sudo apt install cron")
            print("  Arch: sudo pacman -S cronie")
            print("  macOS: cron is pre-installed")
            sys.exit(1)
        
        # Backup existing crontab
        if not args.no_backup:
            backup_crontab()
        
        # Install new crontab
        if install_crontab():
            verify_installation()
            
            print("\n" + "=" * 70)
            print("  CRON SETUP COMPLETE")
            print("=" * 70)
            print(f"""
  What's configured:

  ✅ Orchestrator: Runs every 5 minutes
     Command: python3 orchestrator.py
     Log: {CRON_LOG}

  ✅ Gmail Watcher: Runs every minute
     Command: python3 gmail_watcher.py
     Log: {GMAIL_WATCHER_LOG}

  Next Steps:

  1. Start tmux watchers for continuous monitoring:
     python3 setup_cron.py --start-tmux

  2. Check logs:
     tail -f {LOGS_DIR}/*.log

  3. View dashboard:
     cat Dashboard.md

  4. Monitor cron jobs:
     python3 setup_cron.py --status
""")
            print("=" * 70)
        else:
            print("\n✗ Failed to install cron jobs")
            sys.exit(1)


if __name__ == "__main__":
    main()
