#!/usr/bin/env python3
"""
linkedin_diagnose.py  —  Full LinkedIn Playwright diagnostic
============================================================
Run this BEFORE the fix to capture exactly what fails,
and AFTER the fix to confirm everything works.

Usage (from Digital_Employee directory):
    python3 linkedin_diagnose.py
"""

import json, sys, time
from pathlib import Path
from datetime import datetime

SESSION_DIR  = Path("linkedin_session")
COOKIES_FILE = SESSION_DIR / "cookies.json"
DEBUG_DIR    = Path("Logs/linkedin_debug")
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "-q"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium", "--quiet"])
    from playwright.sync_api import sync_playwright

STEALTH_JS = """
() => {
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    Object.defineProperty(navigator, 'plugins',   {get: () => [1,2,3,4,5]});
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
    window.chrome = {runtime: {}};
}
"""

def shot(page, label):
    p = str(DEBUG_DIR / f"{datetime.now().strftime('%H%M%S')}_{label}.png")
    try: page.screenshot(path=p)
    except: pass
    print(f"  📸 screenshot → {p}")
    return p

PASS, FAIL, WARN = "✅", "❌", "⚠️ "

def run_diagnostic():
    results = {}
    print()
    print("=" * 60)
    print("  LinkedIn Playwright Diagnostic")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # ── 1. Session files ────────────────────────────────────────────
    print("\n[1] Session files")
    if not SESSION_DIR.exists():
        print(f"  {FAIL} linkedin_session/ directory does not exist")
        results["session_dir"] = False
        return results
    files = list(SESSION_DIR.iterdir())
    for f in files:
        print(f"  • {f.name}  ({f.stat().st_size:,} bytes)")
    if not COOKIES_FILE.exists():
        print(f"  {FAIL} cookies.json missing — run: python3 SKILL_LInkedin_Playwright_MCP.py save")
        results["cookies"] = False
        return results
    try:
        cookies = json.loads(COOKIES_FILE.read_text())
        print(f"  {PASS} cookies.json  →  {len(cookies)} cookies loaded")
        results["cookies"] = True
    except Exception as e:
        print(f"  {FAIL} cannot parse cookies.json: {e}")
        results["cookies"] = False
        return results

    # Key LinkedIn auth cookies
    cookie_names = {c["name"] for c in cookies}
    for required in ("li_at", "JSESSIONID"):
        if required in cookie_names:
            print(f"  {PASS} auth cookie present: {required}")
        else:
            print(f"  {WARN} auth cookie MISSING: {required}  (session may be expired)")

    # ── 2. Browser launch ───────────────────────────────────────────
    print("\n[2] Browser launch")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
                locale="en-US",
            )
            context.add_init_script(STEALTH_JS)
            context.add_cookies(cookies)
            page = context.new_page()
            print(f"  {PASS} Chromium launched (headless)")

            # ── 3. Navigate ─────────────────────────────────────────
            print("\n[3] Navigate to feed")
            try:
                page.goto("https://www.linkedin.com/feed/", timeout=60_000, wait_until="commit")
                print(f"  {PASS} Navigation request sent")
            except Exception as e:
                print(f"  {WARN} Navigation warning: {str(e)[:80]}")

            # Wait for nav bar
            nav_found = False
            try:
                page.wait_for_selector("nav, .global-nav, [data-test-global-nav]", timeout=25_000)
                nav_found = True
            except Exception:
                pass

            page.wait_for_timeout(3000)
            url = page.url
            title = page.title()
            print(f"  URL:   {url}")
            print(f"  Title: {title}")
            shot(page, "feed_state")

            # ── 4. Login check ──────────────────────────────────────
            print("\n[4] Login status")
            if "feed" in url and "login" not in url:
                print(f"  {PASS} LOGGED IN")
                results["logged_in"] = True
            elif "login" in url or "checkpoint" in url or "uas/" in url:
                print(f"  {FAIL} SESSION EXPIRED — need to re-login")
                print(f"       Run: python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save")
                results["logged_in"] = False
                browser.close()
                return results
            else:
                print(f"  {WARN} Unexpected URL — may still work")
                results["logged_in"] = "unknown"

            # ── 5. Start-a-post button ──────────────────────────────
            print("\n[5] 'Start a post' button")
            START_SELECTORS = [
                "button[aria-label*='Create a post']",
                "button[aria-label*='start a post']",
                "button[aria-label*='Start a post']",
                "[data-control-name='share.post']",
                "div.share-box-feed-entry__trigger",
                "button:has-text('Start a post')",
                "div[role='button']:has-text('Start a post')",
                "div.feed-shared-create-post__trigger",
            ]
            start_btn = None
            for sel in START_SELECTORS:
                try:
                    loc = page.locator(sel).first
                    loc.wait_for(state="visible", timeout=4000)
                    start_btn = loc
                    print(f"  {PASS} Found with: {sel}")
                    break
                except Exception:
                    print(f"  ✗ Not found: {sel}")

            if start_btn is None:
                print(f"  {FAIL} 'Start a post' button not found with any selector")
                print(f"       LinkedIn may have changed their UI, or session is invalid")
                shot(page, "no_start_btn")
                results["start_btn"] = False
                browser.close()
                return results

            results["start_btn"] = True
            start_btn.click()
            page.wait_for_timeout(2000)
            shot(page, "editor_modal")

            # ── 6. Editor field ─────────────────────────────────────
            print("\n[6] Post editor (contenteditable)")
            EDITOR_SELECTORS = [
                "div.ql-editor[contenteditable='true']",
                "div.editor-content div[contenteditable='true']",
                "div[contenteditable='true'][role='textbox']",
                "div[contenteditable='true'][data-placeholder]",
                "[contenteditable='true']",
            ]
            editor = None
            for sel in EDITOR_SELECTORS:
                try:
                    loc = page.locator(sel).first
                    loc.wait_for(state="visible", timeout=4000)
                    editor = loc
                    print(f"  {PASS} Found with: {sel}")
                    break
                except Exception:
                    print(f"  ✗ Not found: {sel}")

            if editor is None:
                print(f"  {FAIL} Editor not found — cannot type content")
                shot(page, "no_editor")
                results["editor"] = False
                browser.close()
                return results

            results["editor"] = True

            # ── 7. Type test content ────────────────────────────────
            print("\n[7] Type test content (keyboard.type)")
            TEST_TEXT = "Diagnostic test — please ignore this draft"
            editor.click()
            page.wait_for_timeout(400)
            page.keyboard.type(TEST_TEXT, delay=20)
            page.wait_for_timeout(800)
            shot(page, "content_typed")
            print(f"  {PASS} Typed {len(TEST_TEXT)} chars")

            # ── 8. Post button state ────────────────────────────────
            print("\n[8] Post button")
            POST_BTN_SELECTORS = [
                "button[aria-label='Post']",
                "button[aria-label='Post now']",
                "button[data-control-name='share.post']",
                "button.share-actions__primary-action",
                "button:has-text('Post'):not(:has-text('Schedule'))",
            ]
            post_btn = None
            for sel in POST_BTN_SELECTORS:
                try:
                    loc = page.locator(sel).first
                    loc.wait_for(state="visible", timeout=4000)
                    post_btn = loc
                    print(f"  {PASS} Found with: {sel}")
                    break
                except Exception:
                    print(f"  ✗ Not found: {sel}")

            if post_btn is None:
                print(f"  {FAIL} Post button not found")
                shot(page, "no_post_btn")
                results["post_btn"] = False
            else:
                enabled = post_btn.is_enabled()
                aria_disabled = post_btn.get_attribute("aria-disabled")
                print(f"  is_enabled()      = {enabled}")
                print(f"  aria-disabled     = {aria_disabled!r}")
                if enabled:
                    print(f"  {PASS} Post button is ENABLED — ready to submit")
                    results["post_btn"] = True
                else:
                    print(f"  {FAIL} Post button is DISABLED — keyboard.type() didn't register")
                    results["post_btn"] = False

            shot(page, "final_state")

            # ── CLOSE WITHOUT POSTING ───────────────────────────────
            # Press Escape to dismiss the modal (don't actually post)
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
            browser.close()

    except Exception as e:
        print(f"\n{FAIL} Unexpected error: {e}")
        import traceback; traceback.print_exc()
        results["error"] = str(e)

    # ── Summary ─────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  DIAGNOSTIC SUMMARY")
    print("=" * 60)
    all_pass = all(v is True for v in results.values() if isinstance(v, bool))
    for k, v in results.items():
        icon = PASS if v is True else (FAIL if v is False else WARN)
        print(f"  {icon} {k}: {v}")

    print()
    if all_pass:
        print(f"  {PASS} ALL CHECKS PASSED — LinkedIn posting should work")
    else:
        failed = [k for k, v in results.items() if v is False]
        print(f"  {FAIL} Failed checks: {', '.join(failed)}")
        print()
        if not results.get("logged_in"):
            print("  ACTION: re-run session setup:")
            print("    python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save")
        elif not results.get("start_btn"):
            print("  ACTION: LinkedIn changed their UI — update START_POST_SELECTORS")
            print(f"  Open debug screenshots in {DEBUG_DIR} to find the new element")
        elif not results.get("post_btn"):
            print("  ACTION: Post button stays disabled — keyboard.type() not registering")
            print("  This is BUG-1/BUG-2 in the old code; fixed in v3 of the skill")

    print(f"\n  Debug screenshots: {DEBUG_DIR}/")
    return results


if __name__ == "__main__":
    run_diagnostic()
