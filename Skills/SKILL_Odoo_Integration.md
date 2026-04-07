---
skill_id: SKILL_Odoo_Integration
name: Odoo Accounting Integration
version: 1.0.0
tier: Gold
description: Manage accounting operations via Odoo JSON-RPC API including invoices, customers, sales orders, and financial transactions
status: active
created: 2026-04-06
updated: 2026-06-04
author: Digital Employee System
reviewers: [Human-in-the-Loop]
---

# SKILL_Odoo_Integration: Odoo Accounting & Business Operations

## Overview

This skill provides comprehensive integration with Odoo 19 ERP system via JSON-RPC API for accounting and business operations. It enables automated creation and management of invoices, customers, sales orders, journal entries, and financial reporting through MCP tools with human-in-the-loop approval workflows.

## Purpose

- Create and manage customer invoices via Odoo API
- Maintain customer database and contact information
- Process sales orders and quotations
- Record journal entries and financial transactions
- Generate accounting summaries and reports
- Monitor bank balances and cash flow
- Execute business operations with approval controls

## Architecture

```
┌─────────────────┐
│  Trigger File   │
│ /Needs_Action/  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Skill Logic    │
│ Validate Input  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Odoo JSON-RPC   │
│ localhost:8069  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Human Approval  │
│ (if required)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Execute Action  │
│ Log Results     │
└─────────────────┘
```

## Configuration

### Connection Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Endpoint** | `http://localhost:8069/jsonrpc` | Odoo JSON-RPC API URL |
| **Database** | `odoo` | Target Odoo database |
| **Username** | `awaisniaz720@gmail.com` | Authentication user |
| **Authentication** | XML-RPC / JSON-RPC | Protocol for API calls |

### MCP Server Configuration

```json
{
  "odoo-gold-tier": {
    "type": "stdio",
    "command": "python3",
    "args": ["/path/to/odoo_mcp.py"],
    "env": {
      "ODOO_URL": "http://localhost:8069",
      "ODOO_DB": "odoo",
      "ODOO_USERNAME": "awaisniaz720@gmail.com",
      "ODOO_PASSWORD": "<secure_password>",
      "PYTHONUNBUFFERED": "1"
    }
  }
}
```

## Available Actions

### 1. `create_invoice`

Create customer invoices with line items, taxes, and payment terms.

**Parameters:**
```json
{
  "action": "create_invoice",
  "data": {
    "customer": {
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+1234567890",
      "vat": "VAT123456"
    },
    "amount": 1500.00,
    "currency": "USD",
    "invoice_date": "2026-04-06",
    "due_date": "2026-05-06",
    "description": "Professional services - April 2026",
    "payment_term": "30_days",
    "tax_rate": 0.10,
    "line_items": [
      {
        "product": "Consulting Services",
        "quantity": 10,
        "unit_price": 150.00,
        "description": "Hourly consulting"
      }
    ]
  }
}
```

**Required Fields:**
- `action`: Must be `create_invoice`
- `data.amount`: Invoice total amount (numeric)
- `data.customer`: Customer name or customer object

**Optional Fields:**
- `data.currency`: Currency code (default: USD)
- `data.invoice_date`: Invoice date (YYYY-MM-DD)
- `data.due_date`: Payment due date (YYYY-MM-DD)
- `data.description`: Invoice description
- `data.payment_term`: Payment terms (`immediate`, `15_days`, `30_days`, `60_days`)
- `data.tax_rate`: Tax rate as decimal (0.10 = 10%)
- `data.line_items`: Array of line item objects

**Response:**
```json
{
  "success": true,
  "invoice_id": 1234,
  "invoice_number": "INV/2026/0001",
  "amount_total": 1650.00,
  "amount_tax": 150.00,
  "state": "draft",
  "customer_id": 567,
  "message": "Invoice created successfully"
}
```

---

### 2. `create_customer`

Create new customer records in Odoo.

**Parameters:**
```json
{
  "action": "create_customer",
  "data": {
    "name": "Acme Corporation",
    "email": "billing@acme.com",
    "phone": "+1-555-0123",
    "website": "www.acme.com",
    "vat": "US123456789",
    "street": "123 Business Ave",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "US",
    "industry": "Technology",
    "payment_term": "30_days",
    "credit_limit": 10000.00
  }
}
```

**Required Fields:**
- `action`: Must be `create_customer`
- `data.name`: Customer/company name

**Response:**
```json
{
  "success": true,
  "customer_id": 789,
  "name": "Acme Corporation",
  "email": "billing@acme.com",
  "message": "Customer created successfully"
}
```

---

### 3. `create_sale_order`

Create sales orders/qu quotations.

**Parameters:**
```json
{
  "action": "create_sale_order",
  "data": {
    "customer": "Acme Corporation",
    "order_date": "2026-04-06",
    "validity_date": "2026-04-20",
    "products": [
      {
        "name": "Product A",
        "quantity": 5,
        "unit_price": 200.00,
        "tax_rate": 0.10
      }
    ],
    "notes": "Delivery within 2 weeks"
  }
}
```

**Required Fields:**
- `action`: Must be `create_sale_order`
- `data.customer`: Customer name or ID
- `data.products`: Array of product line items

**Response:**
```json
{
  "success": true,
  "order_id": 456,
  "order_number": "SO/2026/0001",
  "amount_total": 1100.00,
  "state": "draft",
  "message": "Sale order created successfully"
}
```

---

### 4. `get_bank_balance`

Retrieve current bank account balances.

**Parameters:**
```json
{
  "action": "get_bank_balance",
  "data": {
    "account_code": "101000"
  }
}
```

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "code": "101000",
      "name": "Bank Account - Main",
      "balance": 25000.50,
      "currency": "USD",
      "last_updated": "2026-04-06T10:30:00Z"
    }
  ]
}
```

---

### 5. `get_accounting_summary`

Get accounting summary for a period.

**Parameters:**
```json
{
  "action": "get_accounting_summary",
  "data": {
    "period": "current_month",
    "start_date": "2026-04-01",
    "end_date": "2026-04-30"
  }
}
```

**Response:**
```json
{
  "success": true,
  "period": "April 2026",
  "summary": {
    "total_revenue": 45000.00,
    "total_expenses": 28000.00,
    "net_profit": 17000.00,
    "invoices_issued": 23,
    "payments_received": 18,
    "outstanding_invoices": 5,
    "outstanding_amount": 12500.00
  }
}
```

---

### 6. `get_recent_transactions`

Fetch recent financial transactions.

**Parameters:**
```json
{
  "action": "get_recent_transactions",
  "data": {
    "limit": 20,
    "account_code": "101000",
    "date_from": "2026-04-01"
  }
}
```

**Response:**
```json
{
  "success": true,
  "count": 20,
  "transactions": [
    {
      "id": 9001,
      "date": "2026-04-06",
      "description": "Customer payment - INV/2026/0001",
      "debit": 1650.00,
      "credit": 0.00,
      "account": "101000",
      "partner": "Acme Corporation"
    }
  ]
}
```

---

### 7. `create_journal_entry`

Record manual journal entries.

**Parameters:**
```json
{
  "action": "create_journal_entry",
  "data": {
    "date": "2026-04-06",
    "reference": "Adjustment - Q1 2026",
    "line_ids": [
      {
        "account_code": "600000",
        "debit": 1000.00,
        "credit": 0.00,
        "partner_id": 789,
        "description": "Operating expense"
      },
      {
        "account_code": "101000",
        "debit": 0.00,
        "credit": 1000.00,
        "partner_id": 789,
        "description": "Bank payment"
      }
    ]
  }
}
```

**Required Fields:**
- `action`: Must be `create_journal_entry`
- `data.date`: Entry date (YYYY-MM-DD)
- `data.line_ids`: Array of debit/credit lines (must balance)

**Response:**
```json
{
  "success": true,
  "entry_id": 3001,
  "entry_number": "JE/2026/0045",
  "total_debit": 1000.00,
  "total_credit": 1000.00,
  "state": "draft",
  "message": "Journal entry created successfully"
}
```

---

## Workflow

### Invoice Creation Workflow

```
1. Trigger Detection
   ↓
2. Validate Input Data
   ↓
3. Check Customer Exists (create if needed)
   ↓
4. Calculate Totals & Tax
   ↓
5. Generate Invoice in Odoo
   ↓
6. Human Approval (if enabled)
   ↓
7. Confirm & Send Invoice
   ↓
8. Log Transaction
```

### Approval Workflow

| Action | Auto-Execute | Requires Approval |
|--------|--------------|-------------------|
| View Balance | ✅ Yes | ❌ No |
| View Transactions | ✅ Yes | ❌ No |
| View Summary | ✅ Yes | ❌ No |
| Create Customer | ✅ Yes (< $10K credit) | ✏️ If credit > $10K |
| Create Invoice | ✏️ Always | ✅ Yes |
| Create Sale Order | ✏️ Always | ✅ Yes |
| Create Journal Entry | ✏️ Always | ✅ Yes |

---

## Usage Examples

### Example 1: Create Simple Invoice

**Trigger File:** `/Needs_Action/ODOO_INVOICE_20260406_001.md`

```markdown
---
type: odoo_invoice_request
action: create_invoice
priority: normal
created: 2026-04-06
---

# Invoice Request

## Customer
- Name: TechStart Inc.
- Email: accounts@techstart.io

## Invoice Details
- Amount: $2,500.00
- Description: Website development - Phase 1
- Due Date: 2026-05-06
- Payment Terms: 30 days
```

**Skill Execution:**
```python
result = odoo_client.execute_action({
    "action": "create_invoice",
    "data": {
        "customer": "TechStart Inc.",
        "amount": 2500.00,
        "description": "Website development - Phase 1",
        "due_date": "2026-05-06",
        "payment_term": "30_days"
    }
})
```

---

### Example 2: Create Customer & Invoice

**Trigger File:** `/Needs_Action/ODOO_NEW_CLIENT_20260406_001.md`

```markdown
---
type: odoo_customer_and_invoice
action: create_customer + create_invoice
priority: high
---

# New Customer Setup & Initial Invoice

## Customer Information
- Company: Global Solutions Ltd.
- Contact: John Smith
- Email: john@global-solutions.com
- Phone: +44-20-7123-4567
- Address: 45 Oxford Street, London, UK

## Invoice
- Amount: £5,000.00
- Description: Consulting services - Q2 2026
- Due: 2026-04-20
```

---

### Example 3: Get Accounting Summary

**Trigger File:** `/Needs_Action/ODOO_REPORT_20260406_001.md`

```markdown
---
type: odoo_report_request
action: get_accounting_summary
priority: normal
---

# Monthly Accounting Summary Request

## Period
- Start: 2026-04-01
- End: 2026-04-30

## Required
- Revenue breakdown
- Expense summary
- Outstanding invoices
- Cash flow status
```

---

## Error Handling

| Error Code | Cause | Resolution |
|------------|-------|------------|
| `AUTH_FAILED` | Invalid credentials | Re-authenticate, check password |
| `DB_NOT_FOUND` | Database doesn't exist | Verify ODOO_DB parameter |
| `CUSTOMER_NOT_FOUND` | Customer doesn't exist | Create customer first |
| `AMOUNT_INVALID` | Invalid amount format | Provide numeric value |
| `DATE_INVALID` | Invalid date format | Use YYYY-MM-DD format |
| `UNBALANCED_ENTRY` | Journal entry doesn't balance | Ensure debits = credits |
| `DUPLICATE_INVOICE` | Invoice already exists | Use existing invoice number |
| `PERMISSION_DENIED` | Insufficient user rights | Contact Odoo admin |
| `CONNECTION_REFUSED` | Odoo server not running | Start Odoo service |
| `TIMEOUT` | Request timeout | Retry, check server health |

---

## Logging Schema

**Log File:** `/Logs/odoo_operations.log`

```json
{
  "timestamp": "2026-04-06T14:30:00Z",
  "action": "create_invoice | create_customer | create_sale_order | get_bank_balance | get_accounting_summary | get_recent_transactions | create_journal_entry",
  "status": "success | failed | pending_approval",
  "user": "awaisniaz720@gmail.com",
  "database": "odoo",
  "request_id": "REQ_20260406_001",
  "record_id": 1234,
  "record_number": "INV/2026/0001",
  "amount": 1650.00,
  "currency": "USD",
  "response_time_ms": 450,
  "error_code": null,
  "error_message": null,
  "approval_required": true,
  "approval_status": "pending | approved | rejected",
  "odoo_version": "19.0"
}
```

---

## Output Format

### Result File (`/Done/ODOO_INVOICE_20260406_001.md`)

```markdown
---
type: odoo_invoice_result
status: completed
version: 1.0
created: 2026-04-06
completed: 2026-04-06T14:30:00Z
action: create_invoice
skill_reference: SKILL_Odoo_Integration
---

# Odoo Invoice Created

## Invoice Details

| Field | Value |
|-------|-------|
| **Invoice Number** | INV/2026/0001 |
| **Invoice ID** | 1234 |
| **Customer** | TechStart Inc. |
| **Customer ID** | 789 |
| **Amount (excl. tax)** | $2,500.00 |
| **Tax (10%)** | $250.00 |
| **Total Amount** | $2,750.00 |
| **Currency** | USD |
| **Invoice Date** | 2026-04-06 |
| **Due Date** | 2026-05-06 |
| **Payment Terms** | 30 days |
| **State** | Draft |

## Odoo Access

- **URL:** http://localhost:8069
- **Database:** odoo
- **Module:** Invoicing → Customer Invoices
- **Direct Link:** http://localhost:8069/web#id=1234&view_type=form&model=account.move

## Approval Status

- [x] ✅ Approved by: [Human Reviewer Name]
- [ ] Approval Date: 2026-04-06T14:25:00Z
- [ ] Notes: Confirmed project completion, approved for billing

## Next Actions

- [ ] Send invoice to customer via email
- [ ] Track payment status
- [ ] Follow up on due date if unpaid
- [ ] Record payment when received

## Metadata

- **Created By:** awaisniaz720@gmail.com
- **API Response Time:** 450ms
- **Odoo Version:** 19.0
- **Request ID:** REQ_20260406_001

---
*Processed by SKILL_Odoo_Integration v1.0.0 (Gold Tier)*
*Human-in-the-Loop Approval Required*
```

---

## API Reference

### JSON-RPC Call Structure

**Authentication:**
```json
{
  "jsonrpc": "2.0",
  "method": "call",
  "params": {
    "service": "common",
    "method": "authenticate",
    "args": ["odoo", "awaisniaz720@gmail.com", "<password>", {}]
  },
  "id": 1
}
```

**Execute Model Method:**
```json
{
  "jsonrpc": "2.0",
  "method": "call",
  "params": {
    "service": "object",
    "method": "execute_kw",
    "args": [
      "odoo",
      <uid>,
      "<password>",
      "account.move",
      "create",
      [{
        "move_type": "out_invoice",
        "partner_id": 789,
        "invoice_date": "2026-04-06",
        "invoice_date_due": "2026-05-06",
        "invoice_line_ids": [[0, 0, {
          "name": "Consulting Services",
          "quantity": 10,
          "price_unit": 150.00
        }]]
      }]
    ]
  },
  "id": 2
}
```

### Key Odoo Models

| Model | Purpose | Key Methods |
|-------|---------|-------------|
| `res.partner` | Customers/Contacts | `create`, `search`, `write` |
| `account.move` | Invoices/Journal Entries | `create`, `action_post`, `button_cancel` |
| `account.move.line` | Invoice Lines | `create`, `write` |
| `sale.order` | Sales Orders | `create`, `action_confirm` |
| `sale.order.line` | Order Lines | `create`, `write` |
| `account.account` | Chart of Accounts | `search_read` |
| `account.journal` | Journals | `search_read` |
| `account.payment` | Payments | `create`, `action_post` |

---

## Best Practices

1. **Validation First**: Always validate input data before API calls
2. **Customer Deduplication**: Search for existing customers before creating
3. **Tax Calculation**: Apply correct tax rates based on customer location
4. **Currency Handling**: Verify currency code and exchange rates
5. **Sequential Numbering**: Let Odoo auto-generate invoice/order numbers
6. **State Management**: Confirm invoices after creation (draft → posted)
7. **Error Logging**: Log all API calls with timestamps
8. **Human Approval**: Require approval for financial transactions
9. **Audit Trail**: Maintain request ID for traceability
10. **Rate Limiting**: Avoid excessive API calls (max 10/min recommended)

---

## Security Considerations

| Aspect | Recommendation |
|--------|----------------|
| **Credentials** | Store in `.env`, never hardcode |
| **User Permissions** | Use minimum required access rights |
| **API Access** | Restrict to localhost or internal network |
| **Audit Logs** | Enable Odoo audit trail for financial models |
| **Data Validation** | Sanitize all input before API calls |
| **Approval Workflow** | Require human approval for monetary actions |
| **Backup** | Verify database backups before bulk operations |
| **Session Timeout** | Re-authenticate periodically |

---

## MCP Integration

### Available Tools

The Odoo MCP server exposes these tools:

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `create_customer` | Create new customer | `name`, `email`, `phone`, `vat`, `address` |
| `create_invoice` | Create customer invoice | `customer`, `amount`, `description`, `due_date` |
| `create_sale_order` | Create sales order | `customer`, `products`, `order_date` |
| `get_bank_balance` | Get bank account balance | `account_code` (optional) |
| `get_accounting_summary` | Get period summary | `period`, `start_date`, `end_date` |
| `get_recent_transactions` | Fetch transactions | `limit`, `account_code`, `date_from` |
| `create_journal_entry` | Record journal entry | `date`, `line_ids`, `reference` |

### Usage via MCP Client

```python
# Example: Create invoice via MCP
result = mcp.call_tool(
    "create_invoice",
    {
        "customer": "TechStart Inc.",
        "amount": 2500.00,
        "description": "Website development - Phase 1",
        "due_date": "2026-05-06"
    }
)
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **Connection refused** | Odoo not running | Start Odoo: `sudo systemctl start odoo` |
| **Authentication failed** | Wrong credentials | Verify username/password in `.env` |
| **Database not found** | Wrong DB name | Check ODOO_DB matches your database |
| **Permission denied** | Insufficient rights | Grant user accounting/invoicing access |
| **Invoice not posting** | Missing required fields | Ensure invoice lines and partner are set |
| **Tax calculation error** | Tax not configured | Create tax in Odoo Accounting → Configuration → Taxes |
| **Customer not found** | Customer doesn't exist | Create customer first or use existing ID |

### Health Check

```bash
# Test Odoo connectivity
curl -X POST http://localhost:8069/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
      "service": "common",
      "method": "version",
      "args": []
    },
    "id": 1
  }'
```

---

## Related Files

| File | Purpose |
|------|---------|
| `/Skills/SKILL_Odoo_Integration.md` | This skill definition |
| `/odoo_mcp.py` | MCP server implementation |
| `/.mcp.json` | MCP server configuration |
| `/.env` | Environment variables (credentials) |
| `/Company_Handbook.md` | Gold Tier Rules & Approval Workflow |
| `/Logs/odoo_operations.log` | Operation logs |
| `/Needs_Action/ODOO_*.md` | Trigger files |
| `/Done/ODOO_*.md` | Completed operations |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-04-06 | Initial release with full accounting support | Digital Employee System |

---

*Part of Gold Tier Digital Employee System*
*Human-in-the-Loop Required for Financial Transactions*
*Connects to Odoo 19 via JSON-RPC API*
