#!/usr/bin/env python3
"""Test Odoo authentication with different users"""

import os
import xmlrpc.client
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'odoo')
ODOO_PASSWORD = os.getenv('ODOO_PASSWORD')

print("Testing authentication with different users...")
print(f"Database: {ODOO_DB}")
print()

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')

# Test 1: admin user
print("Test 1: username=admin")
uid = common.authenticate(ODOO_DB, 'admin', ODOO_PASSWORD, {})
if uid:
    print(f"   ✅ SUCCESS! User ID: {uid}")
else:
    print(f"   ❌ Failed")

# Test 2: email user
print(f"\nTest 2: username=awaisniaz720@gmail.com")
uid = common.authenticate(ODOO_DB, 'awaisniaz720@gmail.com', ODOO_PASSWORD, {})
if uid:
    print(f"   ✅ SUCCESS! User ID: {uid}")
else:
    print(f"   ❌ Failed")
