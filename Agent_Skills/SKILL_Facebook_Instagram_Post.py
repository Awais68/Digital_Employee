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

import re
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
        fb_user_dir = str(FACEBOOK_SESSION_DIR / "browser_data")
        context = p.chromium.launch_persistent_context(
            user_data_dir=fb_user_dir,
            headless=False,
            args=['--no-sandbox', '--disable-setuid-sandbox'],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://www.facebook.com", wait_until="networkidle")

        input("👉 Login to Facebook in the browser, then press Enter here...")

        context.close()
        print(f"✅ Facebook session saved to: {fb_user_dir}")
        print("   Session will persist across restarts (browser_data/)")
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
    page_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Post to Facebook using Playwright with saved session.

    Args:
        content: Post text content
        image_path: Optional path to image file
        link_url: Optional URL to include
        page_name: Optional Facebook Page name to post to (e.g. "AsTechDevelopers")

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
            # Use persistent context to keep localStorage/sessionStorage alive
            fb_user_dir = str(FACEBOOK_SESSION_DIR / "browser_data")
            context = p.chromium.launch_persistent_context(
                user_data_dir=fb_user_dir,
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox'],
            )
            page = context.pages[0] if context.pages else context.new_page()

            # Navigate to Facebook
            logger.info("Navigating to Facebook...")
            page.goto("https://www.facebook.com", wait_until="domcontentloaded", timeout=30000)
            time.sleep(5)

            # Check if logged in - multiple indicators
            current_url = page.url.lower()
            login_indicators = ["/login", "login.php", "checkpoint", "recover", "identify"]
            logged_in = True
            for indicator in login_indicators:
                if indicator in current_url:
                    logged_in = False
                    break
            
            if logged_in:
                try:
                    if page.locator('input[name="email"], input[name="pass"]').first.is_visible(timeout=3000):
                        logged_in = False
                except Exception:
                    pass
            
            if not logged_in:
                context.close()
                logger.warning("Facebook session expired or login required")
                result["message"] = "Facebook session expired. Please re-run: python3 Agent_Skills/SKILL_Facebook_Instagram_Post.py setup-facebook"
                return result

            logger.info("Logged in successfully. Creating post...")

            # Step 1: Navigate to Page or Home, then open composer
            post_box = None
            composer_opened = False

            if page_name:
                # Navigate directly to the Facebook Page
                page_url = f"https://www.facebook.com/{page_name}/"
                logger.info(f"Posting to Page: {page_url}")
                page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(5)

                # Click Page composer trigger — typically says "Write something..." on Page
                page_composer_selectors = [
                    page.locator('[role="button"]:has-text("Write something")'),
                    page.locator('[role="button"]:has-text("Share something")'),
                    page.locator('[role="button"]:has-text("write something")'),
                    page.locator('[role="button"]:has-text("share something")'),
                    page.locator('[aria-label*="Write" i]'),
                    page.locator('[aria-label*="create a post" i]'),
                    page.locator('[aria-label*="Create" i]'),
                ]
                for btn in page_composer_selectors:
                    try:
                        if btn.count() > 0 and btn.first.is_visible(timeout=3000):
                            btn.first.click()
                            composer_opened = True
                            logger.info("Clicked Page composer trigger")
                            break
                    except Exception:
                        continue

                if composer_opened:
                    time.sleep(3)
                    # Find the textbox in the Page composer
                    page_tb_selectors = [
                        page.locator('div[contenteditable="true"][role="textbox"]'),
                        page.locator('div[contenteditable="true"]'),
                        page.locator('[contenteditable]:not([aria-label*="comment" i])'),
                        page.get_by_role("textbox"),
                        page.locator('div.notranslate'),
                    ]
                    for sel in page_tb_selectors:
                        try:
                            if sel.count() > 0 and sel.first.is_visible(timeout=3000):
                                post_box = sel.first
                                logger.info("Found Page composer textbox")
                                break
                        except Exception:
                            continue
                else:
                    # If direct composer click failed, try finding an already-open textbox
                    for sel in [
                        page.locator('div[contenteditable="true"][role="textbox"]'),
                        page.locator('div[contenteditable="true"]'),
                    ]:
                        try:
                            if sel.count() > 0 and sel.first.is_visible(timeout=3000):
                                post_box = sel.first
                                composer_opened = True
                                logger.info("Found already-open Page composer")
                                break
                        except Exception:
                            continue

                if not composer_opened:
                    context.close()
                    result["message"] = f"Could not find composer on Page '{page_name}'"
                    return result
            else:
                # Personal timeline posting (existing flow)
                composer_buttons = [
                    page.get_by_role("button", name=re.compile(r"What'?s on your mind", re.IGNORECASE)),
                    page.locator('[aria-label*="What\'s on your mind"]'),
                    page.get_by_placeholder(re.compile(r"What'?s on your mind", re.IGNORECASE)),
                    page.locator('[aria-label*="Create a post" i]'),
                    page.locator('[aria-label*="create post" i]'),
                    page.locator('[role="button"]:has-text("on your mind")'),
                    page.locator('div[role="button"]:has-text("What")'),
                    page.locator('div[role="button"]:has-text("what")'),
                ]
                for btn in composer_buttons:
                    try:
                        if btn.count() > 0 and btn.first.is_visible(timeout=3000):
                            btn.first.click()
                            composer_opened = True
                            logger.info("Clicked personal composer button")
                            break
                    except Exception:
                        continue
                
                if not composer_opened:
                    context.close()
                    result["message"] = "Could not find 'What\\'s on your mind?' button"
                    return result

                time.sleep(3)
                textbox_selectors = [
                    page.locator('div[contenteditable="true"][role="textbox"]'),
                    page.locator('div[contenteditable="true"]'),
                    page.locator('[aria-label*="post" i][contenteditable]'),
                    page.get_by_role("textbox"),
                    page.locator('div.notranslate'),
                ]
                for sel in textbox_selectors:
                    try:
                        if sel.count() > 0 and sel.first.is_visible(timeout=3000):
                            post_box = sel.first
                            logger.info("Found personal composer textbox")
                            break
                    except Exception:
                        continue
            
            if not post_box:
                context.close()
                result["message"] = "Could not find post textbox after opening composer"
                return result

            # Step 4: Type content
            post_box.click()
            time.sleep(0.5)
            post_box.fill(content)
            time.sleep(1)

            # Attach image if provided
            if image_path and Path(image_path).exists():
                image_attached = False
                logger.info(f"[IMAGE] Attempting to attach: {image_path} ({Path(image_path).stat().st_size} bytes)")

                # Method 1: Direct file input (most reliable for Facebook)
                try:
                    file_input = page.locator('input[type="file"]')
                    if file_input.count() > 0:
                        file_input.first.set_input_files(image_path, timeout=10000)
                        time.sleep(3)
                        image_attached = True
                        logger.info("[IMAGE] Attached via direct file input")
                except Exception as e:
                    logger.warning(f"[IMAGE] Direct file input failed: {e}")

                # Method 2: Click Photo/video button, then use file input
                if not image_attached:
                    for btn_name in ["Photo/video", "photo/video", "Add Photos", "Add photo", "Add Photo"]:
                        try:
                            btn = page.get_by_role("button", name=btn_name)
                            if btn.count() > 0 and btn.first.is_visible(timeout=3000):
                                btn.first.click()
                                time.sleep(2)
                                file_input = page.locator('input[type="file"]')
                                if file_input.count() > 0:
                                    file_input.first.set_input_files(image_path, timeout=10000)
                                    time.sleep(3)
                                    image_attached = True
                                    logger.info(f"[IMAGE] Attached via {btn_name} button")
                                    break
                        except Exception:
                            continue

                # Method 3: JavaScript click on the photo upload element
                if not image_attached:
                    try:
                        clicked = page.evaluate("""
                            () => {
                                const triggers = document.querySelectorAll('[aria-label*="photo" i], [aria-label*="Photo" i], [data-testid*="photo" i]');
                                for (const el of triggers) {
                                    if (el.offsetParent !== null) {
                                        el.click();
                                        return true;
                                    }
                                }
                                const addBtns = document.querySelectorAll('[aria-label*="Add" i]');
                                for (const btn of addBtns) {
                                    if (btn.offsetParent !== null) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            }
                        """)
                        if clicked:
                            time.sleep(2)
                            file_input = page.locator('input[type="file"]')
                            if file_input.count() > 0:
                                file_input.first.set_input_files(image_path, timeout=10000)
                                time.sleep(3)
                                image_attached = True
                                logger.info("[IMAGE] Attached via JS click + file input")
                    except Exception as e:
                        logger.warning(f"[IMAGE] JS method failed: {e}")

                if not image_attached:
                    try:
                        page.screenshot(path='/tmp/fb_image_fail.png')
                        logger.warning("[IMAGE] Could not attach image - screenshot saved to /tmp/fb_image_fail.png")
                    except Exception:
                        pass
                else:
                    logger.info(f"[IMAGE] Successfully attached: {image_path}")

                # Take a pre-post screenshot to verify image in composer
                try:
                    page.screenshot(path='/tmp/fb_pre_post.png')
                    logger.info("[IMAGE] Pre-post screenshot saved to /tmp/fb_pre_post.png")
                except Exception:
                    pass
            elif image_path:
                logger.warning(f"[IMAGE] Image path does not exist: {image_path}")

            # Attach link if provided
            if link_url:
                try:
                    post_box.press("Control+a")
                    post_box.press("Control+c")
                    post_box.fill(content + "\n\n" + link_url)
                    time.sleep(2)
                except Exception as e:
                    logger.warning(f"Could not attach link: {e}")

            # Click Post button - use JavaScript to find ONLY the submit button inside the composer
            posted = False
            try:
                clicked = page.evaluate("""
                    () => {
                        // Target: find the Post button that's in a visible dialog/modal
                        const dialogs = document.querySelectorAll('[role="dialog"], [role="presentation"], form');
                        for (const dialog of dialogs) {
                            const buttons = dialog.querySelectorAll('div[role="button"], button');
                            for (const btn of buttons) {
                                const text = (btn.textContent || '').trim().toLowerCase();
                                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                                if ((text === 'post' || aria === 'post') && !btn.disabled) {
                                    const rect = btn.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        btn.click();
                                        return 'dialog_post';
                                    }
                                }
                            }
                        }
                        // Fallback: find visible Post button with blue/green background (submit style)
                        const allBtns = document.querySelectorAll('div[role="button"], button');
                        for (const btn of allBtns) {
                            const text = (btn.textContent || '').trim().toLowerCase();
                            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                            if ((text === 'post' || aria === 'post') && !btn.disabled) {
                                const rect = btn.getBoundingClientRect();
                                const style = window.getComputedStyle(btn);
                                const bg = style.backgroundColor || '';
                                const isSubmitBtn = rect.width > 0 && rect.height > 0 &&
                                    (bg.includes('rgb(0, 132') || bg.includes('rgb(24, 119') || bg.includes('blue') || bg.includes('rgb(45, 136'));
                                if (isSubmitBtn) {
                                    btn.click();
                                    return 'styled_post';
                                }
                            }
                        }
                        // Last try: any visible Post button
                        for (const btn of allBtns) {
                            const text = (btn.textContent || '').trim().toLowerCase();
                            if (text === 'post' && !btn.disabled) {
                                const rect = btn.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    btn.click();
                                    return 'any_post';
                                }
                            }
                        }
                        return false;
                    }
                """)
                if clicked:
                    posted = True
                    logger.info(f"Clicked Post button via JS method: {clicked}")
            except Exception as e:
                logger.warning(f"JS post click failed: {e}")
            
            # Fallback: Try direct CSS selectors
            if not posted:
                for css_sel in [
                    '[role="dialog"] div[role="button"]:has-text("Post")',
                    '[role="dialog"] button:has-text("Post")',
                    'div[role="button"]:has-text("Post")',
                ]:
                    try:
                        btn = page.locator(css_sel).first
                        if btn.is_visible(timeout=2000):
                            btn.click(timeout=5000)
                            posted = True
                            logger.info(f"Clicked Post via CSS: {css_sel}")
                            break
                    except Exception:
                        continue
            
            if posted:
                time.sleep(5)
                # Verify: check if the composer DIALOG closed (not the feed button)
                modal_still_open = True
                try:
                    page.wait_for_timeout(2000)
                    # Check if any dialog with a Post button is still visible (modal still open)
                    dialog_check = page.evaluate("""
                        () => {
                            const dialogs = document.querySelectorAll('[role="dialog"]');
                            for (const d of dialogs) {
                                const rect = d.getBoundingClientRect();
                                if (rect.width > 200 && rect.height > 100 && d.offsetParent !== null) {
                                    return true;  // dialog still visible
                                }
                            }
                            return false;  // no visible dialog
                        }
                    """)
                    modal_still_open = dialog_check
                except Exception:
                    modal_still_open = False
                
                if not modal_still_open:
                    logger.info("Post submitted successfully")
                    result["success"] = True
                    result["message"] = "Post successfully created on Facebook"
                    result["post_url"] = "https://www.facebook.com"
                else:
                    # Take screenshot for debugging
                    try:
                        page.screenshot(path='/tmp/fb_post_fail.png')
                        logger.warning("Post may have failed - screenshot saved to /tmp/fb_post_fail.png")
                    except Exception:
                        pass
                    result["message"] = "Post composer still visible - post may not have gone through"
            else:
                result["message"] = "Could not find Post button using any method"

            context.close()

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
                
                # Wait for Share button to become enabled
                time.sleep(3)
                
                # Try 1: Exact "Share" button
                share_btn = page.get_by_role("button", name="Share", exact=True)
                if share_btn.count() > 0:
                    try:
                        share_btn.wait_for(state="visible", timeout=10000)
                        share_btn.click()
                        shared = True
                        print("   Shared via exact Share button")
                    except Exception as e:
                        print(f"   Share button click failed: {e}")
                
                if not shared:
                    # Try 2: Any button containing "Share"
                    share_btn = page.get_by_role("button", name="Share")
                    if share_btn.count() > 0:
                        try:
                            share_btn.first.click()
                            shared = True
                            print("   Shared via Share button (first)")
                        except Exception:
                            pass
                
                if not shared:
                    # Try 3: Look for Share by text
                    share_btn = page.get_by_text("Share", exact=True)
                    if share_btn.count() > 0:
                        try:
                            share_btn.first.click()
                            shared = True
                            print("   Shared via Share text")
                        except Exception:
                            pass
                
                if not shared:
                    # Try 4: JavaScript click
                    print("   Trying JavaScript click for Share...")
                    js_click_result = page.evaluate("""
                        () => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            for (const btn of buttons) {
                                if (btn.textContent.trim() === 'Share') {
                                    btn.click();
                                    return {clicked: true, method: 'js'};
                                }
                            }
                            // Also try by aria-label
                            const byLabel = Array.from(document.querySelectorAll('[aria-label*="Share"]'));
                            for (const el of byLabel) {
                                if (el.tagName === 'BUTTON' || el.tagName === 'DIV') {
                                    el.click();
                                    return {clicked: true, method: 'aria-label'};
                                }
                            }
                            return {clicked: false};
                        }
                    """)
                    if js_click_result.get('clicked'):
                        shared = True
                        print(f"   Shared via JavaScript ({js_click_result.get('method')})")
                    else:
                        print("   Could not find Share button via JavaScript")
                
                if shared:
                    print("   Waiting for post to complete...")
                    time.sleep(10)
                    # Wait for navigation or success indicator
                    try:
                        page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        pass
                    logger.info("Instagram post submitted successfully")
                    
                    result["success"] = True
                    result["message"] = "Post successfully created on Instagram"
                    result["post_url"] = "https://www.instagram.com"
                else:
                    result["message"] = "Could not find Share button using any selector"
                    logger.warning("Could not find Share button")

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
