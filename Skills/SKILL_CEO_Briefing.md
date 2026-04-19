---
skill_id: SKILL_CEO_Briefing
name: Weekly Monday Morning CEO Briefing
version: 1.0.0
tier: Platinum
description: Automated weekly CEO briefing combining Odoo accounting data, Obsidian task status, revenue analysis, bottleneck detection, and strategic suggestions
status: active
created: 2026-04-10
updated: 2026-04-10
author: Digital Employee System
reviewers: [Human-in-the-Loop]
schedule: Every Monday 08:00 AM
---

# SKILL_CEO_Briefing: Weekly Monday Morning CEO Briefing

## Overview

This skill generates a comprehensive weekly CEO briefing every Monday morning by aggregating financial data from Odoo accounting, task/project status from Obsidian notes, identifying operational bottlenecks, and producing actionable strategic suggestions. The briefing is saved as a structured Markdown file in `/Briefings/`.

## Purpose

- Consolidate weekly financial performance from Odoo
- Track task completion and project progress from Obsidian
- Identify operational bottlenecks and risks
- Generate data-driven strategic suggestions
- Provide executive-level summary for decision-making
- Archive briefings for historical trend analysis

## Schedule

| Parameter | Value |
|-----------|-------|
| **Frequency** | Weekly |
| **Day** | Monday |
| **Time** | 08:00 AM (local timezone) |
| **Trigger** | Cron job or manual `/Needs_Action/CEO_BRIEFING_*.md` |
| **Output** | `/Briefings/CEO_Briefing_YYYY-MM-DD.md` |

## Architecture

```
┌──────────────────────┐
│  Monday 08:00 AM     │
│  Cron / Trigger File │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│  1. Read Odoo Data   │
│  - Revenue (this wk) │
│  - Invoices          │
│  - Transactions      │
│  - Bank Balance      │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│  2. Read Obsidian    │
│  - Task completion   │
│  - Project status    │
│  - Blockers          │
│  - Upcoming deadlines│
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│  3. Analyze &        │
│  Correlate Data      │
│  - WoW growth        │
│  - Bottlenecks       │
│  - Risk factors      │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│  4. Generate Report  │
│  - Executive Summary │
│  - Revenue Section   │
│  - Tasks Section     │
│  - Bottlenecks       │
│  - Suggestions       │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────┐
│  5. Save to          │
│  /Briefings/         │
│  CEO_Briefing_       │
│  YYYY-MM-DD.md       │
└──────────────────────┘
```

## Configuration

### Obsidian Vault Path

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Vault Root** | User-defined (e.g., `~/ObsidianVault/` or `/path/to/vault/`) | Root of Obsidian notes |
| **Tasks Folder** | `Tasks/` or `Projects/` or user-configured | Where task notes live |
| **Date Format** | `YYYY-MM-DD` | Consistent date formatting |
| **Frontmatter** | YAML `status`, `priority`, `due_date`, `assignee` | Task metadata |

### Odoo Connection (via MCP)

Uses the existing `odoo-gold-tier` MCP server configured in `.mcp.json`:

```json
{
  "odoo-gold-tier": {
    "command": "python3",
    "args": ["/path/to/odoo_mcp.py"],
    "env": {
      "ODOO_URL": "http://localhost:8069",
      "ODOO_DB": "odoo",
      "ODOO_USERNAME": "awaisniaz720@gmail.com",
      "ODOO_PASSWORD": "<secure_password>"
    }
  }
}
```

## Data Sources

### 1. Odoo Accounting Data

The skill queries Odoo via MCP tools for:

| Data Point | MCP Tool | Purpose |
|------------|----------|---------|
| **Revenue This Week** | `get_accounting_summary` | Total invoiced revenue (current week vs prior week) |
| **Invoices Issued** | `get_accounting_summary` | Count and status of invoices |
| **Payments Received** | `get_recent_transactions` | Cash inflow tracking |
| **Outstanding Receivables** | `get_accounting_summary` | Unpaid invoices and aging |
| **Bank Balance** | `get_bank_balance` | Current liquidity position |
| **Recent Transactions** | `get_recent_transactions` | Top 20 transactions for review |
| **Expense Trends** | `get_accounting_summary` | Operating expense analysis |

#### Date Range Calculation

```
Current Week:    Monday (today - 7 days) → Sunday (yesterday)
Prior Week:      Monday (today - 14 days) → Sunday (today - 8 days)
Month-to-Date:   1st of current month → yesterday
Quarter-to-Date: 1st of current quarter → yesterday
```

### 2. Obsidian Task Data

The skill reads Obsidian vault notes to extract:

| Data Point | Source | Purpose |
|------------|--------|---------|
| **Completed Tasks** | Files with `status: done` or in `/Done/` | Weekly accomplishment count |
| **In-Progress Tasks** | Files with `status: in_progress` | Active work items |
| **Blocked Tasks** | Files with `status: blocked` or containing "BLOCKER" | Items needing attention |
| **Overdue Tasks** | Files with `due_date` in the past | Missed deadlines |
| **Upcoming Deadlines** | Files with `due_date` in next 7 days | Priority planning |
| **Project Notes** | Files in `/Projects/` folders | Strategic context |
| **Meeting Notes** | Files with `type: meeting_note` | Key decisions and action items |

#### Obsidian File Parsing Logic

```markdown
# Expected frontmatter in Obsidian task files:
---
title: "Task or Project Name"
status: [todo | in_progress | done | blocked | cancelled]
priority: [low | normal | high | urgent]
assignee: "Person or Agent Name"
due_date: 2026-04-14
created: 2026-04-01
updated: 2026-04-09
type: [task | project | meeting_note | idea]
tags: [tag1, tag2]
---
```

#### Search Patterns

```
Vault/Tasks/**/*.md          → All task files
Vault/Projects/**/*.md       → All project files
Vault/Daily Notes/**/*.md    → Daily notes (for meeting summaries)
Vault/Inbox/**/*.md          → Unprocessed items
```

## Analysis Logic

### Revenue Analysis

```python
# Week-over-Week Growth
revenue_growth = ((this_week_revenue - last_week_revenue) / last_week_revenue) * 100

# Invoice Conversion Rate
invoice_conversion = (paid_invoices / total_invoices) * 100

# Average Invoice Value
avg_invoice = total_revenue / invoice_count

# Outstanding Ratio
outstanding_ratio = (outstanding_amount / total_revenue) * 100

# Cash Flow Trend
cash_flow = payments_received - expenses_paid
```

### Bottleneck Detection

| Bottleneck Type | Detection Logic |
|-----------------|-----------------|
| **Cash Flow** | `bank_balance < 2 * monthly_expenses` |
| **Revenue Decline** | `revenue_growth < -10%` (WoW) |
| **Invoice Aging** | `outstanding_amount > 50% of total_revenue` |
| **Task Backlog** | `blocked_tasks > 5` OR `overdue_tasks > 3` |
| **Resource Overload** | Single assignee has `> 5 in_progress` tasks |
| **Project Delays** | Any task with `due_date` passed AND `status != done` |
| **Expense Spike** | `this_week_expenses > last_week_expenses * 1.3` |
| **Low Productivity** | `completed_tasks < 3` for the week |

### Suggestion Engine

| Condition | Suggestion |
|-----------|------------|
| Revenue declining | "Review pricing strategy and upsell to existing clients" |
| High outstanding invoices | "Initiate collections process for overdue invoices > 30 days" |
| Cash flow tight | "Delay non-critical expenses, accelerate invoice collections" |
| Task backlog growing | "Reassign tasks from overloaded agents, prioritize top 3" |
| Low completion rate | "Identify blockers, hold alignment meeting with team" |
| Revenue growing > 20% | "Consider scaling operations, hiring, or expanding services" |
| Single client > 40% revenue | "Diversify client base to reduce concentration risk" |
| No new clients this month | "Launch lead generation campaign or outreach initiative" |
| Expenses > 70% revenue | "Audit expenses, identify cost optimization opportunities" |
| All tasks on track | "Maintain momentum, plan next sprint goals" |

## Trigger Detection

The skill activates when:

1. **Scheduled**: Monday 08:00 AM via cron
2. **Manual**: File `/Needs_Action/CEO_BRIEFING_*.md` exists
3. **On-Demand**: Direct skill invocation via `/skill SKILL_CEO_Briefing`

### Manual Trigger Format

```markdown
---
type: ceo_briefing_request
priority: normal
created: 2026-04-14
period: weekly
custom_date_range:
  start: 2026-04-07
  end: 2026-04-13
focus_areas: [revenue, tasks, bottlenecks, suggestions]
---

# CEO Briefing Request

Generate weekly briefing for the period above.
```

## Execution Steps

### Step 1: Fetch Odoo Accounting Data

```python
# 1a. Get accounting summary for this week
accounting_summary = mcp.call("get_accounting_summary", {
    "period": "current_week",
    "start_date": this_week_monday,
    "end_date": today
})

# 1b. Get accounting summary for last week
last_week_summary = mcp.call("get_accounting_summary", {
    "period": "last_week",
    "start_date": last_week_monday,
    "end_date": last_week_sunday
})

# 1c. Get bank balance
bank_balance = mcp.call("get_bank_balance")

# 1d. Get recent transactions
transactions = mcp.call("get_recent_transactions", {
    "limit": 20,
    "date_from": this_week_monday
})
```

### Step 2: Read Obsidian Tasks

```python
# Scan vault for task files
tasks = []
for pattern in ["Vault/Tasks/**/*.md", "Vault/Projects/**/*.md"]:
    for file in glob(pattern):
        metadata = parse_yaml_frontmatter(file)
        if metadata and metadata.get("type") in ["task", "project"]:
            tasks.append({
                "title": metadata.get("title", file.stem),
                "status": metadata.get("status", "unknown"),
                "priority": metadata.get("priority", "normal"),
                "assignee": metadata.get("assignee", "Unassigned"),
                "due_date": metadata.get("due_date"),
                "file": file,
                "summary": extract_first_heading(file)
            })

# Categorize
completed = [t for t in tasks if t["status"] == "done"]
in_progress = [t for t in tasks if t["status"] == "in_progress"]
blocked = [t for t in tasks if t["status"] == "blocked"]
overdue = [t for t in tasks if t["due_date"] and t["due_date"] < today and t["status"] != "done"]
upcoming = [t for t in tasks if t["due_date"] and today <= t["due_date"] <= today + 7days]
```

### Step 3: Analyze & Generate Suggestions

```python
# Revenue metrics
this_week_revenue = accounting_summary["total_revenue"]
last_week_revenue = last_week_summary["total_revenue"]
revenue_growth = calculate_growth(this_week_revenue, last_week_revenue)

# Task metrics
completion_rate = len(completed) / max(len(tasks), 1) * 100
blocker_count = len(blocked)
overdue_count = len(overdue)

# Detect bottlenecks
bottlenecks = detect_bottlenecks({
    "revenue_growth": revenue_growth,
    "outstanding_ratio": outstanding_ratio,
    "blocked_tasks": blocker_count,
    "overdue_tasks": overdue_count,
    "bank_balance": bank_balance,
    "expenses": accounting_summary["total_expenses"]
})

# Generate suggestions
suggestions = generate_suggestions(bottlenecks, metrics)
```

### Step 4: Generate & Save Briefing

```python
# Generate briefing markdown
briefing = generate_briefing_template(
    period_start, period_end,
    odoo_data, task_data,
    bottlenecks, suggestions
)

# Save to /Briefings/
date_str = today.strftime("%Y-%m-%d")
output_path = f"/Briefings/CEO_Briefing_{date_str}.md"
write_file(output_path, briefing)

# Log
log_action("ceo_briefing", "generated", output_path)
```

## Output Format

### Briefing File (`/Briefings/CEO_Briefing_YYYY-MM-DD.md`)

```markdown
---
type: ceo_briefing
version: 1.0
generated: 2026-04-14T08:00:00
period: Weekly
week_start: 2026-04-07
week_end: 2026-04-13
data_sources: [odoo_accounting, obsidian_tasks]
skill_reference: SKILL_CEO_Briefing
classification: confidential
---

# CEO Weekly Briefing

**Period:** Monday, April 7 – Sunday, April 13, 2026
**Generated:** Monday, April 14, 2026 at 08:00 AM
**Prepared By:** Digital Employee System

---

## 📊 Executive Summary

> [AI-generated 2-3 sentence overview of the week's performance, highlighting key wins, concerns, and priorities for the week ahead.]

**Overall Health:** 🟢 Good / 🟡 Caution / 🔴 Attention Required

---

## 💰 Financial Performance

### Revenue Overview

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| **Total Revenue** | $XX,XXX | $XX,XXX | ↑/↓ X.X% |
| **Invoices Issued** | XX | XX | ↑/↓ X |
| **Payments Received** | $XX,XXX | $XX,XXX | ↑/↓ X.X% |
| **Avg. Invoice Value** | $X,XXX | $X,XXX | ↑/↓ X.X% |
| **Outstanding** | $X,XXX | $X,XXX | ↑/↓ X.X% |

### Revenue Trend

```
Week 1: $X,XXX  ▓▓▓▓▓▓▓▓░░
Week 2: $X,XXX  ▓▓▓▓▓▓░░░░
Week 3: $X,XXX  ▓▓▓▓▓▓▓░░░
Week 4: $X,XXX  ▓▓▓▓▓▓▓▓▓░  ← Current
```

### Cash Position

| Account | Balance |
|---------|---------|
| **Bank Balance** | $XX,XXX.XX |
| **Outstanding Receivables** | $X,XXX |
| **Net Cash Position** | $XX,XXX |

### Top Transactions This Week

| Date | Description | Amount | Type |
|------|-------------|--------|------|
| 2026-04-08 | Client ABC - Payment | +$5,000 | Revenue |
| 2026-04-09 | Server hosting | -$800 | Expense |
| 2026-04-10 | Client XYZ - Invoice | +$3,200 | Revenue |

---

## ✅ Task & Project Status

### Weekly Accomplishments

**Completed: X tasks** *(vs. X last week)*

| Task | Assignee | Priority | Notes |
|------|----------|----------|-------|
| [Task name] | [Person/Agent] | High | [Brief note] |

### Active Work

**In Progress: X tasks**

| Task | Assignee | Due Date | Status |
|------|----------|----------|--------|
| [Task name] | [Person/Agent] | 2026-04-XX | On Track / At Risk |

### ⚠️ Blocked & Overdue

**Blocked: X | Overdue: X**

| Task | Assignee | Issue | Days Overdue |
|------|----------|-------|--------------|
| [Task name] | [Person/Agent] | [Blocker description] | X days |

### Upcoming Deadlines (Next 7 Days)

| Task | Assignee | Due Date | Priority |
|------|----------|----------|----------|
| [Task name] | [Person/Agent] | 2026-04-XX | High |

---

## 🚨 Bottlenecks & Risks

### Identified Bottlenecks

| # | Bottleneck | Severity | Impact | Root Cause |
|---|-----------|----------|--------|------------|
| 1 | [Description] | 🔴 High / 🟡 Medium / 🟢 Low | [Business impact] | [Why it happened] |

### Risk Assessment

| Risk Area | Current | Threshold | Status |
|-----------|---------|-----------|--------|
| Cash Runway | X months | 3 months min | 🟢 Safe |
| Client Concentration | Top client X% | >40% concern | 🟡 Monitor |
| Task Completion Rate | X% | >70% target | 🟢 On Track |
| Outstanding Receivables | $X,XXX | >50% revenue | 🟡 Elevated |

---

## 💡 Strategic Suggestions

### Immediate Actions (This Week)

| # | Suggestion | Expected Impact | Effort | Priority |
|---|-----------|----------------|--------|----------|
| 1 | [Actionable suggestion] | High/Medium/Low | Low/Med/High | P0/P1/P2 |

### Medium-Term Initiatives (This Month)

| # | Initiative | Expected Outcome | Timeline |
|---|-----------|-----------------|----------|
| 1 | [Initiative description] | [Outcome] | Week X-X |

### Growth Opportunities

| # | Opportunity | Revenue Potential | Investment Required |
|---|------------|-------------------|--------------------|
| 1 | [Opportunity] | $X,XXX / X% growth | Time/Cost estimate |

---

## 📈 Key Metrics Dashboard

| KPI | Target | Actual | Status |
|-----|--------|--------|--------|
| Weekly Revenue | $XX,XXX | $XX,XXX | ✅/⚠️/❌ |
| Task Completion Rate | >70% | X% | ✅/⚠️/❌ |
| New Clients (Month) | X | X | ✅/⚠️/❌ |
| Outstanding Invoices | <30% | X% | ✅/⚠️/❌ |
| Blocked Tasks | 0 | X | ✅/⚠️/❌ |
| Cash Reserve | 3+ months | X months | ✅/⚠️/❌ |

---

## 🔮 Week Ahead Priorities

1. **[Priority 1]**: [Description and owner]
2. **[Priority 2]**: [Description and owner]
3. **[Priority 3]**: [Description and owner]

---

## 📝 Notes & Observations

> [AI-generated observations, trends, anomalies, or contextual notes that don't fit other sections.]

---

*Briefing generated by SKILL_CEO_Briefing v1.0.0 (Platinum Tier)*
*Data sourced from Odoo Accounting + Obsidian Vault*
*Classification: Confidential — For Executive Review Only*
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ODOO_CONNECTION_FAILED` | Odoo server not running | Retry 3x, log error, generate partial briefing |
| `ODOO_AUTH_FAILED` | Invalid credentials | Alert admin, use cached data if available |
| `OBSIDIAN_VAULT_NOT_FOUND` | Vault path doesn't exist | Use default path, prompt user for correction |
| `NO_TASK_FILES` | No tasks in Obsidian | Note in briefing: "No task data found this period" |
| `NO_REVENUE_DATA` | Zero invoices/transactions | Note in briefing: "No revenue activity this period" |
| `MALFORMED_FRONTMATTER` | Invalid YAML in task file | Skip file, log warning, continue |
| `DATE_RANGE_ERROR` | Invalid date calculation | Default to last 7 days, log warning |
| `BRIEFING_WRITE_FAILED` | Cannot write to /Briefings/ | Create directory, retry, fallback to /Done/ |
| `MCP_TIMEOUT` | MCP server unresponsive | Retry with 30s timeout, proceed with available data |

## Logging Schema

**Log File:** `/Logs/ceo_briefing.log`

```json
{
  "timestamp": "2026-04-14T08:00:00Z",
  "event": "briefing_generated",
  "status": "success | partial | failed",
  "period_start": "2026-04-07",
  "period_end": "2026-04-13",
  "output_file": "/Briefings/CEO_Briefing_2026-04-14.md",
  "data_sources": {
    "odoo_connected": true,
    "obsidian_connected": true,
    "revenue_data_retrieved": true,
    "tasks_retrieved": true
  },
  "metrics": {
    "revenue_this_week": 15000.00,
    "revenue_last_week": 12500.00,
    "growth_pct": 20.0,
    "tasks_completed": 8,
    "tasks_blocked": 2,
    "tasks_overdue": 1,
    "bottlenecks_identified": 3,
    "suggestions_generated": 5
  },
  "execution_time_seconds": 12.5,
  "error_code": null,
  "error_message": null
}
```

## Cron Setup

To automate weekly Monday morning generation, add to crontab:

```bash
# Weekly CEO Briefing - Every Monday at 8:00 AM
0 8 * * 1 cd /path/to/Digital_Employee && python3 scripts/ceo_briefing.py >> Logs/ceo_briefing.log 2>&1
```

Or via systemd timer (recommended for Docker environments):

```ini
# /etc/systemd/system/ceo-briefing.timer
[Unit]
Description=Weekly CEO Briefing Timer

[Timer]
OnCalendar=Mon *-*-* 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/ceo-briefing.service
[Unit]
Description=Generate Weekly CEO Briefing

[Service]
Type=oneshot
WorkingDirectory=/path/to/Digital_Employee
ExecStart=python3 scripts/ceo_briefing.py
```

## MCP Integration

### Required MCP Tools

| Tool | Source | Purpose |
|------|--------|---------|
| `get_accounting_summary` | odoo-gold-tier | Revenue, expenses, invoice counts |
| `get_bank_balance` | odoo-gold-tier | Cash position |
| `get_recent_transactions` | odoo-gold-tier | Transaction details |
| File read/write (Obsidian) | Native vault access | Task data |

### Execution via MCP Client

```python
# Pseudocode for briefing generation
def generate_ceo_briefing():
    today = datetime.now()
    period_start = today - timedelta(days=today.weekday(), weeks=1)
    period_end = period_start + timedelta(days=6)

    # Fetch Odoo data
    accounting = mcp.odoo.get_accounting_summary(period_start, period_end)
    bank = mcp.odoo.get_bank_balance()
    transactions = mcp.odoo.get_recent_transactions(limit=20, date_from=period_start)

    # Fetch Obsidian tasks
    tasks = scan_vault_for_tasks(period_start, period_end)

    # Analyze
    metrics = calculate_metrics(accounting, bank, tasks)
    bottlenecks = detect_bottlenecks(metrics)
    suggestions = generate_suggestions(bottlenecks, metrics)

    # Generate briefing
    briefing = render_briefing_template(
        period_start, period_end,
        accounting, bank, transactions,
        tasks, metrics, bottlenecks, suggestions
    )

    # Save
    date_str = today.strftime("%Y-%m-%d")
    output = f"/Briefings/CEO_Briefing_{date_str}.md"
    write_file(output, briefing)

    # Log
    log_event("ceo_briefing", "generated", output)

    return output
```

## Best Practices

1. **Consistency**: Generate at the same time every Monday
2. **Completeness**: Include all data sources even if empty (note absence)
3. **Actionability**: Every bottleneck should have a corresponding suggestion
4. **Brevity**: Keep executive summary to 2-3 sentences; details in sections
5. **Trend Context**: Always compare to prior week and month-to-date
6. **Classification**: Mark as confidential; restrict access
7. **Archive**: Never delete past briefings; maintain for trend analysis
8. **Accuracy**: Cross-check revenue figures between Odoo and briefing
9. **Objectivity**: Flag issues without blame; focus on solutions
10. **Follow-Up**: Reference previous briefing's suggestions and track resolution

## Security Considerations

| Aspect | Recommendation |
|--------|----------------|
| **Access** | Restrict `/Briefings/` to authorized personnel only |
| **Storage** | Encrypt at rest if cloud-synced |
| **Transmission** | Use secure channels if emailing briefing |
| **Classification** | Mark all briefings as "Confidential" |
| **Retention** | Archive quarterly; retain for minimum 1 year |
| **Audit** | Log all briefing generation and access events |

## Related Files

| File | Purpose |
|------|---------|
| `/Skills/SKILL_CEO_Briefing.md` | This skill definition |
| `/Briefings/CEO_Briefing_*.md` | Generated briefing files |
| `/Needs_Action/CEO_BRIEFING_*.md` | Manual trigger files |
| `/Logs/ceo_briefing.log` | Generation audit log |
| `/Company_Handbook.md` | Platinum Tier Rules & Approval Workflow |
| `/odoo_mcp.py` | Odoo MCP server |
| `.mcp.json` | MCP server configuration |

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-04-10 | Initial release with Odoo + Obsidian integration, bottleneck detection, suggestion engine | Digital Employee System |

---

*Part of Platinum Tier Digital Employee System*
*Automated Weekly CEO Briefing — Every Monday 08:00 AM*
*Data Sources: Odoo Accounting + Obsidian Vault*
*Classification: Confidential — For Executive Review Only*
