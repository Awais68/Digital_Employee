#!/usr/bin/env python3
"""Health check script — runs every 5 min via cron"""
import os, json, subprocess, socket
from datetime import datetime
from pathlib import Path

VAULT = Path(os.getenv('VAULT_PATH', '.'))
LOG = VAULT / 'Logs' / 'health_check.log'

def check_port(port):
    s = socket.socket()
    r = s.connect_ex(('127.0.0.1', port))
    s.close()
    return r == 0

def check_process(name):
    result = subprocess.run(['pgrep', '-f', name], capture_output=True)
    return result.returncode == 0

alerts = []
status = {}
status['odoo_local'] = check_port(8069)
if not status['odoo_local']:
    alerts.append("ALERT: Odoo port 8069 not responding")
status['dashboard'] = check_port(3000)
if not status['dashboard']:
    alerts.append("ALERT: Dashboard port 3000 not responding")
for watcher in ['gmail_watcher', 'whatsapp_watcher']:
    running = check_process(watcher)
    status[watcher] = running
    if not running:
        alerts.append(f"ALERT: {watcher} not running!")
import shutil
total, used, free = shutil.disk_usage('/')
disk_pct = int(used / total * 100)
status['disk_usage_pct'] = disk_pct
if disk_pct > 85:
    alerts.append(f"ALERT: Disk usage at {disk_pct}%")
needs_action = VAULT / 'Needs_Action'
backlog = len(list(needs_action.glob('*.md'))) if needs_action.exists() else 0
status['needs_action_backlog'] = backlog
if backlog > 20:
    alerts.append(f"WARN: {backlog} items in Needs_Action — backlog growing")
report = {"timestamp": datetime.now().isoformat(), "status": status, "alerts": alerts, "overall": "DEGRADED" if alerts else "HEALTHY"}
LOG.parent.mkdir(parents=True, exist_ok=True)
with open(LOG, 'a') as f:
    f.write(json.dumps(report) + "\n")
signals_dir = VAULT / 'Signals'
signals_dir.mkdir(exist_ok=True)
(signals_dir / 'health_latest.json').write_text(json.dumps(report, indent=2))
if alerts:
    print(f"[{datetime.now().strftime('%H:%M')}] HEALTH ISSUES: {len(alerts)}")
    for a in alerts:
        print(f"  {a}")
else:
    print(f"[{datetime.now().strftime('%H:%M')}] All systems healthy")
