#!/usr/bin/env python3
"""Test with master password as user password"""
import os
import xmlrpc.client
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'crm_odoo')
MASTER = os.getenv('ODOO_MASTER_PASSWORD', 'admin123')

common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')

# Try common passwords
passwords = ['admin123', 'admin', 'password', 'Odoo@123', 'odoo123']

for pwd in passwords:
    uid = common.authenticate(ODOO_DB, 'admin', pwd, {})
    if uid:
        print(f"✅ SUCCESS! User: admin, Password: {pwd}, UID: {uid}")
        break
    else:
        print(f"❌ admin / {pwd}")
