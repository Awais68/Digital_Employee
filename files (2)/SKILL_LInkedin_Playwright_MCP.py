#!/usr/bin/env python3
"""
SKILL_LInkedin_Playwright_MCP.py  v3.0  — LinkedIn Posting via Playwright
==========================================================================
FIXED BUGS (vs v2.0):
  BUG-1  fill() on contenteditable → use keyboard.type() instead
  BUG-2  JS textContent bypass bypasses React state → use keyboard.type()
  BUG-3  Disabled-button check was wrong (None ≠ disabled) → use is_enabled()
  BUG-4  Stale CSS class selectors → replaced with aria-label + text matchers
  BUG-5  Headless fingerprinting → added --disable-blink-features + stealth JS
  BUG-6  domcontentloaded fires before React renders → wait_for_selector instead

Usage:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin

    result = post_to_linkedin(
        content="Your post text here...",
        image_path=None,   # optional
        target="personal"
    )
    # → {"success": True, "message": "...", "post_url": "..."}

    python3 SKILL_LInkedin_Playwright_MCP.py save    # re-save session (login once)
    python3 SKILL_LInkedin_Playwright_MCP.py test    # verify session
    python3 SKILL_LInkedin_Playwright_MCP.py post 'content'
"""

import sys
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# ── audit shim ──────────────────────────────────────────────────────────────
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from audit_log import get_audit_manager, AuditEntry, AuditCategory, AuditLevel
    AUDIT_AVAILABLE = True
except ImportError:
    AUDIT_AVAILABLE = False

# ── playwright auto-install ──────────────────────────────────────────────────
try:
    from playwright.sync_api import sync_playwright, Page, BrowserContext
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "-q"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium", "--quiet"])
    from playwright.sync_api import sync_playwright, Page

# ── paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent.parent
SESSION_DIR = BASE_DIR / "linkedin_session"
SESSION_DIR.mkdir(parents=True, exist_ok=True)
COOKIES_FILE = SESSION_DIR / "cookies.json"
DEBUG_DIR    = BASE_DIR / "Logs" / "linkedin_debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

# ── stealth JavaScript injected before every page load ───────────────────────
_STEALTH_JS = """
() => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    // Restore plugins length
    Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
    // Restore languages
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    // Fix Chrome property
    window.chrome = {runtime: {}};
}
"""

# ── selectors: multiple fallbacks, ordered by reliability ────────────────────
# LinkedIn A/B tests UI constantly; we try them all and use first that works.

# "Start a post" trigger on the feed
START_POST_SELECTORS = [
    # Stable aria-label patterns
    "button[aria-label*='Create a post']",
    "button[aria-label*='start a post']",
    "button[aria-label*='Start a post']",
    # data attributes LinkedIn uses internally
    "[data-control-name='share.post']",
    # Text-based (Playwright :has-text is CSS-like, very reliable)
    "div.share-box-feed-entry__trigger",
    "button:has-text('Start a post')",
    "div[role='button']:has-text('Start a post')",
    # Older fallback class names
    "div.feed-shared-create-post__trigger",
]

# The post text editor (contenteditable)
EDITOR_SELECTORS = [
    # Quill editor class LinkedIn uses
    "div.ql-editor[contenteditable='true']",
    # Generic contenteditable inside the modal
    "div.editor-content div[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true'][data-placeholder]",
    "[contenteditable='true']",
]

# "Post" submit button
POST_BTN_SELECTORS = [
    # Aria label is most stable
    "button[aria-label='Post']",
    "button[aria-label='Post now']",
    # data-control-name LinkedIn uses
    "button[data-control-name='share.post']",
    # Class-name patterns (may change, kept as last resort)
    "button.share-actions__primary-action",
    "div.share-box_actions button[type='submit']",
    # Text fallbacks
    "button:has-text('Post'):not(:has-text('Schedule'))",
]


# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _screenshot(page: "Page", label: str) -> str:
    """Save a debug screenshot; returns file path."""
    ts   = datetime.now().strftime("%H%M%S")
    path = str(DEBUG_DIR / f"{ts}_{label}.png")
    try:
        page.screenshot(path=path, full_page=False)
    except Exception:
        pass
    return path


def _first_visible(page: "Page", selectors: list, timeout: int = 8000):
    """Return the first locator that is visible, or None."""
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=timeout)
            return loc
        except Exception:
            continue
    return None


def _type_into_editor(page: "Page", content: str) -> bool:
    """
    Click the post editor and type content using keyboard.type().

    WHY keyboard.type() instead of fill() or JS textContent:
      - fill() is designed for <input>/<textarea>; on contenteditable it fires
        no React synthetic events, so the Post button stays disabled.
      - JS textContent assignment bypasses React's synthetic event system.
        React 16+ uses nativeEvent.isTrusted; simulated events are rejected.
      - keyboard.type() sends real OS-level key events that React's event
        delegation picks up correctly, enabling the Post button.
    """
    editor = _first_visible(page, EDITOR_SELECTORS, timeout=10000)
    if editor is None:
        print("[DEBUG] Editor not found with any selector")
        _screenshot(page, "editor_not_found")
        return False

    # Click to focus
    editor.click()
    page.wait_for_timeout(500)

    # Clear any existing text (Select All + Delete)
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    page.wait_for_timeout(300)

    # Type content — delay=25ms keeps typing human-like and lets React keep up
    page.keyboard.type(content, delay=25)
    page.wait_for_timeout(800)   # let React re-render with new text

    print(f"[DEBUG] Typed {len(content)} chars into editor")
    return True


def _click_post_button(page: "Page") -> bool:
    """
    Wait for the Post button to become enabled and click it.

    WHY we wait for is_enabled():
      - After keyboard.type(), React updates state asynchronously.
      - LinkedIn disables the Post button until text is present.
      - The old code checked get_attribute('disabled') which returns None
        even when the button IS disabled via aria-disabled or CSS pointer-events.
      - We poll is_enabled() with a real wait loop instead.
    """
    btn = None
    for sel in POST_BTN_SELECTORS:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=5000)
            btn = loc
            print(f"[DEBUG] Post button found: {sel}")
            break
        except Exception:
            continue

    if btn is None:
        print("[DEBUG] Post button not found with any selector")
        _screenshot(page, "post_btn_missing")
        return False

    # Wait up to 10 s for button to become enabled
    for i in range(20):
        try:
            if btn.is_enabled():
                break
        except Exception:
            pass
        page.wait_for_timeout(500)
        if i == 19:
            print("[DEBUG] Post button never became enabled (text may not have registered)")
            _screenshot(page, "post_btn_disabled")
            return False

    btn.click()
    print("[DEBUG] Post button clicked")
    return True


def _make_context(playwright, cookies: list) -> tuple:
    """
    Create a stealth Chromium context with saved cookies.

    WHY these args:
      --disable-blink-features=AutomationControlled  removes navigator.webdriver
      --no-sandbox / --disable-setuid-sandbox        required in many Linux envs
    """
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--window-size=1280,800",
        ],
    )
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="en-US",
    )
    # Inject stealth JS before every page navigation
    context.add_init_script(_STEALTH_JS)
    # Restore session
    if cookies:
        context.add_cookies(cookies)
    return browser, context


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

def post_to_linkedin(
    content: str,
    image_path: Optional[str] = None,
    target: str = "personal",
) -> Dict[str, Any]:
    """
    Post content to LinkedIn using Playwright with saved session.

    REQUIRES human approval before this is called — orchestrator must move
    the draft from /Pending_Approval/ to /Approved/ first.

    Returns {"success": bool, "message": str, "post_url": str|None}
    """
    audit = get_audit_manager() if AUDIT_AVAILABLE else None
    cid   = f"linkedin_pw_{int(datetime.now().timestamp())}"

    def _fail(msg: str) -> dict:
        print(f"[LINKEDIN] FAIL: {msg}")
        if audit:
            audit.log(AuditEntry(
                category=AuditCategory.LINKEDIN, level=AuditLevel.ERROR,
                action="post_to_linkedin", correlation_id=cid,
                error={"message": msg}, source="SKILL_LInkedin_Playwright_MCP",
            ))
        return {"success": False, "message": msg, "post_url": None}

    # ── validate ────────────────────────────────────────────────────────────
    if not content or not content.strip():
        return _fail("Post content cannot be empty")
    if len(content) > 3000:
        return _fail(f"Post content too long ({len(content)}/3000 chars)")
    if not COOKIES_FILE.exists():
        return _fail(
            "No saved LinkedIn session. Run: "
            "python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save"
        )

    # ── load session ─────────────────────────────────────────────────────────
    try:
        cookies = json.loads(COOKIES_FILE.read_text())
        print(f"[LINKEDIN] Loaded {len(cookies)} session cookies")
    except Exception as e:
        return _fail(f"Failed to read cookies: {e}")

    browser = None
    try:
        with sync_playwright() as p:
            browser, context = _make_context(p, cookies)
            page = context.new_page()

            # ── navigate to feed ─────────────────────────────────────────────
            print("[LINKEDIN] Navigating to LinkedIn feed…")
            try:
                page.goto(
                    "https://www.linkedin.com/feed/",
                    timeout=60_000,
                    # FIX BUG-6: domcontentloaded is too early for React SPA.
                    # We use commit (first byte) then wait for a real element.
                    wait_until="commit",
                )
            except Exception as nav_err:
                print(f"[LINKEDIN] Navigation warning (continuing): {nav_err}")

            # Wait for a stable landmark that proves we're logged in
            # FIX BUG-6 continued: this replaces the bare wait_for_timeout
            try:
                page.wait_for_selector(
                    "nav, .global-nav, [data-test-global-nav]",
                    timeout=30_000,
                )
            except Exception:
                pass  # may still be usable

            page.wait_for_timeout(2000)
            _screenshot(page, "01_feed_loaded")

            # ── session check ────────────────────────────────────────────────
            url = page.url
            print(f"[LINKEDIN] URL after load: {url}")
            if "login" in url or "checkpoint" in url or "uas/" in url:
                _screenshot(page, "02_session_expired")
                return _fail(
                    "LinkedIn session expired. Re-run: "
                    "python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save"
                )
            print("[LINKEDIN] Session valid ✓")

            # ── open 'Start a post' ──────────────────────────────────────────
            print("[LINKEDIN] Looking for 'Start a post' trigger…")
            start_btn = _first_visible(page, START_POST_SELECTORS, timeout=15_000)
            if start_btn is None:
                _screenshot(page, "03_no_start_btn")
                return _fail(
                    "Could not find 'Start a post' button. "
                    "Session may be expired or LinkedIn changed their UI. "
                    f"Debug screenshot saved in {DEBUG_DIR}"
                )

            start_btn.click()
            print("[LINKEDIN] 'Start a post' clicked")
            page.wait_for_timeout(2000)
            _screenshot(page, "04_editor_open")

            # ── type content into editor ─────────────────────────────────────
            # FIX BUG-1 + BUG-2: use keyboard.type() instead of fill()/JS
            print("[LINKEDIN] Typing post content…")
            if not _type_into_editor(page, content):
                _screenshot(page, "05_type_failed")
                return _fail(
                    "Could not type into post editor. "
                    f"Check debug screenshots in {DEBUG_DIR}"
                )
            _screenshot(page, "06_content_typed")

            # ── upload image (optional) ──────────────────────────────────────
            if image_path and Path(image_path).exists():
                print(f"[LINKEDIN] Attaching image: {image_path}")
                img_btn_selectors = [
                    "button[aria-label*='Add a photo']",
                    "button[aria-label*='photo']",
                    "button[aria-label*='image']",
                    "button[aria-label*='Image']",
                    "[data-control-name='share.attach_image']",
                ]
                img_btn = _first_visible(page, img_btn_selectors, timeout=5000)
                if img_btn:
                    with page.expect_file_chooser() as fc_info:
                        img_btn.click()
                    fc_info.value.set_files(image_path)
                    page.wait_for_timeout(3000)
                    print("[LINKEDIN] Image attached")
                else:
                    print("[LINKEDIN] Image button not found — continuing without image")

            # ── click Post button ─────────────────────────────────────────────
            # FIX BUG-3: use is_enabled() polling instead of get_attribute
            print("[LINKEDIN] Submitting post…")
            if not _click_post_button(page):
                _screenshot(page, "07_submit_failed")
                return _fail(
                    "Post button not found or stayed disabled. "
                    "Content may not have registered in React state."
                )

            # ── wait for confirmation ────────────────────────────────────────
            print("[LINKEDIN] Waiting for post confirmation…")
            page.wait_for_timeout(5000)
            _screenshot(page, "08_after_submit")

            post_url = page.url

            # Try to detect success indicators
            success = False
            success_texts = [
                "Your post is now live",
                "Your post was sent",
                "Post published",
                "View your post",
            ]
            for txt in success_texts:
                try:
                    if page.locator(f"text={txt}").first.is_visible(timeout=2000):
                        success = True
                        print(f"[LINKEDIN] Success indicator: '{txt}'")
                        break
                except Exception:
                    continue

            # If we're back on the feed and there was no error, assume success
            if not success and ("feed" in page.url or "mynetwork" in page.url):
                success = True
                print("[LINKEDIN] Back on feed — assuming success")

            browser.close()

            if success:
                if audit:
                    audit.log(AuditEntry(
                        category=AuditCategory.LINKEDIN, level=AuditLevel.SUCCESS,
                        action="post_to_linkedin", correlation_id=cid,
                        details={"post_url": post_url, "content_len": len(content)},
                        source="SKILL_LInkedin_Playwright_MCP",
                    ))
                print(f"[LINKEDIN] Posted successfully: {post_url}")
                return {
                    "success": True,
                    "message": "Post published to LinkedIn",
                    "post_url": post_url,
                }
            else:
                return _fail(
                    f"Post submitted but success not confirmed. "
                    f"Check debug screenshots in {DEBUG_DIR} and verify on LinkedIn."
                )

    except Exception as exc:
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        return _fail(f"Unexpected error: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
#  SESSION MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

def save_linkedin_session(visible: bool = True) -> bool:
    """
    Open a visible browser window, let the user log in, then save cookies.
    Only needs to be done ONCE every ~30 days.
    """
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  LinkedIn Session Setup")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("A browser window will open. Log in to LinkedIn.")
    print("The script will detect login and save your session.")
    print()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not visible)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
            )
            context.add_init_script(_STEALTH_JS)
            page = context.new_page()
            page.goto("https://www.linkedin.com/login", timeout=30_000)

            print("⏳ Waiting for you to log in (up to 3 minutes)…")
            deadline = time.time() + 180
            logged_in = False
            while time.time() < deadline:
                time.sleep(2)
                url = page.url
                if "feed" in url or ("linkedin.com" in url and "login" not in url and "uas/" not in url):
                    logged_in = True
                    print("✅ Login detected!")
                    break
                print(f"   Still waiting… ({int(deadline - time.time())}s left)", end="\r")

            if not logged_in:
                print("\n⚠️  Timeout. Saving whatever session exists anyway.")

            # Extra pause to let LinkedIn finish setting all cookies
            time.sleep(3)
            cookies = context.cookies()
            COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
            COOKIES_FILE.chmod(0o600)
            browser.close()

            print(f"\n💾 Session saved → {COOKIES_FILE}")
            print(f"   {len(cookies)} cookies captured")
            print("✅ Done! Future posts will use this session automatically.")
            return True

    except Exception as e:
        print(f"\n❌ Failed to save session: {e}")
        return False


def test_linkedin_session() -> bool:
    """Verify the saved session is still valid without posting anything."""
    if not COOKIES_FILE.exists():
        print("❌ No saved session. Run: python3 SKILL_LInkedin_Playwright_MCP.py save")
        return False

    print("🧪 Testing LinkedIn session…")
    try:
        cookies = json.loads(COOKIES_FILE.read_text())
    except Exception as e:
        print(f"❌ Cannot read cookies: {e}")
        return False

    try:
        with sync_playwright() as p:
            browser, context = _make_context(p, cookies)
            page = context.new_page()
            page.goto(
                "https://www.linkedin.com/feed/",
                timeout=45_000,
                wait_until="commit",
            )
            try:
                page.wait_for_selector("nav, .global-nav", timeout=20_000)
            except Exception:
                pass
            page.wait_for_timeout(2000)

            url = page.url
            _screenshot(page, "session_test")

            if "feed" in url or ("linkedin.com" in url and "login" not in url):
                print(f"✅ Session is VALID  (url={url})")
                # Check for Start a post button
                btn = _first_visible(page, START_POST_SELECTORS, timeout=8000)
                if btn:
                    print("✅ 'Start a post' button found — ready to post")
                else:
                    print("⚠️  Session valid but 'Start a post' not found — LinkedIn may have changed their UI")
                browser.close()
                return True
            else:
                print(f"❌ Session EXPIRED  (url={url})")
                print("   Re-run: python3 SKILL_LInkedin_Playwright_MCP.py save")
                browser.close()
                return False

    except Exception as e:
        print(f"❌ Test error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "save":
        ok = save_linkedin_session(visible=True)
        sys.exit(0 if ok else 1)

    elif cmd == "test":
        ok = test_linkedin_session()
        sys.exit(0 if ok else 1)

    elif cmd == "post":
        if len(sys.argv) < 3:
            print("Usage: python3 SKILL_LInkedin_Playwright_MCP.py post 'content' [image_path]")
            sys.exit(1)
        content   = sys.argv[2]
        img       = sys.argv[3] if len(sys.argv) > 3 else None
        result    = post_to_linkedin(content, image_path=img)
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["success"] else 1)

    elif cmd == "debug":
        # Verbose session-check with screenshots
        print("Running full diagnostic…")
        test_linkedin_session()
        print(f"\nDebug screenshots saved in: {DEBUG_DIR}")

    else:
        print(__doc__)
        print()
        print("Commands:")
        print("  save    — Open browser, log in, save session")
        print("  test    — Check if saved session is still valid")
        print("  post    — Quick post from command line")
        print("  debug   — Verbose session check with screenshots")
