#!/usr/bin/env python3
"""
workers.py - Worker manager for Digital Employee.

This is now a thin PM2 proxy. It used to Popen() orchestrator.py and
gmail_watcher.py directly, which double-processed everything because PM2 and
cron were already running the same scripts. PM2 (ecosystem.config.js) is the
single supervisor; this script exists so systemd, the dashboard and the CLI all
drive the same mechanism.

Usage:
    python3 workers.py start    # Start/reload all PM2 apps and persist the dump
    python3 workers.py stop     # Stop all PM2 apps
    python3 workers.py status   # Show status
    python3 workers.py restart  # Restart all PM2 apps
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ECOSYSTEM = BASE_DIR / "ecosystem.config.js"
LOG_FILE = BASE_DIR / "Logs" / "workers.log"
PID_FILE = BASE_DIR / ".workers.pid"


def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"[{timestamp}] {message}"
    print(msg)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(msg + "\n")
    except Exception:
        pass


def _pm2_bin():
    """Locate pm2. systemd user units start with a minimal PATH."""
    found = shutil.which("pm2")
    if found:
        return found
    for candidate in Path.home().glob(".nvm/versions/node/*/bin/pm2"):
        return str(candidate)
    for candidate in ("/usr/local/bin/pm2", "/usr/bin/pm2"):
        if os.path.exists(candidate):
            return candidate
    return None


def _pm2(*args, check=False):
    pm2 = _pm2_bin()
    if not pm2:
        log("  ✗ pm2 not found on PATH — install it or fix PATH in the systemd unit")
        return None
    node_bin = str(Path(pm2).parent)
    env = dict(os.environ)
    env["PATH"] = node_bin + os.pathsep + env.get("PATH", "")
    env.setdefault("PM2_HOME", str(Path.home() / ".pm2"))
    return subprocess.run(
        [pm2, *args],
        cwd=str(BASE_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=check,
        timeout=120,
    )


def start_workers():
    log("Starting workers via PM2...")
    # startOrReload is idempotent: it starts what is missing and reloads the rest,
    # so it is safe for the boot service and the 5-minute self-heal timer alike.
    result = _pm2("startOrReload", str(ECOSYSTEM), "--update-env")
    if result is None:
        return []
    if result.returncode != 0:
        log(f"  ✗ pm2 startOrReload failed: {result.stderr.strip()[:400]}")
        return []
    # Persist the process list so `pm2 resurrect` actually has something to restore.
    _pm2("save", "--force")

    running = [w["name"] for w in _list_apps() if w["running"]]
    # Kept only so anything still reading .workers.pid sees the truth.
    try:
        PID_FILE.write_text(json.dumps({w["name"]: w["pid"] for w in _list_apps() if w["running"]}))
    except Exception:
        pass
    log(f"Workers running: {', '.join(running) if running else 'none'}")
    return running


def stop_workers():
    log("Stopping workers via PM2...")
    result = _pm2("stop", str(ECOSYSTEM))
    if result is None:
        return []
    _pm2("save", "--force")
    if PID_FILE.exists():
        PID_FILE.unlink()
    log("Workers stopped")
    return []


def _list_apps():
    result = _pm2("jlist")
    if result is None or result.returncode != 0:
        return []
    try:
        raw = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    apps = []
    for proc in raw:
        env = proc.get("pm2_env", {})
        apps.append({
            "name": proc.get("name"),
            "running": env.get("status") == "online",
            "status": env.get("status"),
            "pid": proc.get("pid") or None,
            "restarts": env.get("restart_time", 0),
            "uptime": env.get("pm_uptime"),
        })
    return apps


def check_status():
    """Return {name: info} for every app declared in ecosystem.config.js."""
    live = {a["name"]: a for a in _list_apps()}
    declared = _declared_apps()
    status = {}
    for name in declared:
        info = live.get(name)
        status[name] = {
            "name": name,
            "description": declared[name],
            "running": bool(info and info["running"]),
            "pid": info["pid"] if info and info["running"] else None,
            "enabled": True,
            "status": info["status"] if info else "missing",
            "restarts": info["restarts"] if info else 0,
        }
    return status


def _declared_apps():
    """Read app names out of ecosystem.config.js without needing node."""
    descriptions = {
        "vault-control": "Dashboard API + WhatsApp client",
        "gmail-watcher": "Gmail watcher - monitors for new emails",
        "email-mcp": "Email MCP server",
        "orchestrator": "Main orchestrator - runs every 3 minutes",
    }
    try:
        text = ECOSYSTEM.read_text()
        import re
        names = re.findall(r"name:\s*'([^']+)'", text)
        return {n: descriptions.get(n, n) for n in names}
    except Exception:
        return descriptions


def print_status():
    status = check_status()
    print("\n" + "=" * 60)
    print("DIGITAL EMPLOYEE - WORKER STATUS (PM2)")
    print("=" * 60)
    for name, info in status.items():
        icon = "✓" if info["running"] else "✗"
        text = "RUNNING" if info["running"] else info["status"].upper()
        pid = f" (PID {info['pid']})" if info["running"] else ""
        print(f"  {icon} {name:20} {text:10}{pid}")
        print(f"    {info['description']}")
        print()
    running = sum(1 for s in status.values() if s["running"])
    print(f"Workers running: {running}/{len(status)}")
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
        result = _pm2("restart", str(ECOSYSTEM), "--update-env")
        if result is not None and result.returncode != 0:
            log(f"  ✗ pm2 restart failed: {result.stderr.strip()[:400]}")
        _pm2("save", "--force")
        print_status()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
