import os
import json
import schedule
import time
from datetime import datetime
from pathlib import Path

PENDING_TOPICS_FILE = Path('Agent_Skills/pending_topics.json')

def generate_topic_options(count=5):
    """Generate topic options using Gemini"""
    from Agent_Skills.SKILL_Gemini_Content import generate_topic_options as gemini_topics
    try:
        return gemini_topics(count=count)
    except Exception as e:
        print(f"Error generating topics: {e}")
        return [
            {"topic": "Why AI is changing Pakistani startups", "angle": "local impact", "hook": "Did you know?"},
            {"topic": "5 tools every developer needs in 2026", "angle": "practical guide", "hook": "Save this list"},
            {"topic": "Remote work lessons from 2 years", "angle": "personal experience", "hook": "Here's what I learned"},
            {"topic": "How to use Claude for business", "angle": "business growth", "hook": "Game changer"},
            {"topic": "Digital transformation in Pakistan", "angle": "industry trends", "hook": "The future is here"},
        ]

def save_pending_topics(topics):
    PENDING_TOPICS_FILE.parent.mkdir(exist_ok=True)
    data = {
        'date': datetime.now().date().isoformat(),
        'topics': topics
    }
    PENDING_TOPICS_FILE.write_text(json.dumps(data, indent=2))

async def send_morning_briefing():
    """Send morning briefing with 5 topic options via WhatsApp"""
    topics = generate_topic_options(count=5)
    save_pending_topics(topics)

    msg = "🌅 *Good Morning! Today's post topics:*\n\n"
    for i, t in enumerate(topics, 1):
        msg += f"{i}️⃣ _{t['topic']}_\n"

    msg += "\nReply with number (1-5) to approve\n"
    msg += "Or SKIP to skip today\n"
    msg += "Or type your own topic"

    from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
    await send_whatsapp_message(msg)
    print(f"[{datetime.now()}] Morning briefing sent with {len(topics)} topics")

async def check_topic_reply():
    """Check for owner's reply to morning briefing"""
    from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import get_unread_messages
    from Agent_Skills.SKILL_Gemini_Content import generate_post_content, generate_post_image
    from Agent_Skills.SKILL_WhatsApp_Playwright_MCP import post_to_linkedin, send_whatsapp_message

    if not PENDING_TOPICS_FILE.exists():
        return

    pending = json.loads(PENDING_TOPICS_FILE.read_text())
    if pending.get('date') != datetime.now().date().isoformat():
        return

    messages = await get_unread_messages()
    topics = pending['topics']

    for msg in messages:
        text = msg.get('text', '').strip()

        if text.upper() == 'SKIP':
            send_whatsapp_message("⏭️ Skipped today's post. See you tomorrow!")
            PENDING_TOPICS_FILE.unlink()
            return

        if text in ['1', '2', '3', '4', '5']:
            idx = int(text) - 1
            if 0 <= idx < len(topics):
                topic = topics[idx]['topic']
                send_whatsapp_message(f"✍️ Generating post for: {topic}...")

                content = generate_post_content(topic, platform='linkedin')
                image = generate_post_image(topic)

                result = await post_to_linkedin(content, image)
                if result.get('success'):
                    send_whatsapp_message(f"✅ Posted to LinkedIn: {topic[:50]}...")
                else:
                    send_whatsapp_message(f"❌ Failed to post: {result.get('error', 'Unknown error')}")

                PENDING_TOPICS_FILE.unlink()
                return

        if len(text) > 10:
            send_whatsapp_message(f"✍️ Generating post for your topic: {text[:50]}...")
            content = generate_post_content(text, platform='linkedin')
            image = generate_post_image(text)
            result = await post_to_linkedin(content, image)
            if result.get('success'):
                send_whatsapp_message(f"✅ Posted to LinkedIn!")
            PENDING_TOPICS_FILE.unlink()
            return

def run_scheduler():
    """Run the scheduler for morning briefing at 8am daily"""
    schedule.every().day.at('08:00').do(lambda: asyncio.run(send_morning_briefing()))

    print("Morning briefing scheduler started. Waiting for 8am...")
    while True:
        schedule.run_pending()
        time.sleep(30)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--test', action='store_true', help='Send test morning briefing')
    parser.add_argument('--schedule', action='store_true', help='Run scheduler')
    args = parser.parse_args()

    if args.test:
        asyncio.run(send_morning_briefing())
    elif args.schedule:
        run_scheduler()
    else:
        print("Use --test or --schedule")
