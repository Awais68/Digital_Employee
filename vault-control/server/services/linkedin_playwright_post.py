#!/usr/bin/env python3
"""Helper to post to LinkedIn via Playwright, called from Node.js"""
import sys
import os
import json

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
sys.path.insert(0, BASE_DIR)

from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin

def main():
    content = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'None' else None

    result = post_to_linkedin(content, image_path=image_path)
    print(json.dumps(result))
    sys.exit(0 if result.get('success') else 1)

if __name__ == '__main__':
    main()
