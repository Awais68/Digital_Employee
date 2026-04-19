#!/usr/bin/env python3
"""
Comprehensive System Test Script
Tests all major components of the Digital Employee system
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment
load_dotenv()

BASE_DIR = Path(__file__).parent.resolve()

print("=" * 80)
print("  DIGITAL EMPLOYEE - COMPREHENSIVE SYSTEM TEST")
print("=" * 80)
print(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)
print()

test_results = {
    "environment": "❌ FAIL",
    "directories": "❌ FAIL",
    "email_mcp": "❌ FAIL",
    "linkedin_mcp": "❌ FAIL",
    "odoo_connection": "❌ FAIL",
    "social_media_skills": "❌ FAIL",
}

# Test 1: Environment Configuration
print("🔍 TEST 1: Environment Configuration")
print("-" * 80)
try:
    required_vars = [
        "SENDER_EMAIL", "SENDER_NAME", "SENDER_TITLE",
        "ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD",
        "DRY_RUN"
    ]
    
    missing_vars = []
    for var in required_vars:
        value = os.getenv(var)
        if value and value != "your-litellm-api-key-here" and "your-" not in value.lower():
            print(f"  ✅ {var}: Configured")
        else:
            missing_vars.append(var)
            print(f"  ⚠️  {var}: Not configured or using default")
    
    if not missing_vars:
        test_results["environment"] = "✅ PASS"
        print("\n  ✅ All required environment variables are configured")
    else:
        print(f"\n  ⚠️  Missing/invalid: {', '.join(missing_vars)}")
        
except Exception as e:
    print(f"  ❌ Error: {str(e)}")

print()

# Test 2: Directory Structure
print("🔍 TEST 2: Directory Structure")
print("-" * 80)
try:
    required_dirs = [
        "Needs_Action", "Pending_Approval", "Approved", "Rejected", 
        "Done", "Logs", "Metrics", "Plans", "Inbox", "Briefings",
        "credentials", "tokens", "Agent_Skills", "Skills"
    ]
    
    missing_dirs = []
    for dir_name in required_dirs:
        dir_path = BASE_DIR / dir_name
        if dir_path.exists():
            print(f"  ✅ {dir_name}/")
        else:
            missing_dirs.append(dir_name)
            print(f"  ❌ {dir_name}/ - Missing")
    
    if not missing_dirs:
        test_results["directories"] = "✅ PASS"
        print("\n  ✅ All required directories exist")
    else:
        print(f"\n  ❌ Missing directories: {', '.join(missing_dirs)}")
        
except Exception as e:
    print(f"  ❌ Error: {str(e)}")

print()

# Test 3: Email MCP
print("🔍 TEST 3: Email MCP Configuration")
print("-" * 80)
try:
    gmail_email = os.getenv("GMAIL_EMAIL")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")
    
    if gmail_email and gmail_password and gmail_password != "your-gmail-app-password":
        print(f"  ✅ Gmail Email: {gmail_email}")
        print(f"  ✅ App Password: Configured (****)")
        print(f"  ✅ DRY_RUN: {os.getenv('DRY_RUN', 'true')}")
        test_results["email_mcp"] = "✅ PASS"
    else:
        print("  ⚠️  Gmail credentials not fully configured")
        print("  ⚠️  Email sending may not work")
        
except Exception as e:
    print(f"  ❌ Error: {str(e)}")

print()

# Test 4: LinkedIn MCP
print("🔍 TEST 4: LinkedIn MCP Configuration")
print("-" * 80)
try:
    linkedin_token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    linkedin_urn = os.getenv("LINKEDIN_URN")
    
    # Check for session files
    session_files = [
        "linkedin_session/cookies.json",
        "Agent_Skills/SKILL_LinkedIn_Posting.md",
        "Agent_Skills/SKILL_LinkedIn_Playwright_MCP.md"
    ]
    
    for session_file in session_files:
        file_path = BASE_DIR / session_file
        if file_path.exists():
            print(f"  ✅ {session_file}")
        else:
            print(f"  ⚠️  {session_file} - Not found")
    
    if linkedin_token and "your-" not in linkedin_token.lower():
        print("  ✅ LinkedIn Access Token: Configured")
        test_results["linkedin_mcp"] = "✅ PASS"
    else:
        print("  ⚠️  LinkedIn API credentials not configured")
        print("  ℹ️  Using Playwright browser automation instead")
        
except Exception as e:
    print(f"  ❌ Error: {str(e)}")

print()

# Test 5: Odoo Connection
print("🔍 TEST 5: Odoo ERP Connection")
print("-" * 80)
try:
    import xmlrpc.client
    
    odoo_url = os.getenv("ODOO_URL", "http://localhost:8069")
    odoo_db = os.getenv("ODOO_DB")
    odoo_username = os.getenv("ODOO_USERNAME")
    odoo_password = os.getenv("ODOO_PASSWORD")
    
    print(f"  📍 Odoo URL: {odoo_url}")
    print(f"  📍 Database: {odoo_db}")
    print(f"  📍 Username: {odoo_username}")
    
    # Test connection
    common_url = f"{odoo_url}/xmlrpc/2/common"
    common = xmlrpc.client.ServerProxy(common_url)
    
    # Get server version
    version = common.version()
    print(f"  ✅ Odoo Server Version: {version.get('server_version', 'Unknown')}")
    
    # Test authentication
    uid = common.authenticate(odoo_db, odoo_username, odoo_password, {})
    
    if uid:
        print(f"  ✅ Authentication successful (User ID: {uid})")
        test_results["odoo_connection"] = "✅ PASS"
        
        # Test database access
        models_url = f"{odoo_url}/xmlrpc/2/object"
        models = xmlrpc.client.ServerProxy(models_url)
        
        # Count customers
        customer_count = models.execute_kw(
            odoo_db, uid, odoo_password,
            'res.partner', 'search_count',
            [[['customer_rank', '>', 0]]]
        )
        print(f"  ✅ Customers in system: {customer_count}")
        
        # Count invoices
        invoice_count = models.execute_kw(
            odoo_db, uid, odoo_password,
            'account.move', 'search_count',
            [[['move_type', '=', 'out_invoice']]]
        )
        print(f"  ✅ Invoices in system: {invoice_count}")
        
    else:
        print("  ❌ Authentication failed - check credentials")
        
except Exception as e:
    print(f"  ❌ Odoo connection error: {str(e)}")
    print("  ℹ️  Make sure Odoo is running: docker-compose -f odoo-docker/docker-compose.yml up -d")

print()

# Test 6: Social Media Skills
print("🔍 TEST 6: Social Media Skills")
print("-" * 80)
try:
    social_skills = [
        "Agent_Skills/SKILL_LinkedIn_Posting.md",
        "Agent_Skills/SKILL_Facebook_Instagram_Post.md",
        "Agent_Skills/SKILL_Twitter_X_Post.md",
        "Agent_Skills/SKILL_LinkedIn_Playwright_MCP.md",
    ]
    
    skill_count = 0
    for skill_file in social_skills:
        file_path = BASE_DIR / skill_file
        if file_path.exists():
            print(f"  ✅ {skill_file}")
            skill_count += 1
        else:
            print(f"  ❌ {skill_file} - Missing")
    
    if skill_count >= 3:
        test_results["social_media_skills"] = "✅ PASS"
        print(f"\n  ✅ {skill_count}/{len(social_skills)} social media skills available")
    else:
        print(f"\n  ⚠️  Only {skill_count}/{len(social_skills)} skills available")
        
except Exception as e:
    print(f"  ❌ Error: {str(e)}")

print()

# Test 7: File System Permissions
print("🔍 TEST 7: File System Permissions")
print("-" * 80)
try:
    test_file = BASE_DIR / "Logs" / "test_write.tmp"
    test_file.write_text("test")
    test_file.unlink()
    print("  ✅ Can write to Logs/")
    
    test_file = BASE_DIR / "Metrics" / "test_write.tmp"
    test_file.write_text("test")
    test_file.unlink()
    print("  ✅ Can write to Metrics/")
    
except Exception as e:
    print(f"  ❌ Write permission error: {str(e)}")

print()

# Summary
print("=" * 80)
print("  TEST SUMMARY")
print("=" * 80)
for test_name, result in test_results.items():
    status_icon = "✅" if "PASS" in result else "❌"
    print(f"  {status_icon} {test_name.replace('_', ' ').title()}: {result}")

pass_count = sum(1 for r in test_results.values() if "PASS" in r)
total_count = len(test_results)
print(f"\n  Overall: {pass_count}/{total_count} tests passed")
print("=" * 80)

# Export results
results_file = BASE_DIR / "Logs" / f"system_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
results_content = f"""# System Test Results

**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Results

| Test | Status |
|------|--------|
"""

for test_name, result in test_results.items():
    results_content += f"| {test_name.replace('_', ' ').title()} | {result} |\n"

results_content += f"""
## Overall

**Passed:** {pass_count}/{total_count}

"""

results_file.write_text(results_content)
print(f"\n📄 Detailed results saved to: {results_file}")
