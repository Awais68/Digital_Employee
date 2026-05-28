#!/usr/bin/env python3
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent
INSTAGRAM_SESSION_DIR = BASE_DIR / "instagram_session"

def load_session(session_dir: Path):
    session_file = session_dir / "cookies.json"
    if not session_file.exists():
        return None
    import json
    with open(session_file, "r") as f:
        return json.load(f)

def post_to_instagram_extra_robust(content, image_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        cookies = load_session(INSTAGRAM_SESSION_DIR)
        context = browser.new_context()
        context.add_cookies(cookies)
        page = context.new_page()
        
        print("🌐 Navigating to Instagram...")
        page.goto("https://www.instagram.com/create/", wait_until="networkidle")
        time.sleep(5)
        
        print("📤 Uploading image...")
        file_input = page.locator('input[type="file"]').first
        file_input.set_input_files(image_path)
        time.sleep(10)
        
        print("🖱️ Clicking Next (Crop)...")
        page.get_by_role("button", name="Next").click()
        time.sleep(3)
        
        print("🖱️ Clicking Next (Filters)...")
        page.get_by_role("button", name="Next").click()
        time.sleep(5)
        
        print("✍️ Adding caption...")
        page.get_by_role("textbox").first.fill(content)
        time.sleep(2)
        
        print("🚀 Clicking Share...")
        share_btn = page.get_by_role("button", name="Share")
        share_btn.click()
        
        print("⏳ Waiting for success (60s)...")
        # Instead of waiting for networkidle, wait for a success indicator or just wait a long time
        time.sleep(30)
        
        print(f"✅ Finished. Current URL: {page.url}")
        browser.close()
        return True

if __name__ == "__main__":
    content = "We Are Ready for the AI Evolution in This New Era 🚀"
    image_path = str(BASE_DIR / "instagram_post_20260420.jpg")
    post_to_instagram_extra_robust(content, image_path)
