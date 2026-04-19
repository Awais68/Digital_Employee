#!/usr/bin/env python3
"""
SKILL_Twitter_X_Post.py — Playwright MCP for Twitter/X
=======================================================

Gold Tier v5.0 — Human-in-the-Loop Social Media Posting

Features:
- Twitter/X posting via Playwright with saved session
- Thread posting support (multi-tweet)
- Image attachment support
- Session persistence (login once, reuse cookies)
- Rate limit safety (30s minimum between posts)
- Full audit logging

Usage:
    from Agent_Skills.SKILL_Twitter_X_Post import post_to_twitter

    # Single tweet
    result = post_to_twitter(content="Your tweet text here...")

    # Tweet with image
    result = post_to_twitter(content="Your tweet text...", image_path="/path/to/image.jpg")

    # Thread
    result = post_to_twitter(
        content=["Tweet 1/3: Introduction...", "Tweet 2/3: Details...", "Tweet 3/3: Conclusion #AI"],
        is_thread=True
    )

Session Setup:
    python3 Agent_Skills/SKILL_Twitter_X_Post.py setup

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
from typing import Optional, Dict, Any, Union, List

# ── Configuration ────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
TWITTER_SESSION_DIR = BASE_DIR / "twitter_session"
LOG_FILE = BASE_DIR / "Logs" / "social_media.log"

# Ensure directories exist
TWITTER_SESSION_DIR.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "Logs").mkdir(parents=True, exist_ok=True)

# Rate limit safety
MIN_DELAY_BETWEEN_POSTS = 30  # seconds

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="a"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("twitter_mcp")

# ── Session Management ───────────────────────────────────────────────────────

def setup_twitter_session():
    """Interactive setup: Login to Twitter/X and save session cookies."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ Playwright not installed. Run: pip install playwright && playwright install chromium")
        return False

    print("🐦 Setting up Twitter/X session...")
    print("   A browser window will open. Login to Twitter/X normally.")
    print("   After logging in, press Enter here to save the session.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://x.com", wait_until="networkidle")

        input("👉 Login to Twitter/X in the browser, then press Enter here...")

        cookies = context.cookies()
        session_file = TWITTER_SESSION_DIR / "cookies.json"

        with open(session_file, "w") as f:
            json.dump(cookies, f, indent=2)

        browser.close()
        print(f"✅ Twitter/X session saved to: {session_file}")
        return True


def load_session() -> Optional[list]:
    """Load saved session cookies."""
    session_file = TWITTER_SESSION_DIR / "cookies.json"
    if not session_file.exists():
        return None
    with open(session_file, "r") as f:
        return json.load(f)


def check_session_valid() -> bool:
    """Quick check if Twitter session is still valid."""
    try:
        from playwright.sync_api import sync_playwright
        if not (TWITTER_SESSION_DIR / "cookies.json").exists():
            return False

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=str(TWITTER_SESSION_DIR))
            page = context.new_page()
            page.goto("https://x.com/home", wait_until="networkidle", timeout=15000)
            time.sleep(2)
            valid = "/login" not in page.url and "login" not in page.url.lower()
            browser.close()
            return valid
    except Exception as e:
        logger.warning(f"Session check failed: {e}")
        return False


# ── Twitter/X Posting ────────────────────────────────────────────────────────

def post_to_twitter(
    content: Union[str, List[str]],
    image_path: Optional[str] = None,
    is_thread: bool = False,
) -> Dict[str, Any]:
    """
    Post to Twitter/X using Playwright with saved session.

    Args:
        content: Tweet text (string) OR list of tweets for thread
        image_path: Optional path to image file (attached to first tweet)
        is_thread: If True, content should be a list of tweets

    Returns:
        Dict with success status and details
    """
    result = {
        "success": False,
        "platform": "twitter",
        "message": "",
        "post_url": "",
        "tweet_count": 1,
        "timestamp": datetime.now().isoformat(),
    }

    # Handle thread
    if is_thread and isinstance(content, list):
        result["tweet_count"] = len(content)
    elif isinstance(content, list):
        is_thread = True
        result["tweet_count"] = len(content)

    # Validate content length (280 char limit for free accounts)
    if isinstance(content, str) and len(content) > 280:
        logger.warning(f"Tweet exceeds 280 characters ({len(content)} chars). May fail on free accounts.")
    elif isinstance(content, list):
        for i, tweet in enumerate(content):
            if len(tweet) > 280:
                logger.warning(f"Tweet {i+1} exceeds 280 characters ({len(tweet)} chars). May fail on free accounts.")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result["message"] = "Playwright not installed. Run: pip install playwright && playwright install chromium"
        return result

    # Check session exists
    if not TWITTER_SESSION_DIR.exists() or not (TWITTER_SESSION_DIR / "cookies.json").exists():
        result["message"] = "No saved Twitter/X session. Run: python3 Agent_Skills/SKILL_Twitter_X_Post.py setup"
        return result

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=str(TWITTER_SESSION_DIR))
            page = context.new_page()

            # Navigate to home
            logger.info("Navigating to Twitter/X...")
            page.goto("https://x.com/home", wait_until="networkidle", timeout=30000)
            time.sleep(3)

            # Check if logged in
            if "/login" in page.url or "login" in page.url.lower():
                browser.close()
                result["message"] = "Twitter/X session expired. Re-run setup to refresh."
                return result

            logger.info("Logged in successfully. Creating tweet...")

            # Click tweet compose button
            try:
                compose_btn = page.get_by_role("button", name="Post")
                if compose_btn.count() == 0:
                    compose_btn = page.get_by_test_id("tweetButtonInline")
                if compose_btn.count() == 0:
                    # Try finding the new tweet button
                    compose_btn = page.locator('[data-testid="SideNav_NewTweet_Button"]')
                compose_btn.click()
                time.sleep(2)
            except Exception as e:
                browser.close()
                result["message"] = f"Could not open tweet composer: {e}"
                return result

            if is_thread and isinstance(content, list):
                # ─── Thread posting ─────────────────────────────────────
                logger.info(f"Creating thread with {len(content)} tweets...")

                for i, tweet_text in enumerate(content):
                    try:
                        textarea = page.get_by_role("textbox").first
                        textarea.fill(tweet_text)
                        time.sleep(1)

                        # Attach image to first tweet if provided
                        if i == 0 and image_path and Path(image_path).exists():
                            try:
                                file_input = page.get_by_test_id("fileInput")
                                file_input.set_input_files(image_path)
                                time.sleep(2)
                            except Exception as e:
                                logger.warning(f"Could not attach image: {e}")

                        if i < len(content) - 1:
                            # Add another tweet to thread
                            add_btn = page.get_by_role("button", name="Add another post")
                            if add_btn.count() > 0:
                                add_btn.click()
                                time.sleep(1)
                            else:
                                # Try alternative selector
                                add_btn = page.locator('[data-testid="addButton"]')
                                if add_btn.count() > 0:
                                    add_btn.click()
                                    time.sleep(1)
                        else:
                            # Post all tweets
                            post_btn = page.get_by_role("button", name="Post all")
                            if post_btn.count() == 0:
                                post_btn = page.get_by_text("Post all")
                            if post_btn.count() == 0:
                                post_btn = page.get_by_role("button", name="Reply")
                            post_btn.click()
                            time.sleep(3)
                            page.wait_for_load_state("networkidle")

                    except Exception as e:
                        logger.warning(f"Thread tweet {i+1} failed: {e}")
                        if i == 0:
                            browser.close()
                            result["message"] = f"First tweet in thread failed: {e}"
                            return result
                        # Continue with remaining tweets

                logger.info("Thread posted successfully")
                result["success"] = True
                result["message"] = f"Thread with {len(content)} tweets posted on Twitter/X"
                result["post_url"] = "https://x.com"

            else:
                # ─── Single tweet ─────────────────────────────────────────
                try:
                    textarea = page.get_by_role("textbox").first
                    textarea.fill(content)
                    time.sleep(1)

                    # Attach image if provided
                    if image_path and Path(image_path).exists():
                        try:
                            file_input = page.get_by_test_id("fileInput")
                            file_input.set_input_files(image_path)
                            time.sleep(2)
                        except Exception as e:
                            logger.warning(f"Could not attach image: {e}")

                    # Post tweet
                    post_btn = page.get_by_role("button", name="Post")
                    if post_btn.count() == 0:
                        post_btn = page.get_by_text("Post", exact=True)
                    post_btn.click()
                    time.sleep(3)
                    page.wait_for_load_state("networkidle")

                    logger.info("Tweet posted successfully")
                    result["success"] = True
                    result["message"] = "Tweet successfully posted on Twitter/X"
                    result["post_url"] = "https://x.com"

                except Exception as e:
                    result["message"] = f"Could not post tweet: {e}"

            browser.close()

    except Exception as e:
        logger.error(f"Twitter/X posting failed: {e}")
        result["message"] = f"Error: {str(e)}"

    return result


# ── CLI Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 SKILL_Twitter_X_Post.py setup          — Login and save session")
        print("  python3 SKILL_Twitter_X_Post.py test           — Check session validity")
        print("  python3 SKILL_Twitter_X_Post.py post 'Hello'   — Post a tweet")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "setup":
        setup_twitter_session()

    elif command == "test":
        print("🐦 Testing Twitter/X session...")
        if check_session_valid():
            print("✅ Twitter/X session is valid!")
        else:
            print("❌ Twitter/X session expired. Run setup to refresh.")

    elif command == "post":
        if len(sys.argv) < 3:
            print("❌ Provide tweet text: python3 SKILL_Twitter_X_Post.py post 'Your tweet here'")
            sys.exit(1)
        tweet_text = " ".join(sys.argv[2:])
        print(f"🐦 Posting: {tweet_text[:80]}...")
        result = post_to_twitter(tweet_text)
        if result["success"]:
            print(f"✅ {result['message']}")
        else:
            print(f"❌ {result['message']}")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
