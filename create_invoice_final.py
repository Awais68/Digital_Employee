#!/usr/bin/env python3
"""
Script to create an invoice in Odoo.
Customer: Shaikh Test
Amount: 350

⚠️  SECURITY: Credentials are loaded from the .env file.
    Never hardcode passwords in source code.
"""

import os
import sys
import xmlrpc.client
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Odoo Configuration
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

def main():
    # Setup XML-RPC endpoints
    common_url = f"{ODOO_URL}/xmlrpc/2/common"
    models_url = f"{ODOO_URL}/xmlrpc/2/object"
    
    common = xmlrpc.client.ServerProxy(common_url)
    models = xmlrpc.client.ServerProxy(models_url)
    
    # Step 1: Authenticate
    print("=" * 60)
    print("Step 1: Authenticating with Odoo...")
    print("=" * 60)
    uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
    
    if not uid:
        print("❌ Authentication failed. Please check your credentials.")
        sys.exit(1)
    
    print(f"✅ Authentication successful. User ID: {uid}")
    
    # Step 2: Search for customer "Shaikh Test"
    print(f"\n{'=' * 60}")
    print(f"Step 2: Searching for customer 'Shaikh Test'...")
    print(f"{'=' * 60}")
    
    customer_domain = [['name', 'ilike', 'Shaikh Test']]
    
    customer_ids = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.partner', 'search',
        [customer_domain]
    )
    
    if not customer_ids:
        print("⚠️  Customer 'Shaikh Test' not found. Creating now...")
        
        customer_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'res.partner', 'create',
            [{
                'name': 'Shaikh Test',
                'customer_rank': 1,
            }]
        )
        print(f"✅ Customer created with ID: {customer_id}")
    else:
        customer_id = customer_ids[0]
        print(f"✅ Customer found with ID: {customer_id}")
    
    # Step 3: Create the invoice
    print(f"\n{'=' * 60}")
    print(f"Step 3: Creating invoice for amount 350...")
    print(f"{'=' * 60}")
    
    invoice_vals = {
        'move_type': 'out_invoice',
        'partner_id': customer_id,
        'invoice_line_ids': [(0, 0, {
            'name': 'Service for Shaikh Test',
            'quantity': 1,
            'price_unit': 350.00,
        })]
    }
    
    try:
        invoice_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'create',
            [invoice_vals]
        )
        
        print(f"\n{'=' * 60}")
        print(f"✅ INVOICE CREATED SUCCESSFULLY!")
        print(f"{'=' * 60}")
        print(f"   Invoice ID: {invoice_id}")
        print(f"   Customer: Shaikh Test (ID: {customer_id})")
        print(f"   Amount: $350.00")
        
        # Read back the invoice details
        invoice = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'read',
            [invoice_id],
            {'fields': ['name', 'state', 'amount_total', 'partner_id', 'invoice_date']}
        )
        
        if invoice:
            print(f"\n📄 Invoice Details:")
            print(f"   Invoice Number: {invoice[0].get('name', 'N/A')}")
            print(f"   State: {invoice[0].get('state', 'N/A')}")
            print(f"   Total Amount: ${invoice[0].get('amount_total', 0):.2f}")
            print(f"   Invoice Date: {invoice[0].get('invoice_date', 'N/A')}")
            print(f"\n🔗 Direct Link: {ODOO_URL}/web#id={invoice_id}&view_type=form&model=account.move")
            
    except Exception as e:
        print(f"\n❌ Error creating invoice: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
