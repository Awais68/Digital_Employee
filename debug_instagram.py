#!/usr/bin/env python3
"""
debug_instagram.py - Debug Instagram UI to find the correct upload flow
"""

import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent
INSTAGRAM_SESSION_DIR = BASE_DIR / "instagram_session"

print("🔍 Debugging Instagram UI...")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    
    # Load cookies
    import json
    with open(INSTAGRAM_SESSION_DIR / "cookies.json") as f:
        cookies = json.load(f)
    
    context = browser.new_context()
    context.add_cookies(cookies)
    page = context.new_page()
    
    print("   Navigating to Instagram...")
    page.goto("https://www.instagram.com", wait_until="networkidle", timeout=30000)
    time.sleep(5)
    
    print(f"   Current URL: {page.url}")
    print("   Taking screenshot...")
    page.screenshot(path="/tmp/instagram_home.png")
    
    # Click Create button
    print("\n   Clicking Create button...")
    try:
        js_result = page.evaluate("""
            () => {
                const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
                for (const btn of buttons) {
                    const label = btn.getAttribute('aria-label') || '';
                    if (label.toLowerCase().includes('create')) {
                        btn.click();
                        return {clicked: true, label: label};
                    }
                }
                return {clicked: false};
            }
        """)
        print(f"   Click result: {js_result}")
    except Exception as e:
        print(f"   Click failed: {e}")
    
    time.sleep(3)
    print("   Taking screenshot after click...")
    page.screenshot(path="/tmp/instagram_after_click.png")
    
    # Check for dialogs/menus
    print("\n   Checking for UI elements...")
    
    # Look for file inputs
    file_inputs = page.locator('input[type="file"]')
    print(f"   File inputs found: {file_inputs.count()}")
    
    # Look for common elements
    elements = {
        "Create button": page.get_by_role("button", name="Create"),
        "New post button": page.locator('svg[aria-label="New post"]'),
        "Menu": page.locator('[role="menu"], [role="dialog"], [role="presentation"]'),
        "Next button": page.get_by_role("button", name="Next"),
        "Share button": page.get_by_role("button", name="Share"),
        "Caption textarea": page.get_by_role("textbox"),
    }
    
    for name, elem in elements.items():
        try:
            count = elem.count()
            print(f"   {name}: {count}")
        except:
            print(f"   {name}: error")
    
    # Try clicking and waiting for menu
    print("\n   Trying to open post creation flow...")
    try:
        with page.expect_popup() as popup_info:
            page.get_by_role("button", name="Create").click()
        popup = popup_info.value
        print(f"   Popup opened: {popup.url}")
    except Exception as e:
        print(f"   No popup: {e}")
    
    time.sleep(2)
    page.screenshot(path="/tmp/instagram_final.png")
    
    print("\n   Screenshots saved to /tmp/instagram_*.png")
    print("   Check them to understand the UI flow")
    
    browser.close()
