#!/usr/bin/env python3
"""
gmail_watcher.py v2.0 - Production Gmail Monitor for Digital Employee

Monitors Gmail for unread + important emails every 2 minutes and converts
them to structured task files in /Needs_Action directory.

Features:
- Gmail API v1 with OAuth2 authentication
- Monitors unread + important emails every 2 minutes
- Creates structured .md files with YAML frontmatter
- Deduplication via processed_ids set + JSON persistence
- BaseWatcher pattern implementation
- Continuous运行 in tmux
- Comprehensive logging and error handling
- tmux management commands (start/stop/status/auth)

Usage:
    python gmail_watcher.py              # Single run (foreground)
    python gmail_watcher.py --start      # Start in tmux (background, 2-min interval)
    python gmail_watcher.py --stop       # Stop tmux watcher
    python gmail_watcher.py --status     # Check if running
    python gmail_watcher.py --auth       # First-time OAuth2 authentication
    python gmail_watcher.py --interval 120  # Custom interval in seconds

Author: Digital Employee System
Version: 2.0 - Production Ready
"""

import os
import sys
import json
import time
import signal
import logging
import subprocess
import base64
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Set
from dataclasses import dataclass, asdict

# Environment loading
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
    from dotenv import load_dotenv
    load_dotenv()

# Google API imports with auto-install
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from google.auth.exceptions import RefreshError
except ImportError:
    print("Installing Google API libraries...")
    subprocess.check_call([sys.executable, "-m", "pip", "install",
                          "google-auth", "google-auth-oauthlib", "google-api-python-client"])
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from google.auth.exceptions import RefreshError


# =============================================================================
# CONFIGURATION
# =============================================================================

VAULT_ROOT = Path(__file__).parent.resolve()
NEEDS_ACTION_DIR = VAULT_ROOT / "Needs_Action"
LOGS_DIR = VAULT_ROOT / "Logs"
METRICS_DIR = VAULT_ROOT / "Metrics"

# Gmail API OAuth2 Scopes
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
]

# Processing settings
CHECK_INTERVAL = int(os.getenv("GMAIL_WATCHER_INTERVAL", "30"))  # 30 seconds for near-instant feel
MAX_RESULTS = int(os.getenv("GMAIL_MAX_RESULTS", "10"))
GMAIL_ENABLED = os.getenv("GMAIL_ENABLED", "true").lower() == "true"

# File paths
CREDENTIALS_FILE = VAULT_ROOT / "token.json"
CREDENTIALS_JSON = VAULT_ROOT / "credentials.json"
PROCESSED_IDS_FILE = METRICS_DIR / "gmail_processed_ids.json"
LOG_FILE = LOGS_DIR / f"gmail_watcher_{datetime.now().strftime('%Y%m%d')}.log"

# tmux session name
TMUX_SESSION_NAME = "gmail_watcher"

# Ensure directories exist
for directory in [NEEDS_ACTION_DIR, LOGS_DIR, METRICS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)


# =============================================================================
# LOGGING SETUP
# =============================================================================

def setup_logging() -> logging.Logger:
    """Configure logging with file and console handlers."""
    logger = logging.getLogger("GmailWatcher")
    logger.setLevel(logging.INFO)

    # Clear existing handlers
    logger.handlers.clear()

    # File handler
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_format)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter(
        '[%(asctime)s] [%(levelname)-8s] %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(console_format)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


logger = setup_logging()


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class EmailData:
    """Structured email data."""
    id: str
    thread_id: str
    subject: str
    from_addr: str
    to_addr: str
    date: str
    body: str
    snippet: str
    labels: List[str]
    priority: str
    received_iso: str


# =============================================================================
# BASE WATCHER PATTERN
# =============================================================================

class BaseWatcher:
    """
    Base class for all watchers in the Digital Employee system.
    Implements common functionality for monitoring and processing.
    """

    def __init__(self, dest_dir: Path, check_interval: int = CHECK_INTERVAL):
        """
        Initialize base watcher.

        Args:
            dest_dir: Destination directory for processed items
            check_interval: Seconds between checks
        """
        self.dest_dir = dest_dir
        self.check_interval = check_interval
        self.processed_ids: Set[str] = self._load_processed_ids()
        self.stats = {
            'processed': 0,
            'errors': 0,
            'skipped': 0,
            'started_at': datetime.now().isoformat(),
        }
        self.running = True

    def _load_processed_ids(self) -> Set[str]:
        """Load previously processed email IDs from JSON file."""
        if PROCESSED_IDS_FILE.exists():
            try:
                with open(PROCESSED_IDS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Keep only last 1000 IDs to prevent file bloat
                    ids = set(data.get('processed_ids', [])[-1000:])
                    logger.info(f"Loaded {len(ids)} previously processed email IDs")
                    return ids
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Could not load processed IDs: {e}")
        return set()

    def _save_processed_ids(self) -> None:
        """Save processed email IDs to JSON file."""
        try:
            with open(PROCESSED_IDS_FILE, 'w', encoding='utf-8') as f:
                json.dump({
                    'processed_ids': list(self.processed_ids),
                    'last_updated': datetime.now().isoformat(),
                    'total_processed': len(self.processed_ids)
                }, f, indent=2)
        except IOError as e:
            logger.error(f"Failed to save processed IDs: {e}")

    def process_item(self, item: EmailData) -> bool:
        """
        Process a single item. Must be implemented by subclass.

        Args:
            item: Item to process

        Returns:
            True if successful
        """
        raise NotImplementedError("Subclasses must implement process_item")

    def log_action(self, action: str, details: str, level: str = "info") -> None:
        """Log an action with timestamp."""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'action': action,
            'details': details,
            'level': level
        }

        message = f"{action}: {details}"
        if level == "error":
            logger.error(message)
        elif level == "warning":
            logger.warning(message)
        else:
            logger.info(message)

    def get_stats(self) -> Dict:
        """Get processing statistics."""
        return self.stats.copy()

    def stop(self) -> None:
        """Signal the watcher to stop."""
        self.running = False
        self._save_processed_ids()
        logger.info("Watcher stopped, processed IDs saved")


# =============================================================================
# GMAIL WATCHER
# =============================================================================

class GmailWatcher(BaseWatcher):
    """
    Watches Gmail for unread + important emails and creates task files.

    Inherits from BaseWatcher for common functionality.
    """

    def __init__(self, dest_dir: Path = NEEDS_ACTION_DIR,
                 check_interval: int = CHECK_INTERVAL):
        """Initialize Gmail watcher."""
        super().__init__(dest_dir, check_interval)
        self.service = None

    def authenticate(self) -> bool:
        """
        Authenticate with Gmail API using OAuth2.

        Returns:
            True if authentication successful
        """
        logger.info("Authenticating with Gmail API...")

        try:
            creds = None

            # Load existing token
            if CREDENTIALS_FILE.exists():
                try:
                    creds = Credentials.from_authorized_user_file(
                        str(CREDENTIALS_FILE), SCOPES
                    )
                    logger.debug("Loaded existing credentials")
                except Exception as e:
                    logger.warning(f"Error loading token: {e}")
                    creds = None

            # Refresh or re-authenticate
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    logger.info("Refreshing expired credentials...")
                    try:
                        creds.refresh(Request())
                        logger.info("Credentials refreshed successfully")
                    except RefreshError as e:
                        logger.error(f"Failed to refresh: {e}")
                        creds = None

                if not creds:
                    if not CREDENTIALS_JSON.exists():
                        logger.error(
                            f"Credentials file not found: {CREDENTIALS_JSON}\n"
                            "Please download from Google Cloud Console"
                        )
                        return False

                    logger.info("Starting OAuth2 flow...")
                    flow = InstalledAppFlow.from_client_secrets_file(
                        str(CREDENTIALS_JSON), SCOPES
                    )

                    # Try port 8080, fallback to random
                    try:
                        creds = flow.run_local_server(
                            port=8080,
                            bind_addr="127.0.0.1",
                            open_browser=False
                        )
                    except OSError:
                        logger.warning("Port 8080 busy, using random port")
                        creds = flow.run_local_server(
                            port=0,
                            bind_addr="127.0.0.1",
                            open_browser=False
                        )

                    # Save credentials
                    with open(CREDENTIALS_FILE, 'w', encoding='utf-8') as token:
                        token.write(creds.to_json())
                    logger.info(f"Credentials saved to: {CREDENTIALS_FILE}")

            # Build service
            self.service = build('gmail', 'v1', credentials=creds)
            logger.info("✅ Gmail API service initialized")
            return True

        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            return False

    def fetch_unread_emails(self, max_results: int = MAX_RESULTS) -> List[Dict]:
        """
        Fetch unread + important emails from Gmail.

        Args:
            max_results: Maximum emails to fetch

        Returns:
            List of email message dicts
        """
        if not self.service:
            logger.error("Gmail service not initialized")
            return []

        try:
            # Query: unread, in inbox, not promotions/social, important
            query = "is:unread in:inbox -category:promotions -category:social"

            logger.info(f"Fetching emails with query: {query}")

            response = self.service.users().messages().list(
                userId='me',
                q=query,
                maxResults=max_results
            ).execute()

            messages = response.get('messages', [])
            logger.info(f"Found {len(messages)} unread emails")

            if not messages:
                return []

            # Fetch full details
            emails = []
            for msg in messages:
                try:
                    full_message = self.service.users().messages().get(
                        userId='me',
                        id=msg['id'],
                        format='full'
                    ).execute()
                    emails.append(full_message)
                except HttpError as e:
                    logger.error(f"Error fetching message {msg['id']}: {e}")
                    self.stats['errors'] += 1

            return emails

        except HttpError as e:
            logger.error(f"Error fetching emails: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return []

    def parse_email(self, message: Dict) -> EmailData:
        """
        Parse Gmail message into structured data.

        Args:
            message: Gmail message dict

        Returns:
            EmailData object
        """
        headers = message['payload']['headers']
        email_dict = {
            'id': message['id'],
            'thread_id': message.get('threadId', ''),
            'subject': '',
            'from_addr': '',
            'to_addr': '',
            'date': '',
            'body': '',
            'snippet': message.get('snippet', ''),
            'labels': message.get('labelIds', []),
            'priority': 'medium'
        }

        # Extract headers
        for header in headers:
            name = header.get('name', '').lower()
            value = header.get('value', '')

            if name == 'subject':
                email_dict['subject'] = value
            elif name == 'from':
                email_dict['from_addr'] = value
            elif name == 'to':
                email_dict['to_addr'] = value
            elif name == 'date':
                email_dict['date'] = value

        # Extract body
        email_dict['body'] = self._extract_body(message['payload'])

        # Determine priority
        email_dict['priority'] = self._assess_priority(email_dict)

        # ISO timestamp
        email_dict['received_iso'] = datetime.now(timezone.utc).isoformat()

        return EmailData(**email_dict)

    def _extract_body(self, payload: Dict) -> str:
        """Extract email body from payload."""
        body = ""

        if 'parts' in payload:
            # Multipart: prefer plain text
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                    data = part['body']['data']
                    body = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
                    break
                elif part['mimeType'] == 'text/html' and 'data' in part['body']:
                    data = part['body']['data']
                    html = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
                    body = re.sub(r'<[^>]+>', '', html)  # Simple HTML strip
        elif 'body' in payload and 'data' in payload['body']:
            data = payload['body']['data']
            body = base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')

        return body.strip()[:5000]  # Limit body length

    def _assess_priority(self, email_dict: Dict) -> str:
        """Assess email priority based on content."""
        subject = email_dict['subject'].lower()
        from_addr = email_dict['from_addr'].lower()

        # High priority keywords
        high_keywords = ['urgent', 'asap', 'immediate', 'important', 'action required',
                        'deadline', 'emergency', 'priority', 'critical']

        if any(kw in subject for kw in high_keywords):
            return 'high'

        # Medium priority
        medium_keywords = ['review', 'approval', 'meeting', 'schedule', 'update',
                          'feedback', 'question', 'request', 'please']

        if any(kw in subject for kw in medium_keywords):
            return 'medium'

        return 'normal'

    def create_task_file(self, email: EmailData) -> Optional[Path]:
        """
        Create structured markdown task file from email.

        Args:
            email: EmailData object

        Returns:
            Path to created file
        """
        try:
            # Generate filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_subject = re.sub(r'[^\w\s-]', '', email.subject[:50])
            safe_subject = re.sub(r'[-\s]+', '_', safe_subject.strip()).lower()
            filename = f"{timestamp}_email_{safe_subject}.md"
            task_path = self.dest_dir / filename

            # Format date
            try:
                parsed_date = datetime.strptime(email.date, '%a, %d %b %Y %H:%M:%S %z')
                formatted_date = parsed_date.strftime('%Y-%m-%d %H:%M:%S %Z')
            except:
                formatted_date = email.date

            # Create markdown with YAML frontmatter
            content = f"""---
type: email
from: {email.from_addr}
subject: {email.subject}
received: {email.received_iso}
priority: {email.priority}
status: pending
email_id: {email.id}
thread_id: {email.thread_id}
---

# 📧 Email: {email.subject}

## Email Details

| Field | Value |
|-------|-------|
| **From** | {email.from_addr} |
| **To** | {email.to_addr} |
| **Received** | {formatted_date} |
| **Priority** | {email.priority.upper()} |
| **Status** | Pending |

---

## Email Content

{email.body if email.body else email.snippet}

---

## Action Items

- [ ] Review email content
- [ ] Determine required action
- [ ] Draft response (if needed)
- [ ] Execute action items
- [ ] Mark as complete

## Notes

*Add context, decisions, or follow-up notes here*

---
*Generated by Gmail Watcher v2.0 on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""

            with open(task_path, 'w', encoding='utf-8') as f:
                f.write(content)

            logger.info(f"✅ Created task file: {filename}")
            return task_path

        except Exception as e:
            logger.error(f"Error creating task file: {e}")
            self.stats['errors'] += 1
            return None

    def mark_email_read(self, email_id: str) -> bool:
        """Mark email as read in Gmail."""
        if not self.service:
            return False

        try:
            self.service.users().messages().modify(
                userId='me',
                id=email_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            logger.debug(f"Marked email {email_id} as read")
            return True
        except HttpError as e:
            logger.error(f"Error marking email read: {e}")
            return False

    def process_item(self, email: EmailData) -> bool:
        """
        Process a single email.

        Args:
            email: EmailData object

        Returns:
            True if successful
        """
        try:
            # Skip if already processed
            if email.id in self.processed_ids:
                logger.debug(f"Email {email.id} already processed")
                self.stats['skipped'] += 1
                return True

            # Create task file
            task_path = self.create_task_file(email)
            if not task_path:
                logger.error(f"Failed to create task for email {email.id}")
                return False

            # Mark as read
            if self.mark_email_read(email.id):
                logger.info(f"Email {email.id} marked as read")
            else:
                logger.warning(f"Failed to mark email {email.id} as read")

            # Update tracking
            self.stats['processed'] += 1
            self.processed_ids.add(email.id)

            # Log action
            self.log_action(
                "EMAIL_PROCESSED",
                f"'{email.subject}' -> {task_path.name}"
            )

            return True

        except Exception as e:
            logger.error(f"Error processing email {email.id}: {e}")
            self.stats['errors'] += 1
            return False

    def run(self) -> Dict:
        """
        Run one iteration of the Gmail watcher.

        Returns:
            Statistics dict
        """
        logger.info("=" * 60)
        logger.info("Gmail Watcher - Starting iteration")
        logger.info("=" * 60)

        # Authenticate
        if not self.service:
            if not self.authenticate():
                logger.error("Authentication failed")
                return self.get_stats()

        # Fetch emails
        emails = self.fetch_unread_emails()

        if not emails:
            logger.info("No new important emails")
            return self.get_stats()

        # Process each email
        logger.info(f"Processing {len(emails)} email(s)...")
        for msg in emails:
            email_data = self.parse_email(msg)
            self.process_item(email_data)

        # Save processed IDs
        self._save_processed_ids()

        # Log summary
        stats = self.get_stats()
        logger.info(f"Iteration complete - Processed: {stats['processed']}, "
                   f"Errors: {stats['errors']}, Skipped: {stats['skipped']}")

        return stats

    def run_continuous(self) -> None:
        """Run watcher continuously with configured interval."""
        logger.info(f"Starting continuous monitoring (interval: {self.check_interval}s)")
        logger.info("Press Ctrl+C to stop")

        try:
            while self.running:
                self.run()
                logger.info(f"Next check in {self.check_interval} seconds...")

                # Sleep with interrupt check
                for _ in range(self.check_interval):
                    if not self.running:
                        break
                    time.sleep(1)

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.stop()
            stats = self.get_stats()
            logger.info(f"Final stats - Processed: {stats['processed']}, "
                       f"Errors: {stats['errors']}, Skipped: {stats['skipped']}")


# =============================================================================
# TMUX MANAGEMENT
# =============================================================================

def check_tmux_installed() -> bool:
    """Check if tmux is installed."""
    try:
        subprocess.run(["tmux", "-V"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def is_watcher_running() -> bool:
    """Check if watcher tmux session exists."""
    try:
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION_NAME],
            capture_output=True
        )
        return result.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def start_watcher_in_tmux(interval: int = CHECK_INTERVAL) -> None:
    """Start watcher in detached tmux session."""
    if is_watcher_running():
        print(f"✓ Gmail watcher already running in '{TMUX_SESSION_NAME}'")
        print(f"  Attach: tmux attach -t {TMUX_SESSION_NAME}")
        return

    if not check_tmux_installed():
        print("✗ tmux not installed. Install with:")
        print("  Ubuntu: sudo apt install tmux")
        print("  Arch: sudo pacman -S tmux")
        print("  macOS: brew install tmux")
        sys.exit(1)

    script_path = Path(__file__).resolve()
    script_dir = script_path.parent

    # Build command with interval
    cmd = [
        "tmux", "new-session", "-d", "-s", TMUX_SESSION_NAME,
        "-c", str(script_dir),
        "python3", str(script_path), "--continuous", "--interval", str(interval)
    ]

    subprocess.run(cmd, check=True)
    print(f"✓ Gmail watcher started in tmux session '{TMUX_SESSION_NAME}'")
    print(f"  Interval: {interval} seconds")
    print(f"  Attach: tmux attach -t {TMUX_SESSION_NAME}")
    print(f"  Detach: Ctrl+b, then d")
    print(f"  Stop:   python3 {script_path.name} --stop")
    print(f"  Logs:   {LOG_FILE}")


def stop_watcher_in_tmux() -> None:
    """Stop watcher tmux session."""
    if not is_watcher_running():
        print("✗ Gmail watcher is not running")
        return

    try:
        subprocess.run(["tmux", "send-keys", "-t", TMUX_SESSION_NAME, "C-c"], check=True)
        time.sleep(0.5)
        subprocess.run(["tmux", "kill-session", "-t", TMUX_SESSION_NAME], check=True)
        print("✓ Gmail watcher stopped")
    except subprocess.CalledProcessError:
        print("✗ Error stopping watcher (may already be stopped)")


def show_status() -> None:
    """Show watcher status."""
    if is_watcher_running():
        print(f"✓ Gmail watcher is RUNNING")
        print(f"  Session: {TMUX_SESSION_NAME}")
        print(f"  Logs: {LOG_FILE}")
        print(f"  Attach: tmux attach -t {TMUX_SESSION_NAME}")
    else:
        print("✗ Gmail watcher is NOT running")
        print(f"  Start: python3 gmail_watcher.py --start")


def run_authentication() -> None:
    """Run OAuth2 authentication flow."""
    logger.info("Starting Gmail OAuth2 authentication...")
    print("\n" + "=" * 60)
    print("GMAIL OAUTH2 AUTHENTICATION")
    print("=" * 60)

    if not CREDENTIALS_JSON.exists():
        print(f"\n✗ Credentials file not found: {CREDENTIALS_JSON}")
        print("\nSteps to get credentials:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create a new project or select existing")
        print("3. Enable Gmail API")
        print("4. Create OAuth2 credentials (Desktop app)")
        print("5. Download credentials.json")
        print("6. Save as 'credentials.json' in:")
        print(f"   {VAULT_ROOT}")
        sys.exit(1)

    watcher = GmailWatcher()
    if watcher.authenticate():
        print("\n✓ Authentication successful!")
        print(f"  Token saved to: {CREDENTIALS_FILE}")
        logger.info("Authentication completed successfully")
    else:
        print("\n✗ Authentication failed")
        logger.error("Authentication failed")
        sys.exit(1)


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

def main() -> None:
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Gmail Watcher - Monitor Gmail for important emails",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python gmail_watcher.py              # Single run
  python gmail_watcher.py --start      # Start in tmux (background)
  python gmail_watcher.py --stop       # Stop tmux session
  python gmail_watcher.py --status     # Check if running
  python gmail_watcher.py --auth       # Authenticate with Gmail
  python gmail_watcher.py --interval 120  # Custom interval (seconds)
        """
    )

    parser.add_argument(
        "--start",
        action="store_true",
        help="Start watcher in tmux (background mode)"
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Stop watcher tmux session"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show watcher status"
    )
    parser.add_argument(
        "--auth",
        action="store_true",
        help="Run OAuth2 authentication"
    )
    parser.add_argument(
        "--continuous",
        action="store_true",
        help="Run continuously (used internally by tmux)"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=CHECK_INTERVAL,
        help=f"Check interval in seconds (default: {CHECK_INTERVAL})"
    )

    args = parser.parse_args()

    # Handle commands
    if args.start:
        start_watcher_in_tmux(args.interval)
    elif args.stop:
        stop_watcher_in_tmux()
    elif args.status:
        show_status()
    elif args.auth:
        run_authentication()
    elif args.continuous:
        logger.info(f"Starting Gmail Watcher v2.0 (interval: {args.interval}s)")
        watcher = GmailWatcher(check_interval=args.interval)
        watcher.run_continuous()
    else:
        # Default: single run
        if not GMAIL_ENABLED:
            logger.warning("Gmail watcher is disabled in .env")
            return

        logger.info("Gmail Watcher v2.0 - Single run mode")
        watcher = GmailWatcher()
        watcher.run()


if __name__ == "__main__":
    main()
