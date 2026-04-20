#!/usr/bin/env python3
import os
import re
import requests

def get_token_from_env():
    try:
        with open(".env", "r") as f:
            content = f.read()
            match = re.search(r'INSTAGRAM_ACCESS_TOKEN=([^\n]+)', content)
            if match:
                return match.group(1).strip()
    except Exception as e:
        print(f"Error reading .env: {e}")
    return None

def fetch_instagram_id():
    token = get_token_from_env()
    if not token:
        print("❌ No token found in .env via regex")
        return

    print(f"🔍 Token found (starts with {token[:10]}...)")
    print("🔍 Fetching Instagram Account ID...")
    
    # Step 1: Get Pages
    pages_url = f"https://graph.facebook.com/v18.0/me/accounts?access_token={token}"
    res = requests.get(pages_url).json()
    
    if "data" not in res or not res["data"]:
        print(f"❌ Could not find any Facebook Pages. Error: {res}")
        return

    for page in res["data"]:
        page_id = page["id"]
        page_name = page["name"]
        print(f"Found Page: {page_name} (ID: {page_id})")
        
        # Step 2: Get Instagram Business Account linked to this page
        ig_url = f"https://graph.facebook.com/v18.0/{page_id}?fields=instagram_business_account&access_token={token}"
        ig_res = requests.get(ig_url).json()
        
        if "instagram_business_account" in ig_res:
            ig_id = ig_res["instagram_business_account"]["id"]
            print(f"✅ Found Instagram Business Account ID: {ig_id}")
            return ig_id
    
    print("❌ No Instagram Business Account found linked to your pages.")
    return None

if __name__ == "__main__":
    ig_id = fetch_instagram_id()
    if ig_id:
        # Update .env
        with open(".env", "r") as f:
            lines = f.readlines()
        
        new_lines = []
        found = False
        for line in lines:
            if line.startswith("INSTAGRAM_ACCOUNT_ID="):
                new_lines.append(f"INSTAGRAM_ACCOUNT_ID={ig_id}\n")
                found = True
            else:
                new_lines.append(line)
        
        if not found:
            new_lines.append(f"INSTAGRAM_ACCOUNT_ID={ig_id}\n")
            
        with open(".env", "w") as f:
            f.writelines(new_lines)
        print("✅ .env updated with INSTAGRAM_ACCOUNT_ID")
