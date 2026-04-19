# Authentication Setup Guide - Digital Employee

This guide covers setting up both Gmail and LinkedIn authentication for the MCP servers.

## Quick Start

### Option 1: Interactive Setup (Recommended)

Run the unified setup script:

```bash
./setup_auth.sh
```

This will guide you through both Gmail and LinkedIn authentication.

### Option 2: Individual Setup

**For Gmail:**
```bash
node setup_gmail_auth.js
```

**For LinkedIn:**
```bash
./setup_linkedin_auth.sh
```

---

## Gmail Authentication

### Overview
- Uses Gmail API with OAuth 2.0
- Requires Google Cloud Project setup
- Token-based authentication (auto-refresh)

### Prerequisites
1. Google Cloud Platform account
2. Create OAuth 2.0 credentials (Desktop app)
3. Download `credentials.json`

### Setup Steps

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Create new project
   - Enable Gmail API
   - Configure OAuth consent screen
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download credentials.json

2. **Place Credentials**
   ```bash
   # Move downloaded file to project root
   mv ~/Downloads/credentials.json ./credentials.json
   ```

3. **Run Authorization**
   ```bash
   node setup_gmail_auth.js
   ```

4. **Verify**
   - `credentials.json` - OAuth client credentials
   - `token.json` - OAuth token (auto-generated)

### Detailed Guide
See `GMAIL_SETUP_GUIDE.md` for step-by-step instructions.

---

## LinkedIn Authentication

### Overview
- Uses Playwright browser automation
- Session cookie-based authentication
- One-time login, reusable session

### Setup Steps

1. **Run Setup Script**
   ```bash
   ./setup_linkedin_auth.sh
   ```

2. **Login to LinkedIn**
   - Browser will open automatically
   - Login with your credentials
   - Session cookies are saved automatically

3. **Verify**
   - `linkedin_session/cookies.json` - Session cookies

### Testing

Test your LinkedIn session:
```python
python3 -c "from Agent_Skills.SKILL_LInkedin_Playwright_MCP import test_linkedin_session; test_linkedin_session()"
```

---

## File Structure

After complete setup:
```
Digital_Employee/
├── credentials.json              # Gmail OAuth credentials (DO NOT SHARE)
├── token.json                    # Gmail OAuth token (auto-generated)
├── linkedin_session/
│   └── cookies.json              # LinkedIn session cookies (DO NOT SHARE)
├── setup_gmail_auth.js           # Gmail authorization helper
├── setup_linkedin_auth.sh        # LinkedIn authorization helper
├── setup_auth.sh                 # Unified setup script
└── GMAIL_SETUP_GUIDE.md          # Detailed Gmail setup guide
```

---

## Security Notes

⚠️ **IMPORTANT:**
- Never commit authentication files to version control
- All auth files are in `.gitignore`
- Keep credentials secure - they provide access to your accounts
- Revoke access in Google/LinkedIn settings if compromised

---

## Troubleshooting

### Gmail Issues

**"credentials.json not found"**
- Follow GMAIL_SETUP_GUIDE.md to create Google Cloud Project
- Download OAuth 2.0 credentials

**"Token expired"**
- Delete `token.json`
- Run `node setup_gmail_auth.js` again

**"Permission denied"**
- Ensure Gmail API is enabled
- Add your email as test user in OAuth consent screen

### LinkedIn Issues

**"No saved session"**
- Run `./setup_linkedin_auth.sh`
- Complete the login process

**"Session expired"**
- Run setup script again to refresh session
- Session typically lasts several weeks

**"Playwright not installed"**
- Script auto-installs Playwright
- Or manually: `pip3 install playwright && python3 -m playwright install chromium`

---

## Next Steps

After authentication is setup:

1. **Test Gmail**
   ```bash
   # The setup script will test automatically
   # Or check token.json exists
   ls -l token.json
   ```

2. **Test LinkedIn**
   ```bash
   python3 -c "from Agent_Skills.SKILL_LInkedin_Playwright_MCP import test_linkedin_session; test_linkedin_session()"
   ```

3. **Use MCP Servers**
   - Both servers are configured in `.mcp.json`
   - They will use the saved credentials automatically

---

## Additional Resources

- `GMAIL_SETUP_GUIDE.md` - Detailed Gmail setup
- `email_mcp.js` - Gmail MCP server implementation
- `Agent_Skills/SKILL_LInkedin_Playwright_MCP.py` - LinkedIn MCP server

---

**Need Help?**
Check the individual guides or review the error messages for specific troubleshooting steps.
