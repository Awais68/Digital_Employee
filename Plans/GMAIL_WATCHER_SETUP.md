# Gmail Watcher Setup Guide

Quick setup guide for the Gmail Watcher component.

---

## Prerequisites

1. **Google Cloud Project** with Gmail API enabled
2. **OAuth2 Credentials** (already in `credentials.json`)
3. **Python 3.7+**

---

## Installation

### Step 1: Install Dependencies

```bash
pip install google-auth google-auth-oauthlib google-api-python-client python-dotenv
```

Or let the script auto-install on first run.

### Step 2: OAuth2 Authentication (One-Time)

Run the authentication flow:

```bash
python gmail_watcher.py --auth
```

This will:
1. Open a browser window (or provide a URL)
2. Ask you to sign in with Google
3. Request permission to read your Gmail
4. Save a `token.json` file for future use

**Note:** The `token.json` file contains your access credentials. Keep it secure!

---

## Usage

### Run Once (Check for new emails)

```bash
python gmail_watcher.py
```

### Run Continuously (Foreground)

```bash
# Check every 60 seconds
python gmail_watcher.py --interval 60
```

### Run in Background (tmux)

```bash
# Start watcher in tmux session
python gmail_watcher.py --start

# Check status
python gmail_watcher.py --status

# Stop watcher
python gmail_watcher.py --stop

# Attach to tmux session (view logs live)
tmux attach -t gmail_watcher

# Detach from tmux (keep running)
# Press Ctrl+b, then d
```

---

## How It Works

1. **Fetches** unread emails from Gmail (Primary inbox only)
2. **Parses** email content, subject, sender, date
3. **Assesses** importance (high/medium/normal priority)
4. **Creates** `.md` task file in `Needs_Action/` folder
5. **Marks** the email as read in Gmail

### Email → Task File Example

**Email:**
- From: boss@company.com
- Subject: URGENT: Review Q4 Report
- Body: Please review the attached Q4 report and send feedback by EOD.

**Creates:** `Needs_Action/20260402_143022_email_URGENT_Review_Q4_Report.md`

```markdown
---
type: email_task
source: gmail
email_id: abc123
priority: high
status: pending
---

# Email Task: URGENT: Review Q4 Report

## Email Details
| Field | Value |
|-------|-------|
| **From** | boss@company.com |
| **Date** | 2026-04-02 14:30:22 |
| **Importance** | HIGH |

## Email Content
Please review the attached Q4 report and send feedback by EOD.

---

## Action Items
- [ ] Review email content
- [ ] Determine required action
- [ ] Respond or delegate
- [ ] Mark as complete
```

---

## Configuration

### Environment Variables (`.env`)

```env
# Gmail Watcher Configuration
GMAIL_CREDENTIALS=credentials.json      # OAuth2 credentials file
GMAIL_WATCHER_INTERVAL=60               # Seconds between checks
GMAIL_MAX_RESULTS=10                    # Max emails per check
GMAIL_ENABLED=true                      # Enable/disable watcher
```

### Importance Detection

Emails are marked as **HIGH** priority if subject contains:
- `urgent`, `asap`, `immediate`, `important`
- `action required`, `deadline`, `emergency`
- `priority`, `critical`, `attention`

Emails are marked as **MEDIUM** priority if subject contains:
- `review`, `approval`, `meeting`, `schedule`
- `update`, `feedback`, `question`, `request`, `please`

All others are **NORMAL** priority.

---

## Logs

Logs are saved to: `Logs/gmail_watcher_YYYYMMDD.log`

View live:
```bash
tail -f Logs/gmail_watcher_$(date +%Y%m%d).log
```

---

## Troubleshooting

### Error: `token.json` not found
Run authentication: `python gmail_watcher.py --auth`

### Error: `credentials.json` not found
Download from Google Cloud Console → APIs & Services → Credentials

### Error: `Gmail API not enabled`
Enable at: https://console.cloud.google.com/apis/library/gmail.googleapis.com

### No emails being fetched
- Check that emails are unread
- Ensure they're in Primary inbox (not Promotions/Social)
- Verify Gmail API has proper permissions

### Tmux not found
Install tmux:
```bash
# Ubuntu/Debian
sudo apt install tmux

# Arch
sudo pacman -S tmux

# macOS
brew install tmux
```

---

## Security Notes

1. **Keep `token.json` secure** - It provides access to your Gmail
2. **Never commit credentials** - `token.json` is in `.gitignore`
3. **Review OAuth permissions** - Only grants read/modify access to Gmail
4. **Revoke access anytime** - Visit https://myaccount.google.com/permissions

---

## Commands Quick Reference

| Command | Description |
|---------|-------------|
| `python gmail_watcher.py --auth` | Run OAuth2 authentication |
| `python gmail_watcher.py` | Check emails once |
| `python gmail_watcher.py --interval 60` | Run continuously (60s interval) |
| `python gmail_watcher.py --start` | Start in tmux (background) |
| `python gmail_watcher.py --status` | Check if running |
| `python gmail_watcher.py --stop` | Stop tmux watcher |
| `tmux attach -t gmail_watcher` | View live logs |

---

**Created:** 2026-04-02  
**Component:** Gmail Watcher  
**Tier:** Silver
