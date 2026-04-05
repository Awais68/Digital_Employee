# 📧 Email MCP v3.0 - Full Feature Implementation

## ✅ All Features Implemented

Your Email MCP servers (both Python and Node.js) now have **complete feature support**:

### 1. ✅ File Attachments
- **Single/Multiple attachments** - Attach one or more files
- **MIME type detection** - Automatic detection of file types
- **Base64 encoding** - Proper encoding for Gmail API/SMTP
- **File size validation** - 10MB default limit (configurable)
- **Supported formats** - PDF, images, documents, any file type

### 2. ✅ Multiple Recipients
- **Comma-separated** - `user1@example.com, user2@example.com`
- **Semicolon-separated** - `user1@example.com; user2@example.com`
- **CC & BCC lists** - Both support multiple recipients
- **Automatic parsing** - Handles mixed separators

### 3. ✅ Email Templates
- **Variable substitution** - Use `${name}`, `${date}`, etc.
- **Template management** - Create, save, and list templates
- **File-based storage** - Templates saved to `/Email_Templates/`
- **Frontmatter support** - Metadata in markdown format
- **HTML templates** - Support for HTML email templates

### 4. ✅ Priority/Flagging Headers
- **4 Priority Levels**:
  - `urgent` - Highest priority (X-Priority: 1)
  - `high` - High priority (X-Priority: 2)
  - `normal` - Default (X-Priority: 3)
  - `low` - Low priority (X-Priority: 5)
- **Standard Headers**:
  - `X-Priority` - Standard priority header
  - `Importance` - Outlook compatibility
  - `X-MSMail-Priority` - Microsoft compatibility

---

## 📋 Feature Comparison

| Feature | Python (SMTP) | Node.js (Gmail API) |
|---------|---------------|---------------------|
| ✅ Attachments | ✅ Yes | ✅ Yes |
| ✅ Multiple Recipients | ✅ Yes | ✅ Yes |
| ✅ CC/BCC Lists | ✅ Yes | ✅ Yes |
| ✅ Email Templates | ✅ Yes | ✅ Yes |
| ✅ Priority Headers | ✅ Yes | ✅ Yes |
| ✅ HTML Support | ✅ Yes | ✅ Yes |
| ✅ Dry Run Mode | ✅ Yes | ✅ Yes |
| ✅ Reply-To | ✅ Yes | ✅ Yes |
| ✅ Email Threading | ✅ Yes | ✅ Yes |

---

## 🚀 Usage Examples

### Python Implementation

#### Basic Email with Attachments
```python
from email_mcp import send_email

result = send_email(
    to='user1@example.com, user2@example.com',
    subject='Meeting Notes',
    body='Please find attached the meeting notes',
    cc='manager@example.com, boss@example.com',
    attachments=['/path/to/notes.pdf', '/path/to/slides.pptx'],
    priority='high'
)
```

#### Using Templates
```python
from email_mcp import send_from_template, create_template

# Create a template
create_template(
    name='Welcome Email',
    subject='Welcome ${name} to ${company}!',
    body='Dear ${name},\n\nYour account ${email} is ready.\n\nBest regards,\n${company} Team'
)

# Send using template
result = send_from_template(
    to='newuser@example.com',
    template_name='Welcome Email',
    variables={
        'name': 'John Doe',
        'company': 'Acme Corp',
        'email': 'john@example.com'
    },
    priority='normal'
)
```

#### CLI Usage
```bash
# Send email with attachments and CC
python3 email_mcp.py send "user1@example.com, user2@example.com" \
  "Meeting Notes" "Please see attached" \
  --cc "manager@example.com, boss@example.com" \
  --attach /path/to/file.pdf \
  --attach /path/to/image.jpg \
  --priority high

# Create template
python3 email_mcp.py template-create \
  "Welcome Email" \
  "Welcome \${name}!" \
  "Hello \${name}, your account is ready"

# List templates
python3 email_mcp.py template-list

# Send from template
python3 email_mcp.py template-send "Welcome Email" \
  "user@example.com" name=John company=Acme
```

---

### Node.js Implementation (MCP Server)

#### MCP Tool: send_email
```javascript
{
  "tool": "send_email",
  "arguments": {
    "to": "user1@example.com, user2@example.com",
    "subject": "Project Update",
    "body": "Please find the attached report",
    "cc": "manager@example.com",
    "bcc": "archive@example.com",
    "attachments": ["/path/to/report.pdf", "/path/to/data.xlsx"],
    "priority": "high",
    "is_html": false
  }
}
```

#### MCP Tool: send_email_from_template
```javascript
{
  "tool": "send_email_from_template",
  "arguments": {
    "to": "newuser@example.com",
    "template_name": "Welcome Email",
    "variables": {
      "name": "John Doe",
      "company": "Acme Corp",
      "email": "john@example.com"
    },
    "cc": "hr@example.com",
    "priority": "normal"
  }
}
```

#### MCP Tool: create_template
```javascript
{
  "tool": "create_template",
  "arguments": {
    "name": "Invoice Email",
    "subject": "Invoice #${invoiceNumber} from ${company}",
    "body": "<h1>Invoice</h1><p>Dear ${name},</p><p>Please find invoice #${invoiceNumber} attached.</p><p>Amount: ${amount}</p>",
    "is_html": true
  }
}
```

#### MCP Tool: list_templates
```javascript
{
  "tool": "list_templates",
  "arguments": {}
}
```

---

## 📁 File Structure

```
Digital_Employee/
├── email_mcp.py                 # Python implementation (v3.0)
├── email_mcp.js                 # Node.js MCP server (v3.0)
├── Email_Templates/             # Email templates directory
│   └── test_welcome.md          # Example template
├── Logs/
│   ├── email_mcp.log            # MCP activity log
│   └── email_log_YYYYMMDD.md    # Daily email logs
├── .env                         # Environment variables
├── credentials.json             # Google OAuth credentials
└── token.json                   # OAuth access token
```

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Email Configuration
SENDER_EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
SENDER_NAME=Digital Employee

# SMTP Settings
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587

# Feature Settings
DRY_RUN=false                     # Enable for testing
MAX_ATTACHMENT_SIZE=10485760      # 10MB in bytes

# Gmail API (Node.js)
GMAIL_CREDENTIALS_PATH=./credentials.json
GMAIL_TOKEN_PATH=./token.json
```

---

## 🎯 Priority Levels

| Priority | X-Priority | Importance | Use Case |
|----------|------------|------------|----------|
| `urgent` | 1 | High | Critical issues, emergencies |
| `high` | 2 | High | Important deadlines, urgent requests |
| `normal` | 3 | Normal | Regular emails (default) |
| `low` | 5 | Low | FYI, newsletters, non-urgent |

---

## 📝 Template Format

Templates are saved as markdown files with YAML frontmatter:

```markdown
---
name: Welcome Email
is_html: false
---
Subject: Welcome ${name} to ${company}!

Dear ${name},

Welcome to ${company}! Your account ${email} has been created.

Best regards,
${company} Team
```

### Template Variables
- Use `${variableName}` syntax
- Variables are case-sensitive
- Missing variables are left as-is (safe substitution)

---

## 🧪 Testing

### Python Tests
```bash
# Run basic tests
python3 -c "from email_mcp import EmailMCP; mcp = EmailMCP(dry_run=True); print('✅ Works')"

# Test connection
python3 email_mcp.py test

# Send test email with dry run
DRY_RUN=true python3 email_mcp.py send "test@example.com" "Test" "Test body"
```

### Node.js Tests
```bash
# Test connection
node email_mcp.js test

# Start MCP server
node email_mcp.js
```

---

## 🔐 Security Features

1. **Attachment Size Limits** - Prevents oversized attachments (10MB default)
2. **File Validation** - Checks file existence before sending
3. **Dry Run Mode** - Test without sending
4. **Credential Protection** - `.env` and token files in `.gitignore`
5. **Email Logging** - All emails logged for audit trail

---

## 📊 MCP Tools Available (Node.js)

1. **send_email** - Send email with full feature support
2. **send_email_from_template** - Send using templates
3. **create_template** - Create reusable email templates
4. **list_templates** - List available templates
5. **test_email_connection** - Test Gmail API connection
6. **get_auth_url** - Get OAuth2 authorization URL
7. **set_auth_code** - Complete OAuth2 flow

---

## 🎓 Quick Start

### Python
```python
from email_mcp import send_email, create_template

# Simple email
send_email(
    to='user@example.com',
    subject='Hello',
    body='Hi there!'
)

# Advanced email
send_email(
    to='user1@example.com, user2@example.com',
    subject='Report',
    body='See attached',
    cc='manager@example.com',
    attachments=['/path/to/report.pdf'],
    priority='high'
)
```

### Node.js (via MCP)
```
Use the send_email tool with:
- to: "user1@example.com, user2@example.com"
- subject: "Test Email"
- body: "Hello world"
- cc: "manager@example.com"
- attachments: ["/path/to/file.pdf"]
- priority: "high"
```

---

## ✅ All Tests Passed

- ✅ Python recipient parsing
- ✅ Python template creation & rendering
- ✅ Python priority headers
- ✅ Python template send (dry run)
- ✅ Python attachments (dry run)
- ✅ Node.js recipient parsing
- ✅ Node.js template rendering
- ✅ Node.js priority headers
- ✅ Node.js multiple recipients (dry run)
- ✅ Node.js attachments (dry run)

---

**Digital Employee System - Email MCP v3.0**
**Last Updated:** 2026-04-05
**Status:** ✅ Fully Operational with All Features
