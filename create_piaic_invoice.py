#!/usr/bin/env python3
"""
Create PIAIC LED & Laptop Invoice for Student
Paid by Sir Ameen Alam — $80,000
Then send Email Report + WhatsApp Notification
"""

import os
import sys
import json
import xmlrpc.client
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.resolve()

# ─── Odoo Config ────────────────────────────────────────────────
ODOO_URL = os.getenv("ODOO_URL", "https://al-hamza.odoo.com")
ODOO_DB = os.getenv("ODOO_DB", "al-hamza")
ODOO_USERNAME = os.getenv("ODOO_USERNAME")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD")

# ─── Helper Colors ──────────────────────────────────────────────
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg, color=GREEN):
    print(f"{color}{msg}{RESET}")

# ═══════════════════════════════════════════════════════════════
# PART 1: CREATE INVOICE IN ODOO
# ═══════════════════════════════════════════════════════════════

def create_odoo_invoice():
    log("=" * 80, BLUE)
    log("  PIAIC INVOICE CREATION — LED & Laptop for Student", BLUE)
    log("=" * 80, BLUE)
    log(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", YELLOW)
    log("=" * 80, BLUE)

    if not ODOO_PASSWORD:
        log("❌ ODOO_PASSWORD not set in .env", RED)
        sys.exit(1)

    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

    # ── Authenticate ──────────────────────────────────────────
    log("\n🔐 Step 1: Authenticating...")
    try:
        uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {})
        if not uid:
            log("❌ Auth failed", RED); sys.exit(1)
        log(f"✅ Authenticated (UID: {uid})")
    except Exception as e:
        log(f"❌ Connection error: {e}", RED); sys.exit(1)

    # ── Create Customer: Sir Ameen Alam ──────────────────────
    log("\n👤 Step 2: Creating customer 'Sir Ameen Alam'...")
    customer_name = "Sir Ameen Alam"
    domain = [["name", "ilike", customer_name]]
    customer_ids = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "search", [domain])
    if customer_ids:
        customer_id = customer_ids[0]
        log(f"✅ Customer already exists (ID: {customer_id})")
    else:
        customer_id = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "create", [{
            "name": customer_name,
            "customer_rank": 1,
            "email": "ameen.alam@piaic.org",
            "phone": "+92-333-5220606",
        }])
        log(f"✅ Customer created (ID: {customer_id})")

    # ── Check/create PIAIC Student customer ──────────────────
    log("\n👤 Step 3: Creating 'PIAIC Student' as invoice partner...")
    student_name = "PIAIC Student"
    domain2 = [["name", "ilike", student_name]]
    student_ids = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "search", [domain2])
    if student_ids:
        student_partner_id = student_ids[0]
        log(f"✅ Student exists (ID: {student_partner_id})")
    else:
        student_partner_id = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "res.partner", "create", [{
            "name": student_name,
            "customer_rank": 1,
            "email": "student@piaic.org",
        }])
        log(f"✅ Student created (ID: {student_partner_id})")

    # ── Find tax ID ──────────────────────────────────────────
    tax_ids = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "account.tax", "search", [[["type_tax_use", "=", "sale"]]], {"limit": 1})
    tax_id = tax_ids[0] if tax_ids else False

    # ── Create Invoice ──────────────────────────────────────
    log("\n💰 Step 4: Creating invoice...")
    invoice_date = datetime.now().strftime("%Y-%m-%d")

    invoice_lines = [
        (0, 0, {
            "name": "PIAIC LED Display Panel for Student",
            "quantity": 1,
            "price_unit": 30000.00,
        }),
        (0, 0, {
            "name": "PIAIC Laptop for Student",
            "quantity": 1,
            "price_unit": 50000.00,
        }),
    ]

    # Add tax to both lines if found
    if tax_id:
        for line in invoice_lines:
            line[2]["tax_ids"] = [(6, 0, [tax_id])]

    invoice_vals = {
        "move_type": "out_invoice",
        "partner_id": student_partner_id,
        "invoice_date": invoice_date,
        "invoice_line_ids": invoice_lines,
        "narration": (
            "Invoice for PIAIC LED Display Panel and Laptop for Student.\n"
            "Paid by: Sir Ameen Alam\n"
            f"Invoice Date: {invoice_date}\n"
            "Total Amount: $80,000.00"
        ),
        "payment_reference": "PAID-BY-SIR-AMEEN-ALAM",
    }

    try:
        invoice_id = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "account.move", "create", [invoice_vals])
        log(f"\n✅ INVOICE CREATED SUCCESSFULLY! ID: {invoice_id}", GREEN)

        # Read back
        invoice = models.execute_kw(ODOO_DB, uid, ODOO_PASSWORD, "account.move", "read", [invoice_id], {"fields": ["name", "amount_total", "state", "invoice_date", "partner_id"]})
        log(f"   Invoice Number: {invoice[0]['name']}")
        log(f"   Amount Total: ${invoice[0]['amount_total']:,.2f}")
        log(f"   Status: {invoice[0]['state']}")
        log(f"   Partner: {invoice[0]['partner_id']}")

        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice[0]["name"],
            "amount_total": invoice[0]["amount_total"],
            "status": invoice[0]["state"],
        }
    except Exception as e:
        log(f"❌ Invoice creation failed: {e}", RED)
        return {"success": False, "error": str(e)}

# ═══════════════════════════════════════════════════════════════
# PART 2: SEND EMAIL REPORT
# ═══════════════════════════════════════════════════════════════

def send_email_report(invoice_result):
    log("\n" + "=" * 80, BLUE)
    log("  SENDING EMAIL REPORT", BLUE)
    log("=" * 80, BLUE)

    if not invoice_result.get("success"):
        log("❌ Invoice failed — skipping email", RED)
        return

    subject = "PIAIC Invoice Report — LED & Laptop for Student — $80,000"
    body = f"""
PIAIC INVOICE REPORT
{'-'*60}

Invoice #: {invoice_result['invoice_number']}
Invoice ID: {invoice_result['invoice_id']}
Amount: ${invoice_result['amount_total']:,.2f}
Status: {invoice_result['status']}
Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Items:
  - PIAIC LED Display Panel × 1  @ $30,000
  - PIAIC Laptop × 1              @ $50,000
  ---------------------------------
  Total: $80,000.00

Paid by: Sir Ameen Alam
Customer: PIAIC Student

This invoice has been successfully created in Odoo ERP.
System: Digital Employee — Odoo Gold Tier Integration
"""

    try:
        import subprocess
        cmd = [
            sys.executable, str(BASE_DIR / "email_mcp.py"),
            "send",
            "hamzajii768@gmail.com",
            subject,
            body,
        ]
        log("📧 Sending email via email_mcp.py...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            log("✅ Email report sent successfully!")
        else:
            log(f"⚠️  Email send had output: {result.stdout[-200:]}{result.stderr[-200:]}", YELLOW)
    except Exception as e:
        log(f"❌ Email send error: {e}", RED)

# ═══════════════════════════════════════════════════════════════
# PART 3: SEND WHATSAPP NOTIFICATION
# ═══════════════════════════════════════════════════════════════

def send_whatsapp_notification(invoice_result):
    log("\n" + "=" * 80, BLUE)
    log("  SENDING WHATSAPP NOTIFICATION", BLUE)
    log("=" * 80, BLUE)

    if not invoice_result.get("success"):
        log("❌ Invoice failed — skipping WhatsApp", RED)
        return

    phone = "923352204606"  # 03352204606
    message = f"""📄 *PIAIC INVOICE — CREATED SUCCESSFULLY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧾 *Invoice:* {invoice_result['invoice_number']}
💰 *Amount:* ${invoice_result['amount_total']:,.2f}
📌 *Items:* LED Display Panel + Laptop
👤 *Paid By:* Sir Ameen Alam
🎓 *For:* PIAIC Student
📅 *Date:* {datetime.now().strftime('%Y-%m-%d')}
✅ *Status:* {invoice_result['status']}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Digital Employee — Odoo Gold Tier_"""

    try:
        import subprocess
        cmd = [
            sys.executable, str(BASE_DIR / "send_whatsapp_direct.py"),
        ]
        log("📱 Sending WhatsApp via send_whatsapp_direct.py...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0:
            log("✅ WhatsApp sent! Check Logs/whatsapp_final.png for screenshot.")
        else:
            log(f"⚠️  WhatsApp output: {result.stdout[-300:]}{result.stderr[-300:]}", YELLOW)
    except Exception as e:
        log(f"❌ WhatsApp error: {e}", RED)

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    log("\n🚀 PIAIC Invoice Automation — Starting...", BLUE)
    log("=" * 80, BLUE)

    # Step 1: Create invoice in Odoo
    invoice_result = create_odoo_invoice()
    print(json.dumps(invoice_result, indent=2))

    if not invoice_result.get("success"):
        log("\n❌ Invoice creation failed. Aborting.", RED)
        sys.exit(1)

    # Step 2: Send email report
    send_email_report(invoice_result)

    # Step 3: Send WhatsApp
    send_whatsapp_notification(invoice_result)

    log("\n" + "=" * 80, GREEN)
    log("  ✅ ALL TASKS COMPLETED SUCCESSFULLY!", GREEN)
    log("=" * 80, GREEN)

if __name__ == "__main__":
    main()
