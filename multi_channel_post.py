#!/usr/bin/env python3
"""
multi_channel_post.py - Post to LinkedIn, Facebook, Instagram, WhatsApp, and Email.
"""

import sys
import os
from pathlib import Path

# Setup paths
BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

# Content
POST_CONTENT = "We Are Ready for the AI Evolution in This New Era 🚀"
IMAGE_PATH = str(BASE_DIR / "instagram_post_20260420.jpg")
EMAIL_RECIPIENT = "owaisniaz596@gmail.com"
WHATSAPP_PHONE = os.getenv("WHATSAPP_PHONE", "923273363154")

print("=" * 70)
print(f"🚀 MULTI-CHANNEL POST: {POST_CONTENT}")
print("=" * 70)

results = {}

# 1. LinkedIn
print("\n[1/5] Posting to LinkedIn...")
try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
    res = post_to_linkedin(POST_CONTENT)
    results['linkedin'] = res
    if res.get('success'):
        print("✅ LinkedIn: Success")
    else:
        print(f"❌ LinkedIn: {res.get('message')}")
except Exception as e:
    print(f"❌ LinkedIn Error: {e}")
    results['linkedin'] = {'success': False, 'message': str(e)}

# 2. Facebook
print("\n[2/5] Posting to Facebook...")
try:
    from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook
    res = post_to_facebook(POST_CONTENT)
    results['facebook'] = res
    if res.get('success'):
        print("✅ Facebook: Success")
    else:
        print(f"❌ Facebook: {res.get('message')}")
except Exception as e:
    print(f"❌ Facebook Error: {e}")
    results['facebook'] = {'success': False, 'message': str(e)}

# 3. Instagram
print("\n[3/5] Posting to Instagram...")
try:
    from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram
    res = post_to_instagram(POST_CONTENT, IMAGE_PATH)
    results['instagram'] = res
    if res.get('success'):
        print("✅ Instagram: Success")
    else:
        print(f"❌ Instagram: {res.get('message')}")
except Exception as e:
    print(f"❌ Instagram Error: {e}")
    results['instagram'] = {'success': False, 'message': str(e)}

# 4. WhatsApp
print("\n[4/5] Sending WhatsApp...")
try:
    from send_whatsapp_direct import send_whatsapp_via_web
    res = send_whatsapp_via_web(WHATSAPP_PHONE, POST_CONTENT)
    results['whatsapp'] = res
    if res.get('success'):
        print(f"✅ WhatsApp: Success (sent to {WHATSAPP_PHONE})")
    else:
        print(f"❌ WhatsApp: {res.get('message')}")
except Exception as e:
    print(f"❌ WhatsApp Error: {e}")
    results['whatsapp'] = {'success': False, 'message': str(e)}

# 5. Email
print("\n[5/5] Sending Email...")
try:
    from email_mcp import send_email
    subject = "Digital Employee: AI Evolution Post Notification"
    body = f"Greetings,\n\nThe following post has been published across all channels:\n\n\"{POST_CONTENT}\"\n\nPlatforms: LinkedIn, Facebook, Instagram, WhatsApp.\n\nSent via Digital Employee System."
    res = send_email(to=EMAIL_RECIPIENT, subject=subject, body=body)
    results['email'] = res
    if res.get('success'):
        print(f"✅ Email: Success (sent to {EMAIL_RECIPIENT})")
    else:
        print(f"❌ Email: {res.get('message')}")
except Exception as e:
    print(f"❌ Email Error: {e}")
    results['email'] = {'success': False, 'message': str(e)}

print("\n" + "=" * 70)
print("FINAL SUMMARY")
print("=" * 70)
for platform, res in results.items():
    status = "✅" if res.get('success') else "❌"
    print(f"{status} {platform.capitalize()}: {res.get('message')}")
print("=" * 70)
