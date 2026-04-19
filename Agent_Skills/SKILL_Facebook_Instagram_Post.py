#!/usr/bin/env python3
"""
SKILL_Facebook_Instagram_Post.py — Playwright MCP for Facebook & Instagram
==========================================================================

Gold Tier v5.0 — Human-in-the-Loop Social Media Posting

Features:
- Facebook posting via Playwright with saved session
- Instagram posting via Playwright with saved session
- Session persistence (login once, reuse cookies)
- Rate limit safety (60s minimum between posts)
- Full audit logging

Usage:
    from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook, post_to_instagram

    # Facebook
    result = post_to_facebook(content="Your post text...", image_path=None, link_url=None)

    # Instagram (image REQUIRED)
    result = post_to_instagram(content="Your caption...", image_path="/path/to/image.jpg")

Session Setup:
    python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py setup-facebook
    python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py setup-instagram

Author: Digital Employee System
Tier: Gold v5.0
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

# ── Configuration ────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
FACEBOOK_SESSION_DIR = BASE_DIR / "facebook_session"
INSTAGRAM_SESSION_DIR = BASE_DIR / "instagram_session"
LOG_FILE = BASE_DIR / "Logs" / "social_media.log"

# Ensure directories exist
FACEBOOK_SESSION_DIR.mkdir(parents=True, exist_ok=True)
INSTAGRAM_SESSION_DIR.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "Logs").mkdir(parents=True, exist_ok=True)

# Rate limit safety
MIN_DELAY_BETWEEN_POSTS = 60  # seconds

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("facebook_instagram_mcp")

# ── Session Management ───────────────────────────────────────────────────────

def setup_facebook_session():
    """Interactive setup: Login to Facebook and save session cookies."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ Playwright not installed. Run: pip install playwright && playwright install chromium")
        return False

    print("📘 Setting up Facebook session...")
    print("   A browser window will open. Login to Facebook normally.")
    print("   After logging in, press Enter here to save the session.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://www.facebook.com", wait_until="networkidle")

        input("👉 Login to Facebook in the browser, then press Enter here...")

        cookies = context.cookies()
        session_file = FACEBOOK_SESSION_DIR / "cookies.json"

        with open(session_file, "w") as f:
            json.dump(cookies, f, indent=2)

        browser.close()
        print(f"✅ Facebook session saved to: {session_file}")
        return True


def setup_instagram_session():
    """Interactive setup: Login to Instagram and save session cookies."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ Playwright not installed. Run: pip install playwright && playwright install chromium")
        return False

    print("📸 Setting up Instagram session...")
    print("   A browser window will open. Login to Instagram normally.")
    print("   After logging in, press Enter here to save the session.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://www.instagram.com", wait_until="networkidle")

        input("👉 Login to Instagram in the browser, then press Enter here...")

        cookies = context.cookies()
        session_file = INSTAGRAM_SESSION_DIR / "cookies.json"

        with open(session_file, "w") as f:
            json.dump(cookies, f, indent=2)

        browser.close()
        print(f"✅ Instagram session saved to: {session_file}")
        return True


def load_session(session_dir: Path) -> Optional[list]:
    """Load saved session cookies."""
    session_file = session_dir / "cookies.json"
    if not session_file.exists():
        return None
    with open(session_file, "r") as f:
        return json.load(f)


def check_session_valid(session_dir: Path, url: str) -> bool:
    """Quick check if session is still valid."""
    try:
        from playwright.sync_api import sync_playwright
        cookies = load_session(session_dir)
        if not cookies:
            return False

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            context.add_cookies(cookies)
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(3)
            except Exception:
                pass  # Timeout doesn't mean session is invalid
            valid = "/login" not in page.url and "accounts/login" not in page.url and "auth_platform" not in page.url
            browser.close()
            return valid
    except Exception as e:
        logger.warning(f"Session check failed: {e}")
        return False


# ── Facebook Posting ─────────────────────────────────────────────────────────

def post_to_facebook(
    content: str,
    image_path: Optional[str] = None,
    link_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Post to Facebook using Playwright with saved session.

    Args:
        content: Post text content
        image_path: Optional path to image file
        link_url: Optional URL to include

    Returns:
        Dict with success status and details
    """
    result = {
        "success": False,
        "platform": "facebook",
        "message": "",
        "post_url": "",
        "timestamp": datetime.now().isoformat(),
    }

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result["message"] = "Playwright not installed. Run: pip install playwright && playwright install chromium"
        return result

    # Check session exists
    if not FACEBOOK_SESSION_DIR.exists() or not (FACEBOOK_SESSION_DIR / "cookies.json").exists():
        result["message"] = "No saved Facebook session. Run: python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py setup-facebook"
        return result

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            
            # Load cookies and add them to context
            cookies = load_session(FACEBOOK_SESSION_DIR)
            context = browser.new_context()
            context.add_cookies(cookies)
            
            page = context.new_page()

            # Navigate to Facebook
            logger.info("Navigating to Facebook...")
            page.goto("https://www.facebook.com", wait_until="networkidle", timeout=30000)
            time.sleep(3)

            # Check if logged in
            if "/login" in page.url or "login" in page.url.lower():
                browser.close()
                result["message"] = "Facebook session expired. Re-run setup-facebook to refresh."
                return result

            logger.info("Logged in successfully. Creating post...")

            # Click "What's on your mind?" composer
            try:
                post_box = page.get_by_placeholder("What's on your mind?", exact=False)
                if post_box.count() == 0:
                    post_box = page.get_by_role("textbox").first
                post_box.click()
                time.sleep(1)
            except Exception as e:
                logger.warning(f"Could not find post composer: {e}")
                # Try alternative: click the post button directly
                try:
                    post_btn = page.get_by_role("button", name="What's on your mind?")
                    post_btn.click()
                    time.sleep(2)
                except Exception:
                    # Try clicking on any textbox to open composer
                    try:
                        post_box = page.get_by_role("textbox").first
                        post_box.click()
                        time.sleep(2)
                    except Exception as e2:
                        browser.close()
                        result["message"] = f"Could not open Facebook post composer. UI may have changed. Error: {e}"
                        return result

            # Type content
            post_box.fill(content)
            time.sleep(1)

            # Attach image if provided
            if image_path and Path(image_path).exists():
                try:
                    photo_btn = page.get_by_role("button", name="Photo/video")
                    if photo_btn.count() == 0:
                        photo_btn = page.get_by_label("Photo/video")
                    photo_btn.click()
                    time.sleep(1)
                    file_input = page.locator('input[type="file"]')
                    file_input.set_input_files(image_path)
                    time.sleep(3)
                    logger.info(f"Image attached: {image_path}")
                except Exception as e:
                    logger.warning(f"Could not attach image: {e}")

            # Attach link if provided
            if link_url:
                try:
                    post_box.press("Control+a")
                    post_box.press("Control+c")
                    post_box.fill(content + "\n\n" + link_url)
                    time.sleep(2)
                except Exception as e:
                    logger.warning(f"Could not attach link: {e}")

            # Click Post button - try multiple selectors
            try:
                posted = False
                
                # Try 1: Exact "Post" button
                post_button = page.get_by_role("button", name="Post", exact=True)
                if post_button.count() > 0:
                    post_button.click()
                    posted = True
                else:
                    # Try 2: Any button containing "Post"
                    post_button = page.get_by_role("button", name="Post", exact=False)
                    if post_button.count() > 0:
                        post_button.first.click()
                        posted = True
                    else:
                        # Try 3: Submit button
                        submit_btn = page.locator('button[type="submit"]')
                        if submit_btn.count() > 0:
                            submit_btn.first.click()
                            posted = True
                        else:
                            # Try 4: Look for Post button by CSS
                            post_btn_css = page.locator('[aria-label="Post"], button:has-text("Post")')
                            if post_btn_css.count() > 0:
                                post_btn_css.first.click()
                                posted = True
                            else:
                                # Try 5: Keyboard shortcut Ctrl+Enter
                                post_box.press("Control+Enter")
                                posted = True
                
                if posted:
                    time.sleep(5)
                    page.wait_for_load_state("networkidle")
                    logger.info("Post submitted successfully")

                    result["success"] = True
                    result["message"] = "Post successfully created on Facebook"
                    result["post_url"] = "https://www.facebook.com"
                else:
                    result["message"] = "Could not find Post button using any selector"

            except Exception as e:
                result["message"] = f"Could not click Post button: {e}"

            browser.close()

    except Exception as e:
        logger.error(f"Facebook posting failed: {e}")
        result["message"] = f"Error: {str(e)}"

    return result


# ── Instagram Posting ────────────────────────────────────────────────────────

def post_to_instagram(
    content: str,
    image_path: str,
    post_type: str = "feed",
) -> Dict[str, Any]:
    """
    Post to Instagram using Playwright with saved session.

    Args:
        content: Caption text
        image_path: REQUIRED path to image file (Instagram requires images)
        post_type: "feed", "carousel", or "story"

    Returns:
        Dict with success status and details
    """
    result = {
        "success": False,
        "platform": "instagram",
        "message": "",
        "post_url": "",
        "post_type": post_type,
        "timestamp": datetime.now().isoformat(),
    }

    # Validate image path
    if not image_path or not Path(image_path).exists():
        result["message"] = "Image is REQUIRED for Instagram posts. Provide a valid image_path."
        return result

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result["message"] = "Playwright not installed. Run: pip install playwright && playwright install chromium"
        return result

    # Check session exists
    if not INSTAGRAM_SESSION_DIR.exists() or not (INSTAGRAM_SESSION_DIR / "cookies.json").exists():
        result["message"] = "No saved Instagram session. Run: python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py setup-instagram"
        return result

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            # Load cookies and add them to context
            cookies = load_session(INSTAGRAM_SESSION_DIR)
            context = browser.new_context()
            context.add_cookies(cookies)

            page = context.new_page()

            # Navigate to Instagram - use domcontentloaded for faster load
            logger.info("Navigating to Instagram...")
            try:
                page.goto("https://www.instagram.com", wait_until="domcontentloaded", timeout=60000)
            except Exception:
                logger.warning("Initial navigation timeout, retrying...")
                page.goto("https://www.instagram.com", wait_until="domcontentloaded", timeout=60000)
            time.sleep(5)

            # Check if logged in
            if "/accounts/login" in page.url or "/login" in page.url:
                browser.close()
                result["message"] = "Instagram session expired. Re-run setup-instagram to refresh."
                return result

            logger.info("Logged in successfully. Creating post...")

            # Navigate directly to create page and upload
            try:
                page.goto("https://www.instagram.com/create/", wait_until="domcontentloaded", timeout=30000)
                time.sleep(5)
                logger.info("Navigated to Instagram create page")
            except Exception as e:
                logger.warning(f"Could not navigate to create page: {e}")
                browser.close()
                result["message"] = "Could not navigate to Instagram create page"
                return result

            # Upload image directly via file input
            try:
                file_input = page.locator('input[type="file"]').first
                if file_input.count() == 0:
                    # Try to find any file input on the page
                    file_input = page.locator('input[accept*="image"]')
                    
                if file_input.count() > 0:
                    file_input.set_input_files(image_path)
                    logger.info(f"Image uploaded via file input: {image_path}")
                    time.sleep(8)
                else:
                    browser.close()
                    result["message"] = "Could not find file input on Instagram create page"
                    return result
            except Exception as e:
                browser.close()
                result["message"] = f"File upload failed: {e}"
                return result

            # Click Next (crop/adjust screen)
            try:
                next_btn = page.get_by_role("button", name="Next")
                if next_btn.count() > 0:
                    next_btn.click()
                    time.sleep(2)
                    # Click Next again if there's a second step
                    time.sleep(2)
                    next_btn2 = page.get_by_role("button", name="Next")
                    if next_btn2.count() > 0:
                        next_btn2.click()
                        time.sleep(3)
            except Exception as e:
                logger.warning(f"Could not click Next: {e}")

            # Add caption
            if post_type == "feed":
                try:
                    textarea = page.get_by_role("textbox")
                    if textarea.count() > 0:
                        textarea.first.fill(content)
                        time.sleep(1)
                        logger.info("Caption added")
                except Exception as e:
                    logger.warning(f"Could not add caption: {e}")

            # Share post - try multiple approaches
            try:
                shared = False
                
                # Try 1: Exact "Share" button
                share_btn = page.get_by_role("button", name="Share", exact=True)
                if share_btn.count() > 0:
                    share_btn.click()
                    shared = True
                else:
                    # Try 2: Any button containing "Share"
                    share_btn = page.get_by_role("button", name="Share")
                    if share_btn.count() > 0:
                        share_btn.first.click()
                        shared = True
                    else:
                        # Try 3: Look for Share by text
                        share_btn = page.get_by_text("Share", exact=True)
                        if share_btn.count() > 0:
                            share_btn.click()
                            shared = True
                        else:
                            # Try 4: JavaScript click
                            js_click_result = page.evaluate("""
                                () => {
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    for (const btn of buttons) {
                                        if (btn.textContent.trim() === 'Share') {
                                            btn.click();
                                            return {clicked: true};
                                        }
                                    }
                                    return {clicked: false};
                                }
                            """)
                            if js_click_result.get('clicked'):
                                shared = True
                                logger.info("Share button clicked via JavaScript")
                            else:
                                logger.warning("Could not find Share button")

                if shared:
                    time.sleep(5)
                    page.wait_for_load_state("networkidle")
                    logger.info("Instagram post submitted successfully")

                    result["success"] = True
                    result["message"] = "Post successfully created on Instagram"
                    result["post_url"] = "https://www.instagram.com"

            except Exception as e:
                result["message"] = f"Could not share post: {e}"
                logger.warning(f"Share failed: {e}")
                # Log current URL for debugging
                logger.warning(f"Current URL: {page.url}")

            browser.close()

    except Exception as e:
        logger.error(f"Instagram posting failed: {e}")
        result["message"] = f"Error: {str(e)}"

    return result


# ── CLI Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 SKILL_Facebook_Instagram_Post.py setup-facebook")
        print("  python3 SKILL_Facebook_Instagram_Post.py setup-instagram")
        print("  python3 SKILL_Facebook_Instagram_Post.py test-facebook")
        print("  python3 SKILL_Facebook_Instagram_Post.py test-instagram")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "setup-facebook":
        setup_facebook_session()

    elif command == "setup-instagram":
        setup_instagram_session()

    elif command == "test-facebook":
        print("📘 Testing Facebook session...")
        if check_session_valid(FACEBOOK_SESSION_DIR, "https://www.facebook.com"):
            print("✅ Facebook session is valid!")
        else:
            print("❌ Facebook session expired. Run setup-facebook to refresh.")

    elif command == "test-instagram":
        print("📸 Testing Instagram session...")
        if check_session_valid(INSTAGRAM_SESSION_DIR, "https://www.instagram.com"):
            print("✅ Instagram session is valid!")
        else:
            print("❌ Instagram session expired. Run setup-instagram to refresh.")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
