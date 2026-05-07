#!/usr/bin/env python3
"""
workers.py - Background worker manager for Digital Employee
Starts and monitors all background workers: orchestrator, whatsapp_watcher, gmail_watcher

Usage:
    python3 workers.py start    # Start all workers
    python3 workers.py stop     # Stop all workers
    python3 workers.py status   # Check worker status
    python3 workers.py restart  # Restart all workers
"""

import os
import sys
import subprocess
import signal
import json
import time
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
PID_FILE = BASE_DIR / ".workers.pid"
LOG_FILE = BASE_DIR / "Logs" / "workers.log"
LOCK_FILE = BASE_DIR / ".workers.lock"

WORKERS = {
    "orchestrator": {
        "script": "orchestrator.py",
        "enabled_env": "ENABLE_ORCHESTRATOR",
        "description": "Main orchestrator - processes approvals, manages workflows"
    },
    "whatsapp_watcher": {
        "script": "whatsapp_watcher.py",
        "enabled_env": "WHATSAPP_ENABLED",
        "description": "WhatsApp watcher - monitors for new messages"
    },
    "gmail_watcher": {
        "script": "gmail_watcher.py",
        "enabled_env": "GMAIL_ENABLED",
        "description": "Gmail watcher - monitors for new emails"
    }
}

def log(message):
    """Log message to file and stdout."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"[{timestamp}] {message}"
    print(msg)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, 'a') as f:
            f.write(msg + "\n")
    except Exception:
        pass

def get_pid():
    """Get stored PID file contents."""
    if not PID_FILE.exists():
        return {}
    try:
        with open(PID_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_pid(pids):
    """Save PIDs to file."""
    with open(PID_FILE, 'w') as f:
        json.dump(pids, f)

def is_running(pid):
    """Check if a process is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False

def start_workers():
    """Start all enabled workers."""
    log("Starting workers...")
    pids = get_pid()
    started = []
    
    for name, config in WORKERS.items():
        # Check if enabled
        enabled = os.environ.get(config["enabled_env"], "true").lower() == "true"
        if not enabled:
            log(f"  ⏭  {name}: disabled by env")
            continue
        
        # Check if already running
        if name in pids and is_running(pids[name]):
            log(f"  ✓ {name}: already running (PID {pids[name]})")
            started.append(name)
            continue
        
        # Start the worker
        script_path = BASE_DIR / config["script"]
        if not script_path.exists():
            log(f"  ✗ {name}: script not found ({script_path})")
            continue
        
        log(f"  ▶ {name}: starting ({config['description']})")
        
        try:
            process = subprocess.Popen(
                [sys.executable, str(script_path)],
                cwd=str(BASE_DIR),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
            pids[name] = process.pid
            started.append(name)
            log(f"  ✓ {name}: started (PID {process.pid})")
        except Exception as e:
            log(f"  ✗ {name}: failed to start ({e})")
    
    save_pid(pids)
    log(f"Workers started: {', '.join(started) if started else 'none'}")
    return started

def stop_workers():
    """Stop all workers."""
    log("Stopping workers...")
    pids = get_pid()
    stopped = []
    
    for name, pid in pids.items():
        if is_running(pid):
            try:
                os.kill(pid, signal.SIGTERM)
                log(f"  ⏹  {name}: stopped (PID {pid})")
                stopped.append(name)
            except Exception as e:
                log(f"  ✗ {name}: failed to stop ({e})")
        else:
            log(f"  ⏭  {name}: not running")
    
    # Clear PID file
    if PID_FILE.exists():
        PID_FILE.unlink()
    
    log(f"Workers stopped: {', '.join(stopped) if stopped else 'none'}")
    return stopped

def check_status():
    """Check status of all workers."""
    pids = get_pid()
    status = {}
    
    for name, config in WORKERS.items():
        pid = pids.get(name)
        running = pid and is_running(pid)
        
        status[name] = {
            "name": name,
            "description": config["description"],
            "running": running,
            "pid": pid if running else None,
            "enabled": os.environ.get(config["enabled_env"], "true").lower() == "true",
            "script": config["script"]
        }
    
    return status

def print_status():
    """Print formatted status."""
    status = check_status()
    
    print("\n" + "=" * 60)
    print("DIGITAL EMPLOYEE - WORKER STATUS")
    print("=" * 60)
    
    for name, info in status.items():
        icon = "✓" if info["running"] else "✗"
        status_text = "RUNNING" if info["running"] else "STOPPED"
        pid_text = f" (PID {info['pid']})" if info["running"] else ""
        
        print(f"  {icon} {name:20} {status_text:10}{pid_text}")
        print(f"    {info['description']}")
        print()
    
    running_count = sum(1 for s in status.values() if s["running"])
    print(f"Workers running: {running_count}/{len(status)}")
    print("=" * 60)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 workers.py [start|stop|status|restart]")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "start":
        start_workers()
    elif command == "stop":
        stop_workers()
    elif command == "status":
        print_status()
    elif command == "restart":
        stop_workers()
        time.sleep(2)
        start_workers()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
