#!/usr/bin/env python3
"""
SKILL_Gemini_Content.py - STRICT Social Media Content Generator

STRICTLY enforces rules for every post:
- Every post MUST have proper formatting
- Every post MUST have hashtags (platform-specific count)
- Every post MUST have emojis
- Every post MUST have an image (via Canva)
- No spam keywords allowed
- Content validation before publishing

Usage:
    from Agent_Skills.SKILL_Gemini_Content import generate_post_content, validate_post
    
    content = generate_post_content(topic, platform='linkedin')
    is_valid, errors = validate_post(content, platform='linkedin')
"""

import os
import json
import re
import requests
from pathlib import Path
import google.generativeai as genai

# Load API key
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
UNSPLASH_KEY = os.getenv('UNSPLASH_API_KEY', '')

# Load rules
RULES_FILE = Path(__file__).resolve().parent.parent / "config" / "social_media_rules.json"

def load_rules():
    """Load strict social media rules."""
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}

def get_platform_rules(platform):
    """Get rules for specific platform."""
    rules = load_rules()
    return rules.get("platforms", {}).get(platform, {}).get("rules", {})

def generate_topic_options(industry='AI & Technology', count=5):
    """Generate topic options with engagement potential."""
    model = genai.GenerativeModel('gemini-pro')
    prompt = f'''
Generate {count} engaging {industry} post topics that are:
- Trending and highly relevant in 2026
- Professional but engaging
- Suitable for Pakistani tech audience
- Have high engagement potential
- Can be paired with professional images

Return as JSON array:
[{{"topic": "...", "angle": "...", "hook": "...", "image_concept": "..."}}]
'''
    response = model.generate_content(prompt)
    try:
        return json.loads(response.text)
    except:
        return [{"topic": topic, "angle": "Professional insight", "hook": "Key takeaway", "image_concept": "Modern tech visual"} for topic in industry.split(",")]

def generate_post_content(topic, platform='linkedin'):
    """
    Generate post content with STRICT rule enforcement.
    Every post MUST follow platform rules exactly.
    """
    rules = get_platform_rules(platform)
    
    if not rules:
        raise ValueError(f"No rules found for platform: {platform}")
    
    # Build strict prompt based on rules
    prompt = f'''
Write a {platform} post about: {topic}

STRICT RULES (MUST FOLLOW ALL):
- Tone: {rules.get('tone', 'professional')}
- Word count: {rules.get('min_words', 50)}-{rules.get('max_words', 300)} words
- Hashtags: {rules.get('min_hashtags', 3)}-{rules.get('max_hashtags', 5)} hashtags at the end
- Emojis: {'Required' if rules.get('require_emojis', True) else 'Optional'} - use them as bullet points
- Line breaks: {'Required' if rules.get('require_line_breaks', True) else 'Optional'} - use between paragraphs
- Hook: {'First line must be attention-grabbing' if rules.get('require_hook_first_line', True) else 'Optional'}
- CTA: {'End with question or call-to-action' if rules.get('require_call_to_action', True) else 'Optional'}

STRUCTURE (MUST FOLLOW):
1. HOOK (First line) - Attention grabber
2. BODY (2-4 paragraphs) - With line breaks and emojis
3. HASHTAGS (At end) - {rules.get('min_hashtags', 3)}-{rules.get('max_hashtags', 5)} relevant hashtags
4. CTA (Last line) - Question or call-to-action

FORBIDDEN (DO NOT USE):
{chr(10).join(['- ' + word for word in rules.get('forbidden_words', [])])}

EXAMPLE FORMAT:
[Hook line with emoji]

[Paragraph 1 with emoji bullet points]

[Paragraph 2 with more insights]

[Question or CTA]

[3-5 hashtags]

Write the post now:
'''
    
    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)
    content = response.text.strip()
    
    # Post-generation validation
    is_valid, errors = validate_post(content, platform)
    
    if not is_valid:
        print(f"[RULES] Content validation failed: {errors}")
        print(f"[RULES] Regenerating with stricter prompt...")
        
        # Regenerate with even stricter prompt
        strict_prompt = f'''
Write a {platform} post about: {topic}

CRITICAL RULES (VIOLATION = REJECTION):
1. EXACTLY {rules.get('min_words', 50)}-{rules.get('max_words', 300)} words
2. EXACTLY {rules.get('min_hashtags', 3)}-{rules.get('max_hashtags', 5)} hashtags at the END
3. MUST have emojis (at least 3-5)
4. MUST have line breaks between paragraphs
5. MUST start with attention-grabbing hook
6. MUST end with question or CTA
7. NO forbidden words: {', '.join(rules.get('forbidden_words', []))}

WRITE NOW:
'''
        response = model.generate_content(strict_prompt)
        content = response.text.strip()
    
    return content

def validate_post(content, platform):
    """
    STRICTLY validate post content against rules.
    Returns (is_valid, list_of_errors)
    """
    rules = get_platform_rules(platform)
    content_rules = load_rules().get("content_validation", {})
    errors = []
    
    if not content or len(content.strip()) == 0:
        return False, ["Content is empty"]
    
    # Word count validation
    words = content.split()
    min_words = rules.get('min_words', 50)
    max_words = rules.get('max_words', 300)
    
    if len(words) < min_words:
        errors.append(f"Too few words: {len(words)} (min: {min_words})")
    if len(words) > max_words:
        errors.append(f"Too many words: {len(words)} (max: {max_words})")
    
    # Hashtag validation
    hashtags = re.findall(r'#\w+', content)
    min_hashtags = rules.get('min_hashtags', 3)
    max_hashtags = rules.get('max_hashtags', 5)
    
    if len(hashtags) < min_hashtags:
        errors.append(f"Too few hashtags: {len(hashtags)} (min: {min_hashtags})")
    if len(hashtags) > max_hashtags:
        errors.append(f"Too many hashtags: {len(hashtags)} (max: {max_hashtags})")
    
    # Emoji validation
    if rules.get('require_emojis', True):
        emoji_pattern = re.compile("["
            u"\U0001F600-\U0001F64F"
            u"\U0001F300-\U0001F5FF"
            u"\U0001F680-\U0001F6FF"
            u"\U0001F1E0-\U0001F1FF"
            u"\U00002702-\U000027B0"
            u"\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE)
        
        emojis_found = emoji_pattern.findall(content)
        if len(emojis_found) < 2:
            errors.append(f"Too few emojis: {len(emojis_found)} (min: 2)")
    
    # Forbidden words validation
    forbidden = rules.get('forbidden_words', [])
    content_lower = content.lower()
    for word in forbidden:
        if word.lower() in content_lower:
            errors.append(f"Forbidden word found: '{word}'")
    
    # Spam detection
    spam_keywords = content_rules.get('spam_keywords', [])
    for spam in spam_keywords:
        if spam.lower() in content_lower:
            errors.append(f"Spam keyword detected: '{spam}'")
    
    # Line break validation
    if rules.get('require_line_breaks', True):
        if '\n' not in content:
            errors.append("No line breaks found (required)")
    
    is_valid = len(errors) == 0
    return is_valid, errors

def generate_post_image(topic, style='professional'):
    """
    Generate image for post using Canva (primary) or Unsplash (fallback).
    Every post MUST have an image.
    """
    try:
        # Try Canva first
        from canva_image_generator import ensure_image_exists
        image_path, status = ensure_image_exists(topic, style=style)
        if image_path:
            return image_path
    except ImportError:
        print("[CANVA] Canva module not available, using fallback")
    
    # Fallback to Unsplash
    if UNSPLASH_KEY:
        try:
            query = '+'.join(topic.split()[:3])
            url = f"https://api.unsplash.com/photos/random?query={query}&client_id={UNSPLASH_KEY}"
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                img_url = response.json()['urls']['regular']
                img_data = requests.get(img_url).content
                image_path = Path('generated_images') / f"{topic[:20].replace(' ', '_')}.jpg"
                image_path.parent.mkdir(exist_ok=True)
                image_path.write_bytes(img_data)
                return str(image_path)
        except Exception as e:
            print(f"[UNSPLASH] Error: {e}")
    
    # STRICT: Return None if no image (will block post)
    print(f"[ERROR] No image generated for: {topic}")
    print(f"[ERROR] Post will be BLOCKED without image")
    return None

def generate_complete_post(topic, platform='linkedin'):
    """
    Generate COMPLETE post with content AND image.
    STRICT: Both content AND image are mandatory.
    """
    # Generate content
    content = generate_post_content(topic, platform)
    
    # Validate content
    is_valid, errors = validate_post(content, platform)
    if not is_valid:
        return {
            "success": False,
            "error": "Content validation failed",
            "errors": errors
        }
    
    # Generate image (MANDATORY)
    image_path = generate_post_image(topic)
    
    if not image_path:
        return {
            "success": False,
            "error": "Image generation failed - POST BLOCKED",
            "content": content,
            "image_required": True
        }
    
    return {
        "success": True,
        "content": content,
        "image": image_path,
        "platform": platform,
        "topic": topic,
        "validation": "passed"
    }

if __name__ == "__main__":
    # Test the generator
    test_topic = "AI in Healthcare: Transforming Patient Care"
    
    print(f"Testing STRICT post generation...")
    print(f"Topic: {test_topic}")
    print(f"Platform: linkedin")
    
    result = generate_complete_post(test_topic, 'linkedin')
    
    if result["success"]:
        print(f"\n✅ Post generated successfully!")
        print(f"Content:\n{result['content']}")
        print(f"\nImage: {result['image']}")
    else:
        print(f"\n❌ Post generation failed!")
        print(f"Error: {result['error']}")
        if 'errors' in result:
            for e in result['errors']:
                print(f"  - {e}")
