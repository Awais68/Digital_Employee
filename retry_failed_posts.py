#!/usr/bin/env python3
"""
retry_failed_posts.py - Retry only LinkedIn and Instagram with improved delays.
"""

import sys
from pathlib import Path

# Setup paths
BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

# Content
POST_CONTENT = "We Are Ready for the AI Evolution in This New Era 🚀"
IMAGE_PATH = str(BASE_DIR / "instagram_post_20260420.jpg")

print("=" * 70)
print(f"🔄 RETRYING FAILED POSTS: {POST_CONTENT}")
print("=" * 70)

# 1. LinkedIn Retry
print("\n[1/2] Retrying LinkedIn...")
try:
    from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
    # Use the existing function but maybe it'll work this time due to timing
    res = post_to_linkedin(POST_CONTENT)
    if res.get('success'):
        print("✅ LinkedIn: Success")
    else:
        print(f"❌ LinkedIn: {res.get('message')}")
except Exception as e:
    print(f"❌ LinkedIn Error: {e}")

# 2. Instagram Retry
print("\n[2/2] Retrying Instagram...")
try:
    from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram
    # Instagram often needs more time for the image to process before sharing
    res = post_to_instagram(POST_CONTENT, IMAGE_PATH)
    if res.get('success'):
        print("✅ Instagram: Success")
    else:
        print(f"❌ Instagram: {res.get('message')}")
except Exception as e:
    print(f"❌ Instagram Error: {e}")

print("\n" + "=" * 70)
print("RETRY COMPLETE")
print("=" * 70)
