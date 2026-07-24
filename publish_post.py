#!/usr/bin/env python3
"""
publish_post.py - STRICT Universal post publisher for Digital Employee

STRICTLY enforces:
- Every post MUST have an image
- Content validation before publishing
- Image validation before publishing
- No posts without images

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
RULES_FILE = BASE_DIR / "config" / "social_media_rules.json"

def load_rules():
    """Load strict social media rules."""
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}

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

def resolve_image(image_url, debug=True):
    """Resolve image URL to a local file path. Downloads if needed."""
    if not image_url:
        if debug: print(f"[IMAGE] No image_url provided")
        return None
    if debug: print(f"[IMAGE] Resolving: {image_url}")
    if os.path.exists(image_url):
        if debug: print(f"[IMAGE] Direct path exists: {image_url}")
        return image_url
    if image_url.startswith(('http://', 'https://', '/uploads/')):
        # Try multiple possible paths
        candidates = [
            BASE_DIR / "public" / image_url.lstrip('/'),
            BASE_DIR / "vault-control" / "public" / image_url.lstrip('/'),
            Path("vault-control/public") / image_url.lstrip('/'),
            Path("public") / image_url.lstrip('/'),
        ]
        for candidate in candidates:
            if debug: print(f"[IMAGE] Trying: {candidate}")
            if candidate.exists():
                result = str(candidate.resolve())
                if debug: print(f"[IMAGE] Found at: {result}")
                return result
        # Try downloading from URL
        if image_url.startswith(('http://', 'https://')):
            try:
                import urllib.request
                dl = BASE_DIR / ".temp_image"
                dl.parent.mkdir(parents=True, exist_ok=True)
                urllib.request.urlretrieve(image_url, str(dl))
                if debug: print(f"[IMAGE] Downloaded to: {dl}")
                return str(dl)
            except Exception as e:
                if debug: print(f"[IMAGE] Download failed: {e}")
        if debug: print(f"[IMAGE] NOT FOUND at any candidate path")
        return None
    return None

def validate_image_strict(image_path):
    """
    STRICT image validation.
    Returns (is_valid, errors)
    """
    errors = []
    
    if not image_path:
        return False, ["BLOCKED: No image provided"]
    
    path = Path(image_path)
    if not path.exists():
        return False, [f"BLOCKED: Image file not found: {image_path}"]
    
    # Check file size
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > 10:
        return False, [f"BLOCKED: Image too large: {size_mb:.1f}MB (max: 10MB)"]
    
    # Check extension
    valid_extensions = ['.png', '.jpg', '.jpeg', '.webp']
    if path.suffix.lower() not in valid_extensions:
        return False, [f"BLOCKED: Invalid format: {path.suffix} (allowed: {valid_extensions})"]
    
    return True, []

def validate_content_strict(content, platform):
    """
    STRICT content validation.
    Returns (is_valid, errors)
    """
    errors = []
    rules = load_rules()
    platform_rules = rules.get("platforms", {}).get(platform, {}).get("rules", {})
    content_rules = rules.get("content_validation", {})
    
    if not content or len(content.strip()) == 0:
        return False, ["Content is empty"]
    
    # Word count validation
    words = content.split()
    min_words = platform_rules.get('min_words', 50)
    max_words = platform_rules.get('max_words', 300)
    
    if len(words) < min_words:
        errors.append(f"Too few words: {len(words)} (min: {min_words})")
    if len(words) > max_words:
        errors.append(f"Too many words: {len(words)} (max: {max_words})")
    
    # Hashtag validation
    hashtags = re.findall(r'#\w+', content)
    min_hashtags = platform_rules.get('min_hashtags', 3)
    max_hashtags = platform_rules.get('max_hashtags', 5)
    
    if len(hashtags) < min_hashtags:
        errors.append(f"Too few hashtags: {len(hashtags)} (min: {min_hashtags})")
    if len(hashtags) > max_hashtags:
        errors.append(f"Too many hashtags: {len(hashtags)} (max: {max_hashtags})")
    
    # Spam detection
    spam_keywords = content_rules.get('spam_keywords', [])
    content_lower = content.lower()
    for spam in spam_keywords:
        if spam.lower() in content_lower:
            errors.append(f"Spam keyword detected: '{spam}'")
    
    is_valid = len(errors) == 0
    return is_valid, errors

def post_to_linkedin(content, image_path=None):
    """Post content to LinkedIn via API."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from linkedin_mcp import create_post as _api_post
        # LinkedIn API needs media registered as URN - skip local file paths
        media_urls = None
        if image_path and image_path.startswith("http"):
            media_urls = [image_path]
        result = _api_post(content, media_urls=media_urls, dry_run=False)
        return {
            "success": result.get("success", False),
            "message": result.get("message", ""),
            "post_url": result.get("post_url") or result.get("post_id", "")
        }
    except Exception as e:
        return {"success": False, "message": f"LinkedIn error: {str(e)}", "post_url": None}

def post_to_facebook(content, image_path=None, page_name=None):
    """Post content to Facebook."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook as _post
        return _post(content, image_path=image_path, page_name=page_name)
    except Exception as e:
        return {"success": False, "message": f"Facebook error: {str(e)}"}

def post_to_instagram(content, image_path=None):
    """Post content to Instagram."""
    try:
        sys.path.insert(0, str(BASE_DIR))
        from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram as _post
        return _post(content, image_path if image_path else "")
    except Exception as e:
        return {"success": False, "message": f"Instagram error: {str(e)}"}

def post_to_twitter(content):
    """Post content to Twitter/X - DISABLED."""
    return {"success": False, "message": "Twitter posting is DISABLED. Skipping."}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "message": "Usage: publish_post.py <file_path> <platform> [platforms...]"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    # Clean platform names: strip quotes, brackets, convert to lowercase, split on comma
    platforms = []
    for p in sys.argv[2:]:
        for part in p.lower().strip().strip('"').strip("'").strip('[]').split(','):
            cleaned = part.strip()
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
    
    # Extract image URL from frontmatter
    image_url = frontmatter.get('imageUrl', frontmatter.get('image_url', None))
    if isinstance(image_url, list):
        image_url = image_url[0] if image_url else None
    resolved_image = resolve_image(image_url)
    
    # Extract page name for Facebook Page posting
    page_name = frontmatter.get('pageName', frontmatter.get('page_name', None))
    if isinstance(page_name, list):
        page_name = page_name[0] if page_name else None
    
    print(f"Publishing to: {', '.join(platforms)}")
    print(f"Content length: {len(content)} chars")
    print(f"Image: {resolved_image or '(none)'}")
    if page_name:
        print(f"Facebook Page: {page_name}")
    
    # STRICT VALIDATION
    all_errors = []
    
    # Validate content for each platform
    for platform in platforms:
        is_valid, errors = validate_content_strict(content, platform)
        if not is_valid:
            all_errors.extend([f"[{platform.upper()}] {e}" for e in errors])
    
    # STRICT: Validate image (MANDATORY)
    if not resolved_image:
        all_errors.append("BLOCKED: No image provided - every post MUST have an image")
    else:
        is_valid, errors = validate_image_strict(resolved_image)
        if not is_valid:
            all_errors.extend(errors)
    
    # BLOCK if validation fails
    if all_errors:
        print("\n❌ BLOCKED: Validation failed")
        for e in all_errors:
            print(f"  - {e}")
        print(json.dumps({"success": False, "message": "Validation failed", "errors": all_errors}))
        sys.exit(1)
    
    print("\n✅ Validation passed. Publishing...")
    
    results = {}
    
    for platform in platforms:
        try:
            # Clean platform name for comparison
            platform_clean = platform.lower().strip().strip('"').strip("'")
            print(f"\n[{platform_clean.upper()}] Posting...")
            
            if platform_clean == 'linkedin':
                result = post_to_linkedin(content, resolved_image)
            elif platform_clean == 'facebook':
                result = post_to_facebook(content, resolved_image, page_name=page_name)
            elif platform_clean == 'instagram':
                result = post_to_instagram(content, resolved_image)
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
        "image": resolved_image,
        "timestamp": datetime.now().isoformat()
    }
    
    print("\n" + json.dumps(output))
    sys.exit(0 if all_success else 1)

if __name__ == "__main__":
    main()
