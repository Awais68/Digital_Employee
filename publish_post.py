#!/usr/bin/env python3
"""
publish_post.py - Universal post publisher for Digital Employee
Reads a post from vault, publishes to platforms, moves to Done.

Usage:
    python3 publish_post.py <post_file_path> <platform> [platform2 ...]
    
Example:
    python3 publish_post.py "/path/to/Pending_Approval/POST_123_LINKEDIN.md" linkedin
"""

import os
import sys
import json
import re
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
VAULT_PATH = BASE_DIR

def parse_frontmatter(content):
    """Parse YAML frontmatter from markdown file."""
    match = re.match(r'^---\n([\s\S]*?)\n---', content)
    if not match:
        return {}, content
    
    frontmatter = {}
    for line in match.group(1).split('\n'):
        if ':' in line:
            key, val = line.split(':', 1)
            # Clean the value: strip quotes, brackets, and whitespace
            val = val.strip().strip('"').strip("'").strip('[]')
            # Handle comma-separated platforms
            if ',' in val:
                val = [p.strip().strip('"').strip("'") for p in val.split(',')]
            frontmatter[key.strip()] = val
    
    body = content[match.end():].strip()
    return frontmatter, body

def post_to_linkedin(content):
    """Post content to LinkedIn."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin as _post
        return _post(content)
    except Exception as e:
        return {"success": False, "message": f"LinkedIn error: {str(e)}", "post_url": None}

def post_to_facebook(content):
    """Post content to Facebook."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook as _post
        return _post(content)
    except Exception as e:
        return {"success": False, "message": f"Facebook error: {str(e)}"}

def post_to_instagram(content, image_path=None):
    """Post content to Instagram."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram as _post
        return _post(content, image_path)
    except Exception as e:
        return {"success": False, "message": f"Instagram error: {str(e)}"}

def post_to_twitter(content):
    """Post content to Twitter/X - placeholder."""
    return {"success": False, "message": "Twitter posting not implemented yet"}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "message": "Usage: publish_post.py <file_path> <platform> [platforms...]"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    # Clean platform names: strip quotes, brackets, convert to lowercase
    platforms = []
    for p in sys.argv[2:]:
        cleaned = p.lower().strip().strip('"').strip("'").strip('[]')
        if cleaned:
            platforms.append(cleaned)
    
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "message": f"File not found: {file_path}"}))
        sys.exit(1)
    
    # Read and parse file
    with open(file_path, 'r', encoding='utf-8') as f:
        raw_content = f.read()
    
    frontmatter, content = parse_frontmatter(raw_content)
    
    if not content or len(content.strip()) == 0:
        print(json.dumps({"success": False, "message": "Post content is empty"}))
        sys.exit(1)
    
    print(f"Publishing to: {', '.join(platforms)}")
    print(f"Content length: {len(content)} chars")
    
    results = {}
    default_image = BASE_DIR / "instagram_post_20260420.jpg"
    
    for platform in platforms:
        try:
            # Clean platform name for comparison
            platform_clean = platform.lower().strip().strip('"').strip("'")
            print(f"\n[{platform_clean.upper()}] Posting...")
            
            if platform_clean == 'linkedin':
                result = post_to_linkedin(content)
            elif platform_clean == 'facebook':
                result = post_to_facebook(content)
            elif platform_clean == 'instagram':
                img = str(default_image) if default_image.exists() else None
                result = post_to_instagram(content, img)
            elif platform_clean == 'twitter':
                result = post_to_twitter(content)
            else:
                result = {"success": False, "message": f"Unknown platform: {platform} (valid: linkedin, facebook, instagram, twitter)"}
            
            results[platform] = result
            print(f"[{platform.upper()}] Result: {json.dumps(result)}")
            
        except Exception as e:
            results[platform] = {"success": False, "message": str(e)}
            print(f"[{platform.upper()}] Error: {e}")
    
    # Determine overall success
    all_success = all(r.get("success", False) for r in results.values())
    
    # Output results as JSON
    output = {
        "success": all_success,
        "results": results,
        "platforms": platforms,
        "timestamp": datetime.now().isoformat()
    }
    
    print("\n" + json.dumps(output))
    sys.exit(0 if all_success else 1)

if __name__ == "__main__":
    main()
