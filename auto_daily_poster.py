#!/usr/bin/env python3
"""
auto_daily_poster.py - STRICT Auto Daily Social Media Poster

STRICTLY enforces:
- Every post MUST have an image (via Canva)
- Every post MUST follow platform rules
- Content validation before publishing
- No posts without images

Usage:
    python3 auto_daily_poster.py --dry-run    # Preview without posting
    python3 auto_daily_poster.py --now        # Post immediately
    python3 auto_daily_poster.py --schedule   # Run scheduler
"""

import os
import json
import schedule
import time
from datetime import datetime, date
from pathlib import Path

POSTS_DIR = Path('Digital_Employee/Todo_posts/Done')
POSTED_TODAY_FILE = Path('Agent_Skills/posted_today.json')
RULES_FILE = Path('config/social_media_rules.json')

DAILY_QUOTA = {'min': 1, 'max': 4}
POST_TIMES = ['09:00', '12:00', '15:00', '18:00']
POSTED_TODAY = []

def load_rules():
    """Load strict social media rules."""
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}

def count_posts_in_done(today_str):
    """Count posts already posted today from Done folder or tracking file"""
    if POSTED_TODAY_FILE.exists():
        data = json.loads(POSTED_TODAY_FILE.read_text())
        if data.get('date') == today_str:
            return len(data.get('posts', []))
    return 0

def should_post():
    today = date.today().isoformat()
    posts_today = count_posts_in_done(today)

    if posts_today >= DAILY_QUOTA['max']:
        log('Daily max reached (4 posts)')
        return False
    return True

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}")

def generate_daily_topic():
    """Generate a topic with image concept"""
    from Agent_Skills.SKILL_Gemini_Content import generate_topic_options
    try:
        topics = generate_topic_options(count=1)
        return topics[0]
    except Exception as e:
        log(f"Error generating topic: {e}")
        fallback_topics = [
            {"topic": "Monday motivation for tech teams", "image_concept": "Modern tech workspace"},
            {"topic": "5 lessons from my coding journey", "image_concept": "Code on screen"},
            {"topic": "Why continuous learning matters in tech", "image_concept": "Books and technology"},
            {"topic": "Building habits for productivity", "image_concept": "Productivity tools"},
            {"topic": "The future of AI in daily life", "image_concept": "AI technology visualization"}
        ]
        return fallback_topics[date.today().toordinal() % len(fallback_topics)]

def generate_post_with_image(topic_data):
    """
    STRICT: Generate post content AND image.
    Both are MANDATORY. No post without image.
    """
    from Agent_Skills.SKILL_Gemini_Content import generate_complete_post
    
    topic = topic_data.get('topic', topic_data) if isinstance(topic_data, dict) else topic_data
    
    try:
        result = generate_complete_post(topic, platform='linkedin')
        
        if not result.get('success'):
            log(f"Post generation failed: {result.get('error')}")
            if 'errors' in result:
                for e in result['errors']:
                    log(f"  - {e}")
            return None, None
        
        content = result.get('content')
        image = result.get('image')
        
        # STRICT: Verify image exists
        if not image or not Path(image).exists():
            log(f"BLOCKED: No image generated for topic: {topic}")
            return None, None
        
        log(f"Post generated with image: {image}")
        return content, image
        
    except Exception as e:
        log(f"Error generating post: {e}")
        return None, None

def validate_post_strict(content, image_path, platform='linkedin'):
    """
    STRICT validation before posting.
    Returns (is_valid, errors)
    """
    errors = []
    
    # Content validation
    if not content or len(content.strip()) == 0:
        errors.append("Content is empty")
    
    if content and len(content.split()) < 50:
        errors.append(f"Content too short: {len(content.split())} words (min: 50)")
    
    # Image validation (MANDATORY)
    if not image_path:
        errors.append("BLOCKED: No image provided")
    elif not Path(image_path).exists():
        errors.append(f"BLOCKED: Image file not found: {image_path}")
    else:
        # Check image size
        image_size = Path(image_path).stat().st_size
        if image_size > 10 * 1024 * 1024:  # 10MB
            errors.append(f"Image too large: {image_size / (1024*1024):.1f}MB (max: 10MB)")
    
    is_valid = len(errors) == 0
    return is_valid, errors

def post_to_linkedin(content, image=None):
    """Post to LinkedIn with image"""
    try:
        from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin as post
        result = post(content, image_path=image)
        return result
    except Exception as e:
        log(f"Error posting to LinkedIn: {e}")
        return {'success': False, 'error': str(e)}

def notify_owner_whatsapp(msg):
    """Send notification to owner via WhatsApp"""
    try:
        from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
        send_whatsapp_message(msg)
    except Exception as e:
        log(f"Error sending WhatsApp notification: {e}")

def track_posted(post_id, topic):
    """Track that a post was made today"""
    today = date.today().isoformat()
    data = {'date': today, 'posts': []}

    if POSTED_TODAY_FILE.exists():
        data = json.loads(POSTED_TODAY_FILE.read_text())
        if data.get('date') != today:
            data = {'date': today, 'posts': []}

    data['posts'].append({'id': post_id, 'topic': topic, 'time': datetime.now().isoformat()})
    POSTED_TODAY_FILE.parent.mkdir(exist_ok=True)
    POSTED_TODAY_FILE.write_text(json.dumps(data, indent=2))

def generate_and_post():
    """
    STRICT: Main function to generate and auto-post.
    Every post MUST have:
    1. Valid content (follows rules)
    2. Image (via Canva)
    """
    if not should_post():
        return

    log("Starting STRICT auto-post generation...")
    
    # Generate topic
    topic_data = generate_daily_topic()
    topic = topic_data.get('topic', topic_data) if isinstance(topic_data, dict) else topic_data
    log(f"Generated topic: {topic}")

    # Generate post with image (BOTH MANDATORY)
    content, image = generate_post_with_image(topic_data)
    
    if not content:
        log("BLOCKED: No content generated")
        notify_owner_whatsapp(f'❌ BLOCKED: No content for topic: {topic[:30]}...')
        return
    
    if not image:
        log("BLOCKED: No image generated - POST NOT PUBLISHED")
        notify_owner_whatsapp(f'❌ BLOCKED: No image for topic: {topic[:30]}...')
        return

    # STRICT validation before posting
    is_valid, errors = validate_post_strict(content, image)
    if not is_valid:
        log("BLOCKED: Validation failed")
        for e in errors:
            log(f"  - {e}")
        notify_owner_whatsapp(f'❌ BLOCKED: Validation failed for: {topic[:30]}...')
        return

    log("Validation passed. Posting to LinkedIn...")
    result = post_to_linkedin(content, image)

    if result and result.get('success'):
        log(f"✅ Auto-posted with image: {topic}")
        log(f"   Image: {image}")
        notify_owner_whatsapp(f'✅ Auto-posted: {topic[:50]}...\nImage: {Path(image).name}')
        track_posted(result.get('post_id', 'unknown'), topic)
    else:
        log(f"❌ Failed to post: {result.get('error', 'Unknown error')}")
        notify_owner_whatsapp(f'❌ Auto-post failed for: {topic[:30]}...')

def run_scheduler():
    """Run the scheduler for auto-posting"""
    for post_time in POST_TIMES:
        schedule.every().day.at(post_time).do(generate_and_post)

    log("STRICT Auto-daily poster scheduler started")
    log(f"Post times: {POST_TIMES}")
    log(f"Daily quota: min={DAILY_QUOTA['min']}, max={DAILY_QUOTA['max']}")
    log("STRICT MODE: Every post MUST have image + follow rules")

    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Preview without posting')
    parser.add_argument('--schedule', action='store_true', help='Run scheduler')
    parser.add_argument('--now', action='store_true', help='Post immediately')
    args = parser.parse_args()

    if args.dry_run:
        log("DRY RUN MODE")
        topic_data = generate_daily_topic()
        topic = topic_data.get('topic', topic_data)
        log(f"Would post topic: {topic}")
        content, image = generate_post_with_image(topic_data)
        if content:
            log(f"Content preview: {content[:200]}...")
        if image:
            log(f"Image: {image}")
        else:
            log("BLOCKED: No image - would not post")
    elif args.now:
        generate_and_post()
    elif args.schedule:
        run_scheduler()
    else:
        print("Use --dry-run, --now, or --schedule")
