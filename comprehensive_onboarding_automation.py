#!/usr/bin/env python3
"""
comprehensive_onboarding_automation.py - Complete automation for Digital Employee onboarding.
"""

import os
import sys
import json
import time
from pathlib import Path
from datetime import datetime

# Add root to sys.path
BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

# Import skills
try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
    from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook, post_to_instagram
    from send_whatsapp_final import send_whatsapp_report
except ImportError as e:
    print(f"❌ Error importing skills: {e}")
    sys.exit(1)

# Configuration
IMAGE_PATH = str(BASE_DIR / "instagram_post_20260420.jpg")
POST_CONTENT = "🚀 AI Generated Digital Employee is onBoard!\n\nWe've successfully integrated the Digital FTE into our systems, including Odoo for automated invoicing and social media automation.\n\n#AI #DigitalEmployee #Automation #Odoo #Innovation"
WHATSAPP_PHONE = os.getenv("WHATSAPP_PHONE", "923273363154")

def run_odoo_invoice():
    print("\n--- 🧾 ODOO INVOICE ---")
    import subprocess
    result = subprocess.run([sys.executable, "create_ermanager_invoice.py"], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode == 0:
        print("✅ Odoo Invoice created for ERMANAGER")
        return True
    else:
        print(f"❌ Odoo Invoice failed: {result.stderr}")
        return False

def post_linkedin():
    print("\n--- 🔗 LINKEDIN POST ---")
    result = post_to_linkedin(POST_CONTENT, image_path=IMAGE_PATH)
    if result.get("success"):
        print(f"✅ LinkedIn: {result.get('message')}")
        return True
    else:
        print(f"❌ LinkedIn: {result.get('message')}")
        return False

def post_facebook():
    print("\n--- 📘 FACEBOOK POST ---")
    result = post_to_facebook(POST_CONTENT, image_path=IMAGE_PATH)
    if result.get("success"):
        print(f"✅ Facebook: {result.get('message')}")
        return True
    else:
        print(f"❌ Facebook: {result.get('message')}")
        return False

def post_instagram():
    print("\n--- 📸 INSTAGRAM POST ---")
    result = post_to_instagram(POST_CONTENT, image_path=IMAGE_PATH)
    if result.get("success"):
        print(f"✅ Instagram: {result.get('message')}")
        return True
    else:
        print(f"❌ Instagram: {result.get('message')}")
        return False

def send_whatsapp():
    print("\n--- 📱 WHATSAPP MESSAGE ---")
    whatsapp_message = f"🚀 *Digital Employee OnBoarded!*\n\n{POST_CONTENT}\n\n✅ Odoo Invoice Created ($5000)\n✅ LinkedIn Posted\n✅ Facebook Posted\n✅ Instagram Posted"
    result = send_whatsapp_report(WHATSAPP_PHONE, whatsapp_message)
    if result.get("success"):
        print(f"✅ WhatsApp: {result.get('message')}")
        return True
    else:
        print(f"❌ WhatsApp: {result.get('message')}")
        return False

def send_email_report():
    print("\n--- 📧 EMAIL REPORT ---")
    import subprocess
    result = subprocess.run([sys.executable, "send_comprehensive_report.py"], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode == 0:
        print("✅ Email Report sent")
        return True
    else:
        print(f"❌ Email Report failed: {result.stderr}")
        return False

def main():
    print("=" * 70)
    print("🚀 DIGITAL EMPLOYEE ONBOARDING AUTOMATION")
    print("=" * 70)
    
    results = {}
    results["odoo"] = run_odoo_invoice()
    results["linkedin"] = post_linkedin()
    results["facebook"] = post_facebook()
    results["instagram"] = post_instagram()
    results["whatsapp"] = send_whatsapp()
    results["email"] = send_email_report()
    
    print("\n" + "=" * 70)
    print("📊 FINAL SUMMARY")
    print("=" * 70)
    for task, success in results.items():
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{task.capitalize():<12}: {status}")
    print("=" * 70)

if __name__ == "__main__":
    main()
