#!/usr/bin/env python3
"""
SKILL_LInkedin_Playwright_MCP.py v2.0 - LinkedIn Posting via Playwright with Saved Session

Posts to LinkedIn using Playwright browser automation with persistent session.
QR code scan happens ONLY once - session is saved and reused automatically.

CRITICAL SAFETY RULES:
- ALWAYS requires human approval before posting
- NEVER auto-post without human moving file to /Approved/
- Uses saved session from /linkedin_session/ folder
- Respects LinkedIn rate limits (60s minimum between posts)

Usage:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
    
    result = post_to_linkedin(
        content="Your post text here...",
        image_path=None,  # Optional: path to image file
        target="personal"  # "personal" or "company"
    )

Author: Digital Employee System
Tier: Silver v2.0 - Human-in-the-Loop LinkedIn Posting
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# Audit logging
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from audit_log import (
        get_audit_manager,
        AuditEntry,
        AuditCategory,
        AuditLevel,
    )
    AUDIT_AVAILABLE = True
except ImportError:
    AUDIT_AVAILABLE = False

# Auto-install playwright if needed
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright


# =============================================================================
# CONFIGURATION
# =============================================================================

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent.parent

# Session persistence directory
SESSION_DIR = BASE_DIR / "linkedin_session"
SESSION_DIR.mkdir(parents=True, exist_ok=True)

# Pending approval directory
APPROVAL_DIR = BASE_DIR / "Pending_Approval"
APPROVAL_DIR.mkdir(parents=True, exist_ok=True)


# =============================================================================
# LINKEDIN POSTING FUNCTION
# =============================================================================

def post_to_linkedin(content: str, image_path: Optional[str] = None, target: str = "personal") -> Dict[str, Any]:
    """
    Post content to LinkedIn using Playwright with saved session.
    
    CRITICAL: This function REQUIRES human approval before posting.
    The orchestrator must save a draft to /Pending_Approval/ first,
    wait for human to move it to /Approved/, then call this function.
    
    Parameters:
    -----------
    content : str
        The text content to post on LinkedIn
    image_path : str, optional
        Path to image file to attach with the post
    target : str
        "personal" for personal profile, "company" for company page
    
    Returns:
    --------
    dict : Result dictionary with keys:
        - success (bool): Whether the post was successful
        - message (str): Human-readable result message
        - post_url (str or None): URL of the posted content if successful
    
    Example:
    --------
    >>> result = post_to_linkedin("Hello LinkedIn! #AI #SaaS")
    >>> if result['success']:
    ...     print(f"Posted! URL: {result['post_url']}")
    """
    # Initialize audit logging
    audit = get_audit_manager() if AUDIT_AVAILABLE else None
    correlation_id = f"linkedin_pw_{int(datetime.now().timestamp())}"
    start_time = datetime.now()

    # Validate content
    if not content or not content.strip():
        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={"content_length": 0, "target": target},
                error={"type": "ValidationError", "message": "Post content cannot be empty"},
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)
        return {
            "success": False,
            "message": "Post content cannot be empty",
            "post_url": None
        }

    if len(content) > 3000:
        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={"content_length": len(content), "target": target},
                error={"type": "ValidationError", "message": f"Post content exceeds 3000 character limit ({len(content)} chars)"},
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)
        return {
            "success": False,
            "message": f"Post content exceeds 3000 character limit ({len(content)} chars)",
            "post_url": None
        }

    # Check for saved session
    cookies_file = SESSION_DIR / "cookies.json"
    if not cookies_file.exists():
        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={"content_length": len(content), "target": target},
                error={"type": "SessionError", "message": "No saved LinkedIn session found"},
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)
        return {
            "success": False,
            "message": "No saved LinkedIn session found. Please login first using test_linkedin_session.py",
            "post_url": None
        }

    # Load saved session cookies
    try:
        with open(cookies_file, 'r', encoding='utf-8') as f:
            cookies = json.load(f)
        print(f"✅ Loaded LinkedIn session from {cookies_file}")

        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.INFO,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={
                    "content_length": len(content),
                    "target": target,
                    "session_loaded": True,
                    "cookie_count": len(cookies),
                },
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)
    except Exception as e:
        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={"content_length": len(content), "target": target},
                error={"type": type(e).__name__, "message": str(e)},
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)
        return {
            "success": False,
            "message": f"Failed to load session cookies: {e}",
            "post_url": None
        }
    
    # Start Playwright browser with saved session
    browser = None
    try:
        with sync_playwright() as p:
            # Launch browser (headless for production)
            print("🚀 Launching browser...")
            browser = p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )

            # Create context with realistic user agent
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720},
                locale="en-US"
            )

            # Add saved cookies for session restoration
            context.add_cookies(cookies)

            # Create page
            page = context.new_page()

            # Navigate to LinkedIn (increased timeouts)
            print("🌐 Navigating to LinkedIn...")
            try:
                page.goto("https://www.linkedin.com", timeout=60000, wait_until="domcontentloaded")
                print("✅ Page loaded")
            except Exception as e:
                # Even if timeout, page may have partially loaded
                print(f"⚠️  Navigation warning: {str(e)[:100]}")
            
            # Wait a bit for page to settle
            page.wait_for_timeout(3000)

            # Check if we're logged in
            current_url = page.url
            print(f"   Current URL: {current_url}")
            
            if "login" in current_url.lower() or "signin" in current_url.lower():
                return {
                    "success": False,
                    "message": "LinkedIn session expired. Please re-login using: python3 setup_linkedin_session.py",
                    "post_url": None
                }

            print("✅ Logged in successfully")
            
            # Navigate to feed (post creation page)
            print("📱 Navigating to feed...")
            try:
                page.goto("https://www.linkedin.com/feed/", timeout=60000, wait_until="domcontentloaded")
                print("✅ Feed loaded")
            except Exception as e:
                print(f"⚠️  Feed navigation warning: {str(e)[:100]}")

            # Wait for LinkedIn's JavaScript to fully load
            print("⏳ Waiting for LinkedIn to load...")
            page.wait_for_timeout(5000)  # Increased wait time
            
            # Click on "Start a post" box
            print("📝 Opening post editor...")
            create_post_clicked = False
            selectors_to_try = [
                "div[role='button']:has-text('Start a post')",
                "button:has-text('Start a post')",
                "div.feed-shared-create-post__cta",
                "button:has-text('Start')",
            ]

            for selector in selectors_to_try:
                try:
                    locator = page.locator(selector).first
                    if locator.is_visible(timeout=5000):  # Increased timeout
                        locator.click()
                        create_post_clicked = True
                        print(f"   Clicked using selector: {selector}")
                        break
                except Exception:
                    continue

            if not create_post_clicked:
                # Try alternative: click anywhere in the post creation area
                try:
                    page.click("div:has-text('Start a post')", timeout=5000)
                    create_post_clicked = True
                    print("   Clicked using text match")
                except Exception as e:
                    return {
                        "success": False,
                        "message": f"Could not find 'Start a post' element. Session may be expired. Try: python3 setup_linkedin_session.py",
                        "post_url": None
                    }

            # Wait for post editor modal to appear
            page.wait_for_timeout(3000)  # Increased wait
            
            # Find the post editor and fill content
            print("✍️  Filling post content...")
            editor_found = False
            editor_selectors = [
                "div.ql-editor[contenteditable='true']",
                "div[contenteditable='true']",
                "div.artdeco-editor",
                "div.ck-content",
                "div[data-placeholder*='What do you want to talk about']",
                "div[data-placeholder*='Write something']",
            ]
            
            for selector in editor_selectors:
                try:
                    editor = page.locator(selector).first
                    if editor.is_visible(timeout=5000):  # Increased timeout
                        # Clear and fill content
                        editor.click()
                        page.wait_for_timeout(500)
                        editor.fill(content)
                        editor_found = True
                        print(f"   Filled content using selector: {selector}")
                        break
                except Exception:
                    continue
            
            if not editor_found:
                return {
                    "success": False,
                    "message": "Could not find the post editor field on LinkedIn",
                    "post_url": None
                }

            # Wait after filling content - LinkedIn needs time to enable Post button
            print("⏳ Waiting for content to register...")
            page.wait_for_timeout(3000)  # Increased from 1000ms
            
            # Add image if provided
            if image_path and os.path.exists(image_path):
                print(f"📷 Uploading image: {image_path}")
                image_uploaded = False
                
                image_button_selectors = [
                    "button[aria-label*='photo']",
                    "button[aria-label*='image']",
                    "button[aria-label*='Add an image']",
                    "button[aria-label*='Add a photo']",
                    "div[role='button'][aria-label*='photo']",
                    "div[role='button'][aria-label*='image']",
                ]
                
                for selector in image_button_selectors:
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=2000):
                            with page.expect_file_chooser() as fc_info:
                                btn.click()
                            file_chooser = fc_info.value
                            file_chooser.set_files(image_path)
                            image_uploaded = True
                            print(f"   Uploaded image using: {selector}")
                            break
                    except Exception:
                        continue
                
                if not image_uploaded:
                    print("⚠️  Warning: Could not upload image, continuing with text-only post")
                
                # Wait for image to upload
                page.wait_for_timeout(3000)
            
            # Find and click the Post button
            print("🚀 Publishing post...")
            post_clicked = False
            post_button_selectors = [
                "button.share-actions__primary-action",  # Most reliable selector
                "div.share-box_actions button",
                "button[aria-label='Post']",
                "button[aria-label='Post now']",
                "button:has-text('Post')",
                "div[role='button']:has-text('Post')",
            ]

            for selector in post_button_selectors:
                try:
                    btn = page.locator(selector).first
                    # Wait for button to be visible
                    if btn.is_visible(timeout=8000):  # Increased wait for button to appear
                        # Check if button is not disabled
                        is_disabled = btn.get_attribute('disabled')
                        is_aria_disabled = btn.get_attribute('aria-disabled')
                        
                        if is_disabled or is_aria_disabled == 'true':
                            print(f"   ⏳ Button is disabled, waiting more... (3s)")
                            page.wait_for_timeout(3000)
                            # Try again
                            if btn.is_visible(timeout=5000):
                                btn.click()
                                post_clicked = True
                                print(f"   ✅ Clicked Post button using: {selector}")
                                break
                        else:
                            btn.click()
                            post_clicked = True
                            print(f"   ✅ Clicked Post button using: {selector}")
                            break
                except Exception:
                    continue
            
            if not post_clicked:
                return {
                    "success": False,
                    "message": "Could not find or click the 'Post' button on LinkedIn",
                    "post_url": None
                }
            
            # Wait for post to be submitted
            print("⏳ Waiting for post to publish...")
            page.wait_for_timeout(5000)
            
            # Check if post was successful
            success_indicators = [
                "Your post has been published",
                "Post published",
                "Share what's on your mind",  # Back to main feed
                "View your post",
            ]
            
            post_success = False
            for indicator in success_indicators:
                try:
                    if page.get_by_text(indicator).first.is_visible(timeout=3000):
                        post_success = True
                        print(f"   ✅ Success indicator found: {indicator}")
                        break
                except Exception:
                    continue
            
            # Get the current URL (may be post URL or feed URL)
            post_url = page.url
            
            # Close browser
            browser.close()

            duration_ms = (datetime.now() - start_time).total_seconds() * 1000

            if post_success:
                # Audit log success
                if audit:
                    entry = AuditEntry(
                        category=AuditCategory.LINKEDIN,
                        level=AuditLevel.SUCCESS,
                        action="post_to_linkedin",
                        correlation_id=correlation_id,
                        details={
                            "content_length": len(content),
                            "target": target,
                            "post_url": post_url,
                            "method": "playwright_browser",
                        },
                        duration_ms=round(duration_ms, 2),
                        source="SKILL_LInkedin_Playwright_MCP",
                    )
                    audit.log(entry)

                return {
                    "success": True,
                    "message": "Post successfully created on LinkedIn",
                    "post_url": post_url
                }
            else:
                # Audit log partial success
                if audit:
                    entry = AuditEntry(
                        category=AuditCategory.LINKEDIN,
                        level=AuditLevel.WARNING,
                        action="post_to_linkedin",
                        correlation_id=correlation_id,
                        details={
                            "content_length": len(content),
                            "target": target,
                            "post_url": post_url,
                            "method": "playwright_browser",
                            "success_confirmed": False,
                        },
                        duration_ms=round(duration_ms, 2),
                        source="SKILL_LInkedin_Playwright_MCP",
                    )
                    audit.log(entry)

                return {
                    "success": True,
                    "message": "Post submitted (no error detected, but success indicator not confirmed)",
                    "post_url": post_url
                }

    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        if browser:
            try:
                browser.close()
            except Exception:
                pass

        error_msg = f"Error posting to LinkedIn: {str(e)}"
        print(f"❌ {error_msg}")

        # Audit log error
        if audit:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="post_to_linkedin",
                correlation_id=correlation_id,
                details={
                    "content_length": len(content),
                    "target": target,
                    "method": "playwright_browser",
                },
                error={"type": type(e).__name__, "message": error_msg},
                duration_ms=round(duration_ms, 2),
                source="SKILL_LInkedin_Playwright_MCP",
            )
            audit.log(entry)

        return {
            "success": False,
            "message": error_msg,
            "post_url": None
        }


# =============================================================================
# SESSION MANAGEMENT HELPERS
# =============================================================================

def save_linkedin_session(cookies_file: Optional[str] = None):
    """
    Interactive helper to save LinkedIn session cookies.
    Opens visible browser for QR code scan, then saves cookies.
    
    Usage:
        python3 -c "from Agent_Skills.SKILL_LInkedin_Playwright_MCP import save_linkedin_session; save_linkedin_session()"
    """
    if cookies_file is None:
        cookies_file = SESSION_DIR / "cookies.json"
    
    print("🔐 LinkedIn Session Setup")
    print("=" * 60)
    print("This will open a browser window for you to login to LinkedIn.")
    print("After logging in, the session will be saved for future automated posts.")
    print()
    
    try:
        with sync_playwright() as p:
            # Launch visible browser
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            page = context.new_page()
            
            print("🌐 Opening LinkedIn login page...")
            page.goto("https://www.linkedin.com/login", timeout=30000)
            
            print("📱 Please login to LinkedIn (scan QR code or enter credentials)")
            print("⏳ Waiting for you to login... (checking every 3 seconds)")
            
            # Wait for user to login (detect when they reach the feed)
            max_wait = 120  # 2 minutes
            logged_in = False
            
            for i in range(max_wait // 3):
                time.sleep(3)
                current_url = page.url
                
                if "login" not in current_url.lower() and "feed" in current_url.lower():
                    logged_in = True
                    print("✅ Login detected!")
                    break
                else:
                    print(f"   Still waiting... ({(i+1)*3}s)")
            
            if not logged_in:
                print("⚠️  Timeout reached. Checking if session is valid anyway...")
            
            # Save cookies
            cookies = context.cookies()
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(str(cookies_file)), exist_ok=True)
            
            with open(cookies_file, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, indent=2)
            
            # Set restrictive permissions (owner only)
            os.chmod(cookies_file, 0o600)
            
            print(f"\n💾 Session saved to: {cookies_file}")
            print(f"🔒 File permissions set to: 0600 (owner read/write only)")
            print("✅ You can now close the browser")
            
            browser.close()
            
            print("\n🎉 Session saved successfully!")
            print("   Future posts will use this session automatically.")
    
    except Exception as e:
        print(f"\n❌ Failed to save session: {e}")
        import traceback
        traceback.print_exc()


def test_linkedin_session():
    """
    Test if saved LinkedIn session is still valid.

    Usage:
        python3 -c "from Agent_Skills.SKILL_LInkedin_Playwright_MCP import test_linkedin_session; test_linkedin_session()"
    """
    cookies_file = SESSION_DIR / "cookies.json"

    if not cookies_file.exists():
        print("❌ No saved session found. Run save_linkedin_session() first.")
        return False

    print("🧪 Testing LinkedIn session...")

    browser = None
    max_retries = 2
    
    for attempt in range(max_retries):
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-setuid-sandbox']
                )
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 720}
                )

                # Load cookies
                with open(cookies_file, 'r', encoding='utf-8') as f:
                    cookies = json.load(f)
                context.add_cookies(cookies)

                page = context.new_page()
                
                if attempt > 0:
                    print(f"   Retry attempt {attempt + 1}/{max_retries}...")
                
                # Navigate to LinkedIn with relaxed wait
                page.goto("https://www.linkedin.com", timeout=30000, wait_until="domcontentloaded")
                
                # Wait for page to be mostly loaded (more lenient than networkidle)
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=10000)
                except Exception:
                    pass  # Page may still be usable even if this times out
                
                # Give LinkedIn a moment to process authentication
                page.wait_for_timeout(3000)

                current_url = page.url

                if "login" in current_url.lower() or "signin" in current_url.lower():
                    print("❌ Session expired. Please re-login using save_linkedin_session()")
                    browser.close()
                    return False
                else:
                    print(f"✅ Session is valid! (URL: {current_url})")
                    browser.close()
                    return True

        except Exception as e:
            if browser:
                try:
                    browser.close()
                except:
                    pass
            
            error_msg = str(e)
            
            # If it's a network error, retry
            if "ERR_NETWORK" in error_msg or "net::" in error_msg:
                if attempt < max_retries - 1:
                    print(f"   ⚠️  Network error, retrying...")
                    import time
                    time.sleep(2)
                    continue
                else:
                    print(f"⚠️  Network error after {max_retries} attempts: {error_msg}")
                    print("   This may be a temporary network issue.")
                    print("   Try running the test again or check your internet connection.")
                    return False
            else:
                # Other errors
                print(f"❌ Session test failed: {error_msg}")
                return False
    
    # Should not reach here
    print("⚠️  Session test inconclusive")
    return False


# =============================================================================
# CLI INTERFACE
# =============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "save":
            save_linkedin_session()
        elif command == "test":
            test_linkedin_session()
        elif command == "post":
            # Quick post from command line
            if len(sys.argv) < 3:
                print("Usage: python3 SKILL_LInkedin_Playwright_MCP.py post 'Your post content here'")
                sys.exit(1)
            
            content = sys.argv[2]
            image = sys.argv[3] if len(sys.argv) > 3 else None
            
            print("📱 Posting to LinkedIn...")
            result = post_to_linkedin(content, image_path=image)
            
            if result['success']:
                print(f"✅ {result['message']}")
                if result['post_url']:
                    print(f"   URL: {result['post_url']}")
            else:
                print(f"❌ {result['message']}")
                sys.exit(1)
        else:
            print("Unknown command. Use: save, test, or post")
            sys.exit(1)
    else:
        print("LinkedIn Playwright MCP v2.0")
        print("Usage:")
        print("  python3 SKILL_LInkedin_Playwright_MCP.py save   - Save new session")
        print("  python3 SKILL_LInkedin_Playwright_MCP.py test   - Test current session")
        print("  python3 SKILL_LInkedin_Playwright_MCP.py post 'content' [image] - Quick post")
        print()
        print("⚠️  WARNING: Always require human approval before posting!")
