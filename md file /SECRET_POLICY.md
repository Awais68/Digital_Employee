# 🔒 Security & Secret Management Policy

## STRICT COMPLIANCE: NO SECRETS IN VERSION CONTROL

This policy ensures **zero tolerance** for secret key leakage in the repository.

---

## 🚫 NEVER COMMIT THESE FILES

### 1. Environment & Configuration Files
- `.env` (use `.env.example` as template)
- `.env.local`, `.env.production`, `.env.backup`
- `config.json` with credentials
- Any file containing API keys, tokens, or passwords

### 2. Browser Session & Cache Data
- `whatsapp_session/` ❌ **LEAKED GOOGLE API KEY HERE**
- `browser_session/`
- `*Session*/`
- `*Local Storage/`
- `*IndexedDB/`
- `*Service Worker/`
- `*Code Cache/`
- `*Cookies*`
- `*Cache/`
- `*GPUCache/`

**Why?** Browser sessions contain:
- Authentication cookies
- Cached API keys
- OAuth tokens
- User credentials
- Session data

### 3. Credentials & Keys
- `credentials.json`
- `token.json`
- `service_account.json`
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- `*.cert`, `*.crt`
- AWS credentials file
- Database connection strings with passwords

### 4. Database Files
- `*.sql`, `*.sqlite`, `*.sqlite3`, `*.db`
- Database dumps and backups
- Any file containing production data

### 5. OS & IDE Files
- `.DS_Store`, `Thumbs.db`, `desktop.ini`
- `.vscode/`, `.idea/`
- `*.swp`, `*.swo`

## ✅ SAFE TO COMMIT

### 1. Template Files
- `.env.example` (with placeholder values)
- `config.example.json`
- Documentation with fake/example credentials

### 2. Code Without Secrets (Mandatory)
All scripts MUST follow this pattern:
```python
import os
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

# Use os.getenv with optional safe default
API_KEY = os.getenv("MY_SERVICE_API_KEY")
```

---

## 🛑 MANDATORY SCRIPT TEMPLATE

Every Python script in this repository that uses credentials MUST use this template:

```python
#!/usr/bin/env python3
import os
from dotenv import load_dotenv

# 1. Always load .env first
load_dotenv(override=True)

# 2. Extract credentials ONLY via environment variables
CREDENTIAL = os.getenv("VARIABLE_NAME")

# 3. Fail gracefully if required credential is missing
if not CREDENTIAL:
    print("❌ Error: VARIABLE_NAME not set in .env")
    # exit or handle error
```

**CRITICAL:** Never assign a string literal to a variable that represents a secret.

---

## 🛡️ AUTOMATED PROTECTIONS

- `README.md`
- `SETUP_GUIDE.md`
- API documentation (without real keys)

---

## 🛡️ AUTOMATED PROTECTIONS

### Pre-Commit Hook (Active)
The repository includes a `.git/hooks/pre-commit` hook that **blocks commits** containing:
- ❌ Google API Keys (`AIzaSy...`)
- ❌ OpenAI API Keys (`sk-...`)
- ❌ AWS Access Keys (`AKIA...`)
- ❌ Hardcoded passwords
- ❌ Private keys
- ❌ Browser session files
- ❌ `.env` files (except `.env.example`)
- ❌ Credential files

### .gitignore Rules
Comprehensive `.gitignore` patterns prevent accidental staging of:
- All browser cache/session directories
- Environment files
- Credential and key files
- Database files
- Build artifacts

---

## 📋 SECRET MANAGEMENT BEST PRACTICES

### 1. Use Environment Variables
```bash
# ✅ GOOD
export GOOGLE_API_KEY="your-key-here"
python app.py
```

```python
# ✅ GOOD - Read from environment
import os
api_key = os.environ.get('GOOGLE_API_KEY')
```

### 2. Use `.env` Files Locally
```bash
# Create .env (already in .gitignore)
GOOGLE_API_KEY=your-real-key-here
OPENAI_API_KEY=sk-your-key-here
```

```python
# Use python-dotenv
from dotenv import load_dotenv
load_dotenv()
api_key = os.environ.get('GOOGLE_API_KEY')
```

### 3. Use Secret Managers (Production)
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Cloud Secret Manager

### 4. Use `.env.example` as Template
```bash
# .env.example (SAFE TO COMMIT)
GOOGLE_API_KEY=your-google-api-key-here
OPENAI_API_KEY=your-openai-key-here
SENDER_EMAIL=your-email@gmail.com
```

---

## 🚨 IF A SECRET IS LEAKED

### Immediate Actions (Within 1 Hour)
1. **Rotate the secret** - Generate a new one immediately
2. **Revoke the old secret** - Use the provider's console
3. **Remove from git history** - Use `git filter-branch` or BFG
4. **Force push** - `git push --force`
5. **Close security alerts** - Mark as "revoked"

### Investigation (Within 24 Hours)
1. Check access logs for unauthorized usage
2. Review which systems used the compromised secret
3. Update all dependent systems with new secret
4. Document the incident

### Prevention (Within 48 Hours)
1. Add the pattern to `.gitignore`
2. Update pre-commit hooks if needed
3. Notify team members
4. Review other repositories for same secret

---

## 🔍 SECRET PATTERNS TO WATCH

| Pattern | Example | Risk Level |
|---------|---------|------------|
| Google API Key | `AIzaSy[a-zA-Z0-9_-]{33}` | 🔴 Critical |
| OpenAI Key | `sk-[a-zA-Z0-9]{20,}` | 🔴 Critical |
| AWS Access Key | `AKIA[0-9A-Z]{16}` | 🔴 Critical |
| GitHub Token | `ghp_[a-zA-Z0-9]{36}` | 🔴 Critical |
| Generic Password | `password = "..."` | 🟡 High |
| Generic Token | `token = "..."` | 🟡 High |
| Private Key | `BEGIN [TYPE] PRIVATE KEY` | 🔴 Critical |
| Database URL | `://user:pass@host` | 🟡 High |

---

## 📚 COMPLIANCE CHECKLIST

Before every commit, verify:
- [ ] No `.env` files staged (except `.env.example`)
- [ ] No browser session/cache files
- [ ] No credential/key files
- [ ] No hardcoded passwords in code
- [ ] No database files
- [ ] Pre-commit hook is active
- [ ] `.gitignore` is up to date

---

## 🛠️ SETUP INSTRUCTIONS

### For New Developers
```bash
# 1. Clone repository
git clone <repo-url>
cd <repo>

# 2. Copy environment template
cp .env.example .env

# 3. Fill in your credentials in .env
nano .env

# 4. Verify pre-commit hook is active
ls -la .git/hooks/pre-commit

# 5. Make it executable if needed
chmod +x .git/hooks/pre-commit
```

### Verify Protection
```bash
# Test that secrets are blocked
echo "AIzaSyExampleTestKeyNotReal1234567890" > test_secret.txt
git add test_secret.txt
git commit -m "test"  # Should be BLOCKED

# Clean up
git reset HEAD test_secret.txt
rm test_secret.txt
```

---

## 📞 INCIDENT RESPONSE

If you detect a secret leak:
1. **Don't panic** - Follow the steps above
2. **Rotate immediately** - Generate new secret
3. **Notify team** - Alert in team channel
4. **Document** - Create incident report
5. **Prevent** - Update policies if needed

---

## 📅 POLICY REVIEW

This policy should be reviewed:
- After every security incident
- When new secret types are identified
- When onboarding new team members
- Quarterly as best practice

**Last Updated:** April 6, 2026  
**Version:** 1.0  
**Status:** ✅ ACTIVE & ENFORCED
