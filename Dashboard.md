# 🎛️ Digital Employee Control Panel

*Last Updated: 2026-07-09 00:21:11* | **Status:** 🟢 Processing

---

## 📊 Quick Status Overview

| 🔴 Needs Action | 🟠 Pending Approval | 🟡 Sent Today | 🟢 Completed Today |
|:---------------:|:-------------------:|:-------------:|:------------------:|
| **0** | **0** | **0** | **0** |

---

## 📈 Today's Activity Summary

| Metric | Count | Visual Status |
|--------|-------|---------------|
| **Emails Sent** | 0 | ⚪ None |
| **Pending Review** | 0 | 🟢 Clear |
| **Rejected** | 0 | 🟢 None |
| **Dry Run Mode** | 0 | ✅ Live |

---

## 🔴 High Priority - Needs Action

- ✅ No items in Needs Action

---

## 🟠 Pending Approvals - Human Review Required

✅ **All clear!** No pending approvals

---

## 🔵 LinkedIn Pending Posts

**LinkedIn Post Queue:** 0 pending, 2 approved, 0 posted

### 🟢 Approved - Ready to Publish

| # | File | Since | Status |
|---|------|-------|--------|
| 1 | `LINKEDIN_POST_20260612_164100.md` | 17:23 | ⏳ Waiting for orchestrator |
| 2 | `LINKEDIN_POST_20260404_234638.md` | 00:49 | ⏳ Waiting for orchestrator |

**2 post(s)** approved, will be posted on next orchestrator run

**Quick Commands:**
```
# Approve post: mv Pending_Approval/LINKEDIN_POST_* Approved/
# Reject post: mv Pending_Approval/LINKEDIN_POST_* Rejected/
# Create new post request: echo 'topic' > Needs_Action/LINKEDIN_DAILY_POST.md
```

---

## 🟡 Today's Completed Tasks

- ⏳ No tasks completed yet today

---

## ⚡ Quick Actions & Scheduling

### Manual Commands

| Command | Purpose |
|---------|---------|
| `python3 orchestrator.py` | Process all pending items |
| `python3 gmail_watcher.py --start` | Start Gmail monitor (30s interval) |
| `python3 gmail_watcher.py --status` | Check watcher status |
| `python3 email_mcp.py test` | Test email connection |

### Automated Scheduling (Recommended)

**Option 1: Cron Job (Linux/Mac)**
```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * cd /path/to/Digital_Employee && python3 orchestrator.py >> Logs/cron.log 2>&1
```

**Option 2: tmux Session (Background)**
```bash
# Start Gmail watcher in tmux
tmux new -d -s gmail_watcher "python3 gmail_watcher.py --start"

# View logs anytime
tmux attach -t gmail_watcher
```

**Option 3: Systemd Service (Production)**
```ini
# /etc/systemd/system/digital-employee.service
[Unit]
Description=Digital Employee Orchestrator
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Digital_Employee
ExecStart=/usr/bin/python3 orchestrator.py
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 📝 Recent Activity Log


---

*🤖 Silver Tier Orchestrator v4.0 | 🟢 Processing*
