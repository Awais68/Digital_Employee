#!/usr/bin/env python3
"""
Create and send an invoice for 5000 in Odoo.
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

def main():
    common_url = f"{ODOO_URL}/xmlrpc/2/common"
    models_url = f"{ODOO_URL}/xmlrpc/2/object"
    
    common = xmlrpc.client.ServerProxy(common_url)
    models = xmlrpc.client.ServerProxy(models_url)
    
    # Step 1: Authenticate
    print("🔐 Authenticating with Odoo...")
    uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
    
    if not uid:
        print("❌ Authentication failed!")
        sys.exit(1)
    
    print(f"✅ Authenticated! User ID: {uid}")
    
    # Step 2: Find or create customer
    print("\n👤 Looking for customer...")
    customer_ids = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.partner', 'search',
        [[['name', 'ilike', 'Customer']]]
    )
    
    if customer_ids:
        customer_id = customer_ids[0]
        print(f"✅ Found customer ID: {customer_id}")
    else:
        # Create a default customer
        print("📝 Creating customer 'Invoice Customer'...")
        customer_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'res.partner', 'create',
            [{
                'name': 'Invoice Customer',
                'email': 'customer@example.com',
                'customer_rank': 1,
            }]
        )
        print(f"✅ Customer created! ID: {customer_id}")
    
    # Step 3: Get company currency
    print("\n💰 Getting company currency...")
    company = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.company', 'search_read',
        [[], {'fields': ['currency_id'], 'limit': 1}]
    )
    currency_id = company[0]['currency_id'][0] if company else None
    print(f"   Currency ID: {currency_id}")
    
    # Step 4: Create invoice
    print(f"\n📄 Creating invoice for 5000...")
    invoice_vals = {
        'move_type': 'out_invoice',
        'partner_id': customer_id,
        'invoice_date': '2026-04-07',
        'invoice_line_ids': [(0, 0, {
            'name': 'Professional Services',
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
        
        # Read invoice details
        invoice = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'read',
            [invoice_id],
            {'fields': ['name', 'state', 'amount_total', 'partner_id', 'invoice_date', 'payment_state']}
        )
        
        if invoice:
            inv = invoice[0]
            print(f"\n{'='*60}")
            print(f"📋 INVOICE DETAILS")
            print(f"{'='*60}")
            print(f"   Invoice Number: {inv.get('name', 'N/A')}")
            print(f"   Customer: {inv.get('partner_id', ['N/A'])[1]}")
            print(f"   Total Amount: {inv.get('amount_total', 0):,.2f}")
            print(f"   State: {inv.get('state', 'N/A')}")
            print(f"   Payment State: {inv.get('payment_state', 'N/A')}")
            print(f"   Date: {inv.get('invoice_date', 'N/A')}")
            print(f"{'='*60}")
        
        # Step 5: Post/Validate the invoice
        print(f"\n📤 Posting invoice to make it official...")
        try:
            models.execute_kw(
                ODOO_DB, uid, ODOO_PASSWORD,
                'account.move', 'action_post',
                [[invoice_id]]
            )
            print(f"✅ Invoice posted successfully!")
            
            # Read updated invoice
            invoice = models.execute_kw(
                ODOO_DB, uid, ODOO_PASSWORD,
                'account.move', 'read',
                [invoice_id],
                {'fields': ['name', 'state', 'amount_total', 'payment_state', 'invoice_pdf']}
            )
            
            if invoice:
                print(f"\n📄 Final Invoice Status:")
                print(f"   Number: {invoice[0].get('name')}")
                print(f"   State: {invoice[0].get('state')}")
                print(f"   Amount: {invoice[0].get('amount_total'):,.2f}")
                print(f"   Payment: {invoice[0].get('payment_state')}")
                
        except Exception as e:
            print(f"⚠️  Invoice created but posting failed: {str(e)}")
            print(f"   You can manually post it in Odoo UI")
        
        # Step 6: Send by email (if configured)
        print(f"\n📧 Attempting to send invoice by email...")
        try:
            models.execute_kw(
                ODOO_DB, uid, ODOO_PASSWORD,
                'account.move', 'action_invoice_sent',
                [[invoice_id]]
            )
            print(f"✅ Invoice email sent!")
        except Exception as e:
            print(f"⚠️  Email sending requires mail server configuration")
            print(f"   You can manually send from Odoo UI: Accounting > Customers > Invoice > Send & Print")
        
        print(f"\n{'='*60}")
        print(f"✅ INVOICE CREATION COMPLETE!")
        print(f"{'='*60}")
        print(f"\n🔗 View in Odoo: {ODOO_URL}/web#id={invoice_id}&model=account.move")
        
    except Exception as e:
        print(f"❌ Error creating invoice: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
