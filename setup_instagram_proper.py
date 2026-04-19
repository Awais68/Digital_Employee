#!/usr/bin/env python3
"""
setup_instagram_proper.py - Proper Instagram session setup
Ensures we login to Instagram (not Facebook)
"""

import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent
INSTAGRAM_SESSION_DIR = BASE_DIR / "instagram_session"
INSTAGRAM_SESSION_DIR.mkdir(parents=True, exist_ok=True)

print("📸 Instagram Session Setup")
print("=" * 60)
print("   A browser will open to Instagram login page")
print("   Login manually, then wait 30 seconds for auto-save\n")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    
    # Go directly to Instagram login
    print("   Opening Instagram login page...")
    page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
    time.sleep(3)
    
    print(f"   Current page: {page.url}")
    print("   ✅ Please login to Instagram now...")
    print("   ⏱️  Auto-saving in 30 seconds\n")
    
    # Wait for user to login
    for i in range(30, 0, -1):
        if i % 5 == 0:
            print(f"   {i} seconds remaining... (current URL: {page.url})")
        time.sleep(1)
    
    # Save cookies
    print("\n💾 Saving Instagram session...")
    cookies = context.cookies()
    session_file = INSTAGRAM_SESSION_DIR / "cookies.json"
    
    with open(session_file, "w") as f:
        json.dump(cookies, f, indent=2)
    
    print(f"✅ Session saved to: {session_file}")
    print(f"   Cookies: {len(cookies)}")
    print(f"   Final URL: {page.url}")
    
    # Verify we're on Instagram (not Facebook)
    if "instagram.com" in page.url:
        print("\n✅ SUCCESS: Instagram session saved correctly!")
    else:
        print(f"\n⚠️  WARNING: URL is {page.url}")
        print("   This might not be a valid Instagram session")
    
    browser.close()
    print("\n🎉 Setup complete!")
