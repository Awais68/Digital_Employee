#!/usr/bin/env python3
"""Reset Odoo admin password using master password.

⚠️  SECURITY: This script reads credentials from the .env file.
    Never hardcode passwords in source code.
"""

import os
import sys
import requests
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "odoo")
MASTER_PASSWORD = os.getenv("ODOO_MASTER_PASSWORD")
NEW_PASSWORD = os.getenv("ODOO_NEW_ADMIN_PASSWORD")

# Validate required credentials
if not MASTER_PASSWORD:
    print("❌ Error: ODOO_MASTER_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_MASTER_PASSWORD=your-master-password")
    sys.exit(1)

if not NEW_PASSWORD:
    print("❌ Error: ODOO_NEW_ADMIN_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_NEW_ADMIN_PASSWORD=your-new-password")
    sys.exit(1)

# Use web endpoint to change database password
url = f"{ODOO_URL}/web/database/change_password"

payload = {
    "db": ODOO_DB,
    "master_pwd": MASTER_PASSWORD,
    "new_password": NEW_PASSWORD
}

headers = {"Content-Type": "application/json"}

response = requests.post(url, json=payload, headers=headers)
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")

if response.status_code == 200 and "true" in response.text.lower():
    print(f"\n✅ Password reset successful!")
    print(f"   Login: admin")
    print(f"   Password: [set in .env as ODOO_NEW_ADMIN_PASSWORD]")
else:
    print(f"\n❌ Password reset failed")
