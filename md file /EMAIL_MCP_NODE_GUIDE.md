# 📧 Email MCP (Node.js) - Complete Setup Guide

**Digital Employee System**
**Version:** 1.0.0
**Last Updated:** 2026-04-05

---

## 📋 Overview

Email MCP is a Node.js Model Context Protocol server that provides Gmail integration using Google APIs. It enables AI assistants (Qwen Code, Claude Code) to send emails programmatically with full OAuth 2.0 authentication.

### Features

- ✅ **Gmail API Integration** - Uses official Google APIs (not SMTP)
- ✅ **OAuth 2.0 Authentication** - Secure, token-based access
- ✅ **Plain Text & HTML Emails** - Full MIME message support
- ✅ **CC, BCC, Reply-To** - Complete email headers
- ✅ **Email Threading** - Continue conversations with thread_id
- ✅ **Dry-Run Mode** - Test without sending (DRY_RUN=true)
- ✅ **Comprehensive Logging** - Full audit trail in `/Logs/`
- ✅ **CLI Commands** - Easy testing and usage
- ✅ **Qwen Code Integration** - Works with Qwen MCP
- ✅ **Claude Code Integration** - Works with Claude MCP

---

## 🚀 Quick Start

### 1. Install Node.js Dependencies

```bash
# Navigate to project directory
cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"

# Install required packages
npm install @modelcontextprotocol/sdk googleapis
```

### 2. Get Gmail API Credentials

#### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click **"Select a project"** → **"New Project"**
3. Name: `Digital Employee`
4. Click **"Create"**

#### Step 2: Enable Gmail API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **"Gmail API"**
3. Click on it and press **"Enable"**

#### Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. If prompted, configure OAuth consent screen:
   - **User Type:** External
   - **App Name:** Digital Employee
   - **User support email:** Your email
   - **Developer contact email:** Your email
   - Click **"Save and Continue"**
   - **Scopes:** Add `https://www.googleapis.com/auth/gmail.send`
   - Click **"Save and Continue"**
   - Add test users (your email)
   - Click **"Save and Continue"**

4. Create OAuth client ID:
   - **Application type:** Desktop app
   - **Name:** Digital Employee Email MCP
   - Click **"Create"**

5. Download the credentials:
   - Click **"Download JSON"**
   - Save as `credentials.json` in the Digital_Employee directory

#### Step 4: Move Credentials

```bash
# Move downloaded credentials to project directory
mv ~/Downloads/credentials.json "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/credentials.json"
```

### 3. Configure mcp.json

The `mcp.json` file is already created with default settings. Edit if needed:

```json
{
  "mcpServers": {
    "email_mcp": {
      "command": "node",
      "args": ["email_mcp.js"],
      "config": {
        "GMAIL_CREDENTIALS": "./credentials.json"
      }
    }
  }
}
```

### 4. Authorize Gmail Access

Run the MCP server to get authorization URL:

```bash
# Start the server (it will output authorization URL)
node email_mcp.js
```

Or use the helper commands:

```bash
# Get authorization URL
node -e "
const { GmailAuth } = require('./email_mcp');
const path = require('path');
const auth = new GmailAuth(path.join(__dirname, 'credentials.json'));
auth.initialize().then(() => {
  console.log('Visit this URL to authorize:');
  console.log(auth.getAuthUrl());
});
"
```

**After visiting the URL:**
1. Sign in to your Google account
2. Click **"Allow"** to grant permissions
3. Copy the **authorization code** from the redirect URL

### 5. Complete Authorization

```bash
# Set the authorization code (replace with your code)
node -e "
const { GmailAuth } = require('./email_mcp');
const path = require('path');
const auth = new GmailAuth(path.join(__dirname, 'credentials.json'));
auth.initialize().then(() => {
  return auth.getToken('YOUR_AUTHORIZATION_CODE_HERE');
}).then(tokens => {
  console.log('Authorization successful!');
  console.log('Token saved to token.json');
});
"
```

### 6. Test Connection

```bash
# Test Gmail API connection
node email_mcp.js test
```

**Expected Output:**
```
📧 Starting Email MCP Server v1.0.0...
✅ Email MCP initialized: Digital Employee <your-email@gmail.com>
✅ Email MCP Server running on stdio
Testing connection...
✅ Connection test successful: Successfully connected to Gmail API as your-email@gmail.com
```

---

## 📁 Usage with AI Assistants

### Qwen Code Integration

To add Email MCP to Qwen Code, the server uses stdio transport and will be automatically detected when running in the project directory.

**Configuration:** The `.qwen/settings.json` is already set up with necessary permissions.

**Usage in Qwen:**
```
Use the send_email tool to send an email to test@example.com with subject "Hello" and body "Test message"
```

### Claude Code Integration

To add Email MCP to Claude Code:

**Method 1: Project-level MCP configuration**

Create `.mcp.json` in the project root (already done via `mcp.json`).

**Method 2: Claude settings configuration**

The `.claude/settings.local.json` allows MCP tool usage.

**Usage in Claude:**
```
Please send an email using the email_mcp tool to test@example.com
```

---

## 🔧 Available MCP Tools

### 1. send_email

Send an email via Gmail API.

**Parameters:**
```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "body": "Email body content",
  "is_html": false,
  "cc": "cc@example.com",
  "bcc": "bcc@example.com",
  "reply_to": "reply@example.com",
  "in_reply_to": "message-id-to-reply-to",
  "thread_id": "gmail-thread-id"
}
```

**Required:** `to`, `subject`, `body`  
**Optional:** `is_html`, `cc`, `bcc`, `reply_to`, `in_reply_to`, `thread_id`

**Example Response:**
```json
{
  "success": true,
  "message": "Email sent successfully to recipient@example.com",
  "messageId": "1234567890abcdef",
  "threadId": "thread-123456",
  "dryRun": false,
  "timestamp": "2026-04-05T12:00:00.000Z",
  "to": "recipient@example.com",
  "subject": "Email Subject"
}
```

### 2. test_email_connection

Test the Gmail API connection.

**Parameters:** None

**Example Response:**
```json
{
  "success": true,
  "message": "Successfully connected to Gmail API as your-email@gmail.com",
  "timestamp": "2026-04-05T12:00:00.000Z",
  "senderEmail": "your-email@gmail.com"
}
```

### 3. get_auth_url

Get OAuth2 authorization URL for Gmail authentication.

**Parameters:** None

**Example Response:**
```
Visit this URL to authorize Gmail access:

https://accounts.google.com/o/oauth2/v2/auth?...

After authorization, copy the authorization code and use the 'set_auth_code' tool to complete setup.
```

### 4. set_auth_code

Set the authorization code received from OAuth2 flow.

**Parameters:**
```json
{
  "code": "4/0AX4XfWh..."
}
```

**Example Response:**
```
✅ Authorization successful!

Access token obtained and saved to token.json

Gmail API is now ready to use.
```

---

## 🧪 Testing Guide

### Test 1: Direct Node.js Test

```bash
# Test using built-in CLI
node email_mcp.js test
```

### Test 2: Dry-Run Mode

```bash
# Enable dry-run mode
export DRY_RUN=true

# Test sending email (won't actually send)
node email_mcp.js
# Then use the send_email tool through MCP
```

### Test 3: Check Logs

```bash
# View email logs
cat Logs/email_log_*.md

# Follow logs in real-time
tail -f Logs/email_mcp.log
```

### Test 4: Full Workflow with AI

1. Start Qwen Code or Claude Code in the project directory
2. Ask the AI to: "Test the email connection"
3. AI should use `test_email_connection` tool
4. Verify the response shows successful connection
5. Ask AI to: "Send a test email to your-email@gmail.com"
6. Check your inbox for the email

---

## 📊 File Format

### Email Log Format

Logs are stored in `Logs/email_log_YYYYMMDD.md`:

```markdown
## ✅ Sent - Test Email

| Field | Value |
|-------|-------|
| **Time** | 2026-04-05T12:00:00.000Z |
| **To** | recipient@example.com |
| **Subject** | Test Email |
| **Message ID** | 1234567890abcdef |
| **Status** | ✅ Sent |

**Body Preview:**
```
This is a test email...
```

---
```

---

## 🐛 Troubleshooting

### Issue: "No token found. Run OAuth2 authorization flow first."

**Solution:**
1. Authorization token hasn't been generated yet
2. Run the server and use `get_auth_url` tool
3. Complete the OAuth flow with `set_auth_code`

### Issue: "Failed to initialize Gmail auth: ENOENT"

**Solution:**
1. Check `credentials.json` exists in the project directory
2. Verify the file path in `mcp.json` is correct
3. Ensure credentials JSON is valid

### Issue: "Authentication failed. Token may be expired."

**Solution:**
1. OAuth tokens can expire
2. Re-run authorization flow:
   ```bash
   rm token.json
   node email_mcp.js
   ```
3. Complete OAuth flow again

### Issue: "Permission denied. Check Gmail API access."

**Solution:**
1. Verify Gmail API is enabled in Google Cloud Console
2. Check OAuth consent screen is configured
3. Ensure your email is added as a test user

### Issue: "Invalid recipient email"

**Solution:**
1. Email address must contain `@` symbol
2. Verify the format: `user@example.com`
3. Check for typos in the address

---

## 📁 File Locations

| File/Folder | Purpose |
|-------------|---------|
| `email_mcp.js` | Main MCP server (Node.js) |
| `mcp.json` | MCP configuration |
| `credentials.json` | Google OAuth credentials (from Google Cloud) |
| `token.json` | OAuth access token (auto-generated) |
| `/Logs/email_mcp.log` | MCP activity logs |
| `/Logs/email_log_*.md` | Daily email logs |
| `.qwen/settings.json` | Qwen Code permissions |
| `.claude/settings.local.json` | Claude Code permissions |

---

## 🔐 Security Best Practices

1. **Never commit credentials**
   - `credentials.json` and `token.json` are in `.gitignore`
   - Never share or upload these files
   - Rotate credentials if compromised

2. **Use dry-run for testing**
   - Set `DRY_RUN=true` during development
   - Verify emails before sending to real recipients

3. **Monitor logs**
   - Check `Logs/email_log_*.md` regularly
   - Review for any unexpected email sends

4. **Limit API access**
   - Only request `gmail.send` scope
   - Don't grant unnecessary permissions

---

## 🎯 Integration Examples

### Example 1: Simple Email

```javascript
// Using the MCP tool
{
  "tool": "send_email",
  "arguments": {
    "to": "user@example.com",
    "subject": "Hello",
    "body": "This is a test email"
  }
}
```

### Example 2: HTML Email with CC

```javascript
{
  "tool": "send_email",
  "arguments": {
    "to": "user@example.com",
    "subject": "HTML Report",
    "body": "<h1>Monthly Report</h1><p>Content here...</p>",
    "is_html": true,
    "cc": "manager@example.com"
  }
}
```

### Example 3: Reply to Thread

```javascript
{
  "tool": "send_email",
  "arguments": {
    "to": "user@example.com",
    "subject": "Re: Previous Conversation",
    "body": "Replying to your message...",
    "in_reply_to": "<original-message-id@gmail.com>",
    "thread_id": "thread-id-from-previous-email"
  }
}
```

---

## 📞 Quick Reference Commands

```bash
# === SETUP ===
npm install @modelcontextprotocol/sdk googleapis  # Install dependencies
node email_mcp.js                                 # Start MCP server
node email_mcp.js test                            # Test connection

# === AUTHORIZATION ===
# Use get_auth_url tool to get authorization URL
# Use set_auth_code tool with the code from Google

# === TESTING ===
export DRY_RUN=true                               # Enable dry-run
cat Logs/email_log_*.md                           # View email logs
tail -f Logs/email_mcp.log                        # Follow logs

# === CONFIGURATION ===
# Edit mcp.json to change paths
# Edit .env for environment variables (optional)
```

---

## 🔗 API Reference

### Gmail API Scopes Used

- `https://www.googleapis.com/auth/gmail.send` - Send emails on your behalf

### OAuth 2.0 Flow

1. Get authorization URL → User visits URL → User authorizes
2. Google redirects with authorization code
3. Exchange code for access token + refresh token
4. Token saved to `token.json` for future use
5. Token auto-refreshes when expired

### Message Format

Emails are sent using RFC 2822 format with:
- Multipart/alternative (plain text + HTML)
- Proper MIME headers
- Base64url encoding for Gmail API

---

## 🎓 Next Steps

1. ✅ **Setup Complete** - Email MCP is ready
2. 📧 **Send Test Email** - Use AI assistant to send a test email
3. 🔧 **Integrate with Workflow** - Add to approval workflow
4. 📊 **Monitor Usage** - Check logs regularly
5. 🚀 **Production Use** - Disable DRY_RUN for live emails

---

**Digital Employee System - Email MCP v1.0.0**
**Last Updated:** 2026-04-05
