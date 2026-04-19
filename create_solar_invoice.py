#!/usr/bin/env python3
"""
Create Solar System Invoice in Odoo
Creates a professional invoice for solar panel installation
"""

import os
import sys
import xmlrpc.client
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Odoo Configuration
ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "crm_odoo")
ODOO_USERNAME = os.getenv("ODOO_USERNAME", "abc@gmail.com")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")

def create_solar_invoice():
    """Create a comprehensive solar system invoice in Odoo"""
    
    print("=" * 80)
    print("  SOLAR SYSTEM INVOICE CREATION")
    print("=" * 80)
    print(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    print()
    
    # Validate credentials
    if not ODOO_PASSWORD:
        print("❌ Error: ODOO_PASSWORD not set in .env")
        sys.exit(1)
    
    # Setup XML-RPC endpoints
    common_url = f"{ODOO_URL}/xmlrpc/2/common"
    models_url = f"{ODOO_URL}/xmlrpc/2/object"
    
    common = xmlrpc.client.ServerProxy(common_url)
    models = xmlrpc.client.ServerProxy(models_url)
    
    # Step 1: Authenticate
    print("🔐 Step 1: Authenticating with Odoo...")
    print("-" * 80)
    try:
        uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
        
        if not uid:
            print("❌ Authentication failed. Please check your credentials.")
            sys.exit(1)
        
        print(f"✅ Authentication successful (User ID: {uid})")
        print(f"📍 Odoo URL: {ODOO_URL}")
        print(f"📍 Database: {ODOO_DB}")
        
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
        print("ℹ️  Make sure Odoo is running at the configured URL")
        sys.exit(1)
    
    print()
    
    # Step 2: Find or Create Customer
    print("👤 Step 2: Finding customer...")
    print("-" * 80)
    
    customer_name = "Solar Customer"
    customer_domain = [['name', 'ilike', customer_name]]
    
    try:
        customer_ids = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'res.partner', 'search',
            [customer_domain]
        )
        
        if customer_ids:
            customer_id = customer_ids[0]
            print(f"✅ Customer found: {customer_name} (ID: {customer_id})")
        else:
            print(f"⚠️  Customer not found. Creating: {customer_name}")
            
            customer_id = models.execute_kw(
                ODOO_DB, uid, ODOO_PASSWORD,
                'res.partner', 'create',
                [{
                    'name': customer_name,
                    'customer_rank': 1,
                    'email': 'solar.customer@example.com',
                    'phone': '+92-XXX-XXXXXXX',
                    'street': '123 Solar Street',
                    'city': 'Lahore',
                    'country_id': 167,  # Pakistan
                }]
            )
            print(f"✅ Customer created (ID: {customer_id})")
            
    except Exception as e:
        print(f"❌ Error with customer: {str(e)}")
        sys.exit(1)
    
    print()
    
    # Step 3: Find Solar Product
    print("🔍 Step 3: Finding solar product...")
    print("-" * 80)
    
    try:
        product_ids = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'product.template', 'search',
            [[['name', 'ilike', 'solar']]]
        )
        
        if product_ids:
            product_id = product_ids[0]
            product_info = models.execute_kw(
                ODOO_DB, uid, ODOO_PASSWORD,
                'product.template', 'read',
                [product_id],
                {'fields': ['name', 'list_price']}
            )
            print(f"✅ Solar product found: {product_info[0]['name']}")
        else:
            product_id = False
            print("⚠️  No solar product found - will create invoice lines manually")
            
    except Exception as e:
        print(f"⚠️  Product search error: {str(e)}")
        product_id = False
    
    print()
    
    # Step 4: Create Solar System Invoice
    print("📄 Step 4: Creating solar system invoice...")
    print("-" * 80)
    
    # Calculate due date (30 days from now)
    invoice_date = datetime.now().strftime('%Y-%m-%d')
    due_date = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
    
    # Invoice line items for solar system
    invoice_lines = [
        (0, 0, {
            'name': 'Solar Panel System - 10kW Premium Package\n'
                    '• 25x 400W Monocrystalline Solar Panels\n'
                    '• High-efficiency panels (21%+ efficiency)\n'
                    '• 25-year performance warranty',
            'quantity': 10,
            'price_unit': 28000.00,  # Per kW
        }),
        (0, 0, {
            'name': 'Hybrid Inverter - 10kW\n'
                    '• Smart hybrid inverter\n'
                    '• Battery compatible\n'
                    '• WiFi monitoring enabled\n'
                    '• 10-year warranty',
            'quantity': 1,
            'price_unit': 180000.00,
        }),
        (0, 0, {
            'name': 'Battery Storage System - 20kWh\n'
                    '• Lithium-ion battery bank\n'
                    '• Backup power capability\n'
                    '• Grid-independent operation\n'
                    '• 10-year warranty',
            'quantity': 20,
            'price_unit': 15000.00,  # Per kWh
        }),
        (0, 0, {
            'name': 'Mounting Structure & Installation\n'
                    '• Aluminum mounting rails\n'
                    '• Roof penetration sealing\n'
                    '• Weatherproof cable management\n'
                    '• Professional installation',
            'quantity': 1,
            'price_unit': 150000.00,
        }),
        (0, 0, {
            'name': 'Electrical Components & Wiring\n'
                    '• DC/AC disconnects\n'
                    '• Surge protection devices\n'
                    '• Solar cables (UV resistant)\n'
                    '• Junction boxes & connectors',
            'quantity': 1,
            'price_unit': 85000.00,
        }),
        (0, 0, {
            'name': 'Monitoring System & Smart Meter\n'
                    '• Real-time energy monitoring\n'
                    '• Mobile app access\n'
                    '• Net metering setup\n'
                    '• Smart energy meter',
            'quantity': 1,
            'price_unit': 45000.00,
        }),
        (0, 0, {
            'name': 'Permits & Engineering\n'
                    '• Building permits\n'
                    '• Electrical permits\n'
                    '• Structural engineering assessment\n'
                    '• Grid interconnection agreement',
            'quantity': 1,
            'price_unit': 75000.00,
        }),
        (0, 0, {
            'name': 'Commissioning & Training\n'
                    '• System testing & commissioning\n'
                    '• Customer training session\n'
                    '• Documentation & manuals\n'
                    '• 2-year maintenance included',
            'quantity': 1,
            'price_unit': 35000.00,
        }),
    ]
    
    invoice_vals = {
        'move_type': 'out_invoice',
        'partner_id': customer_id,
        'invoice_date': invoice_date,
        'invoice_date_due': due_date,
        'invoice_line_ids': invoice_lines,
        'narration': 'Solar Panel System Installation - Complete 10kW Premium Package with Battery Storage\n\n'
                     'Payment Terms: Net 30\n'
                     'Warranty: 25 years on panels, 10 years on inverter and batteries\n'
                     'Includes: Installation, permits, commissioning, and training',
    }
    
    try:
        invoice_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'create',
            [invoice_vals]
        )
        
        print(f"✅ INVOICE CREATED SUCCESSFULLY!")
        print()
        print(f"📋 Invoice Details:")
        print(f"   Invoice ID: {invoice_id}")
        print(f"   Customer: {customer_name}")
        print(f"   Invoice Date: {invoice_date}")
        print(f"   Due Date: {due_date}")
        print()
        
        # Read back the invoice
        invoice = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'read',
            [invoice_id],
            {'fields': ['name', 'state', 'amount_total', 'amount_untaxed', 
                       'amount_tax', 'partner_id', 'invoice_date', 'invoice_date_due']}
        )
        
        if invoice:
            inv_data = invoice[0]
            print("=" * 80)
            print("  INVOICE SUMMARY")
            print("=" * 80)
            print(f"  Invoice Number: {inv_data.get('name', 'N/A')}")
            print(f"  Customer: {customer_name}")
            print(f"  Invoice Date: {inv_data.get('invoice_date', 'N/A')}")
            print(f"  Due Date: {inv_data.get('invoice_date_due', 'N/A')}")
            print(f"  State: {inv_data.get('state', 'Draft')}")
            print("-" * 80)
            print(f"  Subtotal: PKR {inv_data.get('amount_untaxed', 0):,.2f}")
            print(f"  Tax: PKR {inv_data.get('amount_tax', 0):,.2f}")
            print(f"  TOTAL AMOUNT: PKR {inv_data.get('amount_total', 0):,.2f}")
            print("=" * 80)
            print()
            print(f"🔗 Direct Link: {ODOO_URL}/web#id={invoice_id}&view_type=form&model=account.move")
            print()
            
            # Step 5: Post/Validate Invoice
            print("✅ Step 5: Posting invoice (making it official)...")
            print("-" * 80)
            
            try:
                models.execute_kw(
                    ODOO_DB, uid, ODOO_PASSWORD,
                    'account.move', 'action_post',
                    [[invoice_id]]
                )
                print("✅ Invoice posted and validated!")
                
                # Read updated state
                invoice_updated = models.execute_kw(
                    ODOO_DB, uid, ODOO_PASSWORD,
                    'account.move', 'read',
                    [invoice_id],
                    {'fields': ['state', 'name']}
                )
                
                if invoice_updated:
                    print(f"   Invoice Number: {invoice_updated[0].get('name', 'N/A')}")
                    print(f"   Status: {invoice_updated[0].get('state', 'N/A')}")
                    
            except Exception as e:
                print(f"⚠️  Could not auto-post invoice: {str(e)}")
                print("ℹ️  You may need to manually post it in Odoo")
            
            print()
            return invoice_id
            
    except Exception as e:
        print(f"❌ Error creating invoice: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    try:
        invoice_id = create_solar_invoice()
        print("=" * 80)
        print("  ✅ SOLAR SYSTEM INVOICE COMPLETED")
        print("=" * 80)
        print(f"  Invoice ID: {invoice_id}")
        print(f"  Next Steps:")
        print(f"  1. Review invoice in Odoo")
        print(f"  2. Confirm and send to customer")
        print(f"  3. Track payment")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Failed to create solar system invoice: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
