#!/usr/bin/env python3
"""Direct test with hardcoded credentials"""
import xmlrpc.client

ODOO_URL = 'http://localhost:8069'
ODOO_DB = 'crm_odoo'

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')

# Test various combinations
test_cases = [
    ('abc@gmail.com', 'admin123'),
    ('abc@gmail.com', 'Admin123'),
    ('admin', 'admin123'),
    ('admin', 'Admin123'),
]

print("Testing credentials...")
for user, pwd in test_cases:
    try:
        uid = common.authenticate(ODOO_DB, user, pwd, {})
        if uid:
            print(f"  ✅ SUCCESS! {user} / {pwd} => UID: {uid}")
            print(f"\nUpdate your .env with:")
            print(f"  ODOO_USERNAME={user}")
            print(f"  ODOO_PASSWORD={pwd}")
        else:
            print(f"  ❌ {user} / {pwd}")
    except Exception as e:
        print(f"  ❌ {user} / {pwd} => Error: {e}")
