#!/usr/bin/env python3
"""Reset Odoo admin password using direct database access"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(override=True)

ODOO_DB = os.getenv('ODOO_DB', 'odoo')
NEW_PASSWORD = os.getenv('ODOO_PASSWORD', 'Haris@123')

print("=" * 60)
print("Resetting Odoo Admin Password via Database")
print("=" * 60)
print(f"Database: {ODOO_DB}")
print(f"New Password: {NEW_PASSWORD}")
print()

try:
    # Connect to PostgreSQL
    conn = psycopg2.connect(dbname="postgres", user="odoo")
    conn.autocommit = True
    cursor = conn.cursor()
    
    print("✅ Connected to PostgreSQL")
    
    # Check if database exists
    cursor.execute("SELECT datname FROM pg_database WHERE datname = %s", (ODOO_DB,))
    if not cursor.fetchone():
        print(f"❌ Database '{ODOO_DB}' does not exist")
        cursor.close()
        conn.close()
        exit(1)
    
    # Connect to Odoo database
    conn.close()
    conn = psycopg2.connect(dbname=ODOO_DB, user="odoo")
    conn.autocommit = True
    cursor = conn.cursor()
    
    print(f"✅ Connected to database '{ODOO_DB}'")
    
    # Get admin user
    cursor.execute("SELECT id, login FROM res_users WHERE login = 'admin'")
    admin_user = cursor.fetchone()
    
    if admin_user:
        admin_id, admin_login = admin_user
        print(f"✅ Found admin user (ID: {admin_id}, Login: {admin_login})")
        
        # Update password - Odoo will hash it automatically through the ORM
        # But we're doing direct SQL, so we need to use the proper format
        # Let's use the web interface approach instead
        print(f"\n⚠️  Direct SQL password update is complex due to Odoo's hashing")
        print(f"   Using web endpoint instead...")
        
        cursor.close()
        conn.close()
        
        # Use web endpoint
        import requests
        
        ODOO_URL = os.getenv('ODOO_URL', 'http://localhost:8069')
        MASTER_PASSWORD = os.getenv('ODOO_MASTER_PASSWORD')
        
        url = f"{ODOO_URL}/web/database/change_password"
        payload = {
            "db": ODOO_DB,
            "master_pwd": MASTER_PASSWORD,
            "new_password": NEW_PASSWORD
        }
        
        print(f"\n📡 Sending password reset request...")
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200 and "true" in response.text.lower():
            print(f"\n✅ Password reset successful!")
            print(f"   Username: admin")
            print(f"   New Password: {NEW_PASSWORD}")
            print(f"\nUpdate your .env file with:")
            print(f"   ODOO_PASSWORD={NEW_PASSWORD}")
        else:
            print(f"\n❌ Password reset failed")
            print("   Try accessing Odoo web interface at http://localhost:8069")
            print("   and reset password manually")
    else:
        print("❌ Admin user not found")
        cursor.close()
        conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
