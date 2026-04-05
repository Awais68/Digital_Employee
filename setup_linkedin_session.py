#!/usr/bin/env python3
"""
setup_linkedin_session.py - Quick LinkedIn Session Setup

This script helps you save your LinkedIn session for automated posting.
You only need to do this ONCE - the session will be reused forever.

Usage:
    python3 setup_linkedin_session.py

Author: Digital Employee System
"""

import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime

# Colors for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def print_header():
    print("\n" + "=" * 70)
    print(f"{BLUE}🔵 LinkedIn Session Setup{RESET}")
    print("=" * 70)
    print()

def check_playwright():
    """Check if Playwright is installed"""
    try:
        import playwright
        print(f"{GREEN}✅{RESET} Playwright is installed")
        return True
    except ImportError:
        print(f"{YELLOW}⚠️  Playwright not installed{RESET}")
        print("\nInstalling Playwright...")
        os.system("pip install playwright")
        os.system("playwright install chromium")
        
        try:
            import playwright
            print(f"{GREEN}✅{RESET} Playwright installed successfully")
            return True
        except ImportError:
            print(f"{RED}❌ Failed to install Playwright{RESET}")
            return False

def save_session():
    """Save LinkedIn session via browser automation"""
    from playwright.sync_api import sync_playwright
    
    # Session directory
    session_dir = Path(__file__).parent / "linkedin_session"
    session_dir.mkdir(parents=True, exist_ok=True)
    cookies_file = session_dir / "cookies.json"
    
    print(f"\n{BLUE}🔐 Starting LinkedIn Session Setup{RESET}")
    print("=" * 60)
    print()
    print("A browser window will open in 3 seconds...")
    print()
    print(f"{YELLOW}📋 INSTRUCTIONS:{RESET}")
    print("   1. Login to LinkedIn (scan QR code or enter credentials)")
    print("   2. Wait until you see your LinkedIn feed")
    print("   3. Session will save automatically")
    print("   4. Browser will close")
    print()
    print(f"{GREEN}⏳ Starting browser...{RESET}")
    
    try:
        with sync_playwright() as p:
            # Launch visible browser
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            page = context.new_page()
            
            print(f"{GREEN}🌐 Opening LinkedIn login page...{RESET}")
            page.goto("https://www.linkedin.com/login", timeout=30000)
            
            print(f"\n{YELLOW}⏳ Waiting for you to login...{RESET}")
            print(f"   (checking every 3 seconds, timeout: 120s)")
            print()
            
            # Wait for user to login
            max_wait = 120  # 2 minutes
            logged_in = False
            
            for i in range(max_wait // 3):
                time.sleep(3)
                current_url = page.url
                
                # Check if logged in (not on login page and on feed)
                if "login" not in current_url.lower() and "feed" in current_url.lower():
                    logged_in = True
                    print(f"\n{GREEN}✅ Login detected!{RESET}")
                    break
                else:
                    if (i + 1) % 5 == 0:  # Print every 15 seconds
                        print(f"   Still waiting... ({(i+1)*3}s)")
            
            if not logged_in:
                print(f"\n{YELLOW}⚠️  Timeout reached. Checking session anyway...{RESET}")
            
            # Save cookies
            print(f"{GREEN}💾 Saving session...{RESET}")
            cookies = context.cookies()
            
            with open(cookies_file, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, indent=2)
            
            # Set restrictive permissions (owner only)
            os.chmod(cookies_file, 0o600)
            
            print(f"\n{GREEN}✅ Session saved successfully!{RESET}")
            print(f"   Location: {cookies_file}")
            print(f"   Permissions: 0600 (owner read/write only)")
            print(f"   Cookies saved: {len(cookies)}")
            print()
            print(f"{GREEN}🎉 You can now close the browser{RESET}")
            print()
            print(f"{BLUE}📝 Next Steps:{RESET}")
            print("   1. Run: python3 orchestrator.py")
            print("   2. Approve LinkedIn posts in Pending_Approval/")
            print("   3. Move approved posts to Approved/")
            print("   4. Run orchestrator again to post automatically")
            print()
            
            browser.close()
            return True
    
    except Exception as e:
        print(f"\n{RED}❌ Failed to save session: {e}{RESET}")
        import traceback
        traceback.print_exc()
        return False

def test_session():
    """Test if saved session is still valid"""
    from playwright.sync_api import sync_playwright
    
    cookies_file = Path(__file__).parent / "linkedin_session" / "cookies.json"
    
    if not cookies_file.exists():
        print(f"{RED}❌ No saved session found{RESET}")
        print(f"   Run this script first to save your LinkedIn session")
        return False
    
    print(f"{GREEN}🧪 Testing LinkedIn session...{RESET}")
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            
            # Load cookies
            with open(cookies_file, 'r', encoding='utf-8') as f:
                cookies = json.load(f)
            context.add_cookies(cookies)
            
            page = context.new_page()
            page.goto("https://www.linkedin.com", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=15000)
            
            current_url = page.url
            
            if "login" in current_url.lower():
                print(f"{RED}❌ Session expired{RESET}")
                print(f"   Please re-run this script to save a new session")
                browser.close()
                return False
            else:
                print(f"{GREEN}✅ Session is valid!{RESET}")
                print(f"   Current URL: {current_url}")
                print(f"   You can now post to LinkedIn automatically")
                browser.close()
                return True
    
    except Exception as e:
        print(f"{RED}❌ Session test failed: {e}{RESET}")
        return False

def main():
    print_header()
    
    # Check Playwright
    if not check_playwright():
        sys.exit(1)
    
    # Check if session already exists
    cookies_file = Path(__file__).parent / "linkedin_session" / "cookies.json"
    
    if cookies_file.exists():
        print(f"\n{GREEN}✅ Existing session found{RESET}")
        print()
        print("What would you like to do?")
        print("   1. Test existing session")
        print("   2. Re-save session (login again)")
        print()
        
        choice = input("Enter choice (1/2): ").strip()
        
        if choice == "1":
            test_session()
        elif choice == "2":
            print(f"\n{YELLOW}Re-saving session...{RESET}")
            save_session()
        else:
            print(f"{RED}Invalid choice{RESET}")
    else:
        print(f"{YELLOW}No session found. Let's set one up!{RESET}")
        save_session()
    
    print()
    print("=" * 70)
    print(f"{GREEN}✅ Done!{RESET}")
    print("=" * 70)
    print()

if __name__ == "__main__":
    main()
