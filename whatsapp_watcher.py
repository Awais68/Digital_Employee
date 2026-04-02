#!/usr/bin/env python3
"""
whatsapp_watcher.py v2.0 - WhatsApp Message Monitor for Digital Employee

Monitors WhatsApp messages via Twilio API and creates task files for important messages.

Features:
- Twilio API integration for WhatsApp Business
- Checks for new messages every 30 seconds
- Filters important messages based on keywords
- Creates structured .md files in /Needs_Action/
- Deduplication via processed_messages.json
- WHATSAPP_ENABLED flag support
- Designed for continuous运行 in tmux

Usage:
    python3 whatsapp_watcher.py              # Single run
    python3 whatsapp_watcher.py --continuous # Run continuously (tmux)
    python3 whatsapp_watcher.py --interval 60 # Custom interval

Author: Digital Employee System
Version: 2.0 - Production Ready
"""

import os
import sys
import json
import time
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Set
from dataclasses import dataclass

# Environment loading
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
    from dotenv import load_dotenv
    load_dotenv()

# Twilio API imports with auto-install
try:
    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException
except ImportError:
    print("Installing Twilio library...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "twilio"])
    from twilio.rest import Client
    from twilio.base.exceptions import TwilioRestException


# =============================================================================
# CONFIGURATION
# =============================================================================

VAULT_ROOT = Path(__file__).parent.resolve()
NEEDS_ACTION_DIR = VAULT_ROOT / "Needs_Action"
LOGS_DIR = VAULT_ROOT / "Logs"
METRICS_DIR = VAULT_ROOT / "Metrics"

# Ensure directories exist
for directory in [NEEDS_ACTION_DIR, LOGS_DIR, METRICS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Twilio configuration from .env
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "")
MY_WHATSAPP_NUMBER = os.getenv("MY_WHATSAPP_NUMBER", "")

# Settings
CHECK_INTERVAL = int(os.getenv("WHATSAPP_WATCHER_INTERVAL", "30"))
MAX_RESULTS = int(os.getenv("WHATSAPP_MAX_RESULTS", "10"))
WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "false").lower() == "true"

# Important message keywords
IMPORTANT_KEYWORDS = [
    'urgent', 'invoice', 'payment', 'meeting', 'asap', 'price', 'quote',
    'saas', 'ai', 'important', 'deadline', 'emergency', 'critical',
    'review', 'approval', 'contract', 'deal', 'client', 'customer',
    'project', 'task', 'deliver', 'send', 'call', 'reply', 'response'
]

# File paths
PROCESSED_FILE = METRICS_DIR / "whatsapp_processed_messages.json"
LOG_FILE = LOGS_DIR / f"whatsapp_watcher_{datetime.now().strftime('%Y%m%d')}.log"


# =============================================================================
# LOGGING SETUP
# =============================================================================

def setup_logging() -> logging.Logger:
    """Configure logging with file and console handlers."""
    logger = logging.getLogger("WhatsAppWatcher")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    # File handler
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    ))

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(
        '[%(asctime)s] [%(levelname)-8s] %(message)s',
        datefmt='%H:%M:%S'
    ))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


logger = setup_logging()


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class WhatsAppMessage:
    """Structured WhatsApp message data."""
    id: str
    from_addr: str
    to_addr: str
    body: str
    timestamp: str
    priority: str = "medium"


# =============================================================================
# WHATSAPP WATCHER CLASS
# =============================================================================

class WhatsAppWatcher:
    """Watches WhatsApp for important messages and creates task files."""

    def __init__(self):
        """Initialize WhatsApp watcher."""
        self.client = None
        self.processed_ids: Set[str] = self._load_processed_ids()
        self.stats = {'processed': 0, 'errors': 0, 'skipped': 0}
        
        # Validate configuration
        if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER]):
            logger.error("Missing Twilio credentials in .env file")
            raise ValueError("Twilio credentials not configured")

        self._initialize_client()

    def _initialize_client(self) -> bool:
        """Initialize Twilio client."""
        try:
            self.client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            # Test connection
            self.client.api.accounts(TWILIO_ACCOUNT_SID).fetch()
            logger.info("✅ Twilio client initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Twilio client: {e}")
            return False

    def _load_processed_ids(self) -> Set[str]:
        """Load previously processed message IDs."""
        if PROCESSED_FILE.exists():
            try:
                with open(PROCESSED_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    ids = set(data.get('processed_ids', [])[-500:])  # Keep last 500
                    logger.info(f"Loaded {len(ids)} previously processed message IDs")
                    return ids
            except Exception as e:
                logger.warning(f"Could not load processed IDs: {e}")
        return set()

    def _save_processed_ids(self) -> None:
        """Save processed message IDs."""
        try:
            with open(PROCESSED_FILE, 'w', encoding='utf-8') as f:
                json.dump({
                    'processed_ids': list(self.processed_ids),
                    'last_updated': datetime.now().isoformat(),
                    'total_processed': len(self.processed_ids)
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save processed IDs: {e}")

    def _is_important(self, message_body: str) -> tuple:
        """
        Check if message is important based on keywords.
        
        Returns:
            Tuple of (is_important: bool, priority: str)
        """
        body_lower = message_body.lower()
        
        # High priority keywords
        high_priority = ['urgent', 'asap', 'emergency', 'critical', 'deadline', 'important']
        if any(kw in body_lower for kw in high_priority):
            return True, 'high'
        
        # Medium priority keywords
        medium_priority = ['invoice', 'payment', 'meeting', 'price', 'quote', 'review', 
                          'approval', 'contract', 'deal', 'client', 'project', 'task']
        if any(kw in body_lower for kw in medium_priority):
            return True, 'medium'
        
        # Low priority but still important
        low_priority = ['saas', 'ai', 'deliver', 'send', 'call', 'reply', 'response', 
                       'customer', 'urgent']
        if any(kw in body_lower for kw in low_priority):
            return True, 'medium'
        
        return False, 'low'

    def fetch_messages(self) -> List[Dict]:
        """Fetch incoming WhatsApp messages from Twilio."""
        if not self.client:
            logger.error("Twilio client not initialized")
            return []

        try:
            logger.debug(f"Fetching messages (max: {MAX_RESULTS})...")
            
            messages = self.client.messages.list(
                to=TWILIO_WHATSAPP_NUMBER,
                limit=MAX_RESULTS
            )

            incoming_messages = []
            for msg in messages:
                # Only process inbound messages
                if msg.direction == 'inbound-bound':
                    incoming_messages.append({
                        'sid': msg.sid,
                        'from': msg.from_.replace('whatsapp:', ''),
                        'to': msg.to.replace('whatsapp:', ''),
                        'body': msg.body or '',
                        'timestamp': msg.date_sent.isoformat() if msg.date_sent else '',
                    })

            logger.info(f"Found {len(incoming_messages)} incoming messages")
            return incoming_messages

        except TwilioRestException as e:
            logger.error(f"Twilio API error: {e}")
            return []
        except Exception as e:
            logger.error(f"Error fetching messages: {e}")
            return []

    def create_task_file(self, message: WhatsAppMessage) -> Optional[Path]:
        """Create structured markdown task file."""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_sender = message.from_addr.replace('+', '').replace('-', '').replace(' ', '')
            filename = f"{timestamp}_whatsapp_{safe_sender}.md"
            task_path = NEEDS_ACTION_DIR / filename

            # Format received time
            try:
                received_dt = datetime.fromisoformat(message.timestamp.replace('Z', '+00:00'))
                formatted_time = received_dt.strftime('%Y-%m-%d %H:%M:%S %Z')
            except:
                formatted_time = message.timestamp

            content = f"""---
type: whatsapp
from: {message.from_addr}
received: {datetime.now(timezone.utc).isoformat()}
priority: {message.priority}
status: pending
message_id: {message.id}
---

# 📱 WhatsApp Message

## Message Details

| Field | Value |
|-------|-------|
| **From** | {message.from_addr} |
| **Received** | {formatted_time} |
| **Priority** | {message.priority.upper()} |
| **Status** | Pending |

---

## Message Content

{message.body}

---

## Action Items

- [ ] Review message
- [ ] Determine required action
- [ ] Draft response (if needed)
- [ ] Execute action
- [ ] Mark as complete

## Notes

*Add context or follow-up notes here*

## Reply Draft

```
To: {message.from_addr}

[Your reply here]
```

---
*Generated by WhatsApp Watcher v2.0 on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""

            with open(task_path, 'w', encoding='utf-8') as f:
                f.write(content)

            logger.info(f"✅ Created task file: {filename}")
            return task_path

        except Exception as e:
            logger.error(f"Error creating task file: {e}")
            self.stats['errors'] += 1
            return None

    def process_message(self, message_data: Dict) -> bool:
        """Process a single WhatsApp message."""
        try:
            # Skip if already processed
            if message_data['sid'] in self.processed_ids:
                logger.debug(f"Message {message_data['sid']} already processed")
                self.stats['skipped'] += 1
                return True

            # Check if message is for our number
            if message_data['to'] != MY_WHATSAPP_NUMBER.replace('whatsapp:', '').replace('+', ''):
                # Also check with + prefix
                to_clean = message_data['to'].replace('+', '')
                my_clean = MY_WHATSAPP_NUMBER.replace('whatsapp:', '').replace('+', '')
                if to_clean != my_clean:
                    logger.debug(f"Message not for this number: {message_data['to']}")
                    self.stats['skipped'] += 1
                    return True

            # Check if important
            is_important, priority = self._is_important(message_data['body'])
            
            if not is_important:
                logger.debug(f"Message not important, skipping: {message_data['sid']}")
                self.stats['skipped'] += 1
                return True

            # Create message object
            message = WhatsAppMessage(
                id=message_data['sid'],
                from_addr=message_data['from'],
                to_addr=message_data['to'],
                body=message_data['body'],
                timestamp=message_data['timestamp'],
                priority=priority
            )

            # Create task file
            task_path = self.create_task_file(message)
            if not task_path:
                logger.error(f"Failed to create task for message {message.id}")
                return False

            # Update tracking
            self.stats['processed'] += 1
            self.processed_ids.add(message.id)

            # Log action
            logger.info(f"📱 Important message from {message.from_addr} (Priority: {priority})")

            return True

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            self.stats['errors'] += 1
            return False

    def run(self) -> Dict:
        """Run one iteration of the WhatsApp watcher."""
        logger.info("=" * 60)
        logger.info("WhatsApp Watcher - Starting iteration")
        logger.info("=" * 60)

        # Fetch messages
        messages = self.fetch_messages()

        if not messages:
            logger.info("No new messages")
            return self.stats

        # Process each message
        logger.info(f"Processing {len(messages)} message(s)...")
        for msg_data in messages:
            self.process_message(msg_data)

        # Save processed IDs
        self._save_processed_ids()

        # Log summary
        logger.info(f"Iteration complete - Processed: {self.stats['processed']}, "
                   f"Errors: {self.stats['errors']}, Skipped: {self.stats['skipped']}")

        return self.stats


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="WhatsApp Watcher for Digital Employee")
    parser.add_argument('--continuous', action='store_true', help='Run continuously')
    parser.add_argument('--interval', type=int, default=CHECK_INTERVAL, help='Check interval in seconds')

    args = parser.parse_args()

    # Check if enabled
    if not WHATSAPP_ENABLED:
        logger.warning("=" * 60)
        logger.warning("⚠️  WHATSAPP_ENABLED is FALSE in .env")
        logger.warning("   WhatsApp Watcher will NOT fetch messages")
        logger.warning("   Set WHATSAPP_ENABLED=true to enable")
        logger.warning("=" * 60)
        print("\nℹ️  To enable WhatsApp Watcher:")
        print("   1. Edit .env file")
        print("   2. Set WHATSAPP_ENABLED=true")
        print("   3. Configure Twilio credentials\n")
        return

    # Check credentials
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER]):
        logger.error("Missing Twilio credentials in .env file")
        print("\n❌ Error: Missing Twilio credentials")
        print("   Please configure in .env:")
        print("   - TWILIO_ACCOUNT_SID")
        print("   - TWILIO_AUTH_TOKEN")
        print("   - TWILIO_WHATSAPP_NUMBER")
        print("   - MY_WHATSAPP_NUMBER\n")
        return

    # Run watcher
    try:
        watcher = WhatsAppWatcher()

        if args.continuous:
            # Use custom interval if specified
            interval = args.interval if args.interval != CHECK_INTERVAL else CHECK_INTERVAL
            logger.info(f"Running continuously with interval: {interval}s")
            while True:
                watcher.run()
                logger.info(f"Next check in {interval} seconds...")
                time.sleep(interval)
        else:
            stats = watcher.run()
            print(f"\n✅ Processed: {stats['processed']}, Errors: {stats['errors']}, "
                  f"Skipped: {stats['skipped']}")

    except ValueError as e:
        logger.error(str(e))
        print(f"\n❌ Error: {e}\n")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        print(f"\n❌ Error: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
