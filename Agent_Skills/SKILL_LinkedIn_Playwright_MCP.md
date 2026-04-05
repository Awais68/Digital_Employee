# 🔵 SKILL: LinkedIn Posting via Playwright MCP

**Version:** 3.0.0 (Silver Tier)
**Tier:** Silver - Human-in-the-Loop
**Type:** Action Skill
**Last Updated:** 2026-04-04

---

## 📋 Overview

This skill enables **professional LinkedIn post creation and publishing** using Playwright browser automation with a **saved session** (no repeated logins required).

**Critical Safety Rules:**
- ✅ **ALWAYS requires Human-in-the-Loop approval** before posting
- ✅ **NEVER auto-post** without explicit human approval
- ✅ **ALWAYS save drafts** to `/Pending_Approval/` first
- ✅ **USE saved session** from `/linkedin_session/` folder
- ✅ **FOLLOW professional business post standards**

---

## 🎯 When to Use This Skill

Use this skill when:
- Task type contains `"linkedin"` or `"LINKEDIN"`
- File named `LINKEDIN_DAILY_POST.md` appears in `/Needs_Action/`
- Human requests LinkedIn post creation
- Orchestrator detects LinkedIn-related tasks
- Command: `python3 orchestrator.py tasks "Post on LinkedIn: ..."`

---

## 📝 Professional Business Post Guidelines

### Post Structure

Every LinkedIn post MUST follow this structure:

```
[Hook - First 150 characters, attention-grabbing]

[Body - 2-4 short paragraphs with value/insights]

[Call-to-Action - Clear next step for reader]

[3-5 Relevant Hashtags]
```

### Hook Examples

**Announcement:**
- 🚀 "Excited to share what we've been building..."
- "Big news! We're launching something special..."
- "After months of development, it's finally here..."

**Thought Leadership:**
- "Unpopular opinion about AI development..."
- "Here's what most people miss about building AI agents..."
- 💡 "Hot take: The future of SaaS isn't what you think..."

**Educational:**
- "Here's how to build AI agents in 2026..."
- 🎯 "5 lessons learned from shipping AI features..."
- "Want to integrate AI into your SaaS? Start here..."

### Body Rules

✅ **DO:**
- Use short paragraphs (2-3 sentences max)
- Include bullet points or numbered lists
- Share real insights, not fluff
- Keep language conversational and professional
- Use emojis sparingly (2-5 max)
- Add whitespace between paragraphs

❌ **DON'T:**
- Write walls of text
- Use corporate jargon
- Overuse hashtags or emojis
- Post controversial/off-topic content
- Include sensitive company information

### Hashtag Strategy

**Always use 3-5 hashtags:**
- 1-2 broad: `#AI`, `#SaaS`, `#Innovation`
- 1-2 niche: `#AIAgents`, `#AgenticAI`, `#BuildInPublic`
- 0-1 campaign-specific: `#DigitalFTE`, `#Automation`

**Popular Hashtags for AI/SaaS:**
```
#AI (5M+ posts)
#SaaS (2M+ posts)
#AIAgents (100K+ posts)
#AgenticAI (50K+ posts)
#BuildInPublic (500K+ posts)
#Automation (1.5M+ posts)
#MachineLearning (3M+ posts)
#Innovation (4M+ posts)
```

### Call-to-Action (CTA) Examples

- "What's your take on this? Share your thoughts below! 👇"
- "Let's connect if you're building in AI + SaaS! 🤝"
- "♻️ Repost to help your network discover this."
- "Follow along as we build in public."

---

## 🔧 Technical Implementation

### Session Management

**Saved Session Location:** `./linkedin_session/`

The session folder contains:
- `cookies.json` - LinkedIn authentication cookies
- Session persists across runs (scan QR code ONLY once)

**Session Recovery:**
```bash
# Force visible mode for QR scan
python3 -c "
from playwright.sync_api import sync_playwright
import json, os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://www.linkedin.com')
    input('Scan QR code and press Enter...')

    cookies = context.cookies()
    os.makedirs('./linkedin_session', exist_ok=True)
    with open('./linkedin_session/cookies.json', 'w') as f:
        json.dump(cookies, f)

    browser.close()
    print('✅ Session saved!')
"
```

### Playwright MCP Function

**File:** `Agent_Skills/SKILL_LInkedin_Playwright_MCP.py`

```python
from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin

result = post_to_linkedin(
    content="Your post text here...",
    image_path=None,  # Optional: path to image
    target="personal"  # "personal" or "company"
)

# Returns:
{
    "success": True/False,
    "message": "Post successfully created on LinkedIn",
    "post_url": "https://www.linkedin.com/feed/update/..."
}
```

---

## 🔄 Workflow: From Trigger to Published Post

### Step 1: Trigger Detection

Orchestrator detects LinkedIn trigger:
- File in `/Needs_Action/LINKEDIN_DAILY_POST.md`
- Task type contains "linkedin"
- Command: `python3 orchestrator.py tasks "Post on LinkedIn: ..."`

### Step 2: Generate Professional Post

System creates post with:
- ✅ Hook (first 150 chars)
- ✅ Body (2-4 paragraphs)
- ✅ CTA (clear action)
- ✅ 3-5 hashtags
- ✅ Professional formatting
- ✅ Estimated reach metrics

### Step 3: Save Draft to Pending_Approval

**File:** `/Pending_Approval/LINKEDIN_POST_{YYYYMMDD_HHMMSS}.md`

Draft includes:
- Full post content
- Suggested hashtags with reach estimates
- Post metadata (word count, char count, emoji count)
- Approval instructions
- Estimated engagement metrics

### Step 4: Human Review

Human reviews draft and chooses:
- ✅ **Approve** → Move to `/Approved/`
- 🔄 **Regenerate** → Move to `/Needs_Action/` with notes
- ❌ **Reject** → Move to `/Done/`
- ⏳ **Pending** → Leave in `/Pending_Approval/`

### Step 5: Publish via Playwright MCP

After human moves to `/Approved/`:
1. Orchestrator detects approved file
2. Extracts post content
3. Calls `post_to_linkedin()` from Playwright MCP
4. Uses saved session from `./linkedin_session/`
5. Posts to LinkedIn automatically

### Step 6: Log Success/Failure

**Success:**
- Move file to `/Done/`
- Append success note with timestamp and post URL
- Update Dashboard.md with "✅ Posted" status

**Failure:**
- Log error in `/Logs/orchestrator.log`
- Move file back to `/Needs_Action/` with error details
- Update Dashboard.md with "❌ Failed" status

---

## 📁 File Structure

```
Digital_Employee/
├── Needs_Action/
│   └── LINKEDIN_DAILY_POST.md          ← Trigger file
├── Pending_Approval/
│   └── LINKEDIN_POST_20260404_120000.md ← Draft awaiting approval
├── Approved/
│   └── LINKEDIN_POST_20260404_120000.md ← Human-approved, ready to post
├── Done/
│   └── LINKEDIN_POST_20260404_120000.md ← Successfully posted
├── Rejected/
│   └── LINKEDIN_POST_20260404_120000.md ← Rejected draft
├── Agent_Skills/
│   ├── SKILL_LInkedin_Playwright_MCP.py ← Playwright MCP implementation
│   └── SKILL_LinkedIn_Playwright_MCP.md ← This skill documentation
├── linkedin_session/
│   └── cookies.json                     ← Saved session (DO NOT COMMIT)
└── Dashboard.md                         ← Control panel with LinkedIn section
```

---

## 🛡️ Safety & Compliance

### Rate Limits

- ⏳ **Minimum 60 seconds** between posts
- 📊 **Max 3-5 posts per day** (LinkedIn safe limit)
- 🕐 **Optimal posting times:** Tue-Thu, 10:00 AM - 12:00 PM

### Content Rules

- ✅ Professional business content only
- ✅ No spam, no controversial topics
- ✅ Respect LinkedIn User Agreement
- ✅ No automated connection requests
- ✅ No scraping or data harvesting

### Session Security

- 🔒 Session cookies are file-based (not encrypted, but local only)
- 🔒 **NEVER commit** `linkedin_session/` to Git (in `.gitignore`)
- 🔒 Session expires after ~30 days (refresh via QR scan)
- 🔒 If session fails, fallback to visible mode for re-authentication

---

## 🐛 Troubleshooting

### "No saved LinkedIn session found"

**Solution:** Run the QR code scan script shown in Session Management section above.

### "Could not find 'Start a post' element"

**Causes:**
- LinkedIn UI changed
- Session expired
- Page didn't load fully

**Solution:**
- Check session is valid: Login to LinkedIn in browser
- Increase wait times in Playwright MCP
- Update selectors in `SKILL_LInkedin_Playwright_MCP.py`

### "Post published but URL incorrect"

**Normal behavior** - LinkedIn redirects. As long as no error occurred, post was successful.

---

## 📊 Metrics & Analytics

After posting, track:
- ✅ Post URL
- ✅ Timestamp
- ✅ Word count / character count
- ✅ Hashtag count
- ✅ Engagement (manual check after 24h)

**Dashboard Section:**
```
🔵 LinkedIn Posts This Week:
| Date       | Topic          | Status | URL |
|------------|----------------|--------|-----|
| 2026-04-04 | AI Agents      | ✅ Live | [link] |
```

---

## 🎓 Best Practices

1. **Post Consistency** - Daily or every other day is ideal
2. **Engagement Window** - First 60 minutes are critical for algorithm
3. **Visual Content** - Posts with images get 2x engagement
4. **Hashtag Balance** - Mix broad + niche hashtags
5. **Human Touch** - Always review before posting (no fully automated posts)
6. **Analytics Review** - Check performance weekly, adjust strategy

---

## 🔗 Related Files

- `orchestrator.py` - Main orchestrator with LinkedIn integration
- `linkedin_mcp.py` - LinkedIn API MCP (alternative to Playwright)
- `get_linkedin_urn.py` - Fetch your LinkedIn person URN
- `.env` - Environment configuration

---

*🤖 SKILL_LinkedIn_Playwright_MCP v3.0.0 | Silver Tier - Human-in-the-Loop*
*📍 Digital Employee System | Always require human approval before posting*
