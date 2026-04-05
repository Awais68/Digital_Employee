# Company Handbook – Rules of Engagement

**Core Rules:**
- Always be polite and professional
- Flag any payment > $100 for human approval
- Reply to messages within 24 hours
- Never send money without approval file
- Log every action in /Done folder

---

## ⚠️ CRITICAL: WhatsApp Human-in-the-Loop Rule

**All WhatsApp replies MUST go through Human-in-the-Loop approval. NEVER auto-send WhatsApp messages.**

WhatsApp has strict API rate limits. Sending messages too fast will trigger:
> `"api rate limit exceed please try again later"` — and may lead to account bans.

### WhatsApp Approval Workflow

```
1. WhatsApp message received → whatsapp_watcher.py → /Needs_Action/
2. Orchestrator creates reply draft → /Pending_Approval/ (WHATSAPP_*.md)
3. Human reviews draft content
   ├── ✅ Approve → Move to /Approved/ → Human sends manually via WhatsApp Web
   ├── 🔄 Edit & Approve → Edit draft, move to /Approved/ → Human sends manually
   ├── ❌ Reject → Move to /Rejected/ → No reply sent
   └── ⏳ Pending → Keep in /Pending_Approval/ → Review later
4. Orchestrator logs approval and moves file to /Done/
5. Human sends the reply MANUALLY via WhatsApp Web (no auto-send)
```

### WhatsApp Safety Rules

| Rule | Description |
|------|-------------|
| **1. NO Auto-Send** | WhatsApp replies are NEVER sent automatically by the orchestrator |
| **2. Human Approval Required** | Every draft MUST be reviewed and approved by moving to /Approved/ |
| **3. Manual Send** | Human sends the reply manually via WhatsApp Web after approval |
| **4. 60-Second Delay** | Minimum 60 seconds between processing WhatsApp tasks (rate limit safety) |
| **5. One at a Time** | Maximum 1 WhatsApp message processed per 60 seconds |
| **6. Log Everything** | All actions logged in /Logs/ and /Done/ |

### Why This Matters

WhatsApp aggressively rate-limits automated messages. Even with approval, replies must be:
- Sent manually by the human (not by any script)
- Spaced at least 60 seconds apart
- Reviewed for appropriateness before sending

---

## Silver Tier Rules – Approval Workflow

### Approval Categories

| Category | Threshold | Action Required |
|----------|-----------|-----------------|
| **Payments** | > $100 | Human approval required |
| **Emails** | Any external | Human approval required |
| **WhatsApp** | Any reply | Human approval required + Manual send only |
| **LinkedIn Posts** | Any public post | Human approval required |
| **File Deletions** | Any permanent delete | Human approval required |
| **API Calls** | Paid APIs | Human approval required |

### Approval Process Flow

```
1. Item identified → /Needs_Action/
2. Draft created → /Plans/
3. Ready for review → /Pending_Approval/
4. Human reviews and approves → /Approved/
5. Action executed → /Done/
```

---

## 📧 Email Approval Rules (Silver Tier v2.0)

### Golden Rule: ALL Outgoing Emails Require Approval

**Never send an email without human review and approval.**

### Email Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMAIL APPROVAL WORKFLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. New email received → Gmail Watcher → /Needs_Action/         │
│                                                                  │
│  2. Orchestrator creates reply draft → /Pending_Approval/       │
│                                                                  │
│  3. Human reviews draft content                                 │
│     ├── ✅ Approve → Move to /Approved/                         │
│     ├── 🔄 Regenerate → Add notes, move to /Needs_Action/       │
│     ├── ❌ Reject → Move to /Rejected/                          │
│     └── ⏳ Pending → Keep in /Pending_Approval/                  │
│                                                                  │
│  4. If Approved:                                                │
│     ├── email_mcp.py sends email                                │
│     ├── File moved to /Done/ with "✅ Email Sent" note          │
│     └── Logged in /Logs/email_log_YYYYMMDD.md                   │
│                                                                  │
│  5. If Rejected:                                                │
│     ├── Archived to /Done/ as REJECTED_<filename>               │
│     └── Original removed from workflow                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Email MCP Configuration

Email sending is handled by `email_mcp.py` with the following setup:

**Environment Variables (.env):**
```bash
# Email Configuration
SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
SENDER_NAME=Your Name

# Dry-Run Mode (for testing)
DRY_RUN=true  # Set to 'false' for actual sending

# SMTP Settings (optional - defaults to Gmail)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
```

**Gmail App Password Setup:**
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Generate app password
4. Copy to `.env` as `EMAIL_PASSWORD`

### Email Approval File Structure

Files in `/Pending_Approval/` follow this format:

```markdown
---
type: approval_request
action: send_email_reply
status: pending
priority: high
created: 2026-04-02T23:30:00
original_file: original_email.md
---

# ✅ Approval Required: Email Reply

## 📋 Original Email
**Subject:** Re: AI Powered SaaS Required
**From:** sender@example.com
**Intent:** Meeting Request

## 📧 Proposed Reply
**To:** sender@example.com
**Subject:** Re: AI Powered SaaS Required

[Draft content in code block]

## 🎯 Action Buttons
| Action | Destination | Description |
|--------|-------------|-------------|
| ✅ Approve | /Approved/ | Send this reply |
| 🔄 Regenerate | /Needs_Action/ | Request new draft |
| ❌ Reject | /Rejected/ | Discard draft |
| ⏳ Pending | /Pending_Approval/ | Review later |
```

### Email Sending Rules

| Rule | Description |
|------|-------------|
| **1. No Auto-Send** | Emails are NEVER sent automatically |
| **2. Human Review** | Every draft MUST be reviewed by a human |
| **3. Approval Movement** | Only move to /Approved/ when ready to send |
| **4. Dry-Run First** | Test with DRY_RUN=true before production |
| **5. Log Everything** | All sends logged in /Logs/email_log_*.md |
| **6. Track Thread** | Preserve In-Reply-To and Thread-ID headers |

### Rejection Handling

When a draft is rejected:
1. File moved to `/Rejected/` folder
2. Orchestrator creates archive in `/Done/REJECTED_<filename>`
3. Original file removed from workflow
4. Rejection recorded in daily log

### Pending Review Handling

When a draft remains pending:
1. File stays in `/Pending_Approval/`
2. Dashboard shows pending count and file names
3. Orchestrator logs pending status with timestamp
4. No action taken until human decides

---

## LinkedIn Post Approval Rules (Silver Tier)

### LinkedIn Workflow

```
Trigger → Generate Post → /Pending_Approval/ → Human Review → Publish
```

### Post Requirements

1. **All LinkedIn posts require human review** before publishing
2. Draft posts saved in `/Pending_Approval/` with `LINKEDIN_POST_` prefix
3. Posts include:
   - Professional tone
   - 3-5 relevant hashtags with reach estimates
   - Clear call-to-action (when applicable)
   - Engagement metrics preview

### Approval Actions

| Action | Result |
|--------|--------|
| ✅ Approve | Move to /Approved/ for publishing |
| 🔄 Regenerate | Add notes, move to /Needs_Action/ |
| ❌ Reject | Archive to /Done/ |
| ⏳ Pending | Keep for later review |

---

## General Approval Guidelines

### Never Bypass Approval

**Silver tier ALWAYS requires human sign-off** for:
- External communications (email, LinkedIn)
- Financial transactions (>$100)
- Permanent deletions
- Paid API usage

### Clear Documentation

Each approval file must include:
- ✅ What action is being requested
- 📋 Full content for review
- 🎯 Clear action buttons/instructions
- 📝 Space for human notes

### Timestamp Everything

All actions are logged with:
- Creation timestamp
- Approval/rejection timestamp
- Execution timestamp
- Actor (human or system)

### Audit Trail

All actions are traceable through:
- `/Logs/` folder - Detailed action logs
- `/Done/` folder - Completed items with status
- `/Metrics/` folder - System metrics and history

---

## Emergency Override

In rare cases requiring immediate action:

1. **Document the emergency** in the file
2. **Send notification** to human supervisor
3. **Log the override reason** in `/Logs/emergency_override.md`
4. **Retroactive approval** required within 24 hours

### Emergency Log Format

```markdown
## Emergency Override - [DATE]

- **Action Taken:** [What was done]
- **Reason:** [Why emergency override was needed]
- **Notified:** [Who was notified]
- **Retroactive Approval:** [ ] Pending [ ] Approved
```

---

## Folder Structure Reference

```
Digital_Employee/
├── Inbox/              # Raw incoming emails (Gmail)
├── Needs_Action/       # New items requiring processing
├── Plans/              # Generated plans and strategies
├── Pending_Approval/   # ⏳ Awaiting human decision
├── Approved/           # ✅ Ready for execution
├── Rejected/           # ❌ Rejected items (temp)
├── Done/               # 📁 Completed/archived items
├── Logs/               # 📝 Action logs
└── Metrics/            # 📊 System metrics
```

---

## Quick Reference Commands

| Command | Description |
|---------|-------------|
| `python3 orchestrator.py` | Run main orchestration loop |
| `python3 email_mcp.py test` | Test email connection |
| `python3 email_mcp.py send <to> <subject> <body>` | Send email directly |
| `python3 gmail_watcher.py --start` | Start Gmail monitoring |
| `python3 gmail_watcher.py --status` | Check watcher status |
| `python3 whatsapp_watcher.py --first-run` | First WhatsApp run (QR scan) |
| `python3 whatsapp_watcher.py --start` | Start WhatsApp monitor in tmux |
| `python3 whatsapp_watcher.py --status` | Check WhatsApp watcher status |

---

*Last Updated: 2026-04-02*
*Digital Employee System - Silver Tier v4.0*
