#!/usr/bin/env python3
"""Test Odoo connection using credentials from .env file"""

import os
import xmlrpc.client
from dotenv import load_dotenv

# Force reload environment variables
load_dotenv(override=True)

# Get Odoo configuration
ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'digital_fte')
ODOO_USERNAME = os.getenv('ODOO_USERNAME', 'awaisniaz720@gmail.com')
ODOO_PASSWORD = os.getenv('ODOO_PASSWORD')
ODOO_MASTER_PASSWORD = os.getenv('ODOO_MASTER_PASSWORD')

print("=" * 60)
print("Testing Odoo Connection")
print("=" * 60)
print(f"\nOdoo URL: {ODOO_URL}")
print(f"Database: {ODOO_DB}")
print(f"Username: {ODOO_USERNAME}")
print(f"Password: {'*' * len(ODOO_PASSWORD) if ODOO_PASSWORD else 'NOT SET'}")
print(f"Master Password: {'*' * len(ODOO_MASTER_PASSWORD) if ODOO_MASTER_PASSWORD else 'NOT SET'}")
print()

try:
    # Test connection to Odoo server
    print("1. Testing server connection...")
    common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
    version = common.version()
    print(f"   ✅ Connected! Odoo version: {version}")
    
    # Test authentication
    print("\n2. Testing authentication...")
    uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
    
    if uid:
        print(f"   ✅ Authentication successful! User ID (uid): {uid}")
        
        # Get user info
        print("\n3. Fetching user information...")
        models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')
        user_info = models.execute_kw(
            ODOO_DB, uid, ODOO_PASSWORD,
            'res.users', 'read',
            [uid],
            {'fields': ['name', 'login', 'email']}
        )
        
        if user_info:
            user = user_info[0]
            print(f"   ✅ User Name: {user.get('name', 'N/A')}")
            print(f"   ✅ Login: {user.get('login', 'N/A')}")
            print(f"   ✅ Email: {user.get('email', 'N/A')}")
        
        # Test database listing
        print("\n4. Testing database listing...")
        db_list = common.list()
        print(f"   ✅ Available databases: {db_list}")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED! Odoo connection is working correctly.")
        print("=" * 60)
        
    else:
        print("   ❌ Authentication failed! Check your username/password.")
        print("   Possible issues:")
        print("   - Incorrect credentials in .env")
        print("   - User doesn't have access to this database")
        print("   - Database doesn't exist")
        
except xmlrpc.client.Fault as e:
    print(f"\n   ❌ XML-RPC Fault: {e.faultString}")
    print("   Check if Odoo is running and accessible.")
    
except ConnectionRefusedError:
    print("\n   ❌ Connection refused!")
    print("   Is Odoo running on http://localhost:8069?")
    print("   Start Odoo or check the URL.")
    
except Exception as e:
    print(f"\n   ❌ Error: {str(e)}")
    import traceback
    print(f"\n   Full traceback:")
    print(traceback.format_exc())
