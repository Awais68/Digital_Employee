#!/usr/bin/env python3
"""Create and POST invoice via Odoo JSON-RPC"""
import requests, os
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
if not ODOO_URL.endswith('/jsonrpc'):
    ODOO_JSONRPC_URL = f"{ODOO_URL}/jsonrpc"
else:
    ODOO_JSONRPC_URL = ODOO_URL

ODOO_DB = os.getenv('ODOO_DB', 'crm_odoo')
ODOO_USERNAME = os.getenv('ODOO_USERNAME', 'abc@gmail.com')
ODOO_PASSWORD = os.getenv('ODOO_PASSWORD', 'Haris@123')

def jsonrpc_call(method, params):
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    }
    headers = {"Content-Type": "application/json-rpc"}
    response = requests.post(ODOO_JSONRPC_URL, json=payload, headers=headers)
    response.raise_for_status()
    result = response.json()
    if "error" in result:
        raise Exception(f"Odoo JSON-RPC Error: {result['error']}")
    return result.get("result")

print("=" * 60)
print("Creating & Posting Invoice via JSON-RPC")
print("=" * 60)

# Step 1: Authenticate
print("\n1. Authenticating...")
uid = jsonrpc_call("call", {
    "service": "common",
    "method": "authenticate",
    "args": [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]
})

if not uid:
    print("❌ Authentication failed!")
    exit(1)
print(f"   ✅ Authenticated! User ID: {uid}")

# Step 2: Find customer "Awais Niaz"
print("\n2. Finding customer 'Awais Niaz'...")
partner_ids = jsonrpc_call("call", {
    "service": "object",
    "method": "execute_kw",
    "args": [ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "search", [[["name", "ilike", "Awais Niaz"]]]]
})

if not partner_ids:
    partner_id = jsonrpc_call("call", {
        "service": "object",
        "method": "execute_kw",
        "args": [ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "create", [{"name": "Awais Niaz", "email": "awais.niaz@example.com", "is_company": True}]]
    })
    print(f"   ✅ Created customer: ID {partner_id}")
else:
    partner_id = partner_ids[0]
    print(f"   ✅ Found customer: ID {partner_id}")

# Step 3: Create invoice with custom number
print("\n3. Creating invoice ($300) with number 4003201...")
invoice_id = jsonrpc_call("call", {
    "service": "object",
    "method": "execute_kw",
    "args": [ODOO_DB, uid, ODOO_PASSWORD, "account.move", "create", [{
        "partner_id": partner_id,
        "move_type": "out_invoice",
        "invoice_date": "2025-04-08",
        "name": "4003201",
        "invoice_line_ids": [(0, 0, {
            "name": "Professional Services",
            "quantity": 1,
            "price_unit": 300.00,
        })]
    }]]
})

print(f"   ✅ Invoice created: ID {invoice_id}")

# Step 4: POST the invoice (action_post)
print("\n4. Posting invoice...")
try:
    jsonrpc_call("call", {
        "service": "object",
        "method": "execute_kw",
        "args": [ODOO_DB, uid, ODOO_PASSWORD, "account.move", "action_post", [[invoice_id]]]
    })
    print(f"   ✅ Invoice posted successfully!")
except Exception as e:
    print(f"   ⚠️  Post failed: {e}")
    print("   Invoice is in Draft state")

# Step 5: Get invoice details
print("\n5. Fetching invoice details...")
invoice_data = jsonrpc_call("call", {
    "service": "object",
    "method": "execute_kw",
    "args": [ODOO_DB, uid, ODOO_PASSWORD, "account.move", "read", [invoice_id], {"fields": ["name", "partner_id", "amount_total", "state"]}]
})

inv = invoice_data[0]
print(f"\n{'=' * 60}")
print(f"📄 Invoice Details:")
print(f"   Number: {inv.get('name', 'N/A')}")
print(f"   Customer: {inv.get('partner_id', [''])[1] if isinstance(inv.get('partner_id'), list) else 'Awais Niaz'}")
print(f"   Total: ${inv.get('amount_total', 300.00):.2f}")
print(f"   State: {inv.get('state', 'Unknown')}")
print(f"{'=' * 60}")
print(f"\n🔗 View in browser:")
print(f"   http://localhost:8069/web#id={invoice_id}&model=account.move")
