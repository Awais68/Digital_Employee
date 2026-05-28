"""
universal_tool_executor.py

MCP-equivalent tool executor for non-Claude-Code environments.
Reads .mcp.json to understand available tools,
then provides Python implementations of the same tools.

When Claude Code IS available: MCP servers handle tool calls natively.
When it's NOT: this module provides identical functionality via direct API calls.
"""
import os, json, smtplib, logging
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

VAULT   = Path(os.getenv('VAULT_PATH', '.'))
DRY_RUN = os.getenv('DRY_RUN', 'true').lower() == 'true'

logger = logging.getLogger(__name__)

# ── Read existing .mcp.json to understand configured servers ──
def get_mcp_config():
    mcp_file = Path('.mcp.json')
    if not mcp_file.exists():
        mcp_file = Path.home() / '.claude.json'
    if mcp_file.exists():
        try:
            return json.loads(mcp_file.read_text())
        except:
            pass
    return {}

def is_mcp_available(server_name):
    """Check if a specific MCP server is configured in .mcp.json"""
    config = get_mcp_config()
    servers = config.get('mcpServers', {})
    return server_name in servers

# ── Email tools (mirrors email_mcp MCP server) ────────────────
class EmailTools:
    """
    Mirrors: email_mcp server from .mcp.json
    MCP path: email_mcp.js
    Fallback: Gmail SMTP with App Password
    """
    def send_email(self, to, subject, body, cc=None):
        if DRY_RUN:
            logger.info(f"[DRY RUN] Email → {to} | Subject: {subject}")
            return {"status": "dry_run", "to": to, "subject": subject}

        msg = MIMEMultipart()
        msg['From']    = os.getenv('GMAIL_USER')
        msg['To']      = to
        msg['Subject'] = subject
        if cc:
            msg['Cc'] = cc
        msg.attach(MIMEText(body, 'plain'))

        try:
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
                server.login(
                    os.getenv('GMAIL_USER'),
                    os.getenv('GMAIL_APP_PASSWORD')
                )
                server.send_message(msg)
            logger.info(f"Email sent to {to}")
            return {"status": "sent", "to": to}
        except Exception as e:
            logger.error(f"Email failed: {e}")
            return {"status": "error", "error": str(e)}

    def create_draft(self, to, subject, body):
        """Save as approval request instead of sending directly"""
        filename = f"EMAIL_DRAFT_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        content  = f"""---
type: email_draft
action: send_email
to: {to}
subject: {subject}
created: {datetime.now().isoformat()}
status: pending_approval
---

## Email Draft

**To:** {to}  
**Subject:** {subject}

{body}

---
*Move to /Approved/ to send this email.*
"""
        target = VAULT / 'Pending_Approval' / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        logger.info(f"Draft saved: {filename}")
        return {"status": "draft_saved", "file": filename}

# ── Odoo tools (mirrors odoo-gold-tier MCP server) ────────────
class OdooTools:
    """
    Mirrors: odoo-gold-tier server from .mcp.json
    Uses: xmlrpc.client (same as odoo_mcp.py)
    """
    def _connect(self):
        import xmlrpc.client
        url  = os.getenv('ODOO_URL', 'http://localhost:8069')
        db   = os.getenv('ODOO_DB')
        user = os.getenv('ODOO_USERNAME')
        key  = os.getenv('ODOO_API_KEY')
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        uid    = common.authenticate(db, user, key, {})
        models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
        return db, uid, key, models

    def create_invoice_draft(self, customer_name, amount, description='Service'):
        if DRY_RUN:
            logger.info(f"[DRY RUN] Odoo invoice: {customer_name} = {amount}")
            return {"status": "dry_run"}
        try:
            db, uid, key, models = self._connect()
            # Find or create partner
            partner_ids = models.execute_kw(
                db, uid, key, 'res.partner', 'search',
                [[['name', 'ilike', customer_name]]]
            )
            partner_id = partner_ids[0] if partner_ids else models.execute_kw(
                db, uid, key, 'res.partner', 'create',
                [{'name': customer_name}]
            )
            inv_id = models.execute_kw(db, uid, key, 'account.move', 'create', [{
                'move_type': 'out_invoice',
                'partner_id': partner_id,
                'invoice_line_ids': [(0, 0, {
                    'name': description,
                    'price_unit': amount,
                    'quantity': 1
                })]
            }])
            logger.info(f"Invoice draft created: ID {inv_id}")
            return {"status": "created", "invoice_id": inv_id}
        except Exception as e:
            logger.error(f"Odoo error: {e}")
            return {"status": "error", "error": str(e)}

    def get_weekly_revenue(self):
        try:
            from datetime import timedelta
            db, uid, key, models = self._connect()
            week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            invoices = models.execute_kw(
                db, uid, key, 'account.move', 'search_read',
                [[['move_type','=','out_invoice'],
                  ['invoice_date','>=',week_ago]]],
                {'fields': ['name','amount_total','payment_state']}
            )
            total = sum(i['amount_total'] for i in invoices if i['payment_state']=='paid')
            pending = sum(i['amount_total'] for i in invoices if i['payment_state']!='paid')
            return {"collected": total, "pending": pending, "invoice_count": len(invoices)}
        except Exception as e:
            return {"error": str(e)}

# ── Social media tools (mirrors facebook/instagram/linkedin MCP) ──
class SocialTools:
    """
    Mirrors: facebook-mcp, instagram-mcp, linkedin-playwright
    """
    def post_facebook(self, message):
        if DRY_RUN:
            logger.info(f"[DRY RUN] Facebook post: {message[:60]}...")
            return {"status": "dry_run"}
        import requests
        token   = os.getenv('META_SYSTEM_USER_TOKEN')
        page_id = os.getenv('FACEBOOK_PAGE_ID')
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{page_id}/feed",
            data={"message": message, "access_token": token}
        )
        return r.json()

    def post_twitter(self, text):
        if DRY_RUN:
            logger.info(f"[DRY RUN] Tweet: {text[:60]}...")
            return {"status": "dry_run"}
        import tweepy
        client = tweepy.Client(
            consumer_key=os.getenv('TWITTER_API_KEY'),
            consumer_secret=os.getenv('TWITTER_API_SECRET'),
            access_token=os.getenv('TWITTER_ACCESS_TOKEN'),
            access_token_secret=os.getenv('TWITTER_ACCESS_SECRET')
        )
        resp = client.create_tweet(text=text[:280])
        return {"status": "posted", "id": resp.data['id']}

    def create_social_draft(self, platform, content):
        """Save as approval request — never post directly"""
        filename = f"SOCIAL_{platform.upper()}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        draft = f"""---
type: social_post
platform: {platform}
action: post_{platform}
created: {datetime.now().isoformat()}
status: pending_approval
---

## Draft Post — {platform.title()}

{content}

---
*Move to /Approved/ to post.*
"""
        target = VAULT / 'Pending_Approval' / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(draft)
        return {"status": "draft_saved", "file": filename}

# ── Vault filesystem tools (mirrors filesystem MCP) ───────────
class VaultTools:
    """Mirrors: filesystem MCP server"""
    def read_file(self, relative_path):
        f = VAULT / relative_path
        return f.read_text() if f.exists() else None

    def write_file(self, relative_path, content):
        target = VAULT / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not DRY_RUN:
            target.write_text(content)
        return {"status": "dry_run" if DRY_RUN else "written", "path": relative_path}

    def list_folder(self, relative_path):
        folder = VAULT / relative_path
        if not folder.exists():
            return []
        return [f.name for f in folder.iterdir()]

    def move_file(self, src, dest):
        s, d = VAULT / src, VAULT / dest
        d.parent.mkdir(parents=True, exist_ok=True)
        if not DRY_RUN and s.exists():
            s.rename(d)
        return {"status": "dry_run" if DRY_RUN else "moved"}

# ── Unified tool registry ─────────────────────────────────────
class ToolRegistry:
    """
    Single entry point for all tools.
    Automatically uses MCP if Claude Code available,
    otherwise uses Python implementations above.
    """
    def __init__(self):
        self.email  = EmailTools()
        self.odoo   = OdooTools()
        self.social = SocialTools()
        self.vault  = VaultTools()
        self._log_available_tools()

    def _log_available_tools(self):
        mcp_cfg = get_mcp_config()
        servers = mcp_cfg.get('mcpServers', {})
        if servers:
            logger.info(f"MCP servers in .mcp.json: {list(servers.keys())}")
            logger.info("When running via Claude Code: MCP servers will be used")
            logger.info("When running standalone: Python tool implementations used")
        else:
            logger.info("No .mcp.json found — using Python tool implementations only")

tools = ToolRegistry()

if __name__ == '__main__':
    print("Tool Registry initialized")
    print(f"MCP config: {list(get_mcp_config().get('mcpServers', {}).keys())}")
    print(f"DRY_RUN: {DRY_RUN}")
    print("Email tools:  ready")
    print("Odoo tools:   ready")
    print("Social tools: ready")
    print("Vault tools:  ready")
