#!/usr/bin/env python3
"""
Create an invoice for ERMANAGER for Odoo integration ($5000).
"""

import os
import sys
import xmlrpc.client
from dotenv import load_dotenv

load_dotenv()

ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "digital_fte")
ODOO_USERNAME = os.getenv("ODOO_USERNAME", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD", "admin123")

def create_ermanager_invoice():
    common_url = f"{ODOO_URL}/xmlrpc/2/common"
    models_url = f"{ODOO_URL}/xmlrpc/2/object"
    
    common = xmlrpc.client.ServerProxy(common_url)
    models = xmlrpc.client.ServerProxy(models_url)
    
    # Step 1: Authenticate
    print("🔐 Authenticating with Odoo...")
    try:
        uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False
        
    if not uid:
        print("❌ Authentication failed!")
        return False
    
    print(f"✅ Authenticated! User ID: {uid}")
    
    # Step 2: Find or create customer "ERMANAGER"
    print("\n👤 Looking for customer 'ERMANAGER'...")
    customer_ids = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.partner', 'search',
        [[['name', 'ilike', 'ERMANAGER']]]
    )
    
    if customer_ids:
        customer_id = customer_ids[0]
        print(f"✅ Found customer ID: {customer_id}")
    else:
        print("📝 Creating customer 'ERMANAGER'...")
        customer_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'res.partner', 'create',
            [{
                'name': 'ERMANAGER',
                'email': 'ermanager@example.com',
                'customer_rank': 1,
            }]
        )
        print(f"✅ Customer created! ID: {customer_id}")
    
    # Step 3: Get company currency
    company = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.company', 'search_read',
        [[], ['currency_id']],
        {'limit': 1}
    )
    currency_id = company[0]['currency_id'][0] if company else None
    
    # Step 4: Create invoice
    print(f"\n📄 Creating invoice for ERMANAGER - Odoo Integration ($5000)...")
    invoice_vals = {
        'move_type': 'out_invoice',
        'partner_id': customer_id,
        'invoice_date': '2026-04-20',
        'invoice_line_ids': [(0, 0, {
            'name': 'Odoo integration in their system',
            'quantity': 1,
            'price_unit': 5000.00,
        })]
    }
    
    if currency_id:
        invoice_vals['currency_id'] = currency_id
    
    try:
        invoice_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'create',
            [invoice_vals]
        )
        print(f"✅ Invoice created! ID: {invoice_id}")
        
        # Post/Validate the invoice
        print(f"📤 Posting invoice...")
        models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'action_post',
            [[invoice_id]]
        )
        print(f"✅ Invoice posted successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating/posting invoice: {str(e)}")
        return False

if __name__ == "__main__":
    success = create_ermanager_invoice()
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
