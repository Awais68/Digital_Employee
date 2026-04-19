#!/usr/bin/env python3
"""
auto_setup_facebook.py - Automated Facebook session setup
Launches browser, waits for login, auto-saves session
"""

import time
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent
FACEBOOK_SESSION_DIR = BASE_DIR / "facebook_session"
FACEBOOK_SESSION_DIR.mkdir(parents=True, exist_ok=True)

print("📘 Launching Facebook login...")
print("   Login to Facebook in the browser window")
print("   Session will auto-save after 60 seconds\n")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    
    print("   Opening Facebook login page...")
    page.goto("https://www.facebook.com", wait_until="domcontentloaded")
    
    print("\n✅ Browser opened! Please login now...")
    print("   You have 60 seconds to login\n")
    
    # Wait 60 seconds for user to login
    for i in range(60, 0, -1):
        if i % 10 == 0:
            print(f"   {i} seconds remaining...")
        time.sleep(1)
    
    print("\n💾 Saving session...")
    
    # Save cookies
    cookies = context.cookies()
    session_file = FACEBOOK_SESSION_DIR / "cookies.json"
    
    import json
    with open(session_file, "w") as f:
        json.dump(cookies, f, indent=2)
    
    print(f"✅ Facebook session saved to: {session_file}")
    print(f"   Cookies saved: {len(cookies)}")
    
    # Verify login state
    current_url = page.url
    print(f"   Current URL: {current_url}")
    
    if "/login" in current_url.lower():
        print("\n❌ Login not detected. Session may not be valid.")
        print("   Please ensure you're fully logged in before time runs out.")
    else:
        print("\n✅ Login detected! Session should be valid.")
    
    browser.close()
    
    print("\n🎉 Setup complete!")
    print("   Test with: python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py test-facebook")
