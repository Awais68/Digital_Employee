#!/usr/bin/env python3
"""
Post weather update to LinkedIn, Facebook, and Instagram.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))

POST_CONTENT = "The weather of Karachi Today is Very hot Stay safe ☀️🔥 #Karachi #Weather #StaySafe #Pakistan"
IMAGE_PATH = str(BASE_DIR / "instagram_post_20260420.jpg")

print("=" * 70)
print(f"🚀 POSTING: {POST_CONTENT}")
print("=" * 70)

results = {}

# 1. LinkedIn
print("\n[1/3] Posting to LinkedIn...")
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
print("\n[2/3] Posting to Facebook...")
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

# 3. Instagram (Graph API - no image needed for basic, but we'll use existing image)
print("\n[3/3] Posting to Instagram...")
try:
    from Agent_Skills.SKILL_Instagram_Graph_API import post_to_instagram_api
    res = post_to_instagram_api(
        content=POST_CONTENT,
        image_path=IMAGE_PATH,
    )
    results['instagram'] = res
    if res.get('success'):
        print(f"✅ Instagram: Success - {res.get('post_url')}")
    else:
        print(f"❌ Instagram: {res.get('message')}")
except Exception as e:
    print(f"❌ Instagram Error: {e}")
    results['instagram'] = {'success': False, 'message': str(e)}

print("\n" + "=" * 70)
print("FINAL SUMMARY")
print("=" * 70)
for platform, res in results.items():
    status = "✅" if res.get('success') else "❌"
    msg = res.get('message', 'Unknown')
    print(f"{status} {platform.capitalize()}: {msg}")
print("=" * 70)
