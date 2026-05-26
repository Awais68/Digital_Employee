# 📱 LinkedIn MCP - Complete Setup Guide

**Digital Employee System - Silver Tier**
**Version:** 1.0
**Last Updated:** 2026-04-03

---

## 📋 Overview

LinkedIn MCP (Model Context Protocol) enables your Digital Employee to automatically publish LinkedIn posts via the LinkedIn API v2 (UGC Posts API).

### Features

- ✅ **LinkedIn API v2 Integration** - UGC Posts API for publishing
- ✅ **OAuth2 Authentication** - Secure token-based access
- ✅ **Text Posts with Hashtags** - Auto-tag hashtags for better reach
- ✅ **Rich Media Support** - Upload images and videos
- ✅ **Dry-Run Mode** - Test without publishing (DRY_RUN=true)
- ✅ **Post Metrics** - Fetch likes, comments, shares, engagement rate
- ✅ **Token Refresh** - Auto-refresh expired access tokens
- ✅ **Comprehensive Logging** - Full audit trail in `/Logs/`
- ✅ **CLI Commands** - Easy testing and usage

---

## 🚀 Quick Start

### 1. Get LinkedIn API Credentials

#### Step 1: Create LinkedIn Developer App

1. Go to https://www.linkedin.com/developers/apps
2. Click **"Create app"**
3. Select your LinkedIn Page (or create one)
4. Fill in app details:
   - **App Name:** Digital Employee
   - **Company:** Your Company
   - **App URL:** https://your-website.com
   - **Privacy Policy URL:** https://your-website.com/privacy
5. Click **"Create app**"

#### Step 2: Get OAuth2 Credentials

1. In your app dashboard, go to **"Auth"** tab
2. Copy these credentials:
   - **Client ID** (LINKEDIN_CLIENT_ID)
   - **Client Secret** (LINKEDIN_CLIENT_SECRET)
3. Set **Redirect URL:** `https://www.linkedin.com/oauth/v2/authorization`

#### Step 3: Generate Access Token

**Option A: Using LinkedIn API Explorer (Recommended for Testing)**

1. Go to https://www.linkedin.com/developers/tools/oauth/token-generator
2. Select your app
3. Choose scopes:
   - `w_member_social` (for posting)
   - `r_basicprofile` (for profile info)
4. Click **"Generate token"**
5. Copy the **Access Token**

**Option B: Manual OAuth2 Flow (Production)**

```bash
# 1. Open this URL in browser (replace CLIENT_ID)
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://www.linkedin.com/oauth/v2/authorization&scope=w_member_social%20r_basicprofile&state=123456

# 2. Authorize the app
# 3. Copy the authorization code from redirect URL
# 4. Exchange code for token:

curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=https://www.linkedin.com/oauth/v2/authorization" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

#### Step 4: Get Your Person URN

```bash
# After getting access token, run:
curl -X GET https://api.linkedin.com/v2/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "id": "ACoAABC1234567890",
  "firstName": {
    "localized": {
      "en_US": "Your Name"
    }
  },
  ...
}
```

Your Person URN is: `urn:li:person:ACoAABC1234567890`

### 2. Configure .env File

Edit `.env` and add:

```bash
# LinkedIn MCP Configuration
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_ACCESS_TOKEN=your_access_token_here
LINKEDIN_REFRESH_TOKEN=your_refresh_token_here  # Optional
LINKEDIN_PERSON_URN=urn:li:person:ACoAABC1234567890
LINKEDIN_ORGANIZATION_ID=  # Optional: For company pages

# Set DRY_RUN to true for testing
DRY_RUN=true
```

### 3. Install Dependencies

```bash
pip install requests python-dotenv
# Or
pip install -r requirements.txt
```

### 4. Test Connection

```bash
# Test LinkedIn API connection
python3 linkedin_mcp.py test

# Expected output:
# ============================================================
# 📱 Silver Tier LinkedIn MCP v1.0
# ============================================================
# API Base: https://api.linkedin.com/v2
# Client ID: abc12345...
# Dry Run: True
# ------------------------------------------------------------
# Testing LinkedIn API connection...
# ✅ Connection test successful: Connected as: Your Name
# ✅ Connection test passed
```

---

## 📁 Usage Examples

### Create a Text Post

```bash
# Simple post
python3 linkedin_mcp.py post "Excited to share our latest AI project! #AI #SaaS #Innovation"

# With dry-run (testing)
DRY_RUN=true python3 linkedin_mcp.py post "Test post #Testing"
```

### Create Post from File

```bash
# Create post from markdown file
python3 linkedin_mcp.py post-file Pending_Approval/LINKEDIN_POST_*.md
```

### Refresh Access Token

```bash
# Refresh expired token (requires refresh_token)
python3 linkedin_mcp.py refresh-token
```

---

## 🔧 Integration with Orchestrator

LinkedIn MCP automatically integrates with the orchestrator for auto-publishing.

### Workflow

```
LinkedIn Post Request (Needs_Action/)
        ↓
Orchestrator generates draft
        ↓
Pending_Approval/LINKEDIN_POST_*.md
        ↓
Human reviews and moves to Approved/
        ↓
Orchestrator detects LinkedIn post in Approved/
        ↓
Calls linkedin_mcp.create_post()
        ↓
Post published to LinkedIn
        ↓
File updated with post URL → Done/
```

### Orchestrator Integration Code

The orchestrator (`orchestrator.py`) includes:

```python
def publish_linkedin_post(file_path: Path, metrics: MetricsManager):
    """Publish LinkedIn post from approved file."""
    from linkedin_mcp import create_post as mcp_create_post
    
    content = read_file_content(file_path)
    post_data = extract_linkedin_post_content(content)
    
    result = mcp_create_post(content=post_data["content"])
    
    if result["success"]:
        # Update file with post URL
        # Move to Done/
        return True, result["post_url"]
    else:
        return False, result["message"]
```

---

## 📊 File Format

### LinkedIn Post Draft Format

When orchestrator creates a LinkedIn post draft:

**File:** `Pending_Approval/LINKEDIN_POST_20260403_120000.md`

```markdown
---
type: linkedin_post_draft
status: pending_approval
priority: normal
created: 2026-04-03 12:00:00
skill_reference: SKILL_LinkedIn_Posting
---

# 📱 LinkedIn Post Draft

## Proposed Post Content

🚀 Excited to announce our new AI-powered SaaS platform!

After months of development, we're finally ready to ship. Here's what makes it special:

• Agentic workflows that reduce manual tasks
• Smart integrations that understand context
• Self-improving systems that learn from usage

This isn't the future—it's happening now.

#AI #SaaS #AIAgents #Innovation #TechStartup

## Metadata

- **Word Count:** 85 / 300 words
- **Character Count:** 650 / 2,800 characters
- **Hashtag Count:** 5 / 5 hashtags
- **Estimated Reach:** 500-2000 impressions

---

## Approval Status

- [ ] ✅ Approved for publishing
- [ ] ✏️ Requires modifications
- [ ] ❌ Rejected

## Approval Notes

*Pending human review*
```

### After Publishing

**File:** `Done/LINKEDIN_POST_20260403_120000.md`

```markdown
---
## ✅ LinkedIn Post Published

- **Published At:** 2026-04-03T12:05:00
- **Status:** Live on LinkedIn
- **Post URL:** https://www.linkedin.com/feed/update/urn:li:ugcPost:7052123456789
- **Message:** LinkedIn post published successfully

[Original content...]
```

---

## 🧪 Testing Guide

### Test 1: Connection Test

```bash
python3 linkedin_mcp.py test
```

**Expected Output:**
```
✅ Connection test successful: Connected as: Your Name
✅ Connection test passed
```

### Test 2: Dry-Run Post

```bash
# Set DRY_RUN=true
export DRY_RUN=true

# Create test post
python3 linkedin_mcp.py post "Test post from Digital Employee #Testing #AI"
```

**Expected Output:**
```
🔍 DRY RUN - LinkedIn post would be published:
   Content preview: Test post from Digital Employee #Testing #AI
   Visibility: PUBLIC
✅ Post published successfully
```

### Test 3: Check Logs

```bash
# View LinkedIn logs
cat Logs/linkedin_log_$(date +%Y%m%d).md

# Or follow in real-time
tail -f Logs/linkedin_mcp.log
```

### Test 4: Full Workflow Test

```bash
# 1. Create LinkedIn request
cat > Needs_Action/LINKEDIN_TEST.md << 'EOF'
---
type: linkedin_request
priority: normal
topic: AI Development Update
---

# LinkedIn Post Request

## Topic
Building AI Agents for Business Automation

## Key Points
- Discussing latest AI agent developments
- Business automation benefits
- Future of AI in workplace
EOF

# 2. Run orchestrator
python3 orchestrator.py

# 3. Check generated draft
cat Pending_Approval/LINKEDIN_POST_*.md

# 4. Approve for publishing (DRY_RUN mode)
mv Pending_Approval/LINKEDIN_POST_*.md Approved/

# 5. Run orchestrator again
python3 orchestrator.py

# 6. Check result
cat Done/LINKEDIN_POST_*.md
```

---

## 🐛 Troubleshooting

### Issue: "Access token not configured"

**Solution:**
1. Check `.env` has `LINKEDIN_ACCESS_TOKEN`
2. Verify token is valid (not expired)
3. Generate new token if needed

### Issue: "Connection test failed: 401"

**Solution:**
1. Access token expired (valid for 60 days)
2. Generate new access token
3. Or use refresh_token to refresh

### Issue: "Cannot determine author URN"

**Solution:**
1. Set `LINKEDIN_PERSON_URN` in `.env`
2. Format: `urn:li:person:ACoAABC1234567890`
3. Get from `https://api.linkedin.com/v2/me`

### Issue: "Post content exceeds 3000 character limit"

**Solution:**
1. Shorten post content
2. LinkedIn limit is 3000 characters
3. Use concise messaging

### Issue: "LinkedIn API error (429)"

**Solution:**
1. Rate limit exceeded
2. Wait 1 hour before retrying
3. LinkedIn allows 500 requests/day

---

## 📁 File Locations

| File/Folder | Purpose |
|-------------|---------|
| `linkedin_mcp.py` | Main MCP server |
| `/Logs/linkedin_mcp.log` | MCP activity logs |
| `/Logs/linkedin_log_*.md` | Daily post logs |
| `/Pending_Approval/LINKEDIN_POST_*.md` | Draft posts |
| `/Approved/LINKEDIN_POST_*.md` | Ready to publish |
| `/Done/LINKEDIN_POST_*.md` | Published posts |
| `.env` | Configuration |

---

## 🔗 API Reference

### Create Post Endpoint

```
POST https://api.linkedin.com/v2/ugcPosts
Headers:
  Authorization: Bearer {access_token}
  X-Restli-Protocol-Version: 2.0.0
  Content-Type: application/json
  linkedin-version: 202402
```

### Request Body

```json
{
  "author": "urn:li:person:ACoAABC1234567890",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "contentEntities": {
        "entities": []
      },
      "description": {
        "text": "Post content here #hashtag",
        "attributes": [
          {
            "start": 20,
            "length": 9,
            "entityType": "HASHTAG",
            "hashtag": {
              "tag": "hashtag"
            }
          }
        ]
      }
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

### Response

```json
{
  "id": "urn:li:ugcPost:7052123456789"
}
```

---

## 🎯 Best Practices

1. **Always Test with DRY_RUN first**
   - Set `DRY_RUN=true` before testing
   - Verify content and formatting
   - Then set `DRY_RUN=false` for production

2. **Use Hashtags Strategically**
   - 3-5 hashtags per post
   - Mix popular and niche tags
   - Auto-tagged by MCP

3. **Monitor Engagement**
   - Check metrics after 24-48 hours
   - Use `get_post_metrics()` method
   - Track what content performs best

4. **Keep Tokens Secure**
   - Never commit `.env` to Git
   - Rotate tokens periodically
   - Use refresh tokens for production

5. **Respect Rate Limits**
   - 500 requests/day limit
   - Space out posts (max 1-2 per day)
   - Avoid posting in rapid succession

---

## 📞 Quick Reference Commands

```bash
# === TESTING ===
python3 linkedin_mcp.py test              # Test connection
python3 linkedin_mcp.py refresh-token     # Refresh token

# === POSTING ===
python3 linkedin_mcp.py post "Content"    # Create post
python3 linkedin_mcp.py post-file file.md # From file

# === MONITORING ===
cat Logs/linkedin_mcp.log                 # View logs
tail -f Logs/linkedin_mcp.log             # Follow logs
cat Logs/linkedin_log_*.md                # Daily logs

# === CONFIGURATION ===
# Edit .env:
DRY_RUN=true                              # Enable dry-run
LINKEDIN_ACCESS_TOKEN=your_token          # Set token
```

---

**Digital Employee System - Silver Tier v5.0**
**LinkedIn MCP v1.0**
**Last Updated:** 2026-04-03
