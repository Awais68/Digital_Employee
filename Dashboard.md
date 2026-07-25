# 🎛️ Digital Employee Control Panel

*Last Updated: 2026-07-25 06:06:01* | **Status:** 🟡 Action Required

---

## 📊 Quick Status Overview

| 🔴 Needs Action | 🟠 Pending Approval | 🟡 Sent Today | 🟢 Completed Today |
|:---------------:|:-------------------:|:-------------:|:------------------:|
| **0** | **4** | **0** | **1** |

---

## 📈 Today's Activity Summary

| Metric | Count | Visual Status |
|--------|-------|---------------|
| **Emails Sent** | 0 | ⚪ None |
| **Pending Review** | 4 | 🟡 Waiting |
| **Rejected** | 0 | 🟢 None |
| **Dry Run Mode** | 0 | ✅ Live |

---

## 🔴 High Priority - Needs Action

- ✅ No items in Needs Action

---

## 🟠 Pending Approvals - Human Review Required

### 💬 WhatsApp Replies — Manual Approval Required

> ⚠️ **WhatsApp replies are NEVER auto-sent. Human must approve and send manually.**

| # | File | Sender | Since | Action |
|---|------|--------|-------|--------|
| 1 | 💬 `WHATSAPP_20260725_024531_awais_own.md` | 20260725 | 02:45 | Review → `/Approved/` |

**WhatsApp:** 1 reply(ies) awaiting your review

**Move files to `/Approved/` to execute:**

| # | Type | File | Since | Quick Action |
|---|------|------|-------|-------------|
| 1 | 📧 | `DASHBOARD_TEST_POST_20260723.md` | 23:53 | → `/Approved/` |
| 2 | 📧 | `REPLY_2026-07-23_19-17-53_email__comprehensive_test_report_erm_solutions_geneva.md` | 00:18 | → `/Approved/` |
| 3 | 📱 | `LINKEDIN_POST_20260723_235144.md` | 23:51 | → `/Approved/` |

**Total (Email + LinkedIn):** 3 file(s) awaiting your decision

**Quick Commands:**
```
# Approve: mv Pending_Approval/<file> Approved/
# Reject: mv Pending_Approval/<file> Rejected/
```

---

## 🔵 LinkedIn Pending Posts

**LinkedIn Post Queue:** 1 pending, 0 approved, 0 posted

### 🟡 Awaiting Human Review

| # | File | Topic | Since | Action |
|---|------|-------|-------|--------|
| 1 | `LINKEDIN_POST_20260723_235144.md` | LinkedIn Post | 23:51 | Review → `/Approved/` |

**1 post(s)** awaiting your review

**Quick Commands:**
```
# Approve post: mv Pending_Approval/LINKEDIN_POST_* Approved/
# Reject post: mv Pending_Approval/LINKEDIN_POST_* Rejected/
# Create new post request: echo 'topic' > Needs_Action/LINKEDIN_DAILY_POST.md
```

---

## 🟡 Today's Completed Tasks

**Successfully processed today:**

- ✅ `20260725_024331_whatsapp_awais_own.md` `[02:43]`

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

*🤖 Silver Tier Orchestrator v4.0 | 🟡 Action Required*
