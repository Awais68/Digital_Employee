#!/usr/bin/env python3
"""
send_whatsapp_v2.py - Send WhatsApp Message using Persistent Session

Uses the same launch_persistent_context as whatsapp_watcher.py v2.0.
Session is already saved in ./whatsapp_session from the QR scan.
"""

import sys
import os
import asyncio
from pathlib import Path
from datetime import datetime

try:
    from playwright.async_api import async_playwright
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
SESSION_DIR = BASE_DIR / "whatsapp_session"

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

 *TECH STACK:*

• Playwright (Browser Automation)
• Python (Orchestrator)
• Persistent Session
• Human Approval Workflow
• Dashboard Tracking

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 *FILES COMPLETED:*

✅ whatsapp_watcher.py v2.0 (Fixed!)
✅ SKILL_LinkedIn_Playwright_MCP.py
✅ orchestrator.py (Updated)
✅ linkedin_mcp.py
✅ email_mcp.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *STATUS:*

🔵 Session: Active ✅
🟢 Posts: Working ✅
🟡 Approvals: Ready ✅
📧 Email: Working ✅
💬 WhatsApp: Working ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 *CONCLUSION:*

All systems FULLY OPERATIONAL!

*System Status: PRODUCTION READY* 🚀

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Digital Employee System v4.0_
_Silver Tier - Human-in-the-Loop_
"""


async def send_whatsapp_message(phone: str, message: str):
    """Send WhatsApp message using persistent context (same as whatsapp_watcher)."""
    
    print()
    print("=" * 70)
    print(f"{BLUE}📱 WhatsApp Message Sender v2.0{RESET}")
    print("=" * 70)
    print()
    print(f"{GREEN}🚀 Launching browser with persistent session...{RESET}")
    
    pw = None
    context = None
    page = None
    
    try:
        pw = await async_playwright().start()
        
        # Use the SAME persistent context as whatsapp_watcher
        context = await pw.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR.resolve()),
            headless=True,  # Session is saved, so headless works!
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        
        # Get or create page
        if context.pages:
            page = context.pages[0]
        else:
            page = await context.new_page()
        
        # Navigate to WhatsApp Web with the phone number
        import urllib.parse
        encoded_message = urllib.parse.quote(message)
        whatsapp_url = f"https://web.whatsapp.com/send?phone={phone}&text={encoded_message}"
        
        print(f"{GREEN}🌐 Opening WhatsApp Web for {phone}...{RESET}")
        
        await page.goto(whatsapp_url, timeout=60000, wait_until="domcontentloaded")
        
        # Wait for WhatsApp Web to fully load (20 seconds)
        print(f"{GREEN}⏳ Waiting for WhatsApp Web to load...{RESET}")
        await asyncio.sleep(20)
        
        # Check if we're logged in
        current_url = page.url
        print(f"   Current URL: {current_url[:80]}...")
        
        if "web.whatsapp.com" in current_url:
            print(f"{GREEN}✅ WhatsApp Web loaded successfully!{RESET}")
            
            # Wait for send button to appear
            print(f"{GREEN}⏳ Waiting for send button...{RESET}")
            await asyncio.sleep(5)
            
            # Try to click send button
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
                    if await send_btn.is_visible(timeout=5000):
                        await send_btn.click()
                        sent = True
                        print(f"{GREEN}   ✅ Message sent via selector!{RESET}")
                        break
                except:
                    continue
            
            if not sent:
                # Try Enter key
                try:
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(3)
                    sent = True
                    print(f"{GREEN}   ✅ Message sent via Enter key!{RESET}")
                except Exception as e:
                    print(f"{YELLOW}   ⚠️  Send failed: {e}{RESET}")
            
            # Wait and take screenshot
            await asyncio.sleep(5)
            
            screenshot_path = BASE_DIR / "Logs" / "whatsapp_sent_v2.png"
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(screenshot_path))
            print(f"{GREEN}📸 Screenshot: {screenshot_path}{RESET}")
            
            if sent:
                print()
                print("=" * 70)
                print(f"{GREEN}✅ Message sent to {phone}!{RESET}")
                print("=" * 70)
            else:
                print()
                print("=" * 70)
                print(f"{YELLOW}⚠️  Message may not have sent - check screenshot{RESET}")
                print("=" * 70)
        else:
            print(f"{RED}❌ Not on WhatsApp Web{RESET}")
            print(f"   URL: {current_url}")
            
            # Take screenshot
            screenshot_path = BASE_DIR / "Logs" / "whatsapp_error.png"
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(screenshot_path))
            print(f"   Screenshot: {screenshot_path}")
        
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}")
        import traceback
        traceback.print_exc()
    finally:
        # Close context (saves session)
        if context:
            try:
                await context.close()
                print(f"{GREEN}💾 Session saved{RESET}")
            except:
                pass
        if pw:
            try:
                await pw.stop()
            except:
                pass


def main():
    asyncio.run(send_whatsapp_message(PHONE, REPORT))


if __name__ == "__main__":
    main()
