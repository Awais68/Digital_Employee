#!/usr/bin/env python3
"""
post_linkedin_direct.py - Direct LinkedIn Post via Playwright

Posts "This is Digital FTE Test Post" to LinkedIn using Playwright MCP.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

print("=" * 70)
print("  LINKEDIN POST - PLAYWRIGHT MCP")
print("=" * 70)
print()

POST_CONTENT = "This is Digital FTE Test Post"

print(f"📝 Post Content: {POST_CONTENT}")
print()

try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
    
    print("🚀 Posting to LinkedIn via Playwright...")
    print("-" * 70)
    
    result = post_to_linkedin(POST_CONTENT)
    
    print()
    print("-" * 70)
    
    if result.get("success"):
        print("✅ LinkedIn post published successfully!")
        print(f"   Message: {result.get('message', 'N/A')}")
        print(f"   URL: {result.get('url', 'N/A')}")
        success = True
    else:
        print(f"❌ LinkedIn post failed: {result.get('message', 'Unknown error')}")
        success = False
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    success = False

print()
print("=" * 70)

if success:
    print("✅ SUCCESS - Post published to LinkedIn")
    sys.exit(0)
else:
    print("❌ FAILED - Could not publish to LinkedIn")
    sys.exit(1)
