#!/usr/bin/env python3
"""
Quick Gmail SMTP connection test
"""

import os
import smtplib
from dotenv import load_dotenv

load_dotenv('.env', override=True)

sender_email = os.getenv("SENDER_EMAIL") or os.getenv("GMAIL_EMAIL")
sender_password = os.getenv("GMAIL_APP_PASSWORD") or os.getenv("EMAIL_PASSWORD")

print("=" * 60)
print("  GMAIL SMTP CONNECTION TEST")
print("=" * 60)
print(f"\n📧 Sender Email: {sender_email}")
print(f"🔑 App Password: {'*' * 16}")
print(f"🌐 SMTP Server: smtp.gmail.com:587")
print()

try:
    print("🔍 Testing SMTP connection...")
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    print("✅ TLS connection established")
    
    print("🔐 Authenticating...")
    server.login(sender_email, sender_password)
    print("✅ Authentication successful!")
    
    print("\n" + "=" * 60)
    print("  ✅ GMAIL CONNECTION WORKING!")
    print("=" * 60)
    
    server.quit()
    
except smtplib.SMTPAuthenticationError as e:
    print(f"\n❌ Authentication FAILED!")
    print(f"   Error: {str(e)}")
    print("\n📋 Solution:")
    print("   1. Visit: https://myaccount.google.com/apppasswords")
    print("   2. Generate a NEW app password")
    print("   3. Update .env file: GMAIL_APP_PASSWORD=new-password")
    
except Exception as e:
    print(f"\n❌ Connection failed: {str(e)}")
