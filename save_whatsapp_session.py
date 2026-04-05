#!/usr/bin/env python3
"""
save_whatsapp_session.py - Save WhatsApp Web Session

Opens WhatsApp Web, lets you scan QR code, then saves session cookies.
"""

import sys
import json
from pathlib import Path
from datetime import datetime

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("❌ Playwright not installed")
    print("Install: pip install playwright && playwright install chromium")
    sys.exit(1)

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

BASE_DIR = Path(__file__).parent.resolve()
WHATSAPP_SESSION = BASE_DIR / "whatsapp_session"
WHATSAPP_SESSION.mkdir(parents=True, exist_ok=True)

def save_whatsapp_session():
    """Open WhatsApp Web, wait for login, save session."""
    
    print()
    print("=" * 70)
    print(f"{BLUE}📱 WhatsApp Session Saver{RESET}")
    print("=" * 70)
    print()
    print(f"{GREEN}🚀 Launching WhatsApp Web...{RESET}")
    print()
    print("📋 INSTRUCTIONS:")
    print("   1. A browser window will open with WhatsApp Web")
    print("   2. Scan the QR code with your phone's WhatsApp app")
    print("   3. Wait for WhatsApp to fully load")
    print("   4. Press ENTER in this terminal to save the session")
    print()
    print(f"{YELLOW}⏳ Waiting for you to scan QR code...{RESET}")
    print()
    
    browser = None
    try:
        with sync_playwright() as p:
            # Launch browser in visible mode for QR scanning
            browser = p.chromium.launch(
                headless=False,  # Must be visible for QR scan
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            
            page = context.new_page()
            
            # Go to WhatsApp Web
            print(f"{GREEN}🌐 Opening https://web.whatsapp.com{RESET}")
            page.goto("https://web.whatsapp.com", timeout=60000, wait_until="domcontentloaded")
            
            # Wait for user to scan QR and press Enter
            input(f"\n{GREEN}✅ Press ENTER after scanning QR code and WhatsApp loads...{RESET}")
            
            # Save cookies
            cookies = context.cookies()
            cookies_file = WHATSAPP_SESSION / "cookies.json"
            
            with open(cookies_file, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, indent=2)
            
            print()
            print(f"{GREEN}✅ Session saved successfully!{RESET}")
            print(f"   Location: {cookies_file}")
            print(f"   Cookies: {len(cookies)}")
            print()
            
            # Verify session
            current_url = page.url
            if "web.whatsapp.com" in current_url:
                print(f"{GREEN}✅ Verified: Logged into WhatsApp Web{RESET}")
            else:
                print(f"{YELLOW}⚠️  Warning: May not be fully logged in{RESET}")
            
            browser.close()
            
            print()
            print("=" * 70)
            print(f"{GREEN}✅ WhatsApp session saved!{RESET}")
            print("   You can now use send_whatsapp_direct.py")
            print("=" * 70)
            print()
            
    except Exception as e:
        if browser:
            try:
                browser.close()
            except:
                pass
        print(f"\n{RED}❌ Error: {e}{RESET}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    save_whatsapp_session()
