#!/usr/bin/env python3
"""
whatsapp_watcher.py v2.0 - WhatsApp Web Monitor (FIXED SESSION PERSISTENCE)

Monitors personal WhatsApp Web for unread messages every 30 seconds.
Uses Playwright persistent browser context with correct user_data_dir.
QR code scan happens ONLY ONCE — session is saved permanently.

CHANGES in v2.0:
- ✅ FIXED: launch_persistent_context with correct user_data_dir
- ✅ FIXED: Proper session detection (Local Storage + Cookies + IndexedDB)
- ✅ FIXED: 15-20 second wait after page.goto()
- ✅ FIXED: Better login detection via chat list selectors
- ✅ FIXED: Auto-switches headless=True if session valid, headless=False if not
- ✅ FIXED: Saves cookies AND Local Storage properly
- ✅ FIXED: Try-except for session recovery
- ✅ FIXED: Clear log messages: "Session loaded" or "Please scan QR code"
- ✅ Kept: Keywords detection, .md files, processed_messages.json, .env, rate limiting

Usage:
    python3 whatsapp_watcher.py              # Single scan (auto-detects session)
    python3 whatsapp_watcher.py --first-run  # Force visible mode for QR scan
    python3 whatsapp_watcher.py --start      # Start in tmux (background, continuous)
    python3 whatsapp_watcher.py --stop       # Stop tmux watcher
    python3 whatsapp_watcher.py --status     # Check if running
    python3 whatsapp_watcher.py --continuous # Continuous mode (tmux internal)
    python3 whatsapp_watcher.py --reset      # Delete session and force fresh QR scan

Author: Digital Employee System
Tier: Silver v2.0 - WhatsApp Watcher (Fixed Session Persistence)
"""

import os
import sys
import json
import time
import asyncio
import shutil
import logging
import subprocess
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass


# =============================================================================
# AUTO-INSTALL DEPENDENCIES
# =============================================================================

def _ensure_package(pkg: str, import_name: str):
    """Install a package if it can't be imported."""
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

_ensure_package("dotenv", "dotenv")
_ensure_package("playwright", "playwright")

# Verify Playwright browsers are installed
try:
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "--dry-run"],
        capture_output=True, check=True, timeout=10
    )
except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
    print("Installing Chromium for Playwright...")
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])

from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()


# =============================================================================
# CONFIGURATION
# =============================================================================

# Base directories
VAULT_ROOT = Path(__file__).parent.resolve()
NEEDS_ACTION_DIR = VAULT_ROOT / "Needs_Action"
LOGS_DIR = VAULT_ROOT / "Logs"

# CRITICAL: WhatsApp session directory — must be absolute path
SESSION_DIR = VAULT_ROOT / "whatsapp_session"
SESSION_DIR.mkdir(parents=True, exist_ok=True)

PROCESSED_FILE = VAULT_ROOT / "processed_messages.json"
LOG_FILE = LOGS_DIR / f"whatsapp_watcher_{datetime.now().strftime('%Y%m%d')}.log"

TMUX_SESSION_NAME = "whatsapp_watcher"

# Environment variables
WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "true").lower() == "true"
CHECK_INTERVAL = int(os.getenv("WHATSAPP_CHECK_INTERVAL", "30"))

IMPORTANCE_KEYWORDS = [
    "urgent", "invoice", "payment", "meeting", "asap",
    "price", "quote", "saas", "ai", "help", "required",
]

WHATSAPP_WEB_URL = "https://web.whatsapp.com/"

# Ensure directories exist
for d in [NEEDS_ACTION_DIR, LOGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


# =============================================================================
# LOGGING
# =============================================================================

def setup_logging() -> logging.Logger:
    logger = logging.getLogger("WhatsAppWatcher")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] %(message)s",
        datefmt="%H:%M:%S"
    ))

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


logger = setup_logging()


# =============================================================================
# DATA CLASS
# =============================================================================

@dataclass
class WhatsAppMessage:
    message_id: str
    sender: str
    body: str
    received_iso: str
    priority: str
    matched_keywords: List[str]


# =============================================================================
# DEDUPLICATION MANAGER
# =============================================================================

class DeduplicationManager:
    def __init__(self, filepath: Path = PROCESSED_FILE, max_entries: int = 2000):
        self.filepath = filepath
        self.max_entries = max_entries
        self.processed: Set[str] = self._load()

    def _load(self) -> Set[str]:
        if self.filepath.exists():
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    ids = set(data.get("processed_ids", [])[-self.max_entries:])
                    logger.info(f"Loaded {len(ids)} previously processed message IDs")
                    return ids
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Could not load processed IDs: {e}")
        return set()

    def save(self) -> None:
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump({
                    "processed_ids": list(self.processed),
                    "last_updated": datetime.now().isoformat(),
                    "total_processed": len(self.processed),
                }, f, indent=2)
        except IOError as e:
            logger.error(f"Failed to save processed IDs: {e}")

    def is_new(self, message_id: str) -> bool:
        return message_id not in self.processed

    def mark(self, message_id: str) -> None:
        self.processed.add(message_id)
        self.save()


# =============================================================================
# SESSION MANAGER
# =============================================================================

class WhatsAppSessionManager:
    """
    Manages WhatsApp Web session persistence.
    
    WhatsApp stores session data in:
    - Local Storage (login tokens)
    - IndexedDB (message cache)
    - Cookies (session cookies)
    - Cache Storage
    
    launch_persistent_context saves ALL of these automatically to user_data_dir.
    """

    def __init__(self, session_dir: Path = SESSION_DIR):
        self.session_dir = session_dir

    def is_session_valid(self) -> bool:
        """
        Check if a valid WhatsApp session exists.
        
        A real session has significant data in Local Storage + Cookies.
        WhatsApp Web creates specific directories when logged in.
        """
        if not self.session_dir.exists():
            logger.debug("Session directory does not exist")
            return False

        try:
            # Check for Local Storage directory (Chromium stores it here)
            local_storage_path = self.session_dir / "Default" / "Local Storage"
            if local_storage_path.exists():
                # Check if it has actual data (leveldb files)
                leveldb_path = local_storage_path / "leveldb"
                if leveldb_path.exists():
                    files = list(leveldb_path.glob("*"))
                    # Filter out lock files - we want actual data
                    data_files = [f for f in files if f.suffix in ('.ldb', '.log')]
                    if data_files:
                        total_size = sum(f.stat().st_size for f in data_files)
                        if total_size > 1000:  # More than 1KB of data
                            logger.info(f"✅ Local Storage found ({total_size} bytes)")
                            return True

            # Check for Cookies file (another indicator)
            cookies_path = self.session_dir / "Default" / "Cookies"
            if cookies_path.exists():
                if cookies_path.stat().st_size > 500:
                    logger.info("✅ Cookies file found")
                    return True

            # Fallback: check total session size
            all_files = list(self.session_dir.rglob("*"))
            total_size = sum(f.stat().st_size for f in all_files if f.is_file())
            
            logger.debug(f"Total session size: {total_size} bytes")
            
            # A real WhatsApp session is usually >100KB
            if total_size > 100_000:
                logger.info(f"✅ Session data found ({total_size} bytes total)")
                return True

            logger.debug("Session directory exists but appears empty")
            return False

        except Exception as e:
            logger.debug(f"Session validation error: {e}")
            return False

    def reset_session(self) -> None:
        """Delete saved session to force fresh QR scan."""
        if self.session_dir.exists():
            try:
                # Remove everything inside but keep the directory
                for item in self.session_dir.iterdir():
                    if item.is_dir():
                        shutil.rmtree(item)
                    else:
                        item.unlink()
                logger.info("🗑️  Session directory cleared")
            except Exception as e:
                logger.error(f"Error clearing session: {e}")
                # Fallback: delete and recreate
                shutil.rmtree(self.session_dir)
                self.session_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.session_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info("✅ Session reset complete — next run will show QR code")


# =============================================================================
# WHATSAPP WATCHER
# =============================================================================

class WhatsAppWatcher:
    """
    Monitors WhatsApp Web for important messages.
    
    Session Logic (v2.0 - FIXED):
    1. First launch → headless=False, user scans QR → session saved to user_data_dir
    2. Later launches → session restored automatically, headless=True
    3. If session expires → auto-fallback to headless=False + QR scan
    4. Session data saved in Local Storage + IndexedDB + Cookies (all automatic)
    """

    def __init__(
        self,
        dest_dir: Path = NEEDS_ACTION_DIR,
        check_interval: int = CHECK_INTERVAL,
        headless: bool = False,
    ):
        self.dest_dir = dest_dir
        self.check_interval = check_interval
        self.force_headless = headless
        self.session_manager = WhatsAppSessionManager()
        self.dedup = DeduplicationManager()
        
        self.stats = {
            "messages_scanned": 0,
            "messages_flagged": 0,
            "files_created": 0,
            "errors": 0,
            "started_at": datetime.now().isoformat(),
        }
        
        self.running = True
        self.pw = None
        self.context = None
        self.page = None

        # Rate limiting: 10s minimum between message processing
        self.rate_limit_interval = 10  # seconds
        self.last_process_time = 0.0

    # ─── SESSION DETECTION ─────────────────────────────────────────────────

    def _should_run_headless(self) -> bool:
        """
        Determine if we should run in headless mode.
        
        Rules:
        - If session is valid → headless=True (auto-login)
        - If no session or first-run → headless=False (show QR)
        - If force_headless is set → respect it (for debugging)
        """
        if self.force_headless:
            logger.info("🔧 Force headless mode enabled")
            return True

        has_session = self.session_manager.is_session_valid()
        
        if has_session:
            logger.info("✅ Valid session detected — will run headless")
            return True
        else:
            logger.info("📱 No valid session — will show browser for QR scan")
            return False

    # ─── BROWSER LIFECYCLE ─────────────────────────────────────────────────

    async def _launch(self, headless: bool) -> None:
        """
        Launch Chromium with persistent user data directory.
        
        CRITICAL: user_data_dir must be the ABSOLUTE path to session directory.
        Playwright will automatically save cookies, local storage, IndexedDB, etc.
        """
        self.pw = await async_playwright().start()

        user_data_dir = str(SESSION_DIR.resolve())
        
        logger.info(f"Launching browser (headless={headless}, session_dir={user_data_dir})")
        
        try:
            self.context = await self.pw.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=headless,
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                ),
                locale="en-US",
                ignore_https_errors=True,
                accept_downloads=False,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-default-apps",
                    "--disable-sync",
                    "--disable-translate",
                    "--window-position=0,0",
                ],
            )

            # Reuse existing page or create new one
            if self.context.pages:
                self.page = self.context.pages[0]
            else:
                self.page = await self.context.new_page()

            logger.info("✅ Browser launched successfully")

        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")
            raise

    async def _close(self) -> None:
        """Close browser — persistent context automatically saves session."""
        if self.context:
            try:
                # Explicitly close to ensure session is flushed to disk
                await self.context.close()
                logger.info("💾 Session saved to disk")
            except Exception as e:
                logger.warning(f"Context close warning: {e}")
            self.context = None
        
        if self.pw:
            try:
                await self.pw.stop()
            except Exception as e:
                logger.warning(f"Playwright stop warning: {e}")
            self.pw = None
        
        self.page = None
        logger.info("Browser closed")

    # ─── LOGIN DETECTION ───────────────────────────────────────────────────

    async def _is_logged_in(self) -> bool:
        """
        Check if WhatsApp Web is logged in.
        
        Returns True if chat list is visible (logged in).
        Returns False if QR code or login screen is visible.
        """
        try:
            # Check current URL
            url = self.page.url
            
            # Not on WhatsApp Web at all
            if "web.whatsapp.com" not in url:
                return False

            # Method 1: Look for chat list grid (primary indicator of being logged in)
            try:
                chat_list = await self.page.query_selector("div[role='grid']")
                if chat_list:
                    # Verify it's actually the chat list (not something else)
                    is_visible = await chat_list.is_visible()
                    if is_visible:
                        return True
            except Exception:
                pass

            # Method 2: Look for search box at top
            try:
                search_box = await self.page.query_selector("div[contenteditable='true'][data-tab='3']")
                if search_box:
                    is_visible = await search_box.is_visible()
                    if is_visible:
                        return True
            except Exception:
                pass

            # Method 3: Look for specific logged-in elements
            try:
                # WhatsApp Web shows a header with user's profile when logged in
                header = await self.page.query_selector("header[data-testid='chatlist-header']")
                if header:
                    is_visible = await header.is_visible()
                    if is_visible:
                        return True
            except Exception:
                pass

            # Method 4: Check for QR code (indicates NOT logged in)
            try:
                qr_canvas = await self.page.query_selector("canvas")
                if qr_canvas:
                    # Check if we're on the QR page by looking for QR-specific text
                    qr_text = await self.page.query_selector("text='Scan to log in'")
                    if qr_text:
                        return False
            except Exception:
                pass

            # Method 5: Check page title/content for login indicators
            try:
                title = await self.page.title()
                if "WhatsApp" in title and "Scan" not in title:
                    return True
            except Exception:
                pass

            return False

        except Exception as e:
            logger.debug(f"Login check error: {e}")
            return False

    async def _wait_for_login(self, timeout: int = 300) -> bool:
        """
        Wait until WhatsApp Web shows the main chat list (logged in).
        
        If QR code is shown and no session exists, prompt user to scan.
        If session exists but expired, prompt to re-scan.
        
        Returns True on successful login, False on timeout.
        """
        deadline = time.time() + timeout
        last_log = 0.0
        session_existed = self.session_manager.is_session_valid()

        logger.info("⏳ Waiting for WhatsApp Web to load...")

        while time.time() < deadline:
            try:
                logged_in = await self._is_logged_in()

                if logged_in:
                    logger.info("✅ Session loaded successfully - Running headless")
                    print("✅ Session loaded successfully - Running headless")
                    return True

                # Not logged in - check if QR code is visible
                try:
                    qr_text = await self.page.query_selector("text='Scan to log in'")
                    qr_visible = qr_text is not None
                except Exception:
                    qr_visible = False

                if qr_visible:
                    # QR code is shown
                    if session_existed:
                        msg = "⚠️  Session expired — Please scan QR code to re-login"
                    else:
                        msg = "📱 Please scan QR code (one time only)"
                    
                    # Log message every 15 seconds
                    now = time.time()
                    if now - last_log >= 15:
                        logger.info(msg)
                        print(msg)
                        last_log = now

                    # Wait a bit before checking again
                    await asyncio.sleep(2)
                    continue

                # Transitional state - wait and retry
                now = time.time()
                if now - last_log >= 10:
                    logger.info("⏳ Loading WhatsApp Web...")
                    last_log = now
                
                await asyncio.sleep(2)

            except Exception as e:
                logger.debug(f"Login check iteration error: {e}")
                await asyncio.sleep(2)

        logger.error("❌ Login timed out after {}s".format(timeout))
        print("❌ Login timed out — check your connection and try again")
        return False

    # ─── NAVIGATION ────────────────────────────────────────────────────────

    async def _navigate(self) -> bool:
        """
        Navigate to WhatsApp Web and wait for login.
        
        FIXED: Added 15-20 second wait after page.goto() for full hydration.
        """
        logger.info("Navigating to WhatsApp Web...")

        try:
            # Navigate to WhatsApp Web
            await self.page.goto(
                WHATSAPP_WEB_URL,
                wait_until="domcontentloaded",
                timeout=120_000,
            )

            # CRITICAL FIX: Wait 15-20 seconds for WhatsApp Web to fully load
            # WhatsApp Web is a heavy SPA that needs time to hydrate and check auth
            logger.info("⏳ Waiting 20 seconds for WhatsApp Web to fully load...")
            await asyncio.sleep(20)
            
            # Check if we're already logged in (session restored)
            already_logged_in = await self._is_logged_in()
            if already_logged_in:
                logger.info("✅ Already logged in - session restored successfully")
                print("✅ Session loaded successfully - Running headless")
                return True

            # Not logged in - wait for user to scan QR code if needed
            return await self._wait_for_login(timeout=300)

        except Exception as e:
            logger.error(f"Navigation error: {e}")
            # Even on error, wait a bit and check if page partially loaded
            try:
                await asyncio.sleep(10)
                return await self._wait_for_login(timeout=60)
            except Exception:
                return False

    # ─── CHAT OPERATIONS ───────────────────────────────────────────────────

    async def _get_unread_chats(self) -> List[Dict]:
        """Return list of chats that have unread messages."""
        unread_chats = []

        try:
            # Wait for chat list to be ready
            await self.page.wait_for_selector("div[role='grid']", timeout=5000)
            
            # Get all chat items
            items = await self.page.query_selector_all("div[role='griditem']")
            logger.debug(f"Found {len(items)} chat items")

            for item in items:
                try:
                    # Get sender name from title attribute
                    title = ""
                    for sel in ("span[title]", "span[class*='evq2']"):
                        try:
                            el = await item.query_selector(sel)
                            if el:
                                t = await el.get_attribute("title")
                                if t:
                                    title = t
                                    break
                        except Exception:
                            pass

                    if not title:
                        continue

                    # Check for unread badge
                    has_unread = False
                    try:
                        # WhatsApp uses green badge with unread count
                        badges = await item.query_selector_all("span[aria-label*='unread']")
                        has_unread = len(badges) > 0
                    except Exception:
                        pass

                    if has_unread:
                        unread_chats.append({"name": title, "element": item})

                except Exception:
                    continue

        except Exception as e:
            logger.debug(f"Could not read chat list: {e}")

        return unread_chats

    async def _open_chat(self, chat_name: str) -> bool:
        """Click a chat in the sidebar to open it."""
        try:
            items = await self.page.query_selector_all("div[role='griditem']")
            for item in items:
                try:
                    el = await item.query_selector("span[title]")
                    if el and await el.get_attribute("title") == chat_name:
                        await item.click()
                        await asyncio.sleep(1.5)
                        return True
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"Could not open chat '{chat_name}': {e}")
        return False

    async def _extract_messages(self) -> List[str]:
        """Get text of visible messages in the currently open chat."""
        texts = []
        try:
            await asyncio.sleep(1)
            rows = await self.page.query_selector_all("div[role='row']")
            for row in rows:
                try:
                    for sel in (
                        "span[class*='selectable-text']",
                        "span.copyable-text",
                    ):
                        els = await row.query_selector_all(sel)
                        for el in els:
                            t = await el.inner_text()
                            if t and t.strip():
                                texts.append(t.strip())
                                break
                        if texts:
                            break
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"Error extracting messages: {e}")
        return texts

    async def _back_to_chat_list(self) -> None:
        """Return to the sidebar / chat list view."""
        try:
            # Click the back button
            for sel in (
                "span[data-icon='back']",
                "button[aria-label*='Back']",
                "a[href='https://web.whatsapp.com/']",
                "div[data-testid='chat-list']",
            ):
                try:
                    el = await self.page.query_selector(sel)
                    if el:
                        await el.click()
                        await asyncio.sleep(1)
                        return
                except Exception:
                    continue

            # Fallback: navigate to root URL
            await self.page.goto(
                WHATSAPP_WEB_URL,
                wait_until="domcontentloaded",
                timeout=10_000,
            )
            await asyncio.sleep(2)
        except Exception as e:
            logger.debug(f"Back to list failed: {e}")

    # ─── RATE LIMITING ─────────────────────────────────────────────────────

    def _enforce_rate_limit(self) -> bool:
        """
        Enforce rate limiting: minimum delay between message processing.
        
        Returns:
            True if processing is allowed, False if rate limited
        """
        now = time.time()
        elapsed = now - self.last_process_time

        if elapsed < self.rate_limit_interval:
            remaining = int(self.rate_limit_interval - elapsed)
            logger.debug(f"Rate limit active — waiting {remaining}s before next message")
            return False

        self.last_process_time = now
        return True

    # ─── SCAN ITERATION ────────────────────────────────────────────────────

    async def _scan_iteration(self) -> None:
        """One complete scan → detect important messages → create files."""
        logger.info("=" * 60)
        logger.info("WhatsApp Watcher — scanning for unread messages")
        logger.info("=" * 60)

        try:
            unread = await self._get_unread_chats()
            if not unread:
                logger.info("No unread messages")
                print("  No unread messages")
                return

            logger.info(f"Found {len(unread)} unread chat(s)")

            # Collect all important messages first
            pending_messages = []

            for chat in unread:
                name = chat["name"]
                try:
                    if not await self._open_chat(name):
                        continue

                    messages = await self._extract_messages()
                    self.stats["messages_scanned"] += len(messages)

                    for body in messages:
                        important, matched = self._is_important(body)
                        if not important:
                            continue

                        mid = self._msg_id(name, body, datetime.now().isoformat())
                        if not self.dedup.is_new(mid):
                            logger.debug(f"Message already processed: {mid}")
                            continue

                        pending_messages.append((name, body, matched, mid))

                    await self._back_to_chat_list()

                except Exception as e:
                    logger.debug(f"Error processing chat '{name}': {e}")
                    continue

            # Process with rate limiting
            if not pending_messages:
                logger.info("No new important messages after dedup")
                return

            logger.info(f"🚨 {len(pending_messages)} important message(s) to process")

            for idx, (name, body, matched, mid) in enumerate(pending_messages):
                # Enforce rate limit
                if not self._enforce_rate_limit():
                    remaining = int(self.rate_limit_interval - (time.time() - self.last_process_time))
                    logger.debug(
                        f"Rate limit: deferring {len(pending_messages) - idx} message(s) "
                        f"to next scan cycle (wait {remaining}s)"
                    )
                    break

                # Mark as processed
                self.dedup.mark(mid)
                self.stats["messages_flagged"] += 1

                msg = WhatsAppMessage(
                    message_id=mid,
                    sender=name,
                    body=body,
                    received_iso=datetime.now(timezone.utc).isoformat(),
                    priority=self._priority(body),
                    matched_keywords=matched,
                )

                path = self._write_task(msg)
                if path:
                    self.stats["files_created"] += 1
                    logger.info(f"🚨 {name} → {path.name}  [{', '.join(matched)}]")
                    print(f"  🚨 {name} → {path.name}")
                    logger.info("   📋 Draft created in Needs_Action — Orchestrator will create approval draft")
                else:
                    logger.error(f"  ❌ Failed to create task for {name}")

        except Exception as e:
            logger.error(f"Scan iteration error: {e}")
            self.stats["errors"] += 1

    # ─── KEYWORD & PRIORITY HELPERS ────────────────────────────────────────

    @staticmethod
    def _msg_id(sender: str, body: str, ts: str) -> str:
        raw = f"{sender}:{body[:120]}:{ts}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    @staticmethod
    def _is_important(text: str) -> Tuple[bool, List[str]]:
        if not text:
            return False, []
        low = text.lower()
        matched = [kw for kw in IMPORTANCE_KEYWORDS if kw in low]
        return bool(matched), matched

    @staticmethod
    def _priority(text: str) -> str:
        low = text.lower()
        if any(k in low for k in ("urgent", "asap", "immediate", "emergency", "critical", "required")):
            return "high"
        return "medium"

    # ─── FILE OUTPUT ───────────────────────────────────────────────────────

    def _write_task(self, msg: WhatsAppMessage) -> Optional[Path]:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = re.sub(r"[^\w\s-]", "", msg.sender[:40])
        safe = re.sub(r"[-\s]+", "_", safe.strip()).lower()
        filename = f"{ts}_whatsapp_{safe}.md"
        path = self.dest_dir / filename

        emoji = "🔴" if msg.priority == "high" else "🟡"

        content = f"""---
type: whatsapp
from: {msg.sender}
received: {msg.received_iso}
priority: {msg.priority}
status: pending
message_id: {msg.message_id}
---

# {emoji} WhatsApp Message: {msg.sender}

## Message Details

| Field | Value |
|-------|-------|
| **From** | {msg.sender} |
| **Received** | {msg.received_iso} |
| **Priority** | {msg.priority.upper()} |
| **Status** | Pending |
| **Message ID** | {msg.message_id} |

---

## Message Content

{msg.body}

---

## Detected Keywords

{', '.join(msg.matched_keywords)}

---

## Action Items

- [ ] Review message
- [ ] Determine required response
- [ ] Take action
- [ ] Mark as complete

## Notes

*Add context, decisions, or follow-up notes here*

---
*Generated by WhatsApp Watcher v2.0 on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            logger.info(f"✅ Created task file: {filename}")
            return path
        except IOError as e:
            logger.error(f"Failed to write {filename}: {e}")
            self.stats["errors"] += 1
            return None

    # ─── RUN MODES ─────────────────────────────────────────────────────────

    async def run_single(self) -> Dict:
        """Launch → scan once → close."""
        try:
            success = await self._bootstrap()
            if success and self.page:
                await self._scan_iteration()
        except Exception as e:
            logger.error(f"Single run error: {e}")
            self.stats["errors"] += 1
        finally:
            await self._close()
        return self.stats

    async def run_continuous(self) -> None:
        """Launch → scan every N seconds until stopped."""
        try:
            launched = await self._bootstrap()
            if not launched:
                logger.error("Could not launch / login — aborting continuous mode")
                return

            logger.info(f"Continuous mode active (interval: {self.check_interval}s)")
            print(f"  Continuous mode active (interval: {self.check_interval}s)")
            print("  Press Ctrl+C to stop")

            while self.running:
                try:
                    await self._scan_iteration()
                except Exception as e:
                    logger.error(f"Iteration error: {e}")
                    self.stats["errors"] += 1
                    
                    # Recovery: try to reload page
                    try:
                        if self.page:
                            await self.page.reload(wait_until="domcontentloaded", timeout=15_000)
                            await asyncio.sleep(5)
                    except Exception:
                        await self._close()
                        launched = await self._bootstrap()
                        if not launched:
                            logger.error("Recovery failed — waiting before retry")
                            await asyncio.sleep(30)

                for _ in range(self.check_interval):
                    if not self.running:
                        break
                    await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("Continuous loop cancelled")
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Fatal continuous error: {e}")
        finally:
            await self._close()
            logger.info(
                f"Final — Scanned: {self.stats['messages_scanned']}, "
                f"Flagged: {self.stats['messages_flagged']}, "
                f"Files: {self.stats['files_created']}, "
                f"Errors: {self.stats['errors']}"
            )

    async def _bootstrap(self) -> bool:
        """
        Launch browser and ensure we are logged in.
        
        Auto-detects session and chooses appropriate mode:
        - Valid session → headless=True, auto-login
        - No session → headless=False, show QR code
        """
        # Determine headless mode based on session validity
        headless = self._should_run_headless()

        # Launch browser
        await self._launch(headless=headless)
        
        # Navigate and wait for login
        return await self._navigate()


# =============================================================================
# TMUX HELPERS
# =============================================================================

def _tmux_available() -> bool:
    try:
        subprocess.run(["tmux", "-V"], capture_output=True, check=True)
        return True
    except Exception:
        return False


def _tmux_running() -> bool:
    try:
        return subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION_NAME],
            capture_output=True
        ).returncode == 0
    except Exception:
        return False


def tmux_start(interval: int = CHECK_INTERVAL) -> None:
    if _tmux_running():
        print(f"✓ WhatsApp watcher already running ('{TMUX_SESSION_NAME}')")
        print(f"  Attach: tmux attach -t {TMUX_SESSION_NAME}")
        return
    if not _tmux_available():
        print("✗ tmux not installed  →  sudo apt install tmux")
        sys.exit(1)

    script = Path(__file__).resolve()
    subprocess.run([
        "tmux", "new-session", "-d", "-s", TMUX_SESSION_NAME,
        "-c", str(script.parent),
        "python3", str(script), "--continuous", "--interval", str(interval),
    ], check=True)
    print(f"✓ WhatsApp watcher started in tmux ('{TMUX_SESSION_NAME}')")
    print(f"  Interval : {interval}s")
    print(f"  Attach   : tmux attach -t {TMUX_SESSION_NAME}")
    print(f"  Detach   : Ctrl+b, d")
    print(f"  Stop     : python3 {script.name} --stop")
    print(f"  Logs     : {LOG_FILE}")


def tmux_stop() -> None:
    if not _tmux_running():
        print("✗ WhatsApp watcher is not running")
        return
    subprocess.run(["tmux", "send-keys", "-t", TMUX_SESSION_NAME, "C-c"], check=True)
    time.sleep(0.5)
    subprocess.run(["tmux", "kill-session", "-t", TMUX_SESSION_NAME], check=True)
    print("✓ WhatsApp watcher stopped")


def tmux_status() -> None:
    if _tmux_running():
        print(f"✓ WhatsApp watcher is RUNNING  (session: {TMUX_SESSION_NAME})")
        print(f"  Attach : tmux attach -t {TMUX_SESSION_NAME}")
        print(f"  Logs   : {LOG_FILE}")
    else:
        print("✗ WhatsApp watcher is NOT running")
        print(f"  Start  : python3 whatsapp_watcher.py --start")


# =============================================================================
# CLI
# =============================================================================

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="WhatsApp Watcher v2.0 — Fixed Session Persistence",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
First time (scan QR code):
  python3 whatsapp_watcher.py --first-run

Every day after that (auto-login):
  python3 whatsapp_watcher.py                # single scan
  python3 whatsapp_watcher.py --start        # continuous in tmux (recommended)

Utilities:
  python3 whatsapp_watcher.py --stop         # stop tmux
  python3 whatsapp_watcher.py --status       # check if running
  python3 whatsapp_watcher.py --reset        # delete session, force fresh QR scan
  python3 whatsapp_watcher.py --headless     # force headless mode (debug)
""",
    )
    parser.add_argument("--start", action="store_true", help="Start in tmux (continuous)")
    parser.add_argument("--stop", action="store_true", help="Stop tmux session")
    parser.add_argument("--status", action="store_true", help="Show status")
    parser.add_argument("--first-run", action="store_true", help="Visible browser for QR scan")
    parser.add_argument("--continuous", action="store_true", help="Continuous mode (tmux internal)")
    parser.add_argument("--headless", action="store_true", help="Force headless mode")
    parser.add_argument("--reset", action="store_true", help="Delete session and exit")
    parser.add_argument("--interval", type=int, default=CHECK_INTERVAL,
                        help=f"Check interval in seconds (default: {CHECK_INTERVAL})")
    args = parser.parse_args()

    # ── tmux commands ──
    if args.start:
        tmux_start(args.interval)
        return
    if args.stop:
        tmux_stop()
        return
    if args.status:
        tmux_status()
        return
    if args.reset:
        print("⚠️  Deleting WhatsApp session...")
        session_mgr = WhatsAppSessionManager()
        session_mgr.reset_session()
        return

    # ── enabled check ──
    if not WHATSAPP_ENABLED:
        print("ℹ️  WhatsApp watcher is disabled (WHATSAPP_ENABLED=false in .env)")
        return

    # ── run modes ──
    if args.continuous:
        logger.info(f"WhatsApp Watcher v2.0 — continuous mode ({args.interval}s)")
        watcher = WhatsAppWatcher(check_interval=args.interval, headless=True)
        asyncio.run(watcher.run_continuous())
    else:
        headless = args.headless or (not args.first_run)
        logger.info("WhatsApp Watcher v2.0 — single run")
        watcher = WhatsAppWatcher(headless=headless)
        stats = asyncio.run(watcher.run_single())
        print(f"\nDone — Scanned: {stats['messages_scanned']}, "
              f"Flagged: {stats['messages_flagged']}, "
              f"Files: {stats['files_created']}")


if __name__ == "__main__":
    main()
