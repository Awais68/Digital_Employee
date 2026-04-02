# Email Approval Workflow - Full Simulation Guide

**Silver Tier v4.0 - Human-in-the-Loop Email Integration**

This document walks through the complete email approval workflow from receiving an email to sending a reply.

---

## 📋 Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE EMAIL APPROVAL WORKFLOW                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  📥 INCOMING → 📝 DRAFT → 👁️ REVIEW → ✅ APPROVE → 📧 SEND → 📁 ARCHIVE  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Prerequisites

### 1. Environment Configuration

Create/update `.env` file in vault root:

```bash
# Email Configuration
SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
SENDER_NAME=Your Name

# Dry-Run Mode (RECOMMENDED for testing)
DRY_RUN=true

# SMTP Settings (optional - defaults to Gmail)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
```

### 2. Gmail App Password Setup

1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and your device
3. Generate 16-character app password
4. Copy to `.env` as `EMAIL_PASSWORD`

### 3. Verify Installation

```bash
# Test email connection
python3 email_mcp.py test

# Run orchestrator
python3 orchestrator.py
```

---

## 🎬 Full Simulation Flow

### Phase 1: New Email Arrives

**Trigger:** Gmail watcher detects new email

```
📧 Email: "AI Powered SaaS Required"
From: noreply@notifications.example.com
To: awaisniaz720@gmail.com
```

**Action:** Gmail watcher creates task file in `/Needs_Action/`

```
/Needs_Action/20260402_213815_email_re_ai_powered_saas_required.md
```

---

### Phase 2: Orchestrator Processes Task

**Command:** `python3 orchestrator.py`

**What Happens:**
1. Orchestrator scans `/Needs_Action/` folder
2. Detects email task type
3. Extracts email data (from, subject, body)
4. Generates reply draft using templates
5. Creates plan in `/Plans/`
6. **Creates approval file in `/Pending_Approval/`**

**Output:**
```
✅ Created plan: PLAN_20260402_213815_email_re_ai_powered_saas_required.md
✅ Created approval request: REPLY_20260402_213815_email_re_ai_powered_saas_required.md
📦 Moved: original file → Done/
```

---

### Phase 3: Human Review (PENDING_APPROVAL)

**File Location:** `/Pending_Approval/REPLY_*.md`

**Human Actions Available:**

| Action | File Movement | Result |
|--------|---------------|--------|
| ✅ **Approve** | Move to `/Approved/` | Email will be sent |
| 🔄 **Regenerate** | Move to `/Needs_Action/` | New draft requested |
| ❌ **Reject** | Move to `/Rejected/` | Draft discarded |
| ⏳ **Pending** | Keep in place | Review later |

**Example: Reviewing the Draft**

1. Open file in `/Pending_Approval/`
2. Read the proposed reply
3. Edit if needed (add notes in "Human Notes" section)
4. Decide on action

---

### Phase 4: Approval → Email Send

**Human Action:** Move file to `/Approved/`

```bash
# Example: Using file manager or terminal
mv "Pending_Approval/APPROVAL_TEST_REPLY.md" "Approved/"
```

**Orchestrator Detection:** Next run detects file in `/Approved/`

**Command:** `python3 orchestrator.py`

**What Happens:**
1. Orchestrator finds file in `/Approved/`
2. Extracts email data (to, subject, body)
3. Calls `email_mcp.send_email()`
4. Logs result

**Email MCP Actions:**
```python
# Inside orchestrator.py
from email_mcp import send_email

result = send_email(
    to="noreply@notifications.example.com",
    subject="Re: AI Powered SaaS Required",
    body="[Draft content...]"
)
```

**If DRY_RUN=true:**
```
🔍 DRY RUN - Email would be sent:
   To: noreply@notifications.example.com
   Subject: Re: AI Powered SaaS Required
   Body preview: Dear AI Powered SaaS Team...
```

**If DRY_RUN=false:**
```
✅ Email sent successfully
   Message-ID: <20260402234500@smtp.gmail.com>
```

---

### Phase 5: Post-Send Actions

**After Successful Send:**

1. **File moved to `/Done/`**
   ```
   Approved/APPROVAL_TEST_REPLY.md → Done/APPROVAL_TEST_REPLY.md
   ```

2. **Success note added:**
   ```markdown
   ---
   ## ✅ Email Sent
   - **Sent At:** 2026-04-02T23:45:00
   - **Status:** Delivered successfully
   ```

3. **Log entry created:**
   ```
   /Logs/email_log_20260402.md
   ```

4. **Dashboard updated:**
   - "Emails Sent Today" counter incremented
   - Pending Approvals list updated
   - Activity log updated

---

## 📊 Dashboard Updates

After each orchestrator run, Dashboard.md shows:

### Today's Email Activity

| Metric | Count | Status |
|--------|-------|--------|
| **Emails Sent Today** | **1** | 🟢 Active |
| **Pending Approval** | **3** | 🟡 Awaiting review |
| **Rejected Today** | **0** | 🟢 None |
| **Dry Run Mode** | **1** | 🔍 Testing |

### Pending Approvals Section

| # | File Name | Time | Action Required |
|---|-----------|------|-----------------|
| 1 | 📧 `APPROVAL_TEST_REPLY.md` | 23:45 | ✅ Approve / 🔄 Regenerate / ❌ Reject |

---

## 🔄 Alternative Flows

### Flow A: Regenerate Request

**Human Action:** Move to `/Needs_Action/` with notes

```markdown
## 📝 Human Notes

Please make the tone more formal and add availability for next week.
Also mention my rate card.

- Awais
```

**Orchestrator:** Creates new draft based on notes

---

### Flow B: Rejection

**Human Action:** Move to `/Rejected/`

**Orchestrator:**
1. Creates archive in `/Done/REJECTED_<filename>`
2. Removes original from workflow
3. Logs rejection

**Result:**
```
/Done/REJECTED_APPROVAL_TEST_REPLY.md
```

---

### Flow C: Pending Review

**Human Action:** Leave file in `/Pending_Approval/`

**Orchestrator:**
1. Logs pending status
2. Updates dashboard with pending count
3. No action taken

**Dashboard Note:**
```
⏳ `APPROVAL_TEST_REPLY.md` - Pending review since 2026-04-02 23:45
```

---

## 🧪 Testing the Workflow

### Test Scenario 1: Dry Run (Recommended First)

```bash
# 1. Ensure DRY_RUN=true in .env
echo "DRY_RUN=true" >> .env

# 2. Create test approval file (already done)
# File: Pending_Approval/APPROVAL_TEST_REPLY.md

# 3. Move to Approved to trigger send
mv Pending_Approval/APPROVAL_TEST_REPLY.md Approved/

# 4. Run orchestrator
python3 orchestrator.py

# 5. Check logs - email should be logged but not sent
cat Logs/email_log_$(date +%Y%m%d).md
```

**Expected Output:**
```
✅ Found 1 approved file(s) to process
🎉 Processing Approved: APPROVAL_TEST_REPLY.md
📧 Sending email via email_mcp.py:
   To: noreply@notifications.example.com
   Subject: Re: AI Powered SaaS Required
🔍 DRY RUN - Email logged but not sent
📦 Moved: APPROVAL_TEST_REPLY.md → Done/
```

---

### Test Scenario 2: Live Send

```bash
# 1. Set DRY_RUN=false in .env
# Edit .env: DRY_RUN=false

# 2. Create new test approval file
# (Copy APPROVAL_TEST_REPLY.md back to Pending_Approval)

# 3. Move to Approved
mv Pending_Approval/APPROVAL_TEST_REPLY.md Approved/

# 4. Run orchestrator
python3 orchestrator.py

# 5. Check email inbox for sent message
```

**⚠️ Warning:** This will actually send an email!

---

## 📁 File Locations Reference

| Folder | Purpose | Example Files |
|--------|---------|---------------|
| `/Needs_Action/` | New items to process | Incoming email tasks |
| `/Plans/` | Generated plans | `PLAN_*.md` |
| `/Pending_Approval/` | Awaiting human review | `REPLY_*.md`, `LINKEDIN_POST_*.md` |
| `/Approved/` | Ready for execution | Files moved here by human |
| `/Rejected/` | Temp holding for rejections | Files before archival |
| `/Done/` | Completed/archived | All processed files |
| `/Logs/` | Action logs | `email_log_*.md`, `orchestrator.log` |
| `/Metrics/` | System metrics | `orchestrator_metrics.json` |

---

## 🐛 Troubleshooting

### Issue: Email not sending

**Check:**
1. `DRY_RUN` is set to `false`
2. `SENDER_EMAIL` and `EMAIL_PASSWORD` are correct
3. Gmail App Password (not regular password)
4. SMTP connection: `python3 email_mcp.py test`

---

### Issue: Approval file not detected

**Check:**
1. File is in correct folder (`/Approved/`)
2. File has `.md` extension
3. Orchestrator was run after moving file

---

### Issue: Dashboard not updating

**Check:**
1. Orchestrator completed successfully
2. No errors in `/Logs/orchestrator.log`
3. Dashboard file is writable

---

## 📈 Metrics & Logging

### Email Log Format

```markdown
## ✅ Sent - Re: AI Powered SaaS Required

| Field | Value |
|-------|-------|
| **Time** | 2026-04-02T23:45:00 |
| **To** | noreply@notifications.example.com |
| **Subject** | Re: AI Powered SaaS Required |
| **Message ID** | <20260402234500@smtp.gmail.com> |
| **Status** | ✅ Sent |
```

### Orchestrator Metrics

Saved to `/Metrics/orchestrator_metrics.json`:
- Files processed
- Approvals created
- Emails sent
- Errors encountered
- Processing times

---

## 🎯 Best Practices

1. **Always test with DRY_RUN=true first**
2. **Review every draft** before approving
3. **Add human notes** when requesting regeneration
4. **Check logs daily** for any issues
5. **Archive rejected drafts** for record-keeping
6. **Monitor dashboard** for pending items

---

## 📞 Quick Reference Commands

```bash
# Test email connection
python3 email_mcp.py test

# Send email directly (bypass workflow)
python3 email_mcp.py send <to> <subject> <body>

# Run orchestrator once
python3 orchestrator.py

# Check Gmail watcher status
python3 gmail_watcher.py --status

# View orchestrator logs
tail -f Logs/orchestrator.log

# View email logs
cat Logs/email_log_$(date +%Y%m%d).md
```

---

*Last Updated: 2026-04-02*
*Digital Employee System - Silver Tier v4.0*
