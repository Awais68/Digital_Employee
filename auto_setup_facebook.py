#!/usr/bin/env python3
"""
auto_setup_facebook.py - Automated Facebook session setup
Launches browser, waits for login, auto-saves session
"""

import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent
FACEBOOK_SESSION_DIR = BASE_DIR / "facebook_session"
FACEBOOK_SESSION_DIR.mkdir(parents=True, exist_ok=True)
BROWSER_DATA_DIR = str(FACEBOOK_SESSION_DIR / "browser_data")

print("📘 Launching Facebook login...")
print("   Login to Facebook in the browser window")
print("   Session will auto-save after 60 seconds\n")

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=BROWSER_DATA_DIR,
        headless=False,
        args=['--no-sandbox', '--disable-setuid-sandbox'],
    )
    page = context.pages[0] if context.pages else context.new_page()
    
    print("   Opening Facebook login page...")
    page.goto("https://www.facebook.com", wait_until="domcontentloaded")
    
    print("\n✅ Browser opened! Please login now...")
    print("   You have 120 seconds to login (complete 2FA if needed)\n")
    
    # Wait 120 seconds for user to login (2FA may be needed)
    for i in range(120, 0, -1):
        if i % 10 == 0:
            print(f"   {i} seconds remaining...")
        time.sleep(1)
    
    print("\n💾 Saving session...")
    
    # Save cookies as JSON (backup / compatibility)
    cookies = context.cookies()
    session_file = FACEBOOK_SESSION_DIR / "cookies.json"
    
    import json
    with open(session_file, "w") as f:
        json.dump(cookies, f, indent=2)
    
    print(f"✅ Facebook session saved to: {session_file}")
    print(f"   Cookies saved: {len(cookies)}")
    print(f"   Browser profile saved at: {BROWSER_DATA_DIR}")
    
    # Verify login state
    current_url = page.url
    print(f"   Current URL: {current_url}")
    
    if "/login" in current_url.lower():
        print("\n❌ Login not detected. Session may not be valid.")
        print("   Please ensure you're fully logged in before time runs out.")
    else:
        print("\n✅ Login detected! Session should be valid.")
    
    context.close()
    
    print("\n🎉 Setup complete!")
    print("   Test with: python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py test-facebook")
