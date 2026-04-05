#!/usr/bin/env python3
"""
Silver Tier MCP - Email Sender v3.0

Email MCP (Model Context Protocol) for the Digital Employee system.
Provides email sending capabilities with Gmail SMTP support.

Features:
- SMTP + Gmail integration
- Environment-based credentials (.env)
- Dry-run mode for testing (DRY_RUN=true)
- Comprehensive logging
- HTML and plain text support
- File attachments (single/multiple)
- Multiple recipients (comma-separated lists)
- Email templates with variable substitution
- Priority/flagging headers (X-Priority, Importance, X-MSMail-Priority)

Author: Digital Employee System
Version: 3.0 - Full Feature Support
"""

import os
import smtplib
import logging
import mimetypes
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from dotenv import load_dotenv
from string import Template

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

# Maximum attachment size (10MB default)
MAX_ATTACHMENT_SIZE = int(os.getenv("MAX_ATTACHMENT_SIZE", "10485760"))  # 10MB

# Templates directory
TEMPLATES_DIR = BASE_DIR / "Email_Templates"
TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

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
# Email Templates System
# =============================================================================

class EmailTemplate:
    """Email template with variable substitution."""
    
    def __init__(self, name: str, subject: str, body: str, is_html: bool = False):
        """
        Initialize email template.
        
        Args:
            name: Template name
            subject: Email subject with variables (e.g., "Hello ${name}")
            body: Email body with variables
            is_html: If True, body is HTML
        """
        self.name = name
        self.subject = subject
        self.body = body
        self.is_html = is_html
    
    def render(self, **kwargs) -> tuple:
        """
        Render template with variables.
        
        Args:
            **kwargs: Variables to substitute
            
        Returns:
            Tuple of (subject, body)
        """
        template_subject = Template(self.subject)
        template_body = Template(self.body)
        
        rendered_subject = template_subject.safe_substitute(**kwargs)
        rendered_body = template_body.safe_substitute(**kwargs)
        
        return rendered_subject, rendered_body
    
    @classmethod
    def from_file(cls, template_path: Union[str, Path]) -> 'EmailTemplate':
        """
        Load template from file.
        
        Expected format:
        ---
        name: Welcome Email
        is_html: false
        ---
        Subject: Welcome ${name}!
        
        Body content here...
        """
        template_path = Path(template_path)
        if not template_path.exists():
            raise FileNotFoundError(f"Template file not found: {template_path}")
        
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse frontmatter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                frontmatter = {}
                for line in parts[1].strip().split('\n'):
                    if ':' in line:
                        key, value = line.split(':', 1)
                        frontmatter[key.strip().lower()] = value.strip()
                
                body_content = parts[2].strip()
                
                # Split subject and body
                if '\n\n' in body_content:
                    subject_line, body_text = body_content.split('\n\n', 1)
                else:
                    subject_line = body_content
                    body_text = ""
                
                # Remove "Subject: " prefix
                if subject_line.startswith('Subject:'):
                    subject_line = subject_line[8:].strip()
                
                return cls(
                    name=frontmatter.get('name', template_path.stem),
                    subject=subject_line,
                    body=body_text,
                    is_html=frontmatter.get('is_html', 'false').lower() == 'true'
                )
        
        raise ValueError(f"Invalid template format: {template_path}")
    
    def save(self, template_path: Optional[Union[str, Path]] = None) -> Path:
        """Save template to file."""
        if template_path is None:
            safe_name = self.name.lower().replace(' ', '_').replace('/', '_')
            template_path = TEMPLATES_DIR / f"{safe_name}.md"
        else:
            template_path = Path(template_path)
        
        content = f"""---
name: {self.name}
is_html: {str(self.is_html).lower()}
---
Subject: {self.subject}

{self.body}
"""
        with open(template_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info(f"Template saved: {template_path}")
        return template_path


class TemplateManager:
    """Manages email templates."""
    
    def __init__(self, templates_dir: Path = TEMPLATES_DIR):
        self.templates_dir = templates_dir
        self.templates: Dict[str, EmailTemplate] = {}
        self._load_templates()
    
    def _load_templates(self):
        """Load all templates from directory."""
        if not self.templates_dir.exists():
            return
        
        for template_file in self.templates_dir.glob("*.md"):
            try:
                template = EmailTemplate.from_file(template_file)
                self.templates[template.name.lower()] = template
                logger.debug(f"Loaded template: {template.name}")
            except Exception as e:
                logger.warning(f"Failed to load template {template_file}: {e}")
    
    def get(self, name: str) -> Optional[EmailTemplate]:
        """Get template by name."""
        return self.templates.get(name.lower())
    
    def list_templates(self) -> List[str]:
        """List all available template names."""
        return list(self.templates.keys())
    
    def create_template(self, name: str, subject: str, body: str, is_html: bool = False) -> EmailTemplate:
        """Create and register a new template."""
        template = EmailTemplate(name=name, subject=subject, body=body, is_html=is_html)
        self.templates[name.lower()] = template
        template.save()
        return template


# =============================================================================
# Email MCP Class
# =============================================================================

class EmailMCP:
    """
    Email Model Context Protocol handler.
    
    Provides email sending capabilities with Gmail SMTP integration,
    dry-run support, and comprehensive logging.
    """

    # Priority levels
    PRIORITY_LOW = 'low'
    PRIORITY_NORMAL = 'normal'
    PRIORITY_HIGH = 'high'
    PRIORITY_URGENT = 'urgent'

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
        self.template_manager = TemplateManager()

        self._validate_config()

    def _validate_config(self) -> None:
        """Validate email configuration."""
        if not self.sender_email or self.sender_email == "your-email@gmail.com":
            logger.warning("SENDER_EMAIL not configured in .env")
        
        if not self.sender_password or self.sender_password == "your-app-password":
            logger.warning("EMAIL_PASSWORD not configured in .env - emails will fail")

        if self.dry_run:
            logger.info("🔍 DRY_RUN mode enabled - emails will be logged but not sent")

    def _parse_recipients(self, recipients: str) -> List[str]:
        """
        Parse recipient string into list of emails.
        
        Handles comma-separated and semicolon-separated lists.
        Example: "user1@example.com, user2@example.com; user3@example.com"
        
        Args:
            recipients: Recipient string
            
        Returns:
            List of email addresses
        """
        if not recipients:
            return []
        
        # Split by comma or semicolon
        emails = []
        for email in recipients.replace(';', ',').split(','):
            email = email.strip()
            if email and '@' in email:
                emails.append(email)
        
        return emails

    def _validate_attachments(self, attachments: List[Union[str, Path]]) -> List[Path]:
        """
        Validate attachment files.
        
        Args:
            attachments: List of file paths
            
        Returns:
            List of validated Path objects
            
        Raises:
            FileNotFoundError: If attachment doesn't exist
            ValueError: If attachment is too large
        """
        validated = []
        for attachment in attachments:
            file_path = Path(attachment)
            
            if not file_path.exists():
                raise FileNotFoundError(f"Attachment not found: {attachment}")
            
            file_size = file_path.stat().st_size
            if file_size > MAX_ATTACHMENT_SIZE:
                size_mb = file_size / (1024 * 1024)
                max_mb = MAX_ATTACHMENT_SIZE / (1024 * 1024)
                raise ValueError(
                    f"Attachment too large: {file_path.name} ({size_mb:.1f}MB > {max_mb:.1f}MB)"
                )
            
            validated.append(file_path)
        
        return validated

    def _add_priority_headers(self, msg: MIMEMultipart, priority: str) -> None:
        """
        Add priority headers to email.
        
        Args:
            msg: Email message
            priority: Priority level (low, normal, high, urgent)
        """
        priority = priority.lower()
        
        # X-Priority: 1 (Highest), 3 (Normal), 5 (Lowest)
        priority_map = {
            'urgent': '1',
            'high': '2',
            'normal': '3',
            'low': '5'
        }
        
        # Importance header
        importance_map = {
            'urgent': 'High',
            'high': 'High',
            'normal': 'Normal',
            'low': 'Low'
        }
        
        msg['X-Priority'] = priority_map.get(priority, '3')
        msg['Importance'] = importance_map.get(priority, 'Normal')
        msg['X-MSMail-Priority'] = priority_map.get(priority, '3')

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
        thread_id: Optional[str] = None,
        attachments: Optional[List[Union[str, Path]]] = None,
        priority: str = 'normal'
    ) -> Dict[str, Any]:
        """
        Send an email using SMTP.

        Args:
            to: Recipient email address (can be comma-separated for multiple)
            subject: Email subject line
            body: Email body content
            is_html: If True, treat body as HTML; otherwise plain text
            cc: CC recipients (comma-separated for multiple)
            bcc: BCC recipients (comma-separated for multiple)
            reply_to: Reply-To address (optional)
            in_reply_to: Message-ID this is replying to (optional, for threading)
            thread_id: Gmail thread ID for tracking (optional)
            attachments: List of file paths to attach
            priority: Email priority (low, normal, high, urgent)

        Returns:
            Dictionary with send result
        """
        timestamp = datetime.now().isoformat()
        
        # Parse recipients
        to_list = self._parse_recipients(to)
        cc_list = self._parse_recipients(cc) if cc else []
        bcc_list = self._parse_recipients(bcc) if bcc else []
        
        # Format primary recipient for header
        to_header = ', '.join(to_list) if to_list else to
        
        result = {
            "success": False,
            "message": "",
            "message_id": None,
            "thread_id": thread_id,
            "dry_run": self.dry_run,
            "timestamp": timestamp,
            "to": to,
            "cc": cc,
            "bcc": bcc,
            "subject": subject,
            "priority": priority,
            "attachments": [str(a) for a in attachments] if attachments else []
        }

        # Validate primary recipients
        if not to_list:
            error_msg = f"No valid recipient emails found in: {to}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        if not subject:
            subject = "(No Subject)"

        if not body:
            logger.warning("Empty email body")
            body = "(No Content)"
        
        # Validate attachments
        validated_attachments = []
        if attachments:
            try:
                validated_attachments = self._validate_attachments(attachments)
                logger.info(f"Validated {len(validated_attachments)} attachment(s)")
            except (FileNotFoundError, ValueError) as e:
                error_msg = f"Attachment validation failed: {e}"
                logger.error(error_msg)
                result["message"] = error_msg
                return result

        # Dry-run mode - log and return early
        if self.dry_run:
            logger.info("=" * 60)
            logger.info("📧 DRY RUN - Email would be sent:")
            logger.info(f"   To: {to_header}")
            if cc_list:
                logger.info(f"   CC: {', '.join(cc_list)}")
            if bcc_list:
                logger.info(f"   BCC: {', '.join(bcc_list)}")
            logger.info(f"   Subject: {subject}")
            logger.info(f"   Priority: {priority}")
            logger.info(f"   HTML: {is_html}")
            logger.info(f"   Attachments: {len(validated_attachments)}")
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
            if validated_attachments:
                # Mixed type for attachments
                msg = MIMEMultipart("mixed")
                body_part = MIMEMultipart("alternative")
                msg.attach(body_part)
            else:
                msg = MIMEMultipart("alternative")
                body_part = msg

            msg["Subject"] = subject
            msg["From"] = f"{self.sender_name} <{self.sender_email}>"
            msg["To"] = to_header

            # Add CC/BCC headers
            if cc_list:
                msg["Cc"] = ', '.join(cc_list)
            if bcc_list:
                msg["Bcc"] = ', '.join(bcc_list)
            
            # Optional headers
            if reply_to:
                msg["Reply-To"] = reply_to
            if in_reply_to:
                msg["In-Reply-To"] = in_reply_to
                msg["References"] = in_reply_to
            
            # Add priority headers
            self._add_priority_headers(msg, priority)

            # Attach body
            if is_html:
                body_part.attach(MIMEText(body, "html", "utf-8"))
            else:
                body_part.attach(MIMEText(body, "plain", "utf-8"))
                # Also attach HTML version for better compatibility
                html_body = body.replace("\n", "<br>")
                body_part.attach(MIMEText(f"<html><body>{html_body}</body></html>", "html", "utf-8"))
            
            # Attach files
            for file_path in validated_attachments:
                # Determine MIME type
                mime_type, mime_encoding = mimetypes.guess_type(str(file_path))
                if mime_type is None:
                    mime_type = 'application/octet-stream'
                
                maintype, subtype = mime_type.split('/', 1)
                
                with open(file_path, 'rb') as f:
                    attachment = MIMEBase(maintype, subtype)
                    attachment.set_payload(f.read())
                    encoders.encode_base64(attachment)
                    attachment.add_header(
                        'Content-Disposition',
                        f'attachment; filename="{file_path.name}"'
                    )
                    msg.attach(attachment)
                
                logger.info(f"Attached: {file_path.name}")

            # Build all recipients for SMTP
            all_recipients = to_list + cc_list + bcc_list

            # Connect and send
            logger.info(f"Connecting to SMTP server: {self.smtp_server}:{self.smtp_port}")
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.set_debuglevel(0)
                server.ehlo()
                server.starttls()
                server.ehlo()
                
                logger.info(f"Authenticating as: {self.sender_email}")
                server.login(self.sender_email, self.sender_password)
                
                logger.info(f"Sending email to {len(all_recipients)} recipient(s)")
                server.sendmail(self.sender_email, all_recipients, msg.as_string())

            # Success
            message_id = f"<{datetime.now().strftime('%Y%m%d%H%M%S')}@{self.smtp_server}>"
            result["success"] = True
            result["message"] = f"Email sent successfully to {to_header}"
            result["message_id"] = message_id

            logger.info(f"✅ Email sent successfully: {subject}")
            logger.info(f"   Message-ID: {message_id}")
            logger.info(f"   Recipients: {len(all_recipients)}")
            
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

    def send_from_template(
        self,
        to: str,
        template_name: str,
        variables: Dict[str, str],
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        attachments: Optional[List[Union[str, Path]]] = None,
        priority: str = 'normal'
    ) -> Dict[str, Any]:
        """
        Send email using a template.
        
        Args:
            to: Recipient(s)
            template_name: Name of template to use
            variables: Dictionary of variables for template substitution
            cc: CC recipients
            bcc: BCC recipients
            attachments: File attachments
            priority: Email priority
            
        Returns:
            Send result dictionary
        """
        template = self.template_manager.get(template_name)
        if not template:
            available = self.template_manager.list_templates()
            error_msg = f"Template not found: {template_name}. Available: {', '.join(available)}"
            logger.error(error_msg)
            return {
                "success": False,
                "message": error_msg,
                "timestamp": datetime.now().isoformat()
            }
        
        subject, body = template.render(**variables)
        
        return self.send_email(
            to=to,
            subject=subject,
            body=body,
            is_html=template.is_html,
            cc=cc,
            bcc=bcc,
            attachments=attachments,
            priority=priority
        )

    def create_template(
        self,
        name: str,
        subject: str,
        body: str,
        is_html: bool = False
    ) -> EmailTemplate:
        """
        Create a new email template.
        
        Args:
            name: Template name
            subject: Subject line (can contain variables like ${name})
            body: Email body (can contain variables)
            is_html: If True, body is HTML
            
        Returns:
            EmailTemplate object
        """
        return self.template_manager.create_template(name, subject, body, is_html)

    def list_templates(self) -> List[str]:
        """List available email templates."""
        return self.template_manager.list_templates()

    def _log_email_action(self, result: Dict[str, Any], body: str) -> None:
        """Log email action to daily log file."""
        log_file = LOGS_DIR / f"email_log_{datetime.now().strftime('%Y%m%d')}.md"
        
        status = "✅ Sent" if result["success"] else "❌ Failed"
        if result["dry_run"]:
            status = "🔍 Dry Run"

        attachments_info = ', '.join([Path(a).name for a in result.get('attachments', [])])
        
        log_entry = f"""
## {status} - {result.get('subject', 'No Subject')}

| Field | Value |
|-------|-------|
| **Time** | {result['timestamp']} |
| **To** | {result.get('to', 'N/A')} |
| **CC** | {result.get('cc', 'N/A')} |
| **BCC** | {result.get('bcc', 'N/A')} |
| **Subject** | {result.get('subject', 'N/A')} |
| **Priority** | {result.get('priority', 'normal')} |
| **Message ID** | {result.get('message_id', 'N/A')} |
| **Attachments** | {attachments_info if attachments_info else 'None'} |
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
_template_manager: Optional[TemplateManager] = None


def get_email_mcp(dry_run: Optional[bool] = None) -> EmailMCP:
    """Get or create Email MCP instance."""
    global _email_mcp
    if _email_mcp is None or dry_run is not None:
        _email_mcp = EmailMCP(dry_run=dry_run)
    return _email_mcp


def get_template_manager() -> TemplateManager:
    """Get or create Template Manager instance."""
    global _template_manager
    if _template_manager is None:
        _template_manager = TemplateManager()
    return _template_manager


def send_email(
    to: str,
    subject: str,
    body: str,
    is_html: bool = False,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    attachments: Optional[List[Union[str, Path]]] = None,
    priority: str = 'normal',
    dry_run: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Convenience function to send an email with full feature support.

    Args:
        to: Recipient email address(es) (comma-separated for multiple)
        subject: Email subject line
        body: Email body content
        is_html: If True, treat body as HTML
        cc: CC recipients (comma-separated)
        bcc: BCC recipients (comma-separated)
        attachments: List of file paths to attach
        priority: Email priority (low, normal, high, urgent)
        dry_run: Override DRY_RUN env var for this send

    Returns:
        Dictionary with send result
    """
    mcp = get_email_mcp(dry_run=dry_run)
    return mcp.send_email(
        to=to, 
        subject=subject, 
        body=body, 
        is_html=is_html, 
        cc=cc, 
        bcc=bcc,
        attachments=attachments,
        priority=priority
    )


def send_from_template(
    to: str,
    template_name: str,
    variables: Dict[str, str],
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    attachments: Optional[List[Union[str, Path]]] = None,
    priority: str = 'normal',
    dry_run: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Send email using a template.
    
    Args:
        to: Recipient(s)
        template_name: Template name
        variables: Variables for template
        cc: CC recipients
        bcc: BCC recipients
        attachments: File attachments
        priority: Email priority
        dry_run: Dry run mode
        
    Returns:
        Send result dictionary
    """
    mcp = get_email_mcp(dry_run=dry_run)
    return mcp.send_from_template(
        to=to,
        template_name=template_name,
        variables=variables,
        cc=cc,
        bcc=bcc,
        attachments=attachments,
        priority=priority
    )


def test_email_connection() -> Dict[str, Any]:
    """Test SMTP connection."""
    mcp = get_email_mcp()
    return mcp.test_connection()


def create_template(name: str, subject: str, body: str, is_html: bool = False) -> EmailTemplate:
    """Create a new email template."""
    mcp = get_email_mcp()
    return mcp.create_template(name, subject, body, is_html)


def list_templates() -> List[str]:
    """List available email templates."""
    mcp = get_email_mcp()
    return mcp.list_templates()


# =============================================================================
# CLI Interface
# =============================================================================

def main():
    """CLI entry point for email MCP."""
    import sys

    print("=" * 60)
    print("📧 Silver Tier Email MCP v3.0 - Full Features")
    print("=" * 60)
    print(f"SMTP Server: {SMTP_SERVER}:{SMTP_PORT}")
    print(f"Sender: {SENDER_NAME} <{SENDER_EMAIL}>")
    print(f"Dry Run: {DRY_RUN}")
    print(f"Max Attachment: {MAX_ATTACHMENT_SIZE / (1024*1024):.0f}MB")
    print(f"Templates Dir: {TEMPLATES_DIR}")
    print("-" * 60)

    if len(sys.argv) < 2:
        print("Usage: python email_mcp.py <command> [args]")
        print("\nCommands:")
        print("  test                          Test SMTP connection")
        print("  send <to> <subject> <body>    Send an email")
        print("  send-html <to> <subject> <body>  Send HTML email")
        print("  template-create <name> <subject> <body>  Create template")
        print("  template-list                 List templates")
        print("  template-send <name> <to> <key=value...>  Send from template")
        print("\nFeatures:")
        print("  - Multiple recipients: user1@example.com, user2@example.com")
        print("  - CC/BCC: --cc user@example.com --bcc user@example.com")
        print("  - Attachments: --attach file1.pdf --attach file2.jpg")
        print("  - Priority: --priority high (low, normal, high, urgent)")
        print("\nEnvironment Variables:")
        print("  SENDER_EMAIL      Your Gmail address")
        print("  EMAIL_PASSWORD    Gmail App Password")
        print("  SENDER_NAME       Your name")
        print("  DRY_RUN=true      Enable dry-run mode (log only)")
        print("  MAX_ATTACHMENT_SIZE  Max attachment size in bytes (default: 10MB)")
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

    elif command == "send" or command == "send-html":
        if len(sys.argv) < 5:
            print(f"Usage: python email_mcp.py {command} <to> <subject> <body> [options]")
            print("\nOptions:")
            print("  --cc user@example.com, user2@example.com")
            print("  --bcc user@example.com")
            print("  --attach /path/to/file.pdf")
            print("  --priority low|normal|high|urgent")
            print("  --reply-to reply@example.com")
            return
        
        to = sys.argv[2]
        subject = sys.argv[3]
        body = " ".join(sys.argv[4:])
        
        # Parse options
        cc = None
        bcc = None
        attachments = []
        priority = 'normal'
        reply_to = None
        
        i = 4
        while i < len(sys.argv):
            arg = sys.argv[i]
            if arg == "--cc" and i + 1 < len(sys.argv):
                cc = sys.argv[i + 1]
                i += 2
            elif arg == "--bcc" and i + 1 < len(sys.argv):
                bcc = sys.argv[i + 1]
                i += 2
            elif arg == "--attach" and i + 1 < len(sys.argv):
                attachments.append(sys.argv[i + 1])
                i += 2
            elif arg == "--priority" and i + 1 < len(sys.argv):
                priority = sys.argv[i + 1]
                i += 2
            elif arg == "--reply-to" and i + 1 < len(sys.argv):
                reply_to = sys.argv[i + 1]
                i += 2
            else:
                i += 1
        
        print(f"Sending email to: {to}")
        print(f"Subject: {subject}")
        if cc:
            print(f"CC: {cc}")
        if bcc:
            print(f"BCC: {bcc}")
        if attachments:
            print(f"Attachments: {', '.join(attachments)}")
        print(f"Priority: {priority}")
        
        result = mcp.send_email(
            to=to, 
            subject=subject, 
            body=body, 
            is_html=(command == "send-html"),
            cc=cc,
            bcc=bcc,
            attachments=attachments if attachments else None,
            priority=priority,
            reply_to=reply_to
        )
        
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Email sent successfully")
        else:
            print("❌ Email send failed")

    elif command == "template-create":
        if len(sys.argv) < 5:
            print("Usage: python email_mcp.py template-create <name> <subject> <body>")
            return
        
        name = sys.argv[2]
        subject = sys.argv[3]
        body = " ".join(sys.argv[4:])
        
        template = mcp.create_template(name, subject, body)
        print(f"✅ Template created: {name}")
        print(f"   Saved to: {TEMPLATES_DIR}")

    elif command == "template-list":
        templates = mcp.list_templates()
        if templates:
            print(f"Available templates ({len(templates)}):")
            for template in templates:
                print(f"  - {template}")
        else:
            print("No templates found")
            print(f"Templates directory: {TEMPLATES_DIR}")

    elif command == "template-send":
        if len(sys.argv) < 4:
            print("Usage: python email_mcp.py template-send <template_name> <to> <key=value...>")
            return
        
        template_name = sys.argv[2]
        to = sys.argv[3]
        
        # Parse variables
        variables = {}
        for arg in sys.argv[4:]:
            if '=' in arg:
                key, value = arg.split('=', 1)
                variables[key] = value
        
        print(f"Sending template: {template_name}")
        print(f"To: {to}")
        print(f"Variables: {variables}")
        
        result = mcp.send_from_template(to, template_name, variables)
        
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Template email sent successfully")
        else:
            print("❌ Template email send failed")

    else:
        print(f"Unknown command: {command}")
        print("Use 'python email_mcp.py' for usage information")


if __name__ == "__main__":
    main()
