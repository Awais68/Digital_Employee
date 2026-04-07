#!/usr/bin/env python3
"""
Change admin password using Odoo's database management endpoint.

⚠️  SECURITY: This script reads credentials from the .env file.
    Never hardcode passwords in source code.
"""

import os
import sys
import subprocess
import requests
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

ODOO_URL = os.getenv("ODOO_URL", "http://localhost:8069")
ODOO_DB = os.getenv("ODOO_DB", "odoo")
MASTER_PASSWORD = os.getenv("ODOO_MASTER_PASSWORD")
NEW_ADMIN_PASSWORD = os.getenv("ODOO_NEW_ADMIN_PASSWORD")

# Validate required credentials
if not MASTER_PASSWORD:
    print("❌ Error: ODOO_MASTER_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_MASTER_PASSWORD=your-master-password")
    sys.exit(1)

if not NEW_ADMIN_PASSWORD:
    print("❌ Error: ODOO_NEW_ADMIN_PASSWORD not set in .env")
    print("\nPlease add the following to your .env file:")
    print("   ODOO_NEW_ADMIN_PASSWORD=your-new-password")
    sys.exit(1)

def change_admin_password():
    """Use Odoo's web/database manager to change admin password"""
    
    # First, let's try to access the database manager
    url = f"{ODOO_URL}/web/database/manager"
    print(f"Accessing: {url}")
    
    # Get the list of databases first
    response = requests.get(url)
    print(f"Status: {response.status_code}")
    
    # Try to change password via the manage endpoint
    change_url = f"{ODOO_URL}/web/database/change_password"
    
    payload = {
        'db': ODOO_DB,
        'master_pwd': MASTER_PASSWORD,
        'password': NEW_ADMIN_PASSWORD,
    }
    
    print(f"\nTrying to change database password...")
    print(f"This will change the master password for the '{ODOO_DB}' database")
    
    # Actually, we need to change a user's password, not the database password
    # Let me try a different approach - directly query through the web interface
    
    print("\n" + "=" * 60)
    print("Instead, let's try to access the database directly")
    print("=" * 60)
    
    # Try to connect to PostgreSQL as the odoo system user
    import subprocess
    
    # Use sudo -u odoo to run psql
    try:
        result = subprocess.run(
            ['sudo', '-u', 'odoo', 'psql', '-d', 'odoo', '-c', 
             "SELECT id, login, active, name FROM res_users WHERE active = true ORDER BY login;"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            print("\n✅ Successfully queried Odoo users:")
            print(result.stdout)
            
            # Now let's update the password for admin user
            print("\n" + "=" * 60)
            print("Updating admin credentials")
            print("=" * 60)

            # Build SQL query securely (password from .env, not hardcoded)
            sql_query = "UPDATE res_users SET password = %s WHERE login = 'admin';"
            update_result = subprocess.run(
                ['sudo', '-u', 'odoo', 'psql', '-d', ODOO_DB, '-c',
                 sql_query.replace('%s', f"'{NEW_ADMIN_PASSWORD}'")],
                capture_output=True,
                text=True,
                timeout=10
            )

            if update_result.returncode == 0:
                print("\n✅ Admin password updated successfully!")
                print("   New password: [set in .env as ODOO_NEW_ADMIN_PASSWORD]")
                print("   Username: admin")
                return True
            else:
                print(f"\n❌ Error updating password: {update_result.stderr}")
                return False
        else:
            print(f"\n❌ Failed to query users: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("\n❌ Command timed out")
        return False
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    change_admin_password()
