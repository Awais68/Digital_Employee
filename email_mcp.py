#!/usr/bin/env python3
"""
Silver Tier MCP - Email Sender v2.0

Email MCP (Model Context Protocol) for the Digital Employee system.
Provides email sending capabilities with Gmail SMTP support.

Features:
- SMTP + Gmail integration
- Environment-based credentials (.env)
- Dry-run mode for testing (DRY_RUN=true)
- Comprehensive logging
- HTML and plain text support

Author: Digital Employee System
Tier: Silver v2.0 - Email MCP Integration
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# =============================================================================
# Configuration
# =============================================================================

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent

# Load environment variables from .env file (override system env)
load_dotenv(BASE_DIR / ".env", override=True)

# Email configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

# Priority order: SENDER_EMAIL > EMAIL_ADDRESS > empty
SENDER_EMAIL = os.getenv("SENDER_EMAIL") or os.getenv("EMAIL_ADDRESS") or ""
SENDER_PASSWORD = os.getenv("EMAIL_PASSWORD") or os.getenv("GMAIL_APP_PASSWORD") or ""
SENDER_NAME = os.getenv("SENDER_NAME", "Digital Employee")

# Dry-run mode - if true, only logs without sending
DRY_RUN = os.getenv("DRY_RUN", "false").lower() in ("true", "1", "yes")

# Logging configuration
LOGS_DIR = BASE_DIR / "Logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / "email_mcp.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("EmailMCP")


# =============================================================================
# Email MCP Class
# =============================================================================

class EmailMCP:
    """
    Email Model Context Protocol handler.
    
    Provides email sending capabilities with Gmail SMTP integration,
    dry-run support, and comprehensive logging.
    """

    def __init__(self, dry_run: Optional[bool] = None):
        """
        Initialize Email MCP.

        Args:
            dry_run: Override DRY_RUN environment variable if specified
        """
        self.dry_run = dry_run if dry_run is not None else DRY_RUN
        self.sender_email = SENDER_EMAIL
        self.sender_password = SENDER_PASSWORD
        self.sender_name = SENDER_NAME
        self.smtp_server = SMTP_SERVER
        self.smtp_port = SMTP_PORT

        self._validate_config()

    def _validate_config(self) -> None:
        """Validate email configuration."""
        if not self.sender_email or self.sender_email == "your-email@gmail.com":
            logger.warning("SENDER_EMAIL not configured in .env")
        
        if not self.sender_password or self.sender_password == "your-app-password":
            logger.warning("EMAIL_PASSWORD not configured in .env - emails will fail")

        if self.dry_run:
            logger.info("🔍 DRY_RUN mode enabled - emails will be logged but not sent")

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        is_html: bool = False,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        reply_to: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        thread_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an email using SMTP.

        Args:
            to: Recipient email address
            subject: Email subject line
            body: Email body content
            is_html: If True, treat body as HTML; otherwise plain text
            cc: CC recipient (optional)
            bcc: BCC recipient (optional)
            reply_to: Reply-To address (optional)
            in_reply_to: Message-ID this is replying to (optional, for threading)
            thread_id: Gmail thread ID for tracking (optional)

        Returns:
            Dictionary with send result:
            {
                "success": bool,
                "message": str,
                "message_id": str (if sent),
                "dry_run": bool,
                "timestamp": str
            }
        """
        timestamp = datetime.now().isoformat()
        result = {
            "success": False,
            "message": "",
            "message_id": None,
            "dry_run": self.dry_run,
            "timestamp": timestamp,
            "to": to,
            "subject": subject,
        }

        # Validate inputs
        if not to or "@" not in to:
            error_msg = f"Invalid recipient email: {to}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        if not subject:
            subject = "(No Subject)"

        if not body:
            logger.warning("Empty email body")
            body = "(No Content)"

        # Dry-run mode - log and return early
        if self.dry_run:
            logger.info("=" * 60)
            logger.info("📧 DRY RUN - Email would be sent:")
            logger.info(f"   To: {to}")
            logger.info(f"   Subject: {subject}")
            logger.info(f"   HTML: {is_html}")
            logger.info(f"   Body preview: {body[:200]}...")
            logger.info("=" * 60)
            result["success"] = True
            result["message"] = "Dry run - email logged but not sent"
            result["message_id"] = f"DRYRUN-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            self._log_email_action(result, body)
            return result

        # Validate credentials
        if not self.sender_email or not self.sender_password:
            error_msg = "Email credentials not configured. Set SENDER_EMAIL and EMAIL_PASSWORD in .env"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.sender_name} <{self.sender_email}>"
            msg["To"] = to

            # Add optional headers
            if cc:
                msg["Cc"] = cc
            if reply_to:
                msg["Reply-To"] = reply_to
            if in_reply_to:
                msg["In-Reply-To"] = in_reply_to
                msg["References"] = in_reply_to

            # Attach body
            if is_html:
                msg.attach(MIMEText(body, "html", "utf-8"))
            else:
                msg.attach(MIMEText(body, "plain", "utf-8"))
                # Also attach HTML version for better compatibility
                html_body = body.replace("\n", "<br>")
                msg.attach(MIMEText(f"<html><body>{html_body}</body></html>", "html", "utf-8"))

            # Build recipient list
            recipients = [to]
            if cc:
                recipients.extend(cc.split(","))
            if bcc:
                recipients.extend(bcc.split(","))

            # Connect and send
            logger.info(f"Connecting to SMTP server: {self.smtp_server}:{self.smtp_port}")
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.set_debuglevel(0)  # Set to 1 for debug output
                server.ehlo()
                server.starttls()
                server.ehlo()
                
                logger.info(f"Authenticating as: {self.sender_email}")
                server.login(self.sender_email, self.sender_password)
                
                logger.info(f"Sending email to: {to}")
                server.sendmail(self.sender_email, recipients, msg.as_string())

            # Success
            message_id = f"<{datetime.now().strftime('%Y%m%d%H%M%S')}@{self.smtp_server}>"
            result["success"] = True
            result["message"] = f"Email sent successfully to {to}"
            result["message_id"] = message_id

            logger.info(f"✅ Email sent successfully: {subject}")
            logger.info(f"   Message-ID: {message_id}")
            
            self._log_email_action(result, body)
            return result

        except smtplib.SMTPAuthenticationError as e:
            error_msg = f"SMTP Authentication failed: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        except smtplib.SMTPConnectError as e:
            error_msg = f"Failed to connect to SMTP server: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        except smtplib.SMTPException as e:
            error_msg = f"SMTP error: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        except Exception as e:
            error_msg = f"Unexpected error sending email: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

    def _log_email_action(self, result: Dict[str, Any], body: str) -> None:
        """Log email action to daily log file."""
        log_file = LOGS_DIR / f"email_log_{datetime.now().strftime('%Y%m%d')}.md"
        
        status = "✅ Sent" if result["success"] else "❌ Failed"
        if result["dry_run"]:
            status = "🔍 Dry Run"

        log_entry = f"""
## {status} - {result.get('subject', 'No Subject')}

| Field | Value |
|-------|-------|
| **Time** | {result['timestamp']} |
| **To** | {result.get('to', 'N/A')} |
| **Subject** | {result.get('subject', 'N/A')} |
| **Message ID** | {result.get('message_id', 'N/A')} |
| **Status** | {status} |

**Body Preview:**
```
{body[:500]}{'...' if len(body) > 500 else ''}
```

---

"""
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_entry)

    def test_connection(self) -> Dict[str, Any]:
        """
        Test SMTP connection without sending an email.

        Returns:
            Dictionary with connection test result
        """
        result = {
            "success": False,
            "message": "",
            "timestamp": datetime.now().isoformat()
        }

        if self.dry_run:
            result["success"] = True
            result["message"] = "Dry run mode - connection test skipped"
            logger.info("🔍 DRY RUN - Connection test skipped")
            return result

        if not self.sender_email or not self.sender_password:
            result["message"] = "Email credentials not configured"
            logger.error(result["message"])
            return result

        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.set_debuglevel(0)
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.sender_email, self.sender_password)
            
            result["success"] = True
            result["message"] = f"Successfully connected to {self.smtp_server}:{self.smtp_port}"
            logger.info(f"✅ Connection test successful: {result['message']}")

        except Exception as e:
            result["message"] = f"Connection test failed: {e}"
            logger.error(result["message"])

        return result


# =============================================================================
# Module-level Convenience Functions
# =============================================================================

# Global Email MCP instance
_email_mcp: Optional[EmailMCP] = None


def get_email_mcp(dry_run: Optional[bool] = None) -> EmailMCP:
    """Get or create Email MCP instance."""
    global _email_mcp
    if _email_mcp is None or dry_run is not None:
        _email_mcp = EmailMCP(dry_run=dry_run)
    return _email_mcp


def send_email(
    to: str,
    subject: str,
    body: str,
    is_html: bool = False,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    dry_run: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Convenience function to send an email.

    Args:
        to: Recipient email address
        subject: Email subject line
        body: Email body content
        is_html: If True, treat body as HTML
        cc: CC recipient (optional)
        bcc: BCC recipient (optional)
        dry_run: Override DRY_RUN env var for this send

    Returns:
        Dictionary with send result
    """
    mcp = get_email_mcp(dry_run=dry_run)
    return mcp.send_email(to=to, subject=subject, body=body, is_html=is_html, cc=cc, bcc=bcc)


def test_email_connection() -> Dict[str, Any]:
    """Test SMTP connection."""
    mcp = get_email_mcp()
    return mcp.test_connection()


# =============================================================================
# CLI Interface
# =============================================================================

def main():
    """CLI entry point for email MCP."""
    import sys

    print("=" * 60)
    print("📧 Silver Tier Email MCP v2.0")
    print("=" * 60)
    print(f"SMTP Server: {SMTP_SERVER}:{SMTP_PORT}")
    print(f"Sender: {SENDER_NAME} <{SENDER_EMAIL}>")
    print(f"Dry Run: {DRY_RUN}")
    print("-" * 60)

    if len(sys.argv) < 2:
        print("Usage: python email_mcp.py <command> [args]")
        print("\nCommands:")
        print("  test              Test SMTP connection")
        print("  send <to> <subject> <body>  Send an email")
        print("  send-html <to> <subject> <body>  Send HTML email")
        print("\nEnvironment Variables:")
        print("  SENDER_EMAIL      Your Gmail address")
        print("  EMAIL_PASSWORD    Gmail App Password")
        print("  SENDER_NAME       Your name")
        print("  DRY_RUN=true      Enable dry-run mode (log only)")
        return

    command = sys.argv[1].lower()
    mcp = get_email_mcp()

    if command == "test":
        print("Testing SMTP connection...")
        result = mcp.test_connection()
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Connection test passed")
        else:
            print("❌ Connection test failed")

    elif command == "send":
        if len(sys.argv) < 5:
            print("Usage: python email_mcp.py send <to> <subject> <body>")
            return
        
        to = sys.argv[2]
        subject = sys.argv[3]
        body = " ".join(sys.argv[4:])
        
        print(f"Sending email to: {to}")
        print(f"Subject: {subject}")
        result = mcp.send_email(to=to, subject=subject, body=body)
        
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Email sent successfully")
        else:
            print("❌ Email send failed")

    elif command == "send-html":
        if len(sys.argv) < 5:
            print("Usage: python email_mcp.py send-html <to> <subject> <body>")
            return
        
        to = sys.argv[2]
        subject = sys.argv[3]
        body = " ".join(sys.argv[4:])
        
        print(f"Sending HTML email to: {to}")
        print(f"Subject: {subject}")
        result = mcp.send_email(to=to, subject=subject, body=body, is_html=True)
        
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ HTML email sent successfully")
        else:
            print("❌ HTML email send failed")

    else:
        print(f"Unknown command: {command}")
        print("Use 'python email_mcp.py' for usage information")


if __name__ == "__main__":
    main()
