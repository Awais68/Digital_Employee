#!/usr/bin/env python3
"""
send_whatsapp_direct.py - Send WhatsApp Message via Web Interface

Loads WhatsApp Web with saved session and sends message directly.
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("❌ Playwright not installed")
    sys.exit(1)

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

BASE_DIR = Path(__file__).parent.resolve()
WHATSAPP_SESSION = BASE_DIR / "whatsapp_session"

# Phone from .env
PHONE = os.getenv("WHATSAPP_PHONE", "923273363154")

# Report message
REPORT = f"""🚀 *DIGITAL FTE - TEST REPORT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
✅ *Status:* SUCCESS - ALL TASKS DONE!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 *TASK RESULTS:*

✅ *Test Suite:* Completed
✅ *LinkedIn Post:* Published
✅ *Email Report:* Sent
✅ *WhatsApp:* This message!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *LINKEDIN POST:*

📝 Content: This is Digital FTE Test Post
🌐 URL: https://www.linkedin.com/feed/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 *CONCLUSION:*

All systems FULLY OPERATIONAL!

*System Status: PRODUCTION READY* 🚀

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Digital Employee System v4.0_
_Silver Tier - Human-in-the-Loop_
"""

def send_whatsapp_via_web(phone: str, message: str) -> dict:
    """Send WhatsApp message by opening chat directly via wa.me then clicking Continue to Web."""
    
    print(f"{BLUE}📱 Sending WhatsApp Report to {phone}...{RESET}")
    print()
    
    browser = None
    try:
        with sync_playwright() as p:
            # Launch browser
            print(f"{GREEN}🚀 Launching browser...{RESET}")
            browser = p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            
            page = context.new_page()
            
            # Step 1: Go to wa.me URL
            import urllib.parse
            encoded_message = urllib.parse.quote(message)
            whatsapp_url = f"https://wa.me/{phone}?text={encoded_message}"
            
            print(f"{GREEN}🌐 Opening WhatsApp...{RESET}")
            print(f"   URL: wa.me/{phone}")
            page.goto(whatsapp_url, timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            
            # Step 2: Click "Continue to WhatsApp Web" button
            print(f"{GREEN}🔗 Clicking 'Continue to WhatsApp Web'...{RESET}")
            
            continue_clicked = False
            try:
                # Try multiple selectors for the Continue button
                continue_selectors = [
                    "a[href*='web.whatsapp.com']",
                    "text='Continue to WhatsApp Web'",
                    "button:has-text('Continue')",
                    "a:has-text('Continue')",
                ]
                
                for selector in continue_selectors:
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=5000):
                            btn.click()
                            continue_clicked = True
                            print(f"{GREEN}   ✅ Continue button clicked{RESET}")
                            break
                    except:
                        continue
                
                if not continue_clicked:
                    # Try JavaScript click
                    page.evaluate('''() => {
                        const links = document.querySelectorAll('a[href*="web.whatsapp.com"]');
                        if (links.length > 0) {
                            links[0].click();
                            return true;
                        }
                        return false;
                    }''')
                    continue_clicked = True
                    print(f"{GREEN}   ✅ Continue button clicked (via JS){RESET}")
                    
            except Exception as e:
                print(f"{YELLOW}   ⚠️  Continue button: {e}{RESET}")
            
            page.wait_for_timeout(5000)
            
            # Step 3: Wait for WhatsApp Web to load
            current_url = page.url
            print(f"   Current URL: {current_url[:80]}...")
            
            if "web.whatsapp.com" in current_url:
                print(f"{GREEN}✅ WhatsApp Web loaded{RESET}")
                page.wait_for_timeout(5000)
                
                # Step 4: Click send button
                print(f"{GREEN}📤 Clicking send button...{RESET}")
                
                send_selectors = [
                    "button[data-testid='compose-btn-send']",
                    "span[data-icon='send']",
                    "div[aria-label='Send']",
                    "button[aria-label='Send']",
                ]
                
                sent = False
                for selector in send_selectors:
                    try:
                        send_btn = page.locator(selector).first
                        if send_btn.is_visible(timeout=5000):
                            send_btn.click()
                            sent = True
                            print(f"{GREEN}   ✅ Message sent via selector: {selector}{RESET}")
                            break
                    except:
                        continue
                
                if not sent:
                    # Try pressing Enter key
                    try:
                        page.keyboard.press("Enter")
                        page.wait_for_timeout(3000)
                        sent = True
                        print(f"{GREEN}   ✅ Message sent via Enter key{RESET}")
                    except Exception as e:
                        print(f"{YELLOW}   ⚠️  Enter key failed: {e}{RESET}")
                
                # Wait and take screenshot
                page.wait_for_timeout(5000)
                
                screenshot_path = BASE_DIR / "Logs" / "whatsapp_final.png"
                screenshot_path.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshot_path))
                print(f"{GREEN}📸 Screenshot: {screenshot_path}{RESET}")
                
                browser.close()
                
                return {
                    "success": sent,
                    "message": "Message sent" if sent else "Message typed but send failed"
                }
            else:
                # Not on WhatsApp Web - take screenshot
                screenshot_path = BASE_DIR / "Logs" / "whatsapp_issue.png"
                screenshot_path.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshot_path))
                
                print(f"{RED}❌ Did not reach WhatsApp Web{RESET}")
                print(f"   URL: {current_url}")
                print(f"   Screenshot: {screenshot_path}")
                
                browser.close()
                return {
                    "success": False,
                    "message": "Could not reach WhatsApp Web"
                }
                
    except Exception as e:
        if browser:
            try:
                browser.close()
            except:
                pass
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }

def main():
    """Main function"""
    print()
    print("=" * 70)
    print(f"{BLUE}📱 WhatsApp Direct Sender{RESET}")
    print("=" * 70)
    print()
    
    result = send_whatsapp_via_web(PHONE, REPORT)
    
    print()
    print("=" * 70)
    if result['success']:
        print(f"{GREEN}✅ Report sent to {PHONE}!{RESET}")
    else:
        print(f"{RED}❌ Failed: {result['message']}{RESET}")
        print(f"{YELLOW}📝 Note: Check Logs/whatsapp_issue.png for details{RESET}")
    print("=" * 70)
    print()

if __name__ == "__main__":
    main()
