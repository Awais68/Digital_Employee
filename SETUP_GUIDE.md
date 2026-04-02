# 🥈 Silver Tier - Complete Setup Guide

**Personal AI Employee Hackathon 2026**
**Version:** 5.0 - Full Implementation
**Last Updated:** 2026-04-03

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation Steps](#installation-steps)
4. [Configuration](#configuration)
5. [Running the System](#running-the-system)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The Silver Tier Digital Employee system includes:

| Component | File | Purpose |
|-----------|------|---------|
| **Gmail Watcher** | `gmail_watcher.py` | Monitor Gmail for new emails |
| **WhatsApp Watcher** | `whatsapp_watcher.py` | Monitor WhatsApp messages via Twilio |
| **Filesystem Watcher** | `filesystem_watcher.py` | Monitor Inbox folder |
| **Email MCP** | `email_mcp.py` | Send emails via SMTP/Gmail |
| **LinkedIn MCP** | `linkedin_mcp.py` | Publish LinkedIn posts |
| **Orchestrator** | `orchestrator.py` | Central brain coordinating all components |
| **Cron Setup** | `setup_cron.py` | Automated scheduling utility |

### Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SILVER TIER ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📧 Gmail ──────┐                                                        │
│  📱 WhatsApp ───┼──→ Watchers ─→ Needs_Action ─→ Orchestrator          │
│  📁 Filesystem ─┘                                                        │
│                                      │                                   │
│                                      ↓                                   │
│                              ┌───────────────┐                          │
│                              │  Orchestrator │                          │
│                              │  (Central     │                          │
│                              │   Brain)      │                          │
│                              └───────────────┘                          │
│                                      │                                   │
│                    ┌─────────────────┼─────────────────┐                │
│                    │                 │                 │                │
│                    ↓                 ↓                 ↓                │
│            ┌───────────┐    ┌───────────┐    ┌───────────┐             │
│            │  Email    │    │ LinkedIn  │    │  Plans/   │             │
│            │  MCP      │    │  MCP      │    │  Dashboard│             │
│            └───────────┘    └───────────┘    └───────────┘             │
│                                                                          │
│  ✅ Human-in-the-Loop: All actions require approval in Pending_Approval │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Prerequisites

### System Requirements

- Python 3.8+
- pip (Python package manager)
- tmux (for background watchers)
- cron (for scheduling)
- Git (optional, for version control)

### Required Python Packages

```bash
pip install python-dotenv schedule watchdog requests
pip install google-auth google-auth-oauthlib google-api-python-client  # Gmail
pip install twilio  # WhatsApp
```

### Quick Install

```bash
cd /path/to/Digital_Employee
pip install -r requirements.txt
```

---

## ⚙️ Configuration

### Step 1: Environment Variables (.env)

The `.env` file contains all configuration. Here's what needs to be set:

#### Gmail Configuration (Required for Email)

```bash
# Get Gmail App Password:
# 1. Go to https://myaccount.google.com/apppasswords
# 2. Select "Mail" and your device
# 3. Generate 16-character password
# 4. Copy to .env

SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
SENDER_NAME=Your Name
DRY_RUN=false  # Set to true for testing, false for production
```

#### WhatsApp Configuration (Optional - Twilio)

```bash
# Get Twilio credentials:
# 1. Sign up at https://console.twilio.com
# 2. Get Account SID and Auth Token from dashboard
# 3. Enable WhatsApp sandbox

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
MY_WHATSAPP_NUMBER=whatsapp:+923001234567
WHATSAPP_ENABLED=true
```

#### LinkedIn Configuration (Optional - Publishing)

```bash
# Get LinkedIn API credentials:
# 1. Go to https://www.linkedin.com/developers/apps
# 2. Create an app
# 3. Get OAuth2 credentials
# 4. Generate access token

LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_ACCESS_TOKEN=your_access_token
LINKEDIN_PERSON_URN=urn:li:person:YOUR_ID
LINKEDIN_POSTING_ENABLED=true
```

### Step 2: Gmail API Setup (for Gmail Watcher)

1. **Create Google Cloud Project:**
   - Go to https://console.cloud.google.com
   - Create new project

2. **Enable Gmail API:**
   - Go to "APIs & Services" → "Library"
   - Search "Gmail API" and enable

3. **Create OAuth2 Credentials:**
   - Go to "APIs & Services" → "Credentials"
   - Create "OAuth2 Client ID"
   - Download as `credentials.json`
   - Place in project root

4. **First-time Authentication:**
   ```bash
   python3 gmail_watcher.py --auth
   ```

---

## 🚀 Installation Steps

### Step 1: Install Dependencies

```bash
cd /path/to/Digital_Employee
pip install -r requirements.txt
```

### Step 2: Configure Environment

Edit `.env` file with your credentials (see Configuration section above).

### Step 3: Test Individual Components

```bash
# Test Email MCP
python3 email_mcp.py test

# Test LinkedIn MCP (if configured)
python3 linkedin_mcp.py test

# Test Gmail Watcher (single run)
python3 gmail_watcher.py

# Test WhatsApp Watcher (if configured)
python3 whatsapp_watcher.py
```

### Step 4: Setup Automated Scheduling

```bash
# Install cron jobs
python3 setup_cron.py

# Start background watchers in tmux
python3 setup_cron.py --start-tmux

# Verify installation
python3 setup_cron.py --status
```

---

## ▶️ Running the System

### Option 1: Manual Run (Testing)

```bash
# Run orchestrator once
python3 orchestrator.py

# Check Dashboard
cat Dashboard.md

# View logs
tail -f Logs/orchestrator.log
```

### Option 2: Automated (Production)

```bash
# 1. Setup cron jobs
python3 setup_cron.py

# 2. Start tmux watchers
python3 setup_cron.py --start-tmux

# 3. Verify everything is running
python3 setup_cron.py --status
```

### Option 3: Hybrid (Recommended)

```bash
# Start watchers in tmux (continuous monitoring)
tmux new -d -s gmail_watcher "python3 gmail_watcher.py --continuous"
tmux new -d -s whatsapp_watcher "python3 whatsapp_watcher.py --continuous"

# Setup cron for orchestrator (every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * cd /path/to/Digital_Employee && python3 orchestrator.py >> Logs/cron.log 2>&1") | crontab -
```

---

## 🧪 Testing

### Test Email Workflow

```bash
# 1. Create test email in Needs_Action
cat > Needs_Action/test_email.md << 'EOF'
---
type: email
from: test@example.com
subject: Test Email
priority: high
---

This is a test email for workflow validation.
EOF

# 2. Run orchestrator
python3 orchestrator.py

# 3. Check Pending_Approval folder
ls Pending_Approval/

# 4. Approve the draft
mv Pending_Approval/REPLY_*.md Approved/

# 5. Run orchestrator again (sends email)
python3 orchestrator.py

# 6. Check Done folder and logs
ls Done/
cat Logs/email_log_$(date +%Y%m%d).md
```

### Test LinkedIn Post Workflow

```bash
# 1. Create LinkedIn request in Needs_Action
cat > Needs_Action/LINKEDIN_TEST.md << 'EOF'
---
type: linkedin_request
priority: normal
topic: AI Development Update
---

# LinkedIn Post Request

## Topic
Building AI Agents for Business Automation

## Key Points
- Discussing latest AI agent developments
- Business automation benefits
- Future of AI in workplace
EOF

# 2. Run orchestrator
python3 orchestrator.py

# 3. Check generated post
cat Pending_Approval/LINKEDIN_POST_*.md

# 4. Approve for publishing
mv Pending_Approval/LINKEDIN_POST_*.md Approved/

# 5. Run orchestrator (publishes to LinkedIn)
python3 orchestrator.py
```

### Test WhatsApp Integration

```bash
# 1. Send test message via Twilio
python3 whatsapp_watcher.py --send +923001234567 "Test message from Digital Employee"

# 2. Run watcher to check for incoming messages
python3 whatsapp_watcher.py

# 3. Check Needs_Action folder
ls Needs_Action/ | grep whatsapp
```

---

## 📊 Monitoring & Logs

### View Logs

```bash
# Orchestrator logs
tail -f Logs/orchestrator.log

# Email logs
tail -f Logs/email_mcp.log
cat Logs/email_log_$(date +%Y%m%d).md

# LinkedIn logs
tail -f Logs/linkedin_mcp.log
cat Logs/linkedin_log_$(date +%Y%m%d).md

# Gmail watcher logs
tail -f Logs/gmail_watcher_*.log

# WhatsApp watcher logs
tail -f Logs/whatsapp_watcher_*.log

# Cron logs
tail -f Logs/cron.log
```

### Check Dashboard

```bash
# View live dashboard
cat Dashboard.md

# Or in real-time
tail -f Dashboard.md
```

### Check tmux Sessions

```bash
# List all tmux sessions
tmux list-sessions

# Attach to Gmail watcher
tmux attach -t gmail_watcher

# Attach to WhatsApp watcher
tmux attach -t whatsapp_watcher

# Detach from tmux: Ctrl+b, then d
```

---

## 🐛 Troubleshooting

### Email Not Sending

**Problem:** Emails logged but not sent

**Solutions:**
1. Check `DRY_RUN` in `.env` - set to `false` for production
2. Verify Gmail App Password (not regular password)
3. Test connection: `python3 email_mcp.py test`
4. Check logs: `cat Logs/email_mcp.log`

### Gmail Watcher Not Working

**Problem:** New emails not creating tasks

**Solutions:**
1. Check tmux session: `tmux list-sessions`
2. Attach to view logs: `tmux attach -t gmail_watcher`
3. Verify Gmail API credentials (`credentials.json`)
4. Re-authenticate: `python3 gmail_watcher.py --auth`

### WhatsApp Not Working

**Problem:** Messages not being received

**Solutions:**
1. Verify Twilio credentials in `.env`
2. Check Twilio sandbox is active
3. Test connection: `python3 whatsapp_watcher.py --status`
4. Check logs: `cat Logs/whatsapp_watcher_*.log`

### LinkedIn Posts Not Publishing

**Problem:** Posts stay in draft

**Solutions:**
1. Verify LinkedIn API credentials in `.env`
2. Check access token is valid (expires after 60 days)
3. Test connection: `python3 linkedin_mcp.py test`
4. Check logs: `cat Logs/linkedin_mcp.log`

### Cron Jobs Not Running

**Problem:** Orchestrator not running automatically

**Solutions:**
1. Check cron is installed: `which crontab`
2. List cron jobs: `crontab -l`
3. Check cron logs: `tail -f /var/log/syslog | grep CRON`
4. Reinstall: `python3 setup_cron.py`

### Approval Files Not Processing

**Problem:** Files in Approved/ but not processed

**Solutions:**
1. Run orchestrator manually: `python3 orchestrator.py`
2. Check file has `.md` extension
3. Verify file content has proper format
4. Check logs: `tail -f Logs/orchestrator.log`

---

## 📁 Folder Structure

```
Digital_Employee/
├── Needs_Action/          # Incoming tasks (from watchers)
├── Plans/                 # Generated action plans
├── Pending_Approval/      # Drafts awaiting human review
├── Approved/              # Ready for execution (auto-process)
├── Rejected/              # Rejected drafts (temp holding)
├── Done/                  # Completed/archived tasks
├── Inbox/                 # Raw incoming items (pre-processing)
├── Logs/                  # System logs and history
├── Metrics/               # Performance metrics (JSON)
├── Agent_Skills/          # AI skill definitions
├── Skills/                # Custom skill modules
│
├── orchestrator.py        # 🧠 Central brain
├── email_mcp.py           # 📧 Email sending
├── linkedin_mcp.py        # 📱 LinkedIn publishing
├── gmail_watcher.py       # 👁️ Gmail monitor
├── whatsapp_watcher.py    # 📱 WhatsApp monitor
├── filesystem_watcher.py  # 📂 File system monitor
├── setup_cron.py          # ⏰ Cron setup utility
│
├── Dashboard.md           # 🎛️ Live status dashboard
├── Company_Handbook.md    # Rules and guidelines
├── README.md              # This file
└── .env                   # Configuration (DO NOT COMMIT)
```

---

## ✅ Silver Tier Checklist

| Requirement | Status | Verification |
|-------------|--------|--------------|
| **Bronze Requirements** | ✅ | Basic orchestration working |
| **2+ Watcher Scripts** | ✅ | Gmail + WhatsApp + Filesystem |
| **LinkedIn Auto-Post** | ✅ | Draft generation + MCP publishing |
| **Plan.md Generation** | ✅ | Auto-generated in `/Plans/` |
| **One MCP Server** | ✅ | Email MCP + LinkedIn MCP |
| **Human-in-the-Loop** | ✅ | Approval workflow complete |
| **Scheduling (Cron)** | ✅ | `setup_cron.py` utility |
| **Agent Skills** | ✅ | `/Agent_Skills/` and `/Skills/` |

---

## 🔗 Quick Reference Commands

```bash
# === SETUP ===
python3 setup_cron.py              # Install cron jobs
python3 setup_cron.py --start-tmux # Start watchers
python3 setup_cron.py --status     # Check status

# === MANUAL RUN ===
python3 orchestrator.py            # Run orchestrator once
python3 gmail_watcher.py           # Run Gmail watcher once
python3 whatsapp_watcher.py        # Run WhatsApp watcher once

# === TESTING ===
python3 email_mcp.py test          # Test email connection
python3 linkedin_mcp.py test       # Test LinkedIn connection
python3 whatsapp_watcher.py --send +923001234567 "Test"  # Send WhatsApp

# === MONITORING ===
tail -f Logs/orchestrator.log      # Watch orchestrator logs
tmux list-sessions                 # Check tmux watchers
cat Dashboard.md                   # View dashboard
crontab -l                         # List cron jobs

# === APPROVAL WORKFLOW ===
ls Pending_Approval/                          # View pending items
mv Pending_Approval/file.md Approved/         # Approve
mv Pending_Approval/file.md Rejected/         # Reject
mv Pending_Approval/file.md Needs_Action/     # Request regen
```

---

**Hackathon:** Personal AI Employee Hackathon 2026
**Tier:** Silver v5.0 - Complete Implementation
**Status:** Production Ready ✅
**Last Updated:** 2026-04-03
