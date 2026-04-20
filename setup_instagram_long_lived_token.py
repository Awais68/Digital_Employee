#!/usr/bin/env python3
"""
setup_instagram_long_lived_token.py - Exchange short-lived token for long-lived/permanent token.
"""

import os
import sys
import requests
from pathlib import Path
from dotenv import load_dotenv

# Add root to sys.path
BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

from Agent_Skills.SKILL_Instagram_Graph_API import exchange_for_long_lived_token, get_permanent_page_token

load_dotenv()

def main():
    print("=" * 70)
    print("📸 INSTAGRAM LONG-LIVED TOKEN SETUP")
    print("=" * 70)
    
    app_id = os.getenv("FB_INSTAGRAM_APP_ID")
    app_secret = os.getenv("FB_INSTAGRAM_APP_SECRET")
    
    if not app_id or not app_secret or app_id == "your_instagram_app_id":
        print("❌ FB_INSTAGRAM_APP_ID and FB_INSTAGRAM_APP_SECRET must be set in .env")
        app_id = input("Enter FB App ID: ")
        app_secret = input("Enter FB App Secret: ")
    
    print(f"App ID: {app_id}")
    
    short_token = input("\nEnter your short-lived User Access Token from Graph API Explorer: ")
    
    # Step 1: Exchange for Long-Lived User Token (60 days)
    print("\n⏳ Exchanging for 60-day long-lived token...")
    ll_result = exchange_for_long_lived_token(short_token, app_id, app_secret)
    
    if "access_token" not in ll_result:
        print(f"❌ Failed to get long-lived token: {ll_result}")
        return
    
    long_lived_token = ll_result["access_token"]
    print("✅ Received long-lived User Access Token (expires in ~60 days)")
    
    # Step 2: Get Page Access Token (Permanent)
    print("\n❓ Do you want to get a permanent Page Access Token? (Recommended)")
    print("   This token does not expire and can be used for Instagram posting.")
    choice = input("Get permanent token? (y/n): ").lower()
    
    final_token = long_lived_token
    
    if choice == 'y':
        # First, find the pages the user has access to
        print("🔍 Searching for your Facebook Pages...")
        pages_url = f"https://graph.facebook.com/v18.0/me/accounts?access_token={long_lived_token}"
        pages_res = requests.get(pages_url).json()
        
        if "data" not in pages_res or not pages_res["data"]:
            print(f"❌ No pages found: {pages_res}")
        else:
            print("\nSelect the page connected to your Instagram Business Account:")
            for i, page in enumerate(pages_res["data"]):
                print(f"[{i}] {page['name']} (ID: {page['id']})")
            
            p_idx = int(input("\nEnter index: "))
            selected_page = pages_res["data"][p_idx]
            page_id = selected_page["id"]
            
            print(f"\n⏳ Fetching permanent token for {selected_page['name']}...")
            perm_result = get_permanent_page_token(long_lived_token, page_id)
            
            if "access_token" in perm_result:
                final_token = perm_result["access_token"]
                print("✅ Received PERMANENT Page Access Token!")
            else:
                print(f"❌ Failed to get permanent token: {perm_result}")
    
    # Step 3: Save to .env
    print(f"\n💾 Updating .env with new token...")
    
    env_path = BASE_DIR / ".env"
    with open(env_path, "r") as f:
        lines = f.readlines()
    
    updated = False
    new_lines = []
    for line in lines:
        if line.startswith("INSTAGRAM_ACCESS_TOKEN="):
            new_lines.append(f"INSTAGRAM_ACCESS_TOKEN={final_token}\n")
            updated = True
        else:
            new_lines.append(line)
    
    if not updated:
        new_lines.append(f"\n# Instagram Graph API Configuration\nINSTAGRAM_ACCESS_TOKEN={final_token}\n")
    
    with open(env_path, "w") as f:
        f.writelines(new_lines)
    
    print("✅ .env updated successfully!")
    print("\n🚀 Now you can test it with:")
    print("   python3 Agent_Skills/SKILL_Instagram_Graph_API.py test")
    print("=" * 70)

if __name__ == "__main__":
    main()
