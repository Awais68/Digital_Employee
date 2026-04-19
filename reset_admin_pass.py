#!/usr/bin/env python3
"""Reset Odoo admin password using XML-RPC and master password"""

import os
import xmlrpc.client
import hashlib
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
ODOO_DB = os.getenv('ODOO_DB', 'odoo')
MASTER_PASSWORD = os.getenv('ODOO_MASTER_PASSWORD')

NEW_PASSWORD = os.getenv('ODOO_PASSWORD', 'admin123')  # New password for admin user

print("=" * 60)
print("Resetting Odoo Admin Password")
print("=" * 60)
print(f"Database: {ODOO_DB}")
print(f"New Password: {NEW_PASSWORD}")
print()

try:
    # Connect to Odoo DB management
    common = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/common')
    
    # Get version info to confirm connection
    version = common.version()
    print(f"✅ Connected to Odoo {version.get('server_version')}")
    
    # Connect to object service
    models = xmlrpc.client.ServerProxy(f'{ODOO_URL}/xmlrpc/2/object')
    
    # We need to use the master password to get superuser access
    # First, authenticate with master password (superuser)
    uid = common.authenticate(ODOO_DB, 'admin', MASTER_PASSWORD, {})
    
    if uid:
        print(f"✅ Authenticated with master password (uid: {uid})")
        
        # Hash the new password
        from werkzeug.utils import import_string
        try:
            # Odoo 19 uses passlib
            from passlib.context import CryptContext
            # Get the password context used by Odoo
            from odoo.tools import config
            password_hash = CryptContext(
                schemes=['pbkdf2_sha512', 'md5_crypt'],
                deprecated=['md5_crypt'],
                pbkdf2_sha512__rounds=5000,
            ).hash(NEW_PASSWORD)
        except ImportError:
            # Fallback: simple hash (won't work with modern Odoo)
            print("⚠️  Could not import Odoo password hashing modules")
            password_hash = None
        
        if password_hash:
            # Update admin password directly in database
            models.execute_kw(
                ODOO_DB, uid, MASTER_PASSWORD,
                'res.users', 'write',
                [uid],
                {'password': NEW_PASSWORD}  # Odoo will hash it automatically
            )
            
            print(f"✅ Admin password updated successfully!")
            print(f"   Username: admin")
            print(f"   New Password: {NEW_PASSWORD}")
            print(f"\nNow update your .env file with:")
            print(f"   ODOO_PASSWORD={NEW_PASSWORD}")
        else:
            print("❌ Could not hash password")
    else:
        print("❌ Could not authenticate with master password")
        print("   Check if ODOO_MASTER_PASSWORD is correct in .env")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
