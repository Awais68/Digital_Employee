#!/usr/bin/env python3
"""Quick auth test"""
import os, xmlrpc.client
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'crm_odoo')

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')

# Test different users
users_to_test = ['admin', 'awais@gmail.com', 'awais', 'Haris@123']

for user in users_to_test:
    uid = common.authenticate(ODOO_DB, user, 'Haris@123', {})
    if uid:
        print(f"✅ SUCCESS! User: {user}, Password: Haris@123, UID: {uid}")
        break
    else:
        print(f"❌ Failed: {user}")
