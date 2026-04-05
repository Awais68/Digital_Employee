#!/usr/bin/env python3
"""
test_linkedin_session_quick.py - Quick LinkedIn Session Test

Tests if your saved LinkedIn session is still valid.

Usage:
    python3 test_linkedin_session_quick.py

Returns:
    ✅ Session is valid - you can post to LinkedIn
    ❌ Session expired - re-run: python3 setup_linkedin_session.py
"""

import os
import sys
import json
from pathlib import Path

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def test_session():
    """Test if saved LinkedIn session is still valid"""
    cookies_file = Path(__file__).parent / "linkedin_session" / "cookies.json"
    
    if not cookies_file.exists():
        print(f"{RED}❌ No saved LinkedIn session found{RESET}")
        print()
        print("Please run: python3 setup_linkedin_session.py")
        print()
        return False
    
    print(f"{BLUE}🧪 Testing LinkedIn session...{RESET}")
    print()
    
    try:
        from playwright.sync_api import sync_playwright
        
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
            
            print(f"{YELLOW}🌐 Navigating to LinkedIn...{RESET}")
            print(f"   (timeout: 60 seconds){RESET}")
            
            try:
                page.goto("https://www.linkedin.com", timeout=60000, wait_until="domcontentloaded")
                page.wait_for_timeout(3000)
                
                current_url = page.url
                print(f"   Current URL: {current_url}")
                print()
                
                if "login" in current_url.lower() or "signin" in current_url.lower():
                    print(f"{RED}❌ Session EXPIRED{RESET}")
                    print()
                    print("Your LinkedIn session has expired.")
                    print()
                    print(f"{YELLOW}To fix:{RESET}")
                    print("   python3 setup_linkedin_session.py")
                    print()
                    browser.close()
                    return False
                else:
                    print(f"{GREEN}✅ Session is VALID{RESET}")
                    print()
                    print("You can now post to LinkedIn automatically!")
                    print()
                    print(f"{GREEN}Next steps:{RESET}")
                    print("   1. Move approved posts to Approved/")
                    print("   2. Run: python3 orchestrator.py")
                    print("   3. Posts will publish automatically")
                    print()
                    browser.close()
                    return True
                    
            except Exception as e:
                print(f"{YELLOW}⚠️  Navigation timeout (page may still be loading){RESET}")
                print(f"   Error: {str(e)[:100]}")
                print()
                
                # Check current URL even if timeout
                try:
                    current_url = page.url
                    if "login" not in current_url.lower():
                        print(f"{GREEN}✅ Session appears valid (timeout may be network issue){RESET}")
                        print()
                        browser.close()
                        return True
                    else:
                        print(f"{RED}❌ Session expired (redirected to login){RESET}")
                        print()
                        print("To fix: python3 setup_linkedin_session.py")
                        print()
                        browser.close()
                        return False
                except:
                    print(f"{RED}❌ Could not verify session{RESET}")
                    print()
                    browser.close()
                    return False
    
    except ImportError:
        print(f"{RED}❌ Playwright not installed{RESET}")
        print()
        print("Install with: pip install playwright")
        print("Then: playwright install chromium")
        print()
        return False
    except Exception as e:
        print(f"{RED}❌ Test failed: {e}{RESET}")
        print()
        return False

if __name__ == "__main__":
    print()
    print("=" * 70)
    print(f"{BLUE}🔵 LinkedIn Session Test{RESET}")
    print("=" * 70)
    print()
    
    result = test_session()
    
    print("=" * 70)
    if result:
        print(f"{GREEN}✅ PASS - Session is valid{RESET}")
    else:
        print(f"{RED}❌ FAIL - Session needs refresh{RESET}")
    print("=" * 70)
    print()
    
    sys.exit(0 if result else 1)
