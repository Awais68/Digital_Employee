#!/usr/bin/env python3
"""
debug_linkedin_post.py - Visual Debug LinkedIn Posting

Opens a VISIBLE browser and walks through the posting process step by step.
You can SEE exactly what's happening and where it fails.

Usage:
    python3 debug_linkedin_post.py
"""

import os
import sys
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def debug_posting():
    """Debug LinkedIn posting with visible browser"""
    cookies_file = Path(__file__).parent / "linkedin_session" / "cookies.json"
    
    if not cookies_file.exists():
        print(f"{RED}❌ No session found{RESET}")
        print("Run: python3 setup_linkedin_session.py")
        return
    
    print(f"{BLUE}🔍 Debugging LinkedIn Posting...{RESET}")
    print("=" * 70)
    print()
    print(f"{YELLOW}A visible browser will open and walk through each step.{RESET}")
    print(f"Watch what happens and note where it fails.")
    print()
    input(f"{GREEN}Press Enter to start...{RESET}")
    print()
    
    try:
        with sync_playwright() as p:
            # Launch VISIBLE browser
            print(f"{GREEN}🚀 Launching visible browser...{RESET}")
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            context.add_cookies(json.load(open(cookies_file, 'r')))
            page = context.new_page()
            
            # Step 1: Navigate
            print(f"{BLUE}Step 1: Navigating to LinkedIn{RESET}")
            page.goto("https://www.linkedin.com/feed/", timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            print(f"   URL: {page.url}")
            print(f"{GREEN}✅ Step 1 complete{RESET}")
            input("   Press Enter to continue...")
            print()
            
            # Step 2: Click "Start a post"
            print(f"{BLUE}Step 2: Clicking 'Start a post'{RESET}")
            selectors = [
                "div[role='button']:has-text('Start a post')",
                "button:has-text('Start a post')",
                "div:has-text('Start a post')",
            ]
            
            clicked = False
            for selector in selectors:
                try:
                    print(f"   Trying: {selector}")
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=5000):
                        btn.click()
                        print(f"{GREEN}   ✅ Clicked!{RESET}")
                        clicked = True
                        break
                    else:
                        print(f"   ⚠️  Not visible")
                except Exception as e:
                    print(f"   ❌ {str(e)[:50]}")
            
            if not clicked:
                print(f"{RED}❌ Failed to click 'Start a post'{RESET}")
                print("   Browser will stay open - try clicking manually")
                print("   Then press Enter to continue")
                input("   ")
            
            page.wait_for_timeout(3000)
            print(f"{GREEN}✅ Step 2 complete{RESET}")
            input("   Press Enter to continue...")
            print()
            
            # Step 3: Fill content
            print(f"{BLUE}Step 3: Filling content{RESET}")
            test_content = f"Debug test post - {time.strftime('%H:%M:%S')}"
            editors = [
                "div.ql-editor[contenteditable='true']",
                "div[contenteditable='true']",
            ]
            
            filled = False
            for selector in editors:
                try:
                    print(f"   Trying: {selector}")
                    editor = page.locator(selector).first
                    if editor.is_visible(timeout=5000):
                        editor.click()
                        page.wait_for_timeout(500)
                        editor.fill(test_content)
                        print(f"{GREEN}   ✅ Content filled!{RESET}")
                        filled = True
                        break
                    else:
                        print(f"   ⚠️  Not visible")
                except Exception as e:
                    print(f"   ❌ {str(e)[:50]}")
            
            if not filled:
                print(f"{RED}❌ Failed to fill content{RESET}")
                input("   Browser open - try manually, then Enter to continue...")
            
            page.wait_for_timeout(3000)
            print(f"{GREEN}✅ Step 3 complete{RESET}")
            input("   Press Enter to continue...")
            print()
            
            # Step 4: Find Post button
            print(f"{BLUE}Step 4: Finding 'Post' button{RESET}")
            post_selectors = [
                "button[aria-label='Post']",
                "button[aria-label='Post now']",
                "div[role='button']:has-text('Post')",
                "button:has-text('Post')",
                "button:has-text('Post now')",
                "button[data-artdeco-is-focused='true']",
            ]
            
            found = False
            for selector in post_selectors:
                try:
                    print(f"   Trying: {selector}")
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=3000):
                        disabled = btn.get_attribute('disabled')
                        aria_disabled = btn.get_attribute('aria-disabled')
                        print(f"   ✅ FOUND! disabled={disabled}, aria-disabled={aria_disabled}")
                        found = True
                        # Don't click yet - let user verify
                        break
                    else:
                        print(f"   ⚠️  Not visible")
                except Exception as e:
                    print(f"   ❌ {str(e)[:50]}")
            
            if not found:
                print(f"{RED}❌ Post button NOT FOUND{RESET}")
                print()
                print(f"{YELLOW}📋 What to do:{RESET}")
                print("   1. Look at the browser - can you see the Post button?")
                print("   2. If YES, inspect it (right-click → Inspect)")
                print("   3. Copy the HTML/selector and share it")
                print("   4. If NO, check if content was filled correctly")
                print()
                input("   Press Enter when done investigating...")
            else:
                print()
                print(f"{GREEN}✅ Post button found!{RESET}")
                print("   Would you like to click it and post? (y/n)")
                choice = input("   Choice: ").strip().lower()
                if choice == 'y':
                    try:
                        btn.click()
                        print(f"{GREEN}   ✅ Clicked! Post should be publishing...{RESET}")
                        page.wait_for_timeout(5000)
                    except Exception as e:
                        print(f"{RED}   ❌ Click failed: {e}{RESET}")
            
            print()
            print(f"{GREEN}✅ Debug complete{RESET}")
            print()
            print(f"{YELLOW}Browser will stay open for 30 seconds for final inspection...{RESET}")
            print(f"Close it manually when done, or wait for auto-close")
            
            import time as t
            t.sleep(30)
            browser.close()
    
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_posting()
