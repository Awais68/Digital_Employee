# 🔒 Security Hardening Guide

## What Was Fixed

### 1. Hardcoded Passwords Removed
The following files previously contained **hardcoded passwords** that could leak credentials:

| File | Previously Hardcoded | Now Loads From |
|------|---------------------|----------------|
| `odoo_mcp.py` | Default fallback `admin` | `.env` → `ODOO_PASSWORD` |
| `reset_odoo_password.py` | `awais@123`, `admin123` | `.env` → `ODOO_MASTER_PASSWORD`, `ODOO_NEW_ADMIN_PASSWORD` |
| `change_odoo_admin_password.py` | `awais@123`, `admin123` | `.env` → `ODOO_MASTER_PASSWORD`, `ODOO_NEW_ADMIN_PASSWORD` |
| `create_invoice_final.py` | `admin123` | `.env` → `ODOO_PASSWORD` |
| `create_odoo_invoice.py` | `Haris@123` | `.env` → `ODOO_PASSWORD` |
| `run_invoice.py` | `Haris@123` | `.env` → `ODOO_PASSWORD` |
| `reset_odoo_and_invoice.py` | `awais@123`, `Haris@123` | `.env` → `ODOO_MASTER_PASSWORD`, `ODOO_PASSWORD` |

### 2. Browser Session Files Ignored
Added `whatsapp_session/` and other browser session directories to `.gitignore` to prevent committing cookies, tokens, and cached credentials.

### 3. Token Files Ignored
Added patterns like `token_*.json`, `credentials.json` to `.gitignore` to prevent committing OAuth tokens.

---

## How to Set Up Your `.env` File

### Step 1: Copy the template
```bash
cp .env.example .env
```

### Step 2: Edit `.env` with your actual credentials
```bash
nano .env
# or
vim .env
```

### Step 3: Required Variables to Set

#### Odoo Credentials
```env
# Odoo user password (for XML-RPC API access)
ODOO_PASSWORD=your-actual-odoo-password

# Odoo Master Password (for database management - found in odoo.conf as 'admin_passwd')
ODOO_MASTER_PASSWORD=your-actual-master-password

# Optional: New admin password (for password reset scripts)
ODOO_NEW_ADMIN_PASSWORD=your-new-secure-password
```

#### Other Required Credentials
```env
# LLM API Keys
OPENAI_API_KEY=your-openai-key
LITELLM_API_KEY=your-litellm-key

# Email (if using Gmail MCP)
SENDER_EMAIL=your-email@gmail.com

# WhatsApp/Twilio (if using)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# LinkedIn (if using)
LINKEDIN_ACCESS_TOKEN=your-linkedin-token
```

### Step 4: Install python-dotenv
All scripts now use `python-dotenv` to load `.env` variables:
```bash
pip install python-dotenv
```

### Step 5: Verify Setup
Run any script - it will show a clear error if credentials are missing:
```bash
python create_invoice_final.py
```

If `.env` is not configured, you'll see:
```
❌ Error: ODOO_PASSWORD not set in .env

Please add your Odoo password to .env file:
   ODOO_PASSWORD=your-odoo-password
```

---

## Security Best Practices

### ✅ DO
- Store all credentials in `.env` file
- Add `.env` to `.gitignore` (already done)
- Use strong, unique passwords
- Rotate credentials regularly
- Use `.env.example` as a template for team members

### ❌ NEVER
- Commit `.env` to version control
- Hardcode passwords in Python files
- Share credentials in plain text
- Use default passwords in production
- Log or print credential values

---

## Files Modified

| File | Change |
|------|--------|
| `.gitignore` | Added `whatsapp_session/`, `token_*.json`, cleaned up patterns |
| `.env.example` | Added `ODOO_MASTER_PASSWORD`, `ODOO_NEW_ADMIN_PASSWORD`, `LOG_LEVEL` |
| `reset_odoo_password.py` | Removed hardcoded passwords, loads from `.env` |
| `change_odoo_admin_password.py` | Removed hardcoded passwords, loads from `.env` |
| `create_invoice_final.py` | Removed hardcoded password, loads from `.env` |
| `create_odoo_invoice.py` | Removed hardcoded password, loads from `.env` |
| `run_invoice.py` | Removed hardcoded password, loads from `.env` |
| `reset_odoo_and_invoice.py` | Removed hardcoded passwords and brute-force list, loads from `.env` |

### Files Already Secure
- `odoo_mcp.py` - Already used `os.getenv("ODOO_PASSWORD")` with `load_dotenv()`
- `orchestrator.py` - Already used `os.getenv()` for configuration
- `get_linkedin_urn.py` - Already used `os.getenv("LINKEDIN_ACCESS_TOKEN")`

---

## Scanner-Friendly

All security scanners should now pass because:
1. ✅ No hardcoded passwords in source code
2. ✅ Credentials loaded from environment variables
3. ✅ `.env` excluded from version control
4. ✅ Browser session files excluded from version control
5. ✅ Token files excluded from version control
6. ✅ Clear error messages when credentials are missing
7. ✅ No credential values in git history (after cleanup)

---

## Cleaning Git History (If Previously Committed)

If credentials were previously committed to git, you need to remove them from history:

```bash
# Remove sensitive files from git history (keep locally)
git rm --cached .env
git rm --cached credentials.json
git rm --cached token_*.json
git rm --cached -r whatsapp_session/

# Commit the cleanup
git commit -m "security: remove sensitive files from tracking"

# For complete history rewrite (if passwords were committed):
# WARNING: This rewrites git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env credentials.json' \
  --prune-empty --tag-name-filter cat -- --all
```

After rewriting history, force push (if using remote):
```bash
git push origin --force --all
```

Then rotate any exposed credentials immediately.
