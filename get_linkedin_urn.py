#!/usr/bin/env python3
"""
get_linkedin_urn.py - Get Your LinkedIn Person URN

This script fetches your LinkedIn profile info and extracts your Person URN.

Usage:
    python3 get_linkedin_urn.py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment
BASE_DIR = Path(__file__).parent.resolve()
load_dotenv(BASE_DIR / ".env")

# Get access token
ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "")

if not ACCESS_TOKEN:
    print("❌ Error: LINKEDIN_ACCESS_TOKEN not configured in .env")
    print("\nPlease add your LinkedIn access token to .env file")
    sys.exit(1)

# Make API call
try:
    import requests
    
    print("=" * 70)
    print("  FETCHING LINKEDIN PROFILE INFO")
    print("=" * 70)
    print()
    
    # Fetch profile
    response = requests.get(
        "https://api.linkedin.com/v2/me",
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "X-Restli-Protocol-Version": "2.0.0"
        }
    )
    
    if response.status_code == 200:
        profile = response.json()
        
        # Extract info
        person_id = profile.get('id', '')
        first_name = profile.get('localizedFirstName', 'Unknown')
        last_name = profile.get('localizedLastName', '')
        
        person_urn = f"urn:li:person:{person_id}"
        
        print(f"✅ Successfully connected to LinkedIn!")
        print()
        print(f"👤 Profile Information:")
        print(f"   Name: {first_name} {last_name}")
        print(f"   ID: {person_id}")
        print()
        print(f"📝 Your Person URN:")
        print(f"   {person_urn}")
        print()
        print("=" * 70)
        print("  NEXT STEP: Update .env file")
        print("=" * 70)
        print()
        print(f"Replace this line in .env:")
        print(f"   LINKEDIN_PERSON_URN=urn:li:person:YOUR_PERSON_ID")
        print()
        print(f"With:")
        print(f"   LINKEDIN_PERSON_URN={person_urn}")
        print()
        print("=" * 70)
        print()
        
        # Ask to update .env
        response = input("Would you like me to update .env automatically? (y/n): ")
        if response.lower() == 'y':
            # Read .env
            env_file = BASE_DIR / ".env"
            with open(env_file, 'r', encoding='utf-8') as f:
                env_content = f.read()
            
            # Replace old URN with new one
            old_line = "LINKEDIN_PERSON_URN=urn:li:person:YOUR_PERSON_ID"
            new_line = f"LINKEDIN_PERSON_URN={person_urn}"
            
            if old_line in env_content:
                env_content = env_content.replace(old_line, new_line)
                
                with open(env_file, 'w', encoding='utf-8') as f:
                    f.write(env_content)
                
                print(f"✅ .env file updated successfully!")
                print(f"   New URN: {person_urn}")
            else:
                print(f"⚠️  Could not find old URN line in .env")
                print(f"   Please manually add: LINKEDIN_PERSON_URN={person_urn}")
        
    elif response.status_code == 401:
        print("❌ Authentication failed!")
        print("   Your access token may be expired or invalid")
        print()
        print("   To get a new token:")
        print("   1. Go to: https://www.linkedin.com/developers/tools/oauth/token-generator")
        print("   2. Select your app")
        print("   3. Generate new token")
        print("   4. Update .env with new token")
        
    elif response.status_code == 403:
        print("❌ Access denied (403)")
        print("   Your token may not have the required permissions")
        print()
        print("   Required scope: r_basicprofile")
        print("   To fix:")
        print("   1. Go to your app settings")
        print("   2. Add 'r_basicprofile' permission")
        print("   3. Generate new token")
        
    else:
        print(f"❌ API Error: {response.status_code}")
        print(f"   Response: {response.text}")
        
except ImportError:
    print("❌ Error: 'requests' library not installed")
    print("   Install with: pip install requests")
except Exception as e:
    print(f"❌ Unexpected error: {e}")

print()
