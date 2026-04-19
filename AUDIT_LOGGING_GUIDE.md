# Audit Logging & Error Recovery System

## Overview

Comprehensive JSON-based audit logging with error recovery is now integrated across all components of the Digital Employee system.

## Architecture

### Core Components

1. **audit_log.py** - Central audit logging infrastructure
   - `AuditLogManager` - Manages audit log entries with rotation and querying
   - `AuditEntry` - Immutable audit entry builder with integrity hashing
   - `ErrorRecoveryManager` - Handles error recovery with configurable retry policies
   - `RetryPolicy` - Configurable retry policy with exponential backoff

2. **Audit Log Files** (stored in `Logs/audit/`)
   - `audit_log.json` - Main audit log index (max 10,000 entries before rotation)
   - `audit_errors.json` - Error-specific log (max 5,000 entries)
   - `audit_recovery.json` - Recovery action log (max 5,000 entries)
   - `*.archive.N.json` - Rotated archive files

### Audit Categories

All operations are categorized using `AuditCategory` enum:
- `ORCHESTRATOR` - Orchestrator operations (file processing, approvals, workflow)
- `EMAIL` - Email MCP operations (send, template, validation)
- `LINKEDIN` - LinkedIn MCP operations (API posts, Playwright automation)
- `ODOO` - Odoo MCP operations (customers, invoices, sales, accounting)
- `WHATSAPP` - WhatsApp operations (replies, approvals)
- `APPROVAL` - Approval workflow operations
- `WORKFLOW` - General workflow operations
- `SYSTEM` - System-level operations
- `NLU` - Natural language understanding operations
- `FINANCE` - Finance-related operations

### Audit Levels

Each entry has a severity level using `AuditLevel` enum:
- `INFO` - Informational messages (scan results, state changes)
- `SUCCESS` - Successful operations (file processed, email sent)
- `WARNING` - Recoverable issues (fallback used, retry attempt)
- `ERROR` - Failed operations (validation errors, network failures)
- `CRITICAL` - Critical failures requiring manual intervention

## Integration Points

### 1. Orchestrator (`orchestrator.py`)

**Operations Logged:**
- Session start/end
- File scan operations (Needs_Action folder)
- File processing (start, completion, errors)
- Task type detection
- File moves (source → destination with duration)
- File reads (with encoding fallback tracking)
- Email sending via approval workflow
- LinkedIn post publishing (Playwright + API fallback)
- Approval workflow (create, approve, reject)
- Ralph Wiggum Loop delegation
- Dashboard updates
- Batch processing completion

**Correlation IDs:**
- Each file gets a unique `correlation_id` for tracing
- Batch operations have parent correlation ID
- Enables full audit trail from trigger to completion

**Example Audit Entry:**
```json
{
  "entry_id": "uuid",
  "timestamp": "2026-04-10T05:54:01.285408+00:00",
  "category": "orchestrator",
  "level": "SUCCESS",
  "action": "file_move",
  "correlation_id": "file-uuid",
  "source": "orchestrator",
  "details": {
    "source": "/path/Needs_Action/task.md",
    "destination": "/path/Done/task.md",
    "source_name": "task.md",
    "destination_folder": "Done"
  },
  "duration_ms": 12.45,
  "integrity_hash": "sha256hash"
}
```

### 2. Odoo MCP (`odoo_mcp.py`)

**Operations Logged:**
- Tool calls via `_handle_tools_call` (all 7 tools)
  - `create_customer`
  - `create_invoice`
  - `create_sale_order`
  - `get_bank_balance`
  - `get_accounting_summary`
  - `get_recent_transactions`
  - `create_journal_entry`
- Authentication events
- XML-RPC faults
- Success/failure per tool invocation

**Audit Features:**
- Arguments logged (truncated to 100 chars per value)
- Full error context with exception type and message
- Correlation with orchestrator via shared audit manager

**Example:**
```python
# In _handle_tools_call
audit = get_audit_manager()
entry = AuditEntry(
    category=AuditCategory.ODOO,
    level=AuditLevel.INFO,
    action=f"tool_call.{tool_name}",
    details={"arguments": {k: str(v)[:100] for k, v in arguments.items()}},
    source="odoo_mcp",
)
audit.log(entry)
```

### 3. Email MCP (`email_mcp.py`)

**Operations Logged:**
- Send email attempts (with recipient, subject, priority)
- Send email success (with message_id, recipient count)
- Authentication failures
- SMTP connection errors
- Validation errors (invalid recipients, missing credentials)
- Dry-run mode events
- Template operations (load, create, save)

**Audit Helper:**
```python
def _audit_log(self, level: str, action: str, details: dict = None, error: dict = None):
    """Helper to log audit entries."""
    if self.audit:
        audit_level = getattr(AuditLevel, level.upper(), AuditLevel.INFO)
        entry = AuditEntry(
            category=AuditCategory.EMAIL,
            level=audit_level,
            action=action,
            details=details or {},
            error=error,
            source="email_mcp",
        )
        self.audit.log(entry)
```

### 4. LinkedIn MCP (`linkedin_mcp.py`)

**Operations Logged:**
- Post creation attempts (content preview, length)
- Post creation success (with post URL, method used)
- API errors (with HTTP status, error message)
- Network errors
- Token refresh events
- Session expiration detection
- Auto-recovery actions

**Audit Integration:**
- Content length and preview logged
- Method tracking (API vs Playwright)
- Post URL captured for success cases
- Full error context for failures

### 5. LinkedIn Playwright MCP (`SKILL_LInkedin_Playwright_MCP.py`)

**Operations Logged:**
- Post validation (empty content, character limit)
- Session loading (cookie count, session validity)
- Browser launch and navigation
- Post editor interactions
- Success detection (with indicator found)
- Browser errors and timeouts
- Session expiration detection

**Audit Coverage:**
```python
# Initialize audit logging
audit = get_audit_manager() if AUDIT_AVAILABLE else None
correlation_id = f"linkedin_pw_{int(datetime.now().timestamp())}"
start_time = datetime.now()

# Log at each stage
if audit:
    entry = AuditEntry(
        category=AuditCategory.LINKEDIN,
        level=AuditLevel.SUCCESS,
        action="post_to_linkedin",
        correlation_id=correlation_id,
        details={
            "content_length": len(content),
            "target": target,
            "post_url": post_url,
            "method": "playwright_browser",
        },
        duration_ms=round(duration_ms, 2),
        source="SKILL_LInkedin_Playwright_MCP",
    )
    audit.log(entry)
```

## Error Recovery System

### RetryPolicy

Configurable retry with exponential backoff:

```python
from audit_log import RetryPolicy, ErrorRecoveryManager

# Create custom retry policy
policy = RetryPolicy(
    max_retries=3,
    base_delay=2.0,  # seconds
    backoff_factor=2.0,  # exponential multiplier
    max_delay=60.0,  # cap delay
    retryable_exceptions=(ConnectionError, TimeoutError),
)
```

### ErrorRecoveryManager

Executes functions with automatic retry and audit logging:

```python
recovery = get_recovery_manager()

result = recovery.execute_with_retry(
    my_function,
    arg1, arg2,
    policy=policy,
    category=AuditCategory.EMAIL,
    action="send_email",
    correlation_id="corr-123",
)

# Result:
# {
#     "success": True,
#     "result": <function_result>,
#     "attempts": 2,
#     "correlation_id": "corr-123"
# }
```

### Recovery Actions

Logged in `audit_recovery.json`:
- `retry` - Automatic retry with backoff
- `fallback` - Switched to fallback method
- `escalate` - Requires manual intervention
- `skip` - Operation skipped
- `manual_intervention` - Human action required

## Querying Audit Logs

### CLI Usage

```bash
# Query recent entries
python3 audit_log.py query recent --limit 20

# Query errors only
python3 audit_log.py query errors --limit 50

# Query by category
python3 audit_log.py query category --category email --limit 100

# Query by correlation ID
python3 audit_log.py query correlation --correlation-id <uuid>

# Get summary
python3 audit_log.py summary
```

### Programmatic Query

```python
from audit_log import get_audit_manager

audit = get_audit_manager()

# Recent entries
entries = audit.query(limit=100)

# Filter by category and level
errors = audit.query(
    category="email",
    level="ERROR",
    since="2026-04-10T00:00:00",
    limit=50,
)

# Get error summary
error_summary = audit.get_error_summary()
# {
#     "total_errors": 123,
#     "error_summary": {
#         "email/send_email": {"count": 5, "last_error": "..."},
#         "linkedin/create_post": {"count": 2, ...}
#     },
#     "last_error_at": "2026-04-10T..."
# }

# Get recovery summary
recovery_summary = audit.get_recovery_summary()
# {
#     "total_recoveries": 45,
#     "recovery_summary": {
#         "retry": {"count": 30},
#         "fallback": {"count": 10},
#         "escalate": {"count": 5}
#     }
# }

# Verify audit integrity
integrity = audit.verify_integrity()
# {
#     "verified_entries": 100,
#     "valid_entries": 100,
#     "invalid_entries": 0,
#     "integrity_status": "PASS"
# }
```

## 🔒 Secure Template for New Scripts

Every script in the system MUST follow this secure pattern for credential management:

```python
#!/usr/bin/env python3
import os
from dotenv import load_dotenv

# 1. Always load .env first (override=True ensures local .env wins)
load_dotenv(override=True)

# 2. Extract credentials ONLY via environment variables
ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")

# 3. Fail gracefully if required credential is missing
if not ODOO_PASSWORD:
    print("❌ Error: ODOO_PASSWORD not set in .env")
    sys.exit(1)
```

---

## Audit Log Rotation

- **Main index**: Rotates at 10,000 entries
- **Error log**: Rotates at 5,000 entries
- **Recovery log**: Rotates at 5,000 entries

Rotation creates `*.archive.N.json` files with oldest 50% of entries archived.

## Integrity Verification

Each audit entry has SHA-256 integrity hash:
- Computed on: `entry_id + timestamp + category + action + details`
- Detects tampering or corruption
- Verified via `audit.verify_integrity()`

## Best Practices

1. **Always use correlation IDs** - Link related operations across components
2. **Log before and after** - Capture start and completion for critical operations
3. **Include duration** - Track performance via `duration_ms`
4. **Capture error context** - Include exception type and message
5. **Use appropriate levels** - Don't overuse ERROR for expected failures
6. **Keep details concise** - Truncate large payloads to 200 chars
7. **Review regularly** - Use `get_error_summary()` in dashboards

## Monitoring & Alerting

Monitor these metrics for system health:
- Error rate by category (spike detection)
- Recovery success rate (fallback effectiveness)
- Audit integrity status (tampering detection)
- File processing duration (performance regression)
- Email/LinkedIn send success rate (integration health)

## File Structure

```
Logs/audit/
├── audit_log.json          # Main audit index
├── audit_errors.json       # Error-specific log
├── audit_recovery.json     # Recovery action log
└── *.archive.N.json        # Rotated archives
```

## Example: Tracing a Complete Workflow

Given a file `Needs_Action/email_task.md`:

```bash
# 1. Find the correlation ID for file processing
python3 -c "
from audit_log import get_audit_manager
audit = get_audit_manager()
entries = audit.query(category='orchestrator', action='process_file_start', limit=10)
for e in entries:
    print(f\"{e['timestamp']} | {e['correlation_id']} | {e['details']['file_name']}\")
"

# 2. Trace all operations for that file
python3 -c "
from audit_log import get_audit_manager
audit = get_audit_manager()
corr_id = '<correlation_id_from_step_1>'
entries = audit.query(correlation_id=corr_id, limit=100)
for e in entries:
    print(f\"{e['level']:8} | {e['action']:30} | {e.get('duration_ms', 'N/A')}ms\")
    if 'error' in e:
        print(f\"         ERROR: {e['error']}\")
"
```

This gives you complete audit trail from file detection → processing → approval → send.
