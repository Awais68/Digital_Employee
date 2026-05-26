# Gmail Watcher v2.0 - Quick Start Guide

## 📋 Overview

The Gmail Watcher monitors your Gmail for unread + important emails every 2 minutes and automatically creates structured task files in `/Needs_Action/` for the orchestrator to process.

---

## 🔧 First-Time Setup

### Step 1: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 2: Get Gmail API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Gmail API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth2 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Desktop app**
   - Download the `credentials.json` file
5. Save `credentials.json` in the vault root:
   ```
   /media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/credentials.json
   ```

### Step 3: Authenticate

Run the authentication flow:

```bash
python3 gmail_watcher.py --auth
```

This will:
- Open a browser window (or provide a URL)
- Ask you to sign in with Google
- Request permission to read/modify Gmail
- Save `token.json` for future use

**Note:** The token has read/modify access to Gmail. Keep it secure!

---

## 🚀 Running the Watcher

### Option 1: Single Run (Test)

```bash
python3 gmail_watcher.py
```

This will:
- Check for unread emails once
- Create task files for new emails
- Mark processed emails as read
- Exit

### Option 2: Continuous Mode in tmux (Production)

**Start the watcher:**

```bash
python3 gmail_watcher.py --start
```

This creates a detached tmux session that runs every 2 minutes.

**Custom interval (e.g., 5 minutes):**

```bash
python3 gmail_watcher.py --start --interval 300
```

**Check status:**

```bash
python3 gmail_watcher.py --status
```

**Stop the watcher:**

```bash
python3 gmail_watcher.py --stop
```

**View logs (attach to tmux):**

```bash
tmux attach -t gmail_watcher
```

**Detach from tmux:** `Ctrl+b`, then `d`

---

## 📁 Output Files

### Task Files (`/Needs_Action/`)

Each new email creates a file like:

```
20260402_210038_email_security_alert.md
```

With YAML frontmatter:

```yaml
---
type: email
from: security@google.com
subject: Security alert
received: 2026-04-02T21:00:38+00:00
priority: high
status: pending
email_id: abc123
thread_id: xyz789
---
```

### Processed IDs (`/Metrics/gmail_processed_ids.json`)

Tracks already-processed email IDs to avoid duplicates.

### Logs (`/Logs/gmail_watcher_YYYYMMDD.log`)

Daily log files with detailed activity.

---

## 🔍 How It Works

1. **Fetches** unread emails from Gmail (excludes promotions/social)
2. **Parses** each email (subject, from, body, priority)
3. **Creates** structured `.md` file in `/Needs_Action/`
4. **Marks** email as read in Gmail
5. **Tracks** email ID to prevent duplicates
6. **Repeats** every 2 minutes (configurable)

---

## 📊 Priority Detection

| Priority | Triggers |
|----------|----------|
| **High** | urgent, asap, immediate, important, deadline, emergency, critical |
| **Medium** | review, approval, meeting, schedule, update, feedback, request |
| **Normal** | All other emails |

---

## 🛠️ Troubleshooting

### "Credentials file not found"

```bash
# Check if file exists
ls -la credentials.json

# If missing, download from Google Cloud Console
```

### "Token expired"

```bash
# Re-run authentication
python3 gmail_watcher.py --auth
```

### "tmux not found"

```bash
# Install tmux
sudo apt install tmux      # Ubuntu/Debian
sudo pacman -S tmux        # Arch
brew install tmux          # macOS
```

### "No new important emails"

This is normal when inbox is empty. The watcher will continue checking every 2 minutes.

---

## 📝 Commands Summary

| Command | Description |
|---------|-------------|
| `python3 gmail_watcher.py` | Single run (foreground) |
| `python3 gmail_watcher.py --start` | Start in tmux (background) |
| `python3 gmail_watcher.py --stop` | Stop tmux session |
| `python3 gmail_watcher.py --status` | Check if running |
| `python3 gmail_watcher.py --auth` | First-time authentication |
| `python3 gmail_watcher.py --start --interval 300` | Start with 5-min interval |
| `tmux attach -t gmail_watcher` | View live logs |

---

## 🔐 Security Notes

- Keep `credentials.json` and `token.json` secure
- Never commit these files to version control
- The token has read/modify access to your Gmail
- Revoke access from [Google Account Permissions](https://myaccount.google.com/permissions)

---

## 📞 Integration with Orchestrator

The Gmail Watcher works with the Silver Tier Orchestrator:

1. Gmail Watcher creates files in `/Needs_Action/`
2. Orchestrator scans `/Needs_Action/` and creates plans
3. Files move to `/Done/` after processing
4. Dashboard tracks all activity

**Run orchestrator after Gmail Watcher:**

```bash
python3 orchestrator.py
```

---

*Generated for Digital Employee System - Silver Tier v3.0*
