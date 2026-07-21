#!/usr/bin/env python3
"""
auto_daily_poster.py - STRICT Auto Daily Social Media Poster

PHASE 1: One master post per topic, derived per platform — not independent generation.
PHASE 2: Research-grounded. Searches topic before writing. Bans generic filler.

Usage:
    python3 auto_daily_poster.py --dry-run    # Preview without posting
    python3 auto_daily_poster.py --now        # Post immediately
    python3 auto_daily_poster.py --schedule   # Run scheduler
"""

import os
import json
import re
import requests
import urllib.parse
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

# ── BANNED GENERIC FILLER PATTERNS (Phase 2) ──────────────────────────────
BANNED_PATTERNS = [
    r'\d+%\s+of\s+(enterprises|companies|businesses|organizations|consumers)',
    r'\$\d+(\.\d+)?\s*(trillion|billion|million)\s+(market|opportunity|industry)',
    r'Here\'?s what happened this week that blew my mind',
    r'Drop your thoughts below',
    r'Let\'?s have a real conversation',
    r'the numbers speak for themselves',
    r'here\'?s what most people miss',
    r"I've been saying this for years",
    r'nobody is talking about this',
    r'The most interesting part of working with \w+ has been',
    r'One pattern that keeps coming up',
]

GENERIC_HOOKS = [
    "here's what happened this week that blew my mind",
    "let's talk about",
    "in today's fast-paced world",
    "the intersection of",
    "here's why",
    "unpopular opinion",
    "hot take",
]


def contains_banned_patterns(text):
    for pattern in BANNED_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    for hook in GENERIC_HOOKS:
        if hook in text.lower():
            return True
    return False


# ── REAL WEB RESEARCH (Phase 2) ───────────────────────────────────────────
def web_search(query, max_results=5):
    results = []
    try:
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&format=json&srlimit={max_results + 3}"
        resp = requests.get(wiki_url, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            for r in (data.get('query', {}).get('search', [])[:max_results]):
                results.append({
                    'title': r['title'],
                    'url': f"https://en.wikipedia.org/wiki/{urllib.parse.quote(r['title'])}",
                    'snippet': re.sub(r'<\/?[^>]+>', '', r.get('snippet', '')),
                })
    except Exception as e:
        log(f"[WebSearch] Wikipedia failed: {e}")

    if len(results) < max_results:
        try:
            ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
            resp = requests.get(ddg_url, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                if data.get('AbstractText'):
                    results.append({'title': data.get('Heading', query), 'url': data.get('AbstractURL', ''), 'snippet': data['AbstractText']})
                for rt in (data.get('RelatedTopics') or []):
                    if len(results) >= max_results:
                        break
                    if isinstance(rt, dict) and rt.get('Text'):
                        title = rt['Text'].split(' - ')[0] if ' - ' in rt['Text'] else query
                        results.append({'title': title, 'url': rt.get('FirstURL', ''), 'snippet': rt['Text'][:300]})
        except Exception as e:
            log(f"[WebSearch] DuckDuckGo failed: {e}")
    return results[:max_results]


def load_rules():
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}


def count_posts_in_done(today_str):
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
    """Generate a topic grounded in web research."""
    from Agent_Skills.SKILL_Gemini_Content import generate_topic_options, web_search as skill_web_search
    try:
        # Search for trending topics first
        trending = web_search("trending AI technology topics 2026", max_results=3)
        if trending:
            log(f"[Research] Found trending topics: {[t['title'] for t in trending[:2]]}")
        topics = generate_topic_options(count=1)
        return topics[0]
    except Exception as e:
        log(f"Error generating topic: {e}")
        fallback_topics = [
            {"topic": "Monday motivation for tech teams", "image_concept": "Modern tech workspace"},
            {"topic": "5 lessons from my coding journey", "image_concept": "Code on screen"},
            {"topic": "Why continuous learning matters in tech", "image_concept": "Books and technology"},
            {"topic": "Building habits for productivity", "image_concept": "Productivity tools"},
            {"topic": "The future of AI in daily life", "image_concept": "AI technology visualization"},
        ]
        return fallback_topics[date.today().toordinal() % len(fallback_topics)]


def generate_post_with_image(topic_data):
    """
    Generate post using unified master-post approach (Phase 1).
    One master post → adapted per platform. Research-grounded (Phase 2).
    Content AND image both MANDATORY.
    """
    from Agent_Skills.SKILL_Gemini_Content import generate_complete_post, generate_master_content

    topic = topic_data.get('topic', topic_data) if isinstance(topic_data, dict) else topic_data

    try:
        # Use unified master-post pipeline
        result = generate_complete_post(topic, platform='linkedin')

        if not result.get('success'):
            log(f"Post generation failed: {result.get('error')}")
            if 'errors' in result:
                for e in result['errors']:
                    log(f"  - {e}")
            return None, None

        content = result.get('content')
        image = result.get('image')

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
    Strict validation before posting, including banned pattern check (Phase 2).
    """
    errors = []

    if not content or len(content.strip()) == 0:
        errors.append("Content is empty")

    if content and len(content.split()) < 50:
        errors.append(f"Content too short: {len(content.split())} words (min: 50)")

    # Phase 2: banned pattern check
    if content and contains_banned_patterns(content):
        errors.append("Banned generic filler pattern detected")

    if not image_path:
        errors.append("BLOCKED: No image provided")
    elif not Path(image_path).exists():
        errors.append(f"BLOCKED: Image file not found: {image_path}")
    else:
        image_size = Path(image_path).stat().st_size
        if image_size > 10 * 1024 * 1024:
            errors.append(f"Image too large: {image_size / (1024*1024):.1f}MB (max: 10MB)")

    is_valid = len(errors) == 0
    return is_valid, errors


def post_to_linkedin(content, image=None):
    try:
        from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin as post
        result = post(content, image_path=image)
        return result
    except Exception as e:
        log(f"Error posting to LinkedIn: {e}")
        return {'success': False, 'error': str(e)}


def notify_owner_whatsapp(msg):
    try:
        from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
        send_whatsapp_message(msg)
    except Exception as e:
        log(f"Error sending WhatsApp notification: {e}")


def track_posted(post_id, topic):
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
    if not should_post():
        return

    log("Starting research-grounded auto-post generation...")

    # Phase 2: Research-enhanced topic generation
    topic_data = generate_daily_topic()
    topic = topic_data.get('topic', topic_data) if isinstance(topic_data, dict) else topic_data
    log(f"Generated topic: {topic}")

    content, image = generate_post_with_image(topic_data)

    if not content:
        log("BLOCKED: No content generated")
        notify_owner_whatsapp(f'\u274c BLOCKED: No content for topic: {topic[:30]}...')
        return

    if not image:
        log("BLOCKED: No image generated - POST NOT PUBLISHED")
        notify_owner_whatsapp(f'\u274c BLOCKED: No image for topic: {topic[:30]}...')
        return

    is_valid, errors = validate_post_strict(content, image)
    if not is_valid:
        log("BLOCKED: Validation failed")
        for e in errors:
            log(f"  - {e}")
        notify_owner_whatsapp(f'\u274c BLOCKED: Validation failed for: {topic[:30]}...')
        return

    log("Validation passed. Posting to LinkedIn...")
    result = post_to_linkedin(content, image)

    if result and result.get('success'):
        log(f"\u2705 Auto-posted with image: {topic}")
        log(f"   Image: {image}")
        notify_owner_whatsapp(f'\u2705 Auto-posted: {topic[:50]}...\nImage: {Path(image).name}')
        track_posted(result.get('post_id', 'unknown'), topic)
    else:
        log(f"\u274c Failed to post: {result.get('error', 'Unknown error')}")
        notify_owner_whatsapp(f'\u274c Auto-post failed for: {topic[:30]}...')


def run_scheduler():
    for post_time in POST_TIMES:
        schedule.every().day.at(post_time).do(generate_and_post)

    log("Research-grounded auto-daily poster scheduler started")
    log(f"Post times: {POST_TIMES}")
    log(f"Daily quota: min={DAILY_QUOTA['min']}, max={DAILY_QUOTA['max']}")

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
