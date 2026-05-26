# AI Employee Vault

> **Personal AI Employee Hackathon 2026** — A file-based task orchestration system that automates workflow processing using markdown files.

## 🏆 Tier Progress

| Tier | Status | Completion Date | Features |
|------|--------|-----------------|----------|
| **Bronze** | ✅ Complete | 2026-04-02 | Basic orchestration, Dashboard, Plans |
| **Silver** | ✅ **100% Complete** | 2026-04-03 | Email MCP, LinkedIn MCP, Gmail/WhatsApp Watchers, Approval Workflow, Cron, LLM Router |
| **Gold** | ✅ **100% COMPLETE** | 2026-04-10 | Odoo ERP (7 tools), Facebook/Instagram/Twitter Skills, CEO Briefing, Ralph Wiggum Loop, Audit Logging, Error Recovery |
| **Platinum** | ⏳ Pending | — | Full autonomy, Learning, Self-improvement |

---

## 🥈 Silver Tier - Complete Feature List

| Feature | Status | Description |
|---------|--------|-------------|
| ✅ **Email MCP Integration** | Complete | `email_mcp.py` with SMTP/Gmail support |
| ✅ **LinkedIn MCP Integration** | Complete | `linkedin_mcp.py` with LinkedIn API + **Session Persistence** |
| ✅ **Gmail Watcher** | Complete | `gmail_watcher.py` with 30s interval monitoring |
| ✅ **Approval Workflow** | Complete | Pending → Approved → Sent pipeline |
| ✅ **Human-in-the-Loop** | Complete | Review before any email/post |
| ✅ **Auto Dashboard Updates** | Complete | Colorful priority-based status |
| ✅ **LinkedIn Post Generation** | Complete | Auto-draft posts with hashtags + auto-publish |
| ✅ **Rejection Handling** | Complete | Archive rejected drafts |
| ✅ **Dry-Run Mode** | Complete | Test without sending |
| ✅ **Gmail Watcher** | Complete | 30s interval monitoring |
| ✅ **Logging & Metrics** | Complete | Full audit trail |
| ✅ **Cron Scheduling** | Complete | `setup_cron.py` utility for automation |
| ✅ **Production Email Send** | Complete | Gmail App Password support |

---

## 🥇 Gold Tier - The Business Operator ✅ COMPLETE

> **Version 5.0.0** — Transforming from communication assistant to full business operator

### Overview

Gold Tier elevates your Digital Employee from a task executor to a **business operator** that can:
- 🏢 **Run Odoo ERP operations** — Invoices, orders, inventory, financial reports via natural language
- 📱 **Publish to all social platforms** — LinkedIn, Facebook, Instagram, Twitter/X (all Human-in-the-Loop)
- 📊 **Generate CEO Briefings** — Weekly Monday morning executive summaries with revenue, bottlenecks, suggestions
- 🤖 **Autonomous task completion** — Ralph Wiggum Loop keeps iterating until TASK_COMPLETE
- 🛡️ **Full audit logging** — Immutable JSON audit trails with error recovery and retry policies
- 🔒 **Secure by design** — All credentials from .env, never hardcoded

### Gold Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GOLD TIER STACK                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Layer 7: Business Intelligence (NEW)                               │
│  ├── Daily health summaries                                         │
│  ├── Anomaly detection                                              │
│  ├── Revenue trend tracking                                         │
│  └── Proactive suggestions                                          │
│                                                                     │
│  Layer 6: Enhanced Approvals (NEW)                                  │
│  ├── Financial transaction approvals                                │
│  ├── Configurable thresholds ($500 auto-approve)                    │
│  ├── Bulk approval commands                                         │
│  └── WhatsApp + Email approval                                      │
│                                                                     │
│  Layer 5: Advanced LLM (EXTENDED)                                   │
│  ├── Multi-provider failover (existing)                             │
│  ├── Context window management                                      │
│  ├── Cost optimization routing                                      │
│  └── Usage tracking & cost reporting                                │
│                                                                     │
│  Layer 4: Multi-Step Workflows (NEW)                                │
│  ├── Sales pipeline: Quote → Order → Invoice → Email                │
│  ├── Lead generation: Email → Odoo CRM → Notify                     │
│  ├── Inventory alerts: Low stock → PO → Email vendor                │
│  ├── Monthly report generation                                      │
│  └── Collections: Overdue invoice → Follow-up sequence              │
│                                                                     │
│  Layer 3: NLU Engine (NEW)                                          │
│  ├── Intent parsing (regex + LLM)                                   │
│  ├── Entity extraction (dates, amounts, names)                      │
│  ├── Multi-intent detection (chained operations)                    │
│  └── Confidence scoring & clarification                             │
│                                                                     │
│  Layer 2: Odoo ERP Deep Integration (EXTENDED)                      │
│  ├── Customer management (existing)                                 │
│  ├── Invoice lifecycle (existing → extended: validate, pay)         │
│  ├── Sales orders (existing → extended: list, detail)               │
│  ├── Purchase orders (NEW)                                          │
│  ├── Product catalog (NEW)                                          │
│  ├── Inventory management (NEW)                                     │
│  ├── Financial reports (NEW: P&L, Balance Sheet)                    │
│  └── Connection health check & retry (NEW)                          │
│                                                                     │
│  Layer 1: Silver Tier Foundation (existing)                         │
│  ├── Email MCP, LinkedIn MCP, Gmail/WhatsApp watchers               │
│  ├── Approval workflow, Cron scheduling, LLM Router                 │
│  └── Dashboard, logging, metrics                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Gold Tier Features (Detailed)

| Feature | Status | Description |
|---------|--------|-------------|
| ✅ **Odoo MCP Server** | Complete | `odoo_mcp.py` with JSON-RPC, 7 tools, secure .env |
| ✅ **Customer Creation** | Complete | `create_customer` via natural language |
| ✅ **Invoice Creation** | Complete | `create_invoice` with line items |
| ✅ **Sale Orders** | Complete | `create_sale_order` tool |
| ✅ **Accounting Summary** | Complete | `get_accounting_summary` |
| ✅ **Bank Balance** | Complete | `get_bank_balance` |
| ✅ **Recent Transactions** | Complete | `get_recent_transactions` |
| ✅ **Journal Entries** | Complete | `create_journal_entry` |
| ✅ **Facebook/Instagram Skill** | Complete | `SKILL_Facebook_Instagram_Post.md` with Playwright |
| ✅ **Twitter/X Skill** | Complete | `SKILL_Twitter_X_Post.md` with Playwright |
| ✅ **CEO Briefing System** | Complete | Weekly Monday reports from Odoo + Obsidian |
| ✅ **Ralph Wiggum Loop** | Complete | Autonomous loop with TASK_COMPLETE detection |
| ✅ **Audit Logging** | Complete | `audit_log.py` with JSON trails + recovery |
| ✅ **Error Recovery** | Complete | Retry policies with exponential backoff |
| ✅ **Enhanced Orchestrator** | Complete | Cross-domain, all skills, Ralph integration |
| ✅ **Dashboard Updates** | Complete | CEO Briefing section, real-time status |

### Gold Tier Usage Examples

#### Natural Language Commands

```bash
# Create an invoice
"Create an invoice for Acme Corp, $2,500 for web development services, due in 30 days"

# Check business health
"Show me today's business summary"

# Check inventory
"What products are running low on stock?"

# Financial overview
"What's our current cash flow situation?"

# Chain operations
"Create an invoice for John Doe $500 and email it to him"
```

#### Automated Workflows

| Workflow | Trigger | Actions |
|----------|---------|---------|
| **Sales Pipeline** | New email inquiry | Create lead → Draft response → Notify → Follow-up |
| **Invoice Lifecycle** | Invoice created | Validate → Email → Track → Follow-up if overdue |
| **Inventory Alert** | Low stock detected | Calculate reorder → Draft PO → Email vendor |
| **Monthly Report** | Scheduled (1st of month) | Gather data → Generate report → Email stakeholders |
| **Collections** | Invoice overdue | Send reminder → Escalate → Final notice |

### Gold Tier New Dependencies

```bash
# Install additional Python packages
pip install numpy pandas dateparser jsonschema psutil tabulate

# Optional: Advanced anomaly detection
pip install scikit-learn

# Optional: Fuzzy name matching
pip install python-Levenshtein
```

### Gold Tier Configuration (.env additions)

```bash
# Approval Thresholds
APPROVAL_THRESHOLD_INVOICE=500       # Auto-approve invoices under $500
APPROVAL_THRESHOLD_PO=1000           # Auto-approve POs under $1000

# Daily Summary Schedule
DAILY_SUMMARY_TIME=18:00             # 6 PM daily business summary

# LLM Cost Limits
LLM_COST_LIMIT_DAILY=5.00            # Max $5/day LLM spend

# NLU Settings
NLU_CONFIDENCE_THRESHOLD=0.7         # Minimum confidence to act without clarification
```

### Gold Tier Quick Start

```bash
# 1. Ensure Odoo is running
docker-compose -f odoo-docker/docker-compose.yml up -d

# 2. Test Odoo MCP connection
python3 odoo_mcp.py

# 3. Test NLU engine (once implemented)
python3 src/nlu_engine.py --test

# 4. Run a workflow
python3 src/workflow_engine.py --workflow sales_pipeline

# 5. Generate daily business summary
python3 src/business_summary.py

# 6. Run full Gold Tier test suite
python3 run_gold_test.py

# 7. Check system health
python3 src/health_check.py
```

### Gold Tier Documentation

| Document | Location |
|----------|----------|
| Complete Gold Tier Plan | [Plans/PLAN_GOLD_TIER.md](Plans/PLAN_GOLD_TIER.md) |
| Odoo MCP Guide | [ODOO_MCP_GUIDE.md](ODOO_MCP_GUIDE.md) |
| LLM Router Guide | [LLM_ROUTER_GUIDE.md](LLM_ROUTER_GUIDE.md) |
| Silver Tier Completion | [SILVER_TIER_COMPLETE.md](SILVER_TIER_COMPLETE.md) |

---

## 📁 Folder Structure

```
Digital_Employee/
├── Needs_Action/          # Incoming tasks requiring processing
├── Plans/                 # Generated action plans for each task
├── Pending_Approval/      # 🟠 Drafts awaiting human review
├── Approved/              # ✅ Ready for execution (auto-process)
├── Rejected/              # ❌ Rejected drafts (temp holding)
├── Done/                  # 🟢 Completed/archived tasks
├── Inbox/                 # Raw incoming items (pre-processing)
├── Logs/                  # System logs and history
├── Metrics/               # Performance metrics (JSON)
├── Agent_Skills/          # AI skill definitions
├── Skills/                # Custom skill modules
├── .obsidian/             # Obsidian vault configuration
├── Dashboard.md           # 🎛️ Central status & activity dashboard
├── Company_Handbook.md    # Rules, guidelines, and operating procedures
├── EMAIL_APPROVAL_WORKFLOW.md  # Email workflow documentation
├── SETUP_GUIDE.md         # 📖 Complete setup instructions
├── email_mcp.py           # 📧 Email sending MCP
├── linkedin_mcp.py        # 📱 LinkedIn publishing MCP
├── orchestrator.py        # 🧠 Silver Tier orchestrator (main brain)
├── gmail_watcher.py       # 👁️ Gmail monitor (30s interval)
├── filesystem_watcher.py  # 📂 File system monitor
├── setup_cron.py          # ⏰ Cron setup utility
└── run_silver_test.py     # 🧪 Test script for Silver Tier
```

---

## 🚀 Quick Start - Run Complete System

### Option 1: Manual Run (Testing)

```bash
cd /path/to/Digital_Employee

# 1. Test connections (optional)
python3 email_mcp.py test
python3 linkedin_mcp.py test

# 2. Run orchestrator (processes all pending items)
python3 orchestrator.py

# 3. View updated Dashboard
cat Dashboard.md
```

### Option 2: Full Automated Setup (Production) - RECOMMENDED

```bash
# Step 1: Install dependencies
pip install -r requirements.txt

# Step 2: Configure .env file with your credentials
# Edit .env and add: Gmail App Password, Twilio, LinkedIn tokens

# Step 3: Setup cron jobs and watchers (one command)
python3 setup_cron.py

# Step 4: Start background watchers
python3 setup_cron.py --start-tmux

# Step 5: Verify everything is running
python3 setup_cron.py --status
```

### Option 3: Hybrid Setup (Manual + Automated)

```bash
# Start watchers in tmux (continuous monitoring)
tmux new -d -s gmail_watcher "python3 gmail_watcher.py --continuous"

# Setup cron for orchestrator (every 5 minutes)
python3 setup_cron.py

# Verify tmux is running
tmux list-sessions
```

### Option 4: Run Test Suite

```bash
# Run complete Silver Tier test
python3 run_silver_test.py
```

📖 **For detailed setup instructions, see:** [SETUP_GUIDE.md](SETUP_GUIDE.md)

---

## 📧 How to Approve/Reject Emails & LinkedIn Posts

### Approval Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    APPROVAL WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Draft created → /Pending_Approval/                       │
│                                                              │
│  2. Human reviews file                                       │
│     ├── ✅ Approve: mv file Approved/ → Auto-send           │
│     ├── 🔄 Regenerate: mv file Needs_Action/ + notes        │
│     ├── ❌ Reject: mv file Rejected/ → Archive              │
│     └── ⏳ Pending: Keep in place → Review later            │
│                                                              │
│  3. After approval:                                          │
│     ├── email_mcp sends email                               │
│     ├── File moved to Done/                                 │
│     ├── "✅ Email Sent" note added                          │
│     └── Dashboard updated                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Quick Commands

```bash
# Approve an email/post (send it)
mv Pending_Approval/REPLY_*.md Approved/

# Approve a LinkedIn post
mv Pending_Approval/LINKEDIN_POST_*.md Approved/

# Reject a draft
mv Pending_Approval/<file>.md Rejected/

# Request regeneration (add notes first)
mv Pending_Approval/<file>.md Needs_Action/

# Run orchestrator to process approvals
python3 orchestrator.py
```

### Visual Status Guide

| Status | Color | Meaning |
|--------|-------|---------|
| 🔴 | Red | Needs immediate action |
| 🟠 | Orange | Awaiting your review |
| 🟡 | Yellow | Processing/Today's work |
| 🟢 | Green | Complete/All clear |
| ⚪ | Gray | No activity |

---

## 🛠️ Troubleshooting

### Email Not Sending

**Problem:** Emails logged but not sent

**Solutions:**
1. Check `DRY_RUN` in `.env` - set to `false` for production
2. Verify Gmail App Password (not regular password)
3. Test connection: `python3 email_mcp.py test`
4. Check logs: `cat Logs/email_log_*.md`

```bash
# .env configuration
SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
DRY_RUN=false  # Set to true for testing only
```

### Approval File Not Processing

**Problem:** File in Approved/ but not processed

**Solutions:**
1. Run orchestrator: `python3 orchestrator.py`
2. Check file has `.md` extension
3. Verify file content has email data (To, Subject, Body)
4. Check logs: `tail Logs/orchestrator.log`

### Dashboard Not Updating

**Problem:** Dashboard.md shows old data

**Solutions:**
1. Run orchestrator manually
2. Check no Python errors in output
3. Verify Dashboard.md is writable
4. Check logs for errors

### Gmail Watcher Not Working

**Problem:** New emails not creating tasks

**Solutions:**
1. Check tmux session: `tmux list-sessions`
2. Attach to view logs: `tmux attach -t gmail_watcher`
3. Verify Gmail API credentials in `.env`
4. Restart watcher: `python3 gmail_watcher.py --start`

---

## 📊 Dashboard Status Indicators

The Dashboard uses color-coded status for instant visibility:

### Quick Status Overview (Top of Dashboard)

| 🔴 Needs Action | 🟠 Pending Approval | 🟡 Sent Today | 🟢 Completed Today |
|:---------------:|:-------------------:|:-------------:|:------------------:|
| **0** | **2** | **0** | **5** |

**At a glance:**
- 🔴 **0** = No urgent tasks
- 🟠 **2** = Two items need your review
- 🟡 **0** = No emails sent yet today
- 🟢 **5** = Five tasks completed today

### Section Colors

- **🔴 High Priority** - Urgent tasks in Needs_Action
- **🟠 Pending Approvals** - Files awaiting your decision
- **🟡 Today's Completed** - What was done today

---

## 🧪 Testing

### Run Full Test Suite

```bash
python3 run_silver_test.py
```

This will:
1. Create test email task
2. Create test LinkedIn request
3. Run orchestrator
4. Show Dashboard summary
5. Verify all files created

### Manual Test Flow

```bash
# 1. Create test email task
cat > Needs_Action/test_email.md << 'EOF'
---
type: email
from: test@example.com
subject: Test Email
priority: high
---

This is a test email for Silver Tier validation.
EOF

# 2. Run orchestrator
python3 orchestrator.py

# 3. Check Pending_Approval folder
ls Pending_Approval/

# 4. Approve the draft
mv Pending_Approval/REPLY_test_email.md Approved/

# 5. Run orchestrator again (sends email in dry-run mode)
python3 orchestrator.py

# 6. Check Done folder and logs
ls Done/
cat Logs/email_log_$(date +%Y%m%d).md
```

---

## 📋 Environment Configuration

### Required (.env)

```bash
# Email Configuration
SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
SENDER_NAME=Your Name

# Dry-Run Mode (true = log only, false = actually send)
DRY_RUN=true

# Optional: SMTP Settings (defaults to Gmail)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587

# Gmail Watcher (if using)
GMAIL_WATCHER_ENABLED=false
```

### Get Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Generate 16-character password
4. Copy to `.env` as `EMAIL_PASSWORD`

---

## 📈 Metrics & Monitoring

### View Logs

```bash
# Orchestrator logs
tail -f Logs/orchestrator.log

# Email logs (today)
cat Logs/email_log_$(date +%Y%m%d).md

# Metrics JSON
cat Metrics/orchestrator_metrics.json
```

### Key Metrics

- Files processed per session
- Emails sent (success/failure)
- Approval workflow stats
- Processing times
- Error tracking

---

## 🎯 Daily Operations Checklist

### Morning Setup

```bash
# 1. Start Gmail watcher (if not running)
tmux new -d -s gmail_watcher "python3 gmail_watcher.py --start"

# 2. Run initial orchestrator
python3 orchestrator.py

# 3. Check Dashboard for pending approvals
cat Dashboard.md
```

### During Day

```bash
# Review pending approvals (as needed)
ls Pending_Approval/

# Approve items
mv Pending_Approval/<file>.md Approved/

# Re-run orchestrator
python3 orchestrator.py
```

### Evening Check

```bash
# 1. Run final orchestrator
python3 orchestrator.py

# 2. Review Dashboard
cat Dashboard.md

# 3. Check logs for errors
tail Logs/orchestrator.log
```

---

## 🔗 Documentation

| Document | Purpose |
|----------|---------|
| `Company_Handbook.md` | Rules and operating procedures |
| `EMAIL_APPROVAL_WORKFLOW.md` | Complete email workflow guide |
| `GMAIL_WATCHER_GUIDE.md` | Gmail watcher setup and usage |
| `Dashboard.md` | Live status dashboard |

---

**Hackathon:** Personal AI Employee Hackathon 2026
**Current Tier:** Silver ✅ Complete | Gold ✅ **COMPLETE**
**Version:** 5.0.0 (Gold Tier — Complete)
**Last Updated:** 2026-04-10
