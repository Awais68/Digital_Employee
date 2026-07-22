#!/usr/bin/env python3
"""
weekly_ceo_briefing.py — Weekly Monday CEO Briefing Sender

Generates the CEO briefing, saves to Briefings/, then sends:
  - Short summary via WhatsApp
  - Full briefing via Email

Schedule: Every Monday at 10:00 (via vault-control scheduler.js)

Usage:
    python3 weekly_ceo_briefing.py              # Generate + send
    python3 weekly_ceo_briefing.py --dry-run    # Generate only, no send
    python3 weekly_ceo_briefing.py --force      # Run even if not Monday
"""

import os
import sys
import json
import subprocess
import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BRIEFINGS_DIR = SCRIPT_DIR / "Briefings"
LOGS_DIR = SCRIPT_DIR / "Logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
BRIEFINGS_DIR.mkdir(parents=True, exist_ok=True)

DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "weekly_briefing.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("weekly_briefing")


def get_owner_email() -> str:
    return os.getenv("OWNER_EMAIL", os.getenv("GMAIL_USER", "anasuddyn56@gmail.com"))


def get_owner_phone() -> str:
    return os.getenv("OWNER_PHONE", "")


def generate_briefing_file(force: bool = False) -> Path | None:
    """Run the CEO briefing generator script. Returns path to generated file or None."""
    ceo_script = SCRIPT_DIR / "scripts" / "ceo_briefing.py"
    if not ceo_script.exists():
        logger.error(f"CEO briefing script not found: {ceo_script}")
        return None

    cmd = [sys.executable, str(ceo_script)]
    if force:
        cmd.append("--force")

    logger.info("Generating CEO briefing...")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Briefing generation failed:\n{result.stderr}")
            return None
        logger.info(f"Briefing generated:\n{result.stdout}")

        for line in result.stdout.split("\n"):
            if "CEO Briefing saved:" in line or "CEO_Briefing_" in line:
                parts = line.rsplit(":", 1)
                if len(parts) == 2:
                    path = parts[1].strip()
                    if Path(path).exists():
                        return Path(path)
        date_str = datetime.now().strftime("%Y-%m-%d")
        fallback = BRIEFINGS_DIR / f"CEO_Briefing_{date_str}.md"
        if fallback.exists():
            return fallback
        return None
    except subprocess.TimeoutExpired:
        logger.error("Briefing generation timed out")
        return None
    except Exception as e:
        logger.error(f"Briefing generation error: {e}")
        return None


def extract_briefing_data(briefing_path: Path) -> dict:
    """Extract key metrics from generated briefing markdown."""
    content = briefing_path.read_text(encoding="utf-8")
    data = {
        "subject": f"CEO Weekly Briefing — {datetime.now().strftime('%B %d, %Y')}",
        "summary": "",
        "revenue": "$0",
        "growth": "0%",
        "completed_tasks": "0",
        "blocked_tasks": "0",
        "invoices_issued": "0",
        "outstanding": "$0",
        "health": "N/A",
        "bottlenecks": [],
        "priorities": [],
        "full_briefing_path": str(briefing_path),
    }

    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("> ") and not data["summary"]:
            data["summary"] = stripped[2:]
        if "**Total Revenue**" in stripped and "|" in stripped:
            parts = [p.strip() for p in stripped.split("|")]
            if len(parts) >= 3:
                data["revenue"] = parts[2].replace("**", "").replace("$", "").strip()
        if "Overall Health:" in stripped:
            data["health"] = stripped.split("Overall Health:")[-1].strip()
        if "**Completed:" in stripped:
            parts = stripped.split("**")[1].split(":")
            data["completed_tasks"] = parts[-1].strip().split()[0] if len(parts) > 1 else "0"
        if "**Blocked:" in stripped:
            parts = stripped.split("**")[1].split("|")
            for p in parts:
                if "Overdue:" in p:
                    data["blocked_tasks"] = p.split(":")[-1].strip().split()[0]

    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("| **Total Revenue** |"):
            parts = [p.strip() for p in stripped.split("|")]
            if len(parts) >= 4:
                data["invoices_issued"] = parts[3] if len(parts) > 3 else "0"
        if stripped.startswith("**Outstanding**"):
            parts = stripped.split("|")
            if len(parts) >= 2:
                data["outstanding"] = parts[1].replace("**", "").replace("$", "").strip()
        if stripped.startswith("↑") or stripped.startswith("↓"):
            if "%" in stripped:
                data["growth"] = stripped.strip()

    bottlenecks = []
    in_bottleneck = False
    for line in content.split("\n"):
        stripped = line.strip()
        if "### Identified Bottlenecks" in stripped:
            in_bottleneck = True
            continue
        if in_bottleneck:
            if stripped.startswith("|") and "Bottleneck" not in stripped and "--" not in stripped:
                parts = [p.strip() for p in stripped.split("|")]
                if len(parts) >= 3:
                    bottlenecks.append(parts[2])
            if stripped.startswith("##") or stripped.startswith("---"):
                break
    data["bottlenecks"] = bottlenecks

    priorities = []
    in_priorities = False
    for line in content.split("\n"):
        stripped = line.strip()
        if "## 🔮 Week Ahead Priorities" in stripped:
            in_priorities = True
            continue
        if in_priorities:
            if stripped.startswith("##") or stripped.startswith("---"):
                break
            if stripped and stripped[0].isdigit() and ". " in stripped:
                priorities.append(stripped.split(". ", 1)[-1])
    data["priorities"] = priorities[:3]

    return data


def build_whatsapp_summary(data: dict) -> str:
    """Build a short WhatsApp-friendly briefing summary."""
    rev = data["revenue"]
    growth = data["growth"]
    done = data["completed_tasks"]
    blocked = data["blocked_tasks"]
    health = data["health"]
    bottlenecks = data["bottlenecks"]
    priorities = data["priorities"]

    wa = f"📊 *CEO WEEKLY BRIEFING*\n"
    wa += f"_{datetime.now().strftime('%B %d, %Y')}_\n\n"
    wa += f"🔹 *Revenue:* ${rev} ({growth})\n"
    wa += f"🔹 *Tasks:* {done} done, {blocked} blocked\n"
    wa += f"🔹 *Health:* {health}\n"

    if bottlenecks:
        wa += f"\n🚨 *Bottlenecks:* {len(bottlenecks)}\n"
        for b in bottlenecks[:3]:
            wa += f"  • {b[:60]}\n"

    if priorities:
        wa += f"\n🎯 *Priorities:*\n"
        for p in priorities:
            wa += f"  • {p[:80]}\n"

    wa += f"\n📧 Full briefing sent to your email."
    return wa


def build_email_body(data: dict) -> str:
    """Build email body with briefing summary + link to full file."""
    rev = data["revenue"]
    done = data["completed_tasks"]
    blocked = data["blocked_tasks"]
    invoices = data["invoices_issued"]
    outstanding = data["outstanding"]
    health = data["health"]
    priorities = data["priorities"]
    bottlenecks = data["bottlenecks"]

    body = f"""Hi Awais,

Here is your weekly CEO briefing summary:

📊 FINANCIAL OVERVIEW
  • Revenue: ${rev}
  • Invoices Issued: {invoices}
  • Outstanding: ${outstanding}

✅ TASK STATUS
  • Completed: {done}
  • Blocked: {blocked}
  • Overall Health: {health}

"""
    if bottlenecks:
        body += f"🚨 BOTTLENECKS ({len(bottlenecks)})\n"
        for b in bottlenecks[:3]:
            body += f"  • {b}\n"
        body += "\n"

    if priorities:
        body += "🎯 PRIORITIES THIS WEEK\n"
        for p in priorities:
            body += f"  • {p}\n"
        body += "\n"

    body += f"""
Full briefing file: {data['full_briefing_path']}

--
Digital Employee System
Generated on {datetime.now().strftime('%A, %B %d, %Y at %I:%M %p')}
"""
    return body


async def send_whatsapp(phone: str, message: str) -> bool:
    """Send WhatsApp message using the vault-control server API."""
    if not phone:
        logger.warning("No owner phone configured — skipping WhatsApp")
        return False
    if DRY_RUN:
        logger.info(f"[DRY-RUN] WhatsApp to {phone}: {message[:100]}...")
        return True
    try:
        import httpx
        server_url = f"http://localhost:{os.getenv('PORT', '3000')}/api/whatsapp/send"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(server_url, json={"to": phone, "message": message})
            if resp.status_code == 200:
                logger.info("Briefing sent via WhatsApp")
                return True
            logger.warning(f"WhatsApp send returned {resp.status_code}: {resp.text[:100]}")
            return False
    except ImportError:
        logger.warning("httpx not installed — can't send WhatsApp")
        return False
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")
        return False


def send_email(to: str, subject: str, body: str) -> bool:
    """Send email directly via SMTP (Gmail)."""
    if not to:
        logger.warning("No owner email configured — skipping email")
        return False
    if DRY_RUN:
        logger.info(f"[DRY-RUN] Email to {to}: {subject}")
        return True
    try:
        import smtplib
        from email.mime.text import MIMEText

        gmail_user = os.getenv("GMAIL_USER", "")
        gmail_pass = os.getenv("GMAIL_APP_PASSWORD", "")
        if not gmail_user or not gmail_pass:
            logger.warning("Gmail credentials not configured — skipping email")
            return False

        msg = MIMEText(body, "plain")
        msg["From"] = gmail_user
        msg["To"] = to
        msg["Subject"] = subject

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_pass)
            server.send_message(msg)
        logger.info(f"Briefing email sent to {to}")
        return True
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return False


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Weekly CEO Briefing Generator & Sender")
    parser.add_argument("--dry-run", action="store_true", help="Generate only, don't send")
    parser.add_argument("--force", action="store_true", help="Run even if not Monday")
    args = parser.parse_args()

    global DRY_RUN
    if args.dry_run:
        DRY_RUN = True

    today = datetime.now()

    # Only run on Monday at 10:00 unless --force
    if today.weekday() != 0 and not args.force:
        logger.info(f"Today is {today.strftime('%A')} — not Monday. Use --force to run.")
        print(f"⏭️  Today is {today.strftime('%A')}, not Monday. Skipping weekly briefing.")
        print("   Use --force to generate anyway.")
        return

    logger.info("=== Weekly CEO Briefing ===")
    print(f"\n📊 Generating Weekly CEO Briefing ({today.strftime('%A, %B %d, %Y')})...")

    # Step 1: Generate briefing
    briefing_path = generate_briefing_file(force=args.force)
    if not briefing_path:
        logger.error("Failed to generate briefing")
        print("❌ Failed to generate briefing")
        return

    print(f"✅ Briefing saved: {briefing_path}")

    # Step 2: Extract data
    data = extract_briefing_data(briefing_path)
    print(f"   Revenue: ${data['revenue']} | Tasks: {data['completed_tasks']} done, {data['blocked_tasks']} blocked")
    print(f"   Health: {data['health']} | Bottlenecks: {len(data['bottlenecks'])}")

    # Step 3: Send WhatsApp summary
    wa_msg = build_whatsapp_summary(data)
    phone = get_owner_phone()
    if phone:
        print("   📱 Sending WhatsApp summary...")
        wa_ok = await send_whatsapp(phone, wa_msg)
        print(f"   {'✅' if wa_ok else '❌'} WhatsApp: {'Sent' if wa_ok else 'Failed'}")
    else:
        print("   ⏭️  No owner phone configured — skipping WhatsApp")

    # Step 4: Send email
    email_to = get_owner_email()
    if email_to:
        print("   📧 Sending email briefing...")
        email_body = build_email_body(data)
        email_ok = send_email(email_to, data["subject"], email_body)
        print(f"   {'✅' if email_ok else '❌'} Email: {'Sent' if email_ok else 'Failed'}")
    else:
        print("   ⏭️  No owner email configured — skipping email")

    print(f"\n✅ Weekly CEO Briefing complete — {briefing_path.name}")
    logger.info("=== Weekly CEO Briefing Complete ===")


if __name__ == "__main__":
    asyncio.run(main())
