import os
import json
import schedule
import time
from datetime import datetime, date
from pathlib import Path

POSTS_DIR = Path('Digital_Employee/Todo_posts/Done')
POSTED_TODAY_FILE = Path('Agent_Skills/posted_today.json')

DAILY_QUOTA = {'min': 1, 'max': 4}
POST_TIMES = ['09:00', '12:00', '15:00', '18:00']
POSTED_TODAY = []

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
    """Generate a simple motivational/industry topic"""
    from Agent_Skills.SKILL_Gemini_Content import generate_topic_options
    try:
        topics = generate_topic_options(count=1)
        return topics[0]['topic']
    except Exception as e:
        log(f"Error generating topic: {e}")
        fallback_topics = [
            "Monday motivation for tech teams",
            "5 lessons from my coding journey",
            "Why continuous learning matters in tech",
            "Building habits for productivity",
            "The future of AI in daily life"
        ]
        return fallback_topics[date.today().toordinal() % len(fallback_topics)]

def generate_post_with_image(topic):
    """Generate post content and image"""
    from Agent_Skills.SKILL_Gemini_Content import generate_post_content, generate_post_image
    try:
        content = generate_post_content(topic, platform='linkedin')
        image = generate_post_image(topic)
        return content, image
    except Exception as e:
        log(f"Error generating post: {e}")
        return None, None

def post_to_linkedin(content, image=None):
    """Post to LinkedIn (no approval needed for auto-posts)"""
    try:
        from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import post_to_linkedin as post
        result = post(content, image)
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
    """Main function to generate and auto-post"""
    if not should_post():
        return

    log("Starting auto-post generation...")
    topic = generate_daily_topic()
    log(f"Generated topic: {topic}")

    content, image = generate_post_with_image(topic)
    if not content:
        log("Failed to generate content")
        return

    log("Posting to LinkedIn...")
    result = post_to_linkedin(content, image)

    if result and result.get('success'):
        log(f"Auto-posted: {topic}")
        notify_owner_whatsapp(f'✅ Auto-posted: {topic[:50]}...')
        track_posted(result.get('post_id', 'unknown'), topic)
    else:
        log(f"Failed to post: {result.get('error', 'Unknown error')}")
        notify_owner_whatsapp(f'❌ Auto-post failed for: {topic[:30]}...')

def run_scheduler():
    """Run the scheduler for auto-posting"""
    for post_time in POST_TIMES:
        schedule.every().day.at(post_time).do(generate_and_post)

    log("Auto-daily poster scheduler started")
    log(f"Post times: {POST_TIMES}")
    log(f"Daily quota: min={DAILY_QUOTA['min']}, max={DAILY_QUOTA['max']}")

    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show what would be posted without posting')
    parser.add_argument('--schedule', action='store_true', help='Run scheduler')
    parser.add_argument('--now', action='store_true', help='Post immediately once')
    args = parser.parse_args()

    if args.dry_run:
        topic = generate_daily_topic()
        print(f"Would post topic: {topic}")
        content, image = generate_post_with_image(topic)
        print(f"Content preview: {content[:200]}...")
        print(f"Image: {image}")
    elif args.now:
        generate_and_post()
    elif args.schedule:
        run_scheduler()
    else:
        print("Use --dry-run, --now, or --schedule")
