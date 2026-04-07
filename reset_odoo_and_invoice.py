#!/usr/bin/env python3
"""
Script to reset Odoo admin password and create an invoice.

⚠️  SECURITY: This script reads credentials from the .env file.
    Never hardcode passwords in source code.
"""

import os
import sys
import requests
import json
import xmlrpc.client
from requests import Session
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Odoo Configuration
ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "odoo")
MASTER_PASSWORD = os.getenv("ODOO_MASTER_PASSWORD")
ODOO_USERNAME = os.getenv("ODOO_USERNAME", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")

# Validate required credentials
if not MASTER_PASSWORD:
    print("❌ Error: ODOO_MASTER_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_MASTER_PASSWORD=your-master-password")
    sys.exit(1)

if not ODOO_PASSWORD:
    print("❌ Error: ODOO_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_PASSWORD=your-odoo-password")
    sys.exit(1)

def reset_user_password():
    """Try to authenticate using credentials from .env file."""
    print("Attempting to authenticate with credentials from .env...")

    common_url = f"{ODOO_URL}/xmlrpc/2/common"
    common = xmlrpc.client.ServerProxy(common_url)

    # Try authenticating with credentials from .env
    print("\nTrying credentials from .env file...")

    try:
        uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
        if uid:
            print(f"\n✅ SUCCESS! Authentication successful:")
            print(f"   Username: {ODOO_USERNAME}")
            print(f"   User ID: {uid}")
            return uid, ODOO_USERNAME, ODOO_PASSWORD
    except Exception as e:
        print(f"   Authentication failed: {e}")

    print("\n❌ Could not authenticate with credentials from .env")
    return None, None, None

def main():
    print("=" * 60)
    print("Odoo Credential Finder & Invoice Creator")
    print("=" * 60)
    
    # Step 1: Try to find working credentials
    uid, username, password = reset_user_password()
    
    if not uid:
        print("\n" + "=" * 60)
        print("Unable to authenticate. Please manually:")
        print("1. Login to Odoo at http://localhost:8069")
        print("2. Go to Settings → Users & Companies → Users")
        print("3. Select the user and set a known password")
        print("4. Run this script again with the correct credentials")
        print("=" * 60)
        return
    
    # Step 2: Search for customer "Shaikh Test"
    print(f"\n{'=' * 60}")
    print(f"Step 2: Searching for customer 'Shaikh Test'...")
    print(f"{'=' * 60}")
    
    import xmlrpc.client
    models_url = f"{ODOO_URL}/xmlrpc/2/object"
    models = xmlrpc.client.ServerProxy(models_url)
    
    customer_domain = [['name', 'ilike', 'Shaikh Test']]
    
    try:
        customer_ids = models.execute_kw(
            ODOO_DB, uid, password,
            'res.partner', 'search',
            [customer_domain]
        )
        
        if not customer_ids:
            print("❌ Customer 'Shaikh Test' not found.")
            print("\nCreating customer 'Shaikh Test'...")
            
            customer_id = models.execute_kw(
                ODOO_DB, uid, password,
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
        print(f"Step 3: Creating invoice...")
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
        
        invoice_id = models.execute_kw(
            ODOO_DB, uid, password,
            'account.move', 'create',
            [invoice_vals]
        )
        
        print(f"\n✅ Invoice created successfully!")
        print(f"   Invoice ID: {invoice_id}")
        print(f"   Customer: Shaikh Test (ID: {customer_id})")
        print(f"   Amount: $350.00")
        
        # Read back the invoice details
        invoice = models.execute_kw(
            ODOO_DB, uid, password,
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
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
