#!/usr/bin/env python3
"""Create 350 invoices in Odoo - Direct approach"""
import xmlrpc.client, random, os
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'crm_odoo')
ODOO_USERNAME = os.getenv('ODOO_USERNAME', 'abc@gmail.com')
ODOO_PASSWORD = os.getenv('ODOO_PASSWORD', 'Haris@123')

print("Connecting to Odoo...")
common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})

if not uid:
    print("❌ Authentication failed!")
    exit(1)

print(f"✅ Authenticated! User ID: {uid}")
models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')

# Step 1: Create 20 customers
print("\n1. Creating 20 customers...")
partner_ids = []
for i in range(1, 21):
    partner_id = models.execute_kw(
        ODOO_DB, uid, ODOO_PASSWORD,
        'res.partner', 'create',
        [{'name': f'Customer {i}', 'email': f'customer{i}@example.com', 'is_company': True}]
    )
    partner_ids.append(partner_id)
print(f"   ✅ Created 20 customers: {partner_ids}")

# Step 2: Create 350 invoices
print(f"\n2. Creating 350 invoices...")
print("-" * 60)

services = [
    "Web Development", "Mobile App Development", "UI/UX Design",
    "Cloud Consulting", "Database Management", "Security Audit",
    "API Integration", "DevOps Services", "QA Testing",
    "Technical Support", "System Administration", "Data Analytics",
    "AI/ML Consulting", "Blockchain Development", "IoT Solutions",
]

created = 0
failed = 0
errors = []

for i in range(1, 351):
    partner_id = random.choice(partner_ids)
    service = random.choice(services)
    amount = round(random.uniform(100, 5000), 2)
    quantity = random.randint(1, 20)
    
    try:
        invoice_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'account.move', 'create',
            [{
                'partner_id': partner_id,
                'move_type': 'out_invoice',
                'invoice_date': '2025-04-08',
                'invoice_line_ids': [(0, 0, {
                    'name': f'{service} - Invoice #{i}',
                    'quantity': quantity,
                    'price_unit': amount,
                })]
            }]
        )
        if invoice_id:
            created += 1
        else:
            failed += 1
            if len(errors) < 3:
                errors.append(f"Invoice {i}: returned None")
        
        if i % 50 == 0:
            print(f"   Progress: {i}/350 (Created: {created}, Failed: {failed})")
            
    except Exception as e:
        failed += 1
        if len(errors) < 5:
            errors.append(f"Invoice {i}: {str(e)[:120]}")

print("-" * 60)
print(f"\n📊 Final Results:")
print(f"   ✅ Successfully created: {created}")
print(f"   ❌ Failed: {failed}")

if errors:
    print(f"\n⚠️  Sample errors:")
    for err in errors[:3]:
        print(f"   - {err}")

if created > 0:
    print(f"\n🎉 Success! {created} invoices created in Odoo!")
