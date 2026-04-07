# Odoo MCP Server — Gold Tier

Connects to local Odoo 19 via XML-RPC/JSON-RPC and exposes MCP tools for business operations.

## Setup

### 1. Add to `.env`
```env
ODOO_URL=http://localhost:8069
ODOO_DB=digital_fte
ODOO_USERNAME=admin
ODOO_PASSWORD=admin
```

### 2. Install dependency
```bash
pip install python-dotenv
```
(already in `requirements.txt`)

## Usage

### A. MCP Mode (stdin/stdout — for Claude Code / MCP clients)
```bash
python3 odoo_mcp.py
```
The server reads JSON-RPC requests from stdin and writes responses to stdout.

### B. Direct CLI Mode (quick testing)
```bash
# Create a customer
python3 odoo_mcp.py create_customer name="Acme Corp" email="info@acme.com" phone="+1234567890"

# Create an invoice
python3 odoo_mcp.py create_invoice partner_id=12 invoice_type=out_invoice invoice_line_ids='[{"name":"Consulting","quantity":10,"price_unit":150}]'

# Get bank balance
python3 odoo_mcp.py get_bank_balance

# Get recent transactions
python3 odoo_mcp.py get_recent_transactions limit=10 days=7

# Get accounting summary
python3 odoo_mcp.py get_accounting_summary

# Create a journal entry
python3 odoo_mcp.py create_journal_entry journal_id=1 line_ids='[{"account_id":10,"name":"Test","debit":100,"credit":0},{"account_id":20,"name":"Test","debit":0,"credit":100}]'
```

## Available MCP Tools

| Tool | Description | Required Args |
|------|-------------|---------------|
| `create_customer` | Create a new customer/contact | `name` |
| `create_invoice` | Create a customer invoice | `partner_id` |
| `create_sale_order` | Create a sale order | `partner_id` |
| `get_bank_balance` | Bank/cash journal balance summary | — |
| `get_accounting_summary` | Overall accounting summary | — |
| `get_recent_transactions` | Recent journal items | — |
| `create_journal_entry` | Manual journal entry | `journal_id`, `line_ids` |

## MCP Protocol Messages

### Initialize
```json
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
```

### List Tools
```json
{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
```

### Call Tool
```json
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "create_customer", "arguments": {"name": "Test Corp"}}}
```

## Claude Code MCP Configuration

Add to your `.mcp.json`:
```json
{
  "mcpServers": {
    "odoo-gold-tier": {
      "command": "python3",
      "args": ["/path/to/odoo_mcp.py"],
      "env": {
        "ODOO_URL": "http://localhost:8069",
        "ODOO_DB": "digital_fte",
        "ODOO_USERNAME": "admin",
        "ODOO_PASSWORD": "admin"
      }
    }
  }
}
```

## Error Handling

- Authentication failures → clear error message
- XML-RPC faults → Odoo error string returned
- General exceptions → logged + returned as MCP error response
- All errors go to stderr (logging), responses stay clean on stdout
