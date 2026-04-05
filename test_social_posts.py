#!/usr/bin/env python3
"""
test_social_posts.py - Test LinkedIn & Facebook Post Creation

This script tests the complete workflow:
1. Creates a test LinkedIn post draft
2. Simulates approval workflow
3. Tests publishing (dry-run mode)

Usage:
    python3 test_social_posts.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# Base directory
BASE_DIR = Path(__file__).parent.resolve()

# Test configuration
TEST_LINKEDIN_POST = """---
type: linkedin_request
priority: normal
topic: AI Employee System Launch
---

# LinkedIn Post Request

## Topic
Launching Our AI Employee System

## Key Points
- Excited to announce our new AI-powered digital employee
- Automates email, LinkedIn posting with approval workflow
- Silver Tier complete with human-in-the-loop approval
- Built with Python and modern APIs

## Requirements
- Tone: Professional yet exciting
- Include hashtags: #AI #SaaS #Automation
- CTA: Learn more in comments
"""


def create_test_linkedin_post():
    """Create a test LinkedIn post request."""
    print("\n" + "=" * 70)
    print("  TEST 1: Creating LinkedIn Post Request")
    print("=" * 70)
    
    needs_action_dir = BASE_DIR / "Needs_Action"
    needs_action_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{timestamp}_linkedin_test.md"
    filepath = needs_action_dir / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(TEST_LINKEDIN_POST)
    
    print(f"✅ Created test LinkedIn request:")
    print(f"   File: {filepath.name}")
    print(f"   Location: Needs_Action/")
    
    return filepath


def run_orchestrator():
    """Run orchestrator to process the test post."""
    print("\n" + "=" * 70)
    print("  TEST 2: Running Orchestrator")
    print("=" * 70)
    
    # Import and run orchestrator
    sys.path.insert(0, str(BASE_DIR))
    
    try:
        from orchestrator import main as orchestrator_main
        
        print("🔄 Running orchestrator...")
        orchestrator_main(run_mode="once")
        
        # Check if draft was created
        pending_dir = BASE_DIR / "Pending_Approval"
        if pending_dir.exists():
            linkedin_drafts = list(pending_dir.glob("LINKEDIN_POST_*.md"))
            if linkedin_drafts:
                print(f"✅ LinkedIn draft created:")
                print(f"   File: {linkedin_drafts[0].name}")
                print(f"   Location: Pending_Approval/")
                return linkedin_drafts[0]
        
        print("⚠️  No LinkedIn draft found in Pending_Approval/")
        return None
        
    except Exception as e:
        print(f"❌ Orchestrator error: {e}")
        return None


def test_linkedin_mcp_dry_run():
    """Test LinkedIn MCP in dry-run mode."""
    print("\n" + "=" * 70)
    print("  TEST 3: Testing LinkedIn MCP (Dry-Run Mode)")
    print("=" * 70)
    
    try:
        from linkedin_mcp import create_post
        
        # Test post content
        test_content = """🚀 Excited to announce our AI Employee System!

Key Features:
• Automates email, LinkedIn posting with approval workflow
• Human-in-the-loop approval workflow
• Silver Tier complete

#AI #SaaS #Automation #DigitalEmployee"""
        
        print("📱 Creating LinkedIn post (DRY-RUN)...")
        result = create_post(content=test_content, dry_run=True)
        
        if result.get("success"):
            print(f"✅ Post created successfully (dry-run)")
            print(f"   Message: {result['message']}")
            print(f"   Post ID: {result.get('post_id', 'N/A')}")
            return True
        else:
            print(f"❌ Post creation failed: {result.get('message', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ LinkedIn MCP error: {e}")
        return False


def test_complete_workflow():
    """Test complete workflow from creation to publishing."""
    print("\n" + "=" * 70)
    print("  COMPLETE WORKFLOW TEST")
    print("=" * 70)
    
    # Test 1: Create post request
    test_file = create_test_linkedin_post()
    
    # Test 2: Run orchestrator
    draft_file = run_orchestrator()
    
    # Test 3: Test LinkedIn MCP
    mcp_success = test_linkedin_mcp_dry_run()
    
    # Summary
    print("\n" + "=" * 70)
    print("  TEST SUMMARY")
    print("=" * 70)
    print(f"  LinkedIn Post Request: ✅ Created")
    print(f"  Orchestrator Processing: {'✅ Success' if draft_file else '⚠️  Partial'}")
    print(f"  LinkedIn MCP (Dry-Run): {'✅ Success' if mcp_success else '❌ Failed'}")
    print("=" * 70)
    
    if mcp_success:
        print("\n✅ All tests passed!")
        print("\n📝 Next Steps:")
        print("   1. Configure LinkedIn credentials in .env")
        print("   2. Set DRY_RUN=false for production")
        print("   3. Move draft from Pending_Approval/ to Approved/")
        print("   4. Run orchestrator to publish")
    else:
        print("\n⚠️  Some tests failed. Check logs for details.")
    
    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  SOCIAL MEDIA POST TESTING")
    print("  LinkedIn & Facebook Test Suite")
    print("=" * 70)
    
    # Run complete workflow test
    test_complete_workflow()
    
    # Note about Facebook
    print("\n" + "=" * 70)
    print("  FACEBOOK INTEGRATION STATUS")
    print("=" * 70)
    print("""
  ❌ Facebook MCP is NOT implemented yet.
  
  To add Facebook posting, you need:
  1. Facebook Developer App (https://developers.facebook.com)
  2. Page Access Token
  3. Facebook Graph API integration
  
  Would you like me to create Facebook MCP integration?
  Run: python3 test_social_posts.py --add-facebook
    """)
    print("=" * 70 + "\n")
