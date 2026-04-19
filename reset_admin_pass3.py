#!/usr/bin/env python3
"""Reset Odoo admin password using web endpoint"""

import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'odoo')
MASTER_PASSWORD = os.getenv('ODOO_MASTER_PASSWORD')

NEW_PASSWORD = os.getenv('ODOO_PASSWORD', 'Haris@123')

print("=" * 60)
print("Resetting Odoo Admin Password")
print("=" * 60)
print(f"Database: {ODOO_DB}")
print(f"New Password: {NEW_PASSWORD}")
print()

url = f"{ODOO_URL}/web/database/change_password"
payload = {
    "db": ODOO_DB,
    "master_pwd": MASTER_PASSWORD,
    "new_password": NEW_PASSWORD
}

try:
    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200 and "true" in response.text.lower():
        print(f"\n✅ Password reset successful!")
        print(f"   Username: admin")
        print(f"   New Password: {NEW_PASSWORD}")
        print(f"\nNow testing authentication...")
        
        # Update .env file
        import xmlrpc.client
        common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
        uid = common.authenticate(ODOO_DB, 'admin', NEW_PASSWORD, {})
        
        if uid:
            print(f"✅ Authentication confirmed! User ID: {uid}")
        else:
            print("⚠️  Password reset succeeded but authentication test failed")
            print("   You may need to wait a moment or restart Odoo")
    else:
        print(f"\n❌ Password reset failed")
        print("   This might mean:")
        print("   - Master password is incorrect")
        print("   - Database doesn't exist")
        print("   - Odoo web interface issue")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
