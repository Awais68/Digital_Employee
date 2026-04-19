#!/usr/bin/env python3
"""Test all databases with admin123"""
import xmlrpc.client

ODOO_URL = 'http://localhost:8069'
common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')

dbs = ['crm_odoo', 'odoo']
passwords = ['admin123', 'Admin123', 'ADMIN123']

for db in dbs:
    print(f"\nDatabase: {db}")
    for pwd in passwords:
        uid = common.authenticate(db, 'admin', pwd, {})
        if uid:
            print(f"  ✅ SUCCESS! admin / {pwd} => UID: {uid}")
        else:
            print(f"  ❌ admin / {pwd}")
