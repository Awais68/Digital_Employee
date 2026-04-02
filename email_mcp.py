#!/usr/bin/env python3
"""
Silver Tier MCP - Email Sender

This script sends emails for approved items in the Approved folder.
It follows the human approval workflow - only sends emails for items
that have been explicitly approved.

Usage: python email_mcp.py
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from datetime import datetime
import json
import shutil


# =============================================================================
# Configuration
# =============================================================================
BASE_DIR = Path(__file__).parent.resolve()
APPROVED_DIR = BASE_DIR / "Approved"
DONE_DIR = BASE_DIR / "Done"
LOGS_DIR = BASE_DIR / "Logs"

# Email configuration (load from environment or credentials)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


def load_email_credentials() -> dict:
    """
    Load email credentials from environment variables or credentials file.
    Returns dict with email, password, and recipient information.
    """
    # Try environment variables first (more secure)
    sender_email = os.getenv("EMAIL_ADDRESS")
    sender_password = os.getenv("EMAIL_PASSWORD")
    recipient_email = os.getenv("RECIPIENT_EMAIL")

    if not sender_email or not sender_password:
        # Fallback to credentials file (less secure, for development only)
        creds_file = BASE_DIR / "credentials.json"
        if creds_file.exists():
            with open(creds_file, "r") as f:
                creds = json.load(f)
                # Note: credentials.json has OAuth creds, not SMTP
                # User needs to set up app password separately
                pass

    return {
        "sender_email": sender_email or "your-email@gmail.com",
        "sender_password": sender_password or "your-app-password",
        "recipient_email": recipient_email or "recipient@example.com"
    }


def get_current_timestamp() -> str:
    """Return current timestamp in ISO format."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_approved_files() -> list:
    """
    Get all markdown files in Approved folder that are ready for email.
    Returns list of file paths.
    """
    if not APPROVED_DIR.exists():
        return []

    # Look for EMAIL_* files or any approved item with email content
    email_files = list(APPROVED_DIR.glob("EMAIL_*.md"))

    # Also check for any file with email_ready status
    for md_file in APPROVED_DIR.glob("*.md"):
        content = md_file.read_text()
        if "status: ready_to_email" in content or "type: email" in content:
            if md_file not in email_files:
                email_files.append(md_file)

    return email_files


def extract_email_content(filepath: Path) -> dict:
    """
    Extract email subject, body, and recipient from approved file.

    Returns dict with:
        - subject: Email subject line
        - body: Email body content
        - recipient: Recipient email (optional)
    """
    content = filepath.read_text(encoding="utf-8")

    # Extract subject (from first heading or filename)
    subject = filepath.stem.replace("_", " ").replace("EMAIL ", "")

    # Look for subject in content
    for line in content.split("\n"):
        if line.startswith("# ") or line.startswith("Subject:"):
            subject = line.replace("#", "").replace("Subject:", "").strip()
            break

    # Extract body (everything after headers/frontmatter)
    body_start = False
    body_lines = []
    for line in content.split("\n"):
        if line.startswith("---") and not body_start:
            body_start = True
            continue
        if body_start and not line.startswith("---"):
            if not line.startswith(("type:", "status:", "created:", "approved:", "recipient:")):
                body_lines.append(line)

    body = "\n".join(body_lines).strip()

    # Extract recipient if specified
    recipient = None
    for line in content.split("\n"):
        if line.startswith("recipient:"):
            recipient = line.split(":")[1].strip()
            break

    return {
        "subject": subject,
        "body": body,
        "recipient": recipient
    }


def send_email(subject: str, body: str, recipient: str, creds: dict) -> bool:
    """
    Send email using SMTP.

    Args:
        subject: Email subject
        body: Email body (supports HTML)
        recipient: Recipient email address
        creds: Credentials dict with sender_email, sender_password

    Returns:
        True if sent successfully, False otherwise
    """
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = creds["sender_email"]
        msg["To"] = recipient

        # Attach body as plain text and HTML
        msg.attach(MIMEText(body, "plain", "utf-8"))
        msg.attach(MIMEText(body.replace("\n", "<br>"), "html", "utf-8"))

        # Connect to SMTP server and send
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()  # Secure the connection
            server.login(creds["sender_email"], creds["sender_password"])
            server.sendmail(creds["sender_email"], recipient, msg.as_string())

        return True

    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def log_email_sent(filename: str, recipient: str) -> None:
    """Log the sent email in /Logs/ folder."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    log_file = LOGS_DIR / f"email_log_{datetime.now().strftime('%Y%m%d')}.md"

    log_entry = f"""
## Email Sent - {filename}
- **Time**: {get_current_timestamp()}
- **Recipient**: {recipient}
- **Status**: Sent successfully

"""

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(log_entry)


def move_to_done(source_path: Path, filename: str) -> Path:
    """Move processed file to Done folder."""
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = DONE_DIR / filename
    shutil.move(str(source_path), str(dest_path))
    return dest_path


def process_approved_emails() -> int:
    """
    Main function to process approved email files.

    Returns:
        Number of emails sent successfully
    """
    # Ensure directories exist
    APPROVED_DIR.mkdir(parents=True, exist_ok=True)

    # Get approved files
    email_files = get_approved_files()

    if not email_files:
        print("No approved emails to send.")
        return 0

    # Load credentials
    creds = load_email_credentials()

    # Check if credentials are configured
    if creds["sender_password"] == "your-app-password":
        print("\n⚠️  Email credentials not configured!")
        print("Set environment variables:")
        print("  EMAIL_ADDRESS=your-email@gmail.com")
        print("  EMAIL_PASSWORD=your-app-password")
        print("  RECIPIENT_EMAIL=default-recipient@example.com")
        print("\nFor Gmail, use an App Password: https://myaccount.google.com/apppasswords")
        return 0

    sent_count = 0

    for filepath in email_files:
        filename = filepath.name

        try:
            # Extract email content
            email_data = extract_email_content(filepath)

            # Use file-specified recipient or default
            recipient = email_data["recipient"] or creds["recipient_email"]

            # Send email
            print(f"Sending email: {email_data['subject']}")
            print(f"  To: {recipient}")

            if send_email(email_data["subject"], email_data["body"], recipient, creds):
                print(f"  ✓ Sent successfully")

                # Log the action
                log_email_sent(filename, recipient)

                # Move to Done
                move_to_done(filepath, filename)

                sent_count += 1
            else:
                print(f"  ✗ Failed to send")

        except Exception as e:
            print(f"Error processing {filename}: {e}")
            continue

    return sent_count


def main():
    """Entry point for the script."""
    print("=" * 60)
    print("Silver Tier MCP - Email Sender")
    print("=" * 60)
    print(f"Scanning: {APPROVED_DIR}")
    print("-" * 60)

    # Process all approved emails
    count = process_approved_emails()

    # Print summary
    print("-" * 60)
    print(f"{count} email(s) sent successfully.")
    print("=" * 60)


if __name__ == "__main__":
    main()
