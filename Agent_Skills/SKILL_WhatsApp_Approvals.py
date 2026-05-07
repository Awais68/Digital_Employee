import os
import re
import json
import time
import asyncio
from pathlib import Path

PENDING_POSTS_FILE = Path('Agent_Skills/pending_approvals.json')

def load_pending():
    if PENDING_POSTS_FILE.exists():
        return json.loads(PENDING_POSTS_FILE.read_text())
    return {}

def save_pending(data):
    PENDING_POSTS_FILE.parent.mkdir(exist_ok=True)
    PENDING_POSTS_FILE.write_text(json.dumps(data, indent=2))

async def send_approval_request(post_id, content, platform='LinkedIn'):
    """Send WhatsApp message to owner with post preview for approval"""
    preview = content[:200] + '...' if len(content) > 200 else content
    msg = f"""
📝 POST APPROVAL NEEDED
Platform: {platform}
─────────────────────────
{preview}
─────────────────────────
Reply:
✅ YES — publish now
❌ NO  — reject
✏️ EDIT — send new text
ID: {post_id}
"""
    from SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
    await send_whatsapp_message(msg)
    pending = load_pending()
    pending[post_id] = {'content': content, 'platform': platform, 'status': 'pending'}
    save_pending(pending)

async def check_approval_replies():
    """Scan WhatsApp for messages containing post IDs and process YES/NO/EDIT replies"""
    from SKILL_WhatsApp_Playwright_MCP import get_unread_messages
    pending = load_pending()
    messages = await get_unread_messages()

    for msg in messages:
        text = msg.get('text', '').upper()
        for post_id in list(pending.keys()):
            if post_id.upper() in text:
                if 'YES' in text:
                    await approve_and_publish(post_id)
                    from SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
                    await send_whatsapp_message(f'✅ Post {post_id} published!')
                    del pending[post_id]
                elif 'NO' in text:
                    await reject_post(post_id)
                    from SKILL_WhatsApp_Playwright_MCP import send_whatsapp_message
                    await send_whatsapp_message(f'❌ Post {post_id} rejected.')
                    del pending[post_id]
                elif 'EDIT' in text:
                    new_text = text.replace('EDIT', '').replace(post_id, '').strip()
                    if new_text:
                        pending[post_id]['content'] = new_text
                        save_pending(pending)
    save_pending(pending)

async def approve_and_publish(post_id):
    pending = load_pending()
    post = pending.get(post_id)
    if not post:
        return
    from SKILL_WhatsApp_Playwright_MCP import post_to_linkedin
    result = await post_to_linkedin(post['content'])
    if result.get('success'):
        post['status'] = 'published'
    else:
        post['status'] = 'failed'
    save_pending(pending)

async def reject_post(post_id):
    pending = load_pending()
    if post_id in pending:
        pending[post_id]['status'] = 'rejected'
        save_pending(pending)

if __name__ == '__main__':
    asyncio.run(check_approval_replies())
