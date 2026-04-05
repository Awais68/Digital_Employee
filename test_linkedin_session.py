#!/usr/bin/env python3
"""
test_linkedin_post.py - Quick test to verify LinkedIn session works

This script tests your LinkedIn connection without actually posting.
"""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from linkedin_mcp import LinkedInMCP

def main():
    print("=" * 60)
    print("🧪 LinkedIn Session Test")
    print("=" * 60)
    
    # Create MCP instance
    mcp = LinkedInMCP()
    
    # Check session
    print(f"\n📊 Session Status:")
    print(f"   Access Token: {'✅ Loaded' if mcp.access_token else '❌ Missing'}")
    print(f"   Refresh Token: {'✅ Loaded' if mcp.refresh_token and mcp.refresh_token != 'your_linkedin_refresh_token' else '⚠️  Placeholder (will auto-refresh for 30 days)'}")
    print(f"   Person URN: {'✅ ' + mcp.person_urn if mcp.person_urn else '❌ Missing'}")
    
    # Test connection
    print(f"\n🔍 Testing LinkedIn API connection...")
    result = mcp.test_connection()
    
    if result['success']:
        print(f"\n✅ SUCCESS! {result['message']}")
        print(f"\nYour session is working perfectly!")
        print(f"You can now post to LinkedIn without any login.")
    else:
        print(f"\n❌ Connection test failed: {result['message']}")
        print(f"\nTroubleshooting:")
        print(f"   1. Check your internet connection")
        print(f"   2. Verify tokens in .env file")
        print(f"   3. Run: python3 linkedin_mcp.py session-status")
    
    print("=" * 60)

if __name__ == "__main__":
    main()
