#!/usr/bin/env python3
"""
Universal Tool Executor — direct Python alternatives to MCP servers.

When Claude Code + MCP is available:
  → .mcp.json handles tool calls automatically
  → This file is NOT needed (but harmless)

When MCP is NOT available:
  → This file provides the same functionality via direct Python calls
  → Each method maps to an MCP server tool
"""

import os, json, logging, time, functools
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

VAULT   = Path(os.getenv('VAULT_PATH', '.'))
DRY_RUN = os.getenv('DRY_RUN', 'true').lower() == 'true'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [TOOLS] %(message)s',
    handlers=[
        logging.FileHandler(VAULT / 'Logs' / 'tool_executor.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── Retry decorator ───────────────────────────────────────────
def with_retry(max_attempts=3, base_delay=2, max_delay=30):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        log.error(f"All {max_attempts} attempts failed: {func.__name__}: {e}")
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    log.warning(f"Attempt {attempt+1}/{max_attempts} failed: {e}. Retry in {delay}s")
                    time.sleep(delay)
        return wrapper
    return decorator

# ── Audit logger ──────────────────────────────────────────────
def audit_log(action: str, status: str, details: dict = {}):
    log_file = VAULT / 'Logs' / f"{datetime.now().strftime('%Y-%m-%d')}_audit.json"
    entries  = json.loads(log_file.read_text()) if log_file.exists() else []
    entries.append({
        'timestamp': datetime.now(datetime.UTC).isoformat(),
        'action':    action,
        'status':    status,
        'dry_run':   DRY_RUN,
        'details':   details
    })
    log_file.write_text(json.dumps(entries, indent=2))

# ── Graceful degradation ──────────────────────────────────────
class GracefulDegradation:
    def queue_for_later(self, action: str, data: dict):
        queue_dir = VAULT / 'Offline_Queue'
        queue_dir.mkdir(parents=True, exist_ok=True)
        queue_file = queue_dir / f"{action}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        queue_file.write_text(json.dumps({
            'action':   action,
            'data':     data,
            'queued_at': datetime.now().isoformat(),
            'retry_count': 0
        }, indent=2))
        log.info(f"[Queued] {action} → Offline_Queue/")

degradation = GracefulDegradation()

# ── TOOL 1: Gmail / Email ─────────────────────────────────────
# Maps to: email_mcp MCP server

class EmailTool:
    """Replaces email_mcp MCP server"""

    @with_retry()
    def send_email(self, to: str, subject: str, body: str) -> dict:
        if DRY_RUN:
            log.info(f"[DRY RUN] Email → {to} | {subject}")
            audit_log('send_email', 'dry_run', {'to': to, 'subject': subject})
            return {'status': 'dry_run', 'to': to, 'subject': subject}

        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        gmail_user = os.getenv('GMAIL_USER') or os.getenv('GMAIL_EMAIL')
        app_pass   = os.getenv('GMAIL_APP_PASSWORD')

        if not gmail_user or not app_pass:
            log.warning("Gmail not configured — queuing for later")
            degradation.queue_for_later('send_email', {'to': to, 'subject': subject, 'body': body})
            return {'status': 'queued'}

        msg            = MIMEMultipart()
        msg['From']    = gmail_user
        msg['To']      = to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(gmail_user, app_pass)
            server.send_message(msg)

        log.info(f"[Email sent] → {to}")
        audit_log('send_email', 'success', {'to': to, 'subject': subject})
        return {'status': 'sent', 'to': to}

    @with_retry()
    def check_inbox(self, max_results: int = 10) -> list:
        """Gmail inbox check — returns list of messages"""
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds_path = VAULT / 'credentials' / 'token.json'
        if not creds_path.exists():
            creds_path = VAULT / 'token.json'
        if not creds_path.exists():
            log.warning("Gmail token.json not found")
            return []

        creds   = Credentials.from_authorized_user_file(str(creds_path))
        service = build('gmail', 'v1', credentials=creds)
        results = service.users().messages().list(
            userId='me', q='is:unread is:important',
            maxResults=max_results
        ).execute()
        return results.get('messages', [])


# ── TOOL 2: Odoo ─────────────────────────────────────────────
# Maps to: odoo-gold-tier MCP server

class OdooTool:
    """Replaces odoo-gold-tier MCP server"""

    def _get_connection(self):
        import xmlrpc.client
        url  = os.getenv('ODOO_URL', 'http://localhost:8069')
        db   = os.getenv('ODOO_DB')
        key  = os.getenv('ODOO_PASSWORD')
        user = os.getenv('ODOO_USERNAME')
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        uid    = common.authenticate(db, user, key, {})
        models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
        return db, uid, key, models

    @with_retry()
    def create_invoice_draft(self, customer_name: str,
                              amount: float, description: str) -> dict:
        if DRY_RUN:
            log.info(f"[DRY RUN] Odoo Invoice: {customer_name} = ${amount}")
            audit_log('create_invoice', 'dry_run',
                      {'customer': customer_name, 'amount': amount})
            return {'status': 'dry_run', 'customer': customer_name, 'amount': amount}

        db, uid, key, models = self._get_connection()
        # Find or create customer
        partner_ids = models.execute_kw(db, uid, key, 'res.partner', 'search',
                                        [[['name', 'ilike', customer_name]]])
        partner_id  = partner_ids[0] if partner_ids else models.execute_kw(
            db, uid, key, 'res.partner', 'create',
            [{'name': customer_name, 'customer_rank': 1}]
        )
        # Create draft invoice
        inv_id = models.execute_kw(db, uid, key, 'account.move', 'create', [{
            'move_type':  'out_invoice',
            'partner_id': partner_id,
            'invoice_line_ids': [(0, 0, {
                'name':        description,
                'price_unit':  amount,
                'quantity':    1,
            })]
        }])
        log.info(f"[Odoo] Draft invoice #{inv_id} created for {customer_name}")
        audit_log('create_invoice', 'success',
                  {'invoice_id': inv_id, 'customer': customer_name, 'amount': amount})
        return {'status': 'draft_created', 'invoice_id': inv_id}

    @with_retry()
    def get_weekly_summary(self) -> dict:
        """CEO briefing ke liye weekly Odoo data"""
        from datetime import timedelta
        db, uid, key, models = self._get_connection()
        week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        invoices = models.execute_kw(db, uid, key, 'account.move', 'search_read',
            [[['move_type', '=', 'out_invoice'], ['invoice_date', '>=', week_ago]]],
            {'fields': ['name', 'partner_id', 'amount_total', 'payment_state']}
        )
        paid    = sum(i['amount_total'] for i in invoices if i['payment_state'] == 'paid')
        pending = sum(i['amount_total'] for i in invoices if i['payment_state'] != 'paid')
        return {'invoices': invoices, 'paid': paid, 'pending': pending,
                'total_count': len(invoices)}


# ── TOOL 3: LinkedIn ──────────────────────────────────────────
# Maps to: linkedin-playwright MCP server

class LinkedInTool:
    """Replaces linkedin-playwright MCP server"""

    @with_retry()
    def create_post_draft(self, content: str, topic: str) -> dict:
        """Draft LinkedIn post — saves to vault for approval"""
        ts        = datetime.now().strftime('%Y%m%d_%H%M%S')
        draft_dir = VAULT / 'LinkedIn_Drafts'
        draft_dir.mkdir(parents=True, exist_ok=True)
        draft_file = draft_dir / f"POST_{ts}.md"

        draft_content = f"""---
platform: linkedin
status: draft
created: {datetime.now().isoformat()}
topic: {topic}
requires_approval: true
---

## Post Content

{content}

## To Post
1. Review above content
2. Move approval file from Pending_Approval/ to Approved/
3. Orchestrator will handle posting
"""
        draft_file.write_text(draft_content)

        # Create approval request
        approval_dir = VAULT / 'Pending_Approval'
        approval_dir.mkdir(parents=True, exist_ok=True)
        (approval_dir / f"LINKEDIN_POST_{ts}.md").write_text(f"""---
action: post_linkedin
draft_file: LinkedIn_Drafts/POST_{ts}.md
status: pending_approval
created: {datetime.now().isoformat()}
---
LinkedIn post ready for review.
Move to Approved/ to publish.
""")
        audit_log('linkedin_draft', 'created', {'topic': topic})
        return {'status': 'draft_saved', 'file': str(draft_file)}

    @with_retry()
    def post_via_api(self, content: str) -> dict:
        """Direct LinkedIn API post (after approval)"""
        if DRY_RUN:
            log.info(f"[DRY RUN] LinkedIn post: {content[:60]}...")
            return {'status': 'dry_run'}

        token = os.getenv('LINKEDIN_ACCESS_TOKEN')
        if not token:
            log.warning("LinkedIn token not set — queuing")
            degradation.queue_for_later('linkedin_post', {'content': content})
            return {'status': 'queued'}

        import requests
        urn = os.getenv('LINKEDIN_URN', '')
        resp = requests.post(
            'https://api.linkedin.com/v2/ugcPosts',
            headers={'Authorization': f'Bearer {token}',
                     'Content-Type': 'application/json'},
            json={
                'author': urn,
                'lifecycleState': 'PUBLISHED',
                'specificContent': {
                    'com.linkedin.ugc.ShareContent': {
                        'shareCommentary': {'text': content},
                        'shareMediaCategory': 'NONE'
                    }
                },
                'visibility': {'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'}
            }
        )
        if resp.status_code in (200, 201):
            audit_log('linkedin_post', 'success', {'length': len(content)})
            return {'status': 'posted'}
        log.error(f"LinkedIn post failed: {resp.status_code} {resp.text[:100]}")
        return {'status': 'failed', 'error': resp.text[:100]}


# ── TOOL 4: Social Media (Facebook/Instagram/Twitter) ─────────
# Maps to: facebook-mcp + instagram-mcp

class SocialTool:
    """Replaces facebook-mcp and instagram-mcp MCP servers"""

    @with_retry()
    def post_facebook(self, message: str) -> dict:
        if DRY_RUN:
            log.info(f"[DRY RUN] Facebook: {message[:60]}...")
            return {'status': 'dry_run'}

        import requests
        token   = os.getenv('META_SYSTEM_USER_TOKEN')
        page_id = os.getenv('FACEBOOK_PAGE_ID')

        if not token or not page_id or token == 'your_token_here':
            log.warning("Facebook token not configured — queuing")
            degradation.queue_for_later('facebook_post', {'message': message})
            return {'status': 'queued'}

        resp = requests.post(
            f'https://graph.facebook.com/v19.0/{page_id}/feed',
            data={'message': message, 'access_token': token}
        )
        result = resp.json()
        if 'id' in result:
            audit_log('facebook_post', 'success', {'post_id': result['id']})
            return {'status': 'posted', 'post_id': result['id']}
        return {'status': 'failed', 'error': str(result)}

    @with_retry()
    def post_twitter(self, text: str) -> dict:
        if DRY_RUN:
            log.info(f"[DRY RUN] Twitter: {text[:60]}...")
            return {'status': 'dry_run'}

        import tweepy
        api_key    = os.getenv('TWITTER_API_KEY', '')
        api_secret = os.getenv('TWITTER_API_SECRET', '')
        acc_token  = os.getenv('TWITTER_ACCESS_TOKEN', '')
        acc_secret = os.getenv('TWITTER_ACCESS_TOKEN_SECRET', '')

        if not api_key or api_key in ('your_key_here', 'placeholder'):
            log.warning("Twitter tokens not configured — queuing")
            degradation.queue_for_later('twitter_post', {'text': text})
            return {'status': 'queued'}

        client = tweepy.Client(
            consumer_key=api_key, consumer_secret=api_secret,
            access_token=acc_token, access_token_secret=acc_secret
        )
        tweet  = text[:277] + '...' if len(text) > 280 else text
        result = client.create_tweet(text=tweet)
        audit_log('twitter_post', 'success', {'tweet_id': result.data['id']})
        return {'status': 'posted', 'tweet_id': result.data['id']}

    @with_retry()
    def post_instagram(self, image_url: str, caption: str) -> dict:
        if DRY_RUN:
            log.info(f"[DRY RUN] Instagram caption: {caption[:60]}...")
            return {'status': 'dry_run'}

        import requests
        token  = os.getenv('META_SYSTEM_USER_TOKEN') or os.getenv('INSTAGRAM_ACCESS_TOKEN')
        ig_id  = os.getenv('INSTAGRAM_ACCOUNT_ID')

        if not token or not ig_id:
            log.warning("Instagram not configured — queuing")
            degradation.queue_for_later('instagram_post',
                                        {'image_url': image_url, 'caption': caption})
            return {'status': 'queued'}

        # Step 1: container
        container = requests.post(
            f'https://graph.facebook.com/v19.0/{ig_id}/media',
            data={'image_url': image_url, 'caption': caption, 'access_token': token}
        ).json()

        if 'id' not in container:
            return {'status': 'failed', 'error': str(container)}

        # Step 2: publish
        publish = requests.post(
            f'https://graph.facebook.com/v19.0/{ig_id}/media_publish',
            data={'creation_id': container['id'], 'access_token': token}
        ).json()

        if 'id' in publish:
            audit_log('instagram_post', 'success', {'media_id': publish['id']})
            return {'status': 'posted', 'media_id': publish['id']}
        return {'status': 'failed', 'error': str(publish)}


# ── Tool registry ─────────────────────────────────────────────
class UniversalTools:
    """Single access point for all tools"""
    def __init__(self):
        self.email    = EmailTool()
        self.odoo     = OdooTool()
        self.linkedin = LinkedInTool()
        self.social   = SocialTool()


tools = UniversalTools()

if __name__ == '__main__':
    # Quick test in DRY_RUN mode
    print("=== Universal Tool Executor — Self Test ===")
    print(f"DRY_RUN: {DRY_RUN}")
    r1 = tools.email.send_email("test@example.com", "Test", "Hello")
    r2 = tools.social.post_twitter("Test tweet from AI Employee")
    r3 = tools.social.post_facebook("Test Facebook post")
    print(f"Email:    {r1['status']}")
    print(f"Twitter:  {r2['status']}")
    print(f"Facebook: {r3['status']}")
    print("Self test complete.")
