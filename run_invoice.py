#!/usr/bin/env python3
"""Create invoice in Odoo for Shaikh Test - Amount: 350

⚠️  SECURITY: Credentials are loaded from the .env file.
    Never hardcode passwords in source code.
"""

import os
import sys
import xmlrpc.client
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "odoo")
ODOO_USERNAME = os.getenv("ODOO_USERNAME", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")

# Validate credentials
if not ODOO_PASSWORD:
    print("❌ Error: ODOO_PASSWORD not set in .env")
    print("\nPlease add your Odoo password to .env file:")
    print("   ODOO_PASSWORD=your-odoo-password")
    sys.exit(1)

# Connect
common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

# Authenticate
uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
print(f"✅ Authenticated. User ID: {uid}")

# Search for customer "Shaikh Test"
customer_ids = models.execute_kw(
    ODOO_DB, uid, ODOO_PASSWORD,
    'res.partner', 'search',
    [[['name', 'ilike', 'Shaikh Test']]]
)

if customer_ids:
    customer_id = customer_ids[0]
    print(f"✅ Customer found: ID {customer_id}")
else:
    # Create customer
    customer_id = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.partner', 'create',
        [{
            'name': 'Shaikh Test',
            'customer_rank': 1,
        }]
    )
    print(f"✅ Customer created: ID {customer_id}")

# Create invoice
invoice_vals = {
    'move_type': 'out_invoice',
    'partner_id': customer_id,
    'invoice_line_ids': [(0, 0, {
        'name': 'Service for Shaikh Test',
        'quantity': 1,
        'price_unit': 350.00,
    })]
}

invoice_id = models.execute_kw(
    ODOO_DB, uid, ODOO_PASSWORD,
    'account.move', 'create',
    [invoice_vals]
)

print(f"\n✅ INVOICE CREATED!")
print(f"   Invoice ID: {invoice_id}")
print(f"   Customer: Shaikh Test (ID: {customer_id})")
print(f"   Amount: $350.00")

# Read details
invoice = models.execute_kw(
    ODOO_DB, uid, ODOO_PASSWORD,
    'account.move', 'read',
    [invoice_id],
    {'fields': ['name', 'state', 'amount_total', 'invoice_date']}
)

if invoice:
    print(f"\n📄 Details:")
    print(f"   Number: {invoice[0].get('name', 'N/A')}")
    print(f"   State: {invoice[0].get('state', 'N/A')}")
    print(f"   Total: ${invoice[0].get('amount_total', 0):.2f}")
    print(f"   Date: {invoice[0].get('invoice_date', 'N/A')}")
    print(f"   Link: {ODOO_URL}/web#id={invoice_id}&view_type=form&model=account.move")
