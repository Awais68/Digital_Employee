# 📧 SKILL: Email Draft & Approval System

**Tier:** Silver v4.0  
**Type:** Human-in-the-Loop Workflow  
**Status:** Production Ready

---

## 🎯 Overview

This skill enables the Digital Employee to automatically generate professional email reply drafts and route them through a human approval workflow before sending.

### Key Features

- ✅ Automatic reply draft generation
- ✅ Intent detection (meeting request, urgent, general inquiry, etc.)
- ✅ Professional template-based responses
- ✅ Human-in-the-Loop approval workflow
- ✅ Clear Approve/Regenerate/Reject actions
- ✅ Audit trail and tracking

---

## 📁 Folder Structure

```
Digital_Employee/
├── Needs_Action/           # Incoming tasks (from Gmail Watcher)
├── Plans/                  # Generated plans with reply drafts
├── Pending_Approval/       # Awaiting human decision
├── Approved/               # Human approved → Ready to send
├── Rejected/               # Human rejected → Discarded
├── Done/                   # Completed actions
└── Dashboard.md            # Central control panel
```

---

## 🔄 Workflow

### Step 1: Email Received

```
Gmail (via gmail_watcher.py)
    ↓
Creates: /Needs_Action/{timestamp}_email_{subject}.md
    ↓
Contains: YAML frontmatter + email content
```

### Step 2: Orchestrator Processing

```
orchestrator.py scans /Needs_Action/
    ↓
1. Reads email content
2. Detects task type (email)
3. Extracts sender info
4. Generates reply draft
5. Creates Plan file
6. Creates Approval file
7. Moves original to /Done/
```

### Step 3: Human Review

```
Human opens: /Pending_Approval/REPLY_{filename}.md
    ↓
Reviews proposed reply
    ↓
Selects action:
├── Move to /Approved/ → Send email
├── Move to /Needs_Action/ → Regenerate (add notes)
└── Move to /Rejected/ → Discard draft
```

### Step 4: Execution

```
orchestrator.py checks /Approved/
    ↓
Finds approved reply
    ↓
Triggers email_mcp.py to send
    ↓
Moves to /Done/
```

---

## 📝 Reply Draft Templates

### 1. Meeting Request

```
Dear {sender_name},

Thank you for reaching out regarding {subject_topic}.

I would be happy to schedule a meeting to discuss this further. 
Please let me know your availability for the following time slots:

- {date_option_1}
- {date_option_2}
- {date_option_3}

Alternatively, please feel free to suggest a time that works best for you.

Looking forward to our conversation.

Best regards,
{my_name}
{my_title}
```

### 2. SaaS Developer Response

```
Dear {sender_name},

Thank you for considering me for the Agent/Developer position at {company_name}.

I am excited about the opportunity to work on AI integration and SaaS development.
I would be available for a meeting this week to discuss:

1. Project requirements and scope
2. Technical stack and architecture
3. Timeline and deliverables
4. Collaboration framework

Please let me know your preferred meeting time. I am flexible and can accommodate
your schedule.

Looking forward to contributing to your team's success.

Best regards,
{my_name}
{my_title}
```

### 3. Urgent Action

```
Dear {sender_name},

I acknowledge receipt of your urgent request regarding {subject_topic}.

I am prioritizing this matter and will {action_commitment} by {deadline}.

Should you need immediate assistance, please don't hesitate to contact me directly.

Best regards,
{my_name}
{my_title}
```

### 4. General Inquiry

```
Dear {sender_name},

Thank you for your email regarding {subject_topic}.

I appreciate you reaching out. {positive_acknowledgment}

Please let me know if you need any additional information from my end.

Best regards,
{my_name}
{my_title}
```

---

## 🎯 Intent Detection Rules

| Intent | Keywords | Template |
|--------|----------|----------|
| `meeting_request` | meeting, schedule, available, time, call | Meeting Request |
| `urgent_action` | urgent, asap, immediately, deadline | Urgent Action |
| `saas_developer_response` | saas, developer, agent, position, company, cto | SaaS Developer |
| `general_inquiry` | (default) | General Inquiry |

---

## 📋 Approval File Structure

```markdown
---
type: approval_request
action: send_email_reply
status: pending
priority: high
created: 2026-04-02T21:00:00
original_file: 20260402_213815_email_re_ai_powered_saas_required.md
---

# ✅ Approval Required: Email Reply

## 📋 Original Email

**Subject:** Re: AI Powered SaaS Required
**From:** funter boy <bfunter87@gmail.com>
**Intent:** Saas Developer Response

---

## 📧 Proposed Reply

**To:** funter boy <bfunter87@gmail.com>
**Subject:** Re: AI Powered SaaS Required

[Draft content...]

---

## 🎯 Action Buttons

| Action | Destination | Description |
|--------|-------------|-------------|
| ✅ **Approve** | `/Approved/` | Send this reply via email_mcp.py |
| 🔄 **Regenerate** | `/Needs_Action/` | Add notes and request new draft |
| ❌ **Reject** | `/Rejected/` | Discard this draft |
| ⏳ **Pending** | `/Pending_Approval/` | Keep for later review |

---

## 📝 Human Notes

*Add any comments, edits, or instructions here:*

```

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Sender Information
SENDER_NAME=Awais Niaz
SENDER_EMAIL=awaisniaz720@gmail.com
SENDER_TITLE=CTO / AI Engineer

# Orchestrator Settings
ORCHESTRATOR_INTERVAL=30
```

### Customizing Templates

Edit `EMAIL_TEMPLATES` dictionary in `orchestrator.py`:

```python
EMAIL_TEMPLATES = {
    "custom_intent": """
Dear {sender_name},
...
""",
}
```

---

## 📊 Dashboard Integration

The Dashboard.md shows:

- 🔴 High Priority items
- 🟠 Medium Priority items
- 🟡 Low Priority items
- ⏳ Pending Approvals with actions

---

## 🚀 Commands

### Run Orchestrator

```bash
python3 orchestrator.py
```

### Check Dashboard

```bash
cat Dashboard.md
```

### View Pending Approvals

```bash
ls -la Pending_Approval/
```

### Process Approved Items

```bash
# Orchestrator automatically checks /Approved/
python3 orchestrator.py
```

---

## 📈 Metrics Tracked

| Metric | Description |
|--------|-------------|
| `files_processed` | Total files processed from Needs_Action |
| `approvals_created` | Reply drafts generated |
| `approvals_triggered` | Approved replies sent |
| `errors` | Processing errors |
| `task_types` | Breakdown by type (email, document, etc.) |
| `avg_processing_time` | Average time per file |

---

## 🔐 Security Notes

- All drafts require human approval before sending
- Original email content preserved in Plans/
- Rejected drafts archived in Rejected/
- Full audit trail in Dashboard.md

---

## 🛠️ Troubleshooting

### Draft Not Generated

Check if email data was extracted:
```bash
cat Plans/PLAN_*.md | grep -A 20 "Proposed Reply Draft"
```

### Approval File Missing

Verify orchestrator detected email task type:
```bash
cat Logs/orchestrator.log | grep "Email detected"
```

### Email Not Sending

Check email_mcp.py integration (currently logs only):
```bash
cat Logs/orchestrator.log | grep "Triggering email send"
```

---

## 📞 Integration Points

| Component | File | Purpose |
|-----------|------|---------|
| Gmail Watcher | `gmail_watcher.py` | Fetches emails → Needs_Action |
| Orchestrator | `orchestrator.py` | Generates drafts + approvals |
| Email MCP | `email_mcp.py` | Sends approved emails (TODO) |
| Dashboard | `Dashboard.md` | Central control panel |

---

## 🎓 Example Flow

### Input Email
```
From: funter boy <bfunter87@gmail.com>
Subject: Re: AI Powered SaaS Required

We love to hear from you.

On Thu, Apr 2, 2026 at 9:19 PM:
> Hi, I'm Manager of AS Developers and I need a special Agent/Developer
> for our Running Company to Deal With SaaS and use AI integration.
> Are you Available for meeting in This Week.
```

### Generated Approval File
```
Pending_Approval/REPLY_20260402_213815_email_re_ai_powered_saas_required.md
```

### Human Action
→ Move to `/Approved/` to send
→ Add notes and move to `/Needs_Action/` to regenerate
→ Move to `/Rejected/` to discard

---

*Generated by Silver Tier Orchestrator v4.0*
*Documentation: SKILL_Email_Draft_And_Approval.md*
