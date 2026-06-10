# 🎛️ Digital Employee Control Panel

*Last Updated: 2026-06-11 00:24:06* | **Status:** 🟡 Action Required

---

## 📊 Quick Status Overview

| 🔴 Needs Action | 🟠 Pending Approval | 🟡 Sent Today | 🟢 Completed Today |
|:---------------:|:-------------------:|:-------------:|:------------------:|
| **0** | **8** | **0** | **0** |

---

## 📈 Today's Activity Summary

| Metric | Count | Visual Status |
|--------|-------|---------------|
| **Emails Sent** | 0 | ⚪ None |
| **Pending Review** | 8 | 🟡 Waiting |
| **Rejected** | 0 | 🟢 None |
| **Dry Run Mode** | 0 | ✅ Live |

---

## 🔴 High Priority - Needs Action

- ✅ No items in Needs Action

---

## 🟠 Pending Approvals - Human Review Required

**Move files to `/Approved/` to execute:**

| # | Type | File | Since | Quick Action |
|---|------|------|-------|-------------|
| 1 | 📧 | `REPLY_2026-06-08_17-33-30_email_sps_omk_7951_do_more_with_your_domains.md` | 22:34 | → `/Approved/` |
| 2 | 📧 | `REPLY_2026-06-08_17-15-21_email_sps_omk_7951_do_more_with_your_domains.md` | 22:15 | → `/Approved/` |
| 3 | 📧 | `REPLY_2026-06-08_16-56-38_email_race_mode_on_trade_full_speed.md` | 21:57 | → `/Approved/` |
| 4 | 📧 | `REPLY_2026-06-08_16-56-37_email_digital_fte_builder_required.md` | 21:57 | → `/Approved/` |
| 5 | 📧 | `EMAIL_REPLY_1780937809839.md` | 21:56 | → `/Approved/` |
| 6 | 📧 | `EMAIL_REPLY_1780937807704.md` | 21:56 | → `/Approved/` |
| 7 | 📱 | `LINKEDIN_POST_20260608_215753.md` | 22:09 | → `/Approved/` |
| 8 | 📱 | `LINKEDIN_POST_20260608_215724.md` | 21:57 | → `/Approved/` |

**Total (Email + LinkedIn):** 8 file(s) awaiting your decision

**Quick Commands:**
```
# Approve: mv Pending_Approval/<file> Approved/
# Reject: mv Pending_Approval/<file> Rejected/
```

---

## 🔵 LinkedIn Pending Posts

**LinkedIn Post Queue:** 2 pending, 1 approved, 0 posted

### 🟡 Awaiting Human Review

| # | File | Topic | Since | Action |
|---|------|-------|-------|--------|
| 1 | `LINKEDIN_POST_20260608_215753.md` | LinkedIn Post | 22:09 | Review → `/Approved/` |
| 2 | `LINKEDIN_POST_20260608_215724.md` | LinkedIn Post | 21:57 | Review → `/Approved/` |

**2 post(s)** awaiting your review

### 🟢 Approved - Ready to Publish

| # | File | Since | Status |
|---|------|-------|--------|
| 1 | `LINKEDIN_POST_20260404_234638.md` | 00:49 | ⏳ Waiting for orchestrator |

**1 post(s)** approved, will be posted on next orchestrator run

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

*🤖 Silver Tier Orchestrator v4.0 | 🟡 Action Required*
