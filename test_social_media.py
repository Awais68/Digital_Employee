#!/usr/bin/env python3
"""
test_social_media.py - Comprehensive test for Facebook & Instagram integration
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook, post_to_instagram

print("=" * 70)
print("  SOCIAL MEDIA INTEGRATION TEST")
print("=" * 70)

# Test 1: Facebook Post
print("\n📘 TEST 1: Facebook Post")
print("-" * 70)

fb_result = post_to_facebook(
    content="🚀 Digital Employee AI System - Live Test!\n\nSuccessfully integrated Facebook posting capability!\n\n#AI #Automation #DigitalEmployee #Innovation",
    image_path=None,
    link_url=None
)

print(f"Status: {'✅ SUCCESS' if fb_result['success'] else '❌ FAILED'}")
print(f"Message: {fb_result['message']}")
print(f"Post URL: {fb_result.get('post_url', 'N/A')}")

# Test 2: Instagram Post
print("\n📸 TEST 2: Instagram Post")
print("-" * 70)

# Create test image path
test_image = "/tmp/test_instagram.jpg"
if not Path(test_image).exists():
    print("⚠️  Creating test image...")
    # Create minimal JPEG
    with open(test_image, 'wb') as f:
        f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' \",#\x1c\x1c(7teletext7(teletext\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0\$3br\x82\t\n\x16\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd4\xff\xd9')
    print("✅ Test image created")

ig_result = post_to_instagram(
    content="🚀 Digital Employee AI System - Live Test!\n\nSuccessfully integrated Instagram posting capability!\n\n#AI #Automation #DigitalEmployee #Innovation",
    image_path=test_image,
    post_type="feed"
)

print(f"Status: {'✅ SUCCESS' if ig_result['success'] else '❌ FAILED'}")
print(f"Message: {ig_result['message']}")
print(f"Post URL: {ig_result.get('post_url', 'N/A')}")

# Summary
print("\n" + "=" * 70)
print("  TEST SUMMARY")
print("=" * 70)
print(f"  Facebook:  {'✅ OPERATIONAL' if fb_result['success'] else '❌ NOT WORKING'}")
print(f"  Instagram: {'✅ OPERATIONAL' if ig_result['success'] else '⚠️  NEEDS ATTENTION'}")
print("=" * 70)

if fb_result['success']:
    print("\n🎉 Facebook integration is FULLY OPERATIONAL!")
    print("   Session saved permanently in: facebook_session/cookies.json")
    print("   Ready for production use")

if ig_result['success']:
    print("\n🎉 Instagram integration is FULLY OPERATIONAL!")
    print("   Session saved permanently in: instagram_session/cookies.json")
    print("   Ready for production use")

print("\n📝 Next Steps:")
print("   1. Sessions are saved permanently")
print("   2. Use orchestrator.py to automate posting")
print("   3. Place posts in Needs_Action/ for automatic processing")
print("   4. Check Pending_Approval/ for human review workflow")
print("=" * 70 + "\n")
