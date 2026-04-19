# 🔵 SKILL: Twitter/X Posting via Playwright MCP

**Version:** 1.0.0 (Silver Tier)
**Tier:** Silver - Human-in-the-Loop
**Type:** Action Skill
**Last Updated:** 2026-04-10

---

## 📋 Overview

This skill enables **professional Twitter/X post creation and publishing** using Playwright browser automation with a **saved session** (no repeated logins required).

**Critical Safety Rules:**
- ✅ **ALWAYS requires Human-in-the-Loop approval** before posting
- ✅ **NEVER auto-post** without explicit human approval
- ✅ **ALWAYS save drafts** to `/Pending_Approval/` first
- ✅ **USE saved session** from `/twitter_session/` folder
- ✅ **FOLLOW professional business post standards**
- ✅ **RESPECT Twitter/X rate limits and content policies**

---

## 🎯 When to Use This Skill

Use this skill when:
- Task type contains `"twitter"` or `"TWITTER"` or `"x"` or `"X_POST"`
- File named `TWITTER_DAILY_POST.md` appears in `/Needs_Action/`
- Human requests Twitter/X post creation
- Orchestrator detects Twitter/X-related tasks
- Command: `python3 orchestrator.py tasks "Post on Twitter: ..."`

---

## 📝 Professional Twitter/X Post Guidelines

### Post Structure (Single Tweet)

```
[Hook - First 100 characters, attention-grabbing]

[Core message - concise and impactful]

[Call-to-Action or question to drive engagement]

[1-3 Relevant Hashtags]
```

### Thread Structure (Multi-Tweet)

```
Tweet 1/Thread: [Hook + context]
Tweet 2/Thread: [Key insight/detail]
Tweet 3/Thread: [Supporting point/example]
...
Tweet N/Thread: [Summary + CTA + Hashtags]
```

### Hook Examples

**Announcement:**
- 🚀 "Excited to announce..."
- "We just shipped..."
- "Big milestone..."

**Thought Leadership:**
- "Hot take on AI development:"
- "Most people don't realize..."
- 💡 "Here's what I've learned building AI products:"

**Educational:**
- "Thread 🧵 on building AI agents in 2026:"
- 🎯 "5 things I wish I knew before..."
- "Quick guide to..."

### Post Rules

**Character Limits:**
- Free accounts: 280 characters per tweet
- Premium accounts: 25,000 characters per post

**✅ DO:**
- Keep it concise and punchy
- Use line breaks for readability
- Include 1-3 relevant hashtags
- Add emojis strategically (2-4 max)
- Ask questions to drive engagement
- Tag relevant accounts when appropriate
- Use threads for longer content

**❌ DON'T:**
- Exceed character limits
- Overuse hashtags or emojis
- Post controversial or divisive content
- Share sensitive company information
- Spam or engage in trolls
- Use excessive @ mentions

### Hashtag Strategy

**Always use 1-3 hashtags:**
- 1 broad: `#AI`, `#Tech`, `#Innovation`
- 1 niche: `#AIAgents`, `#SaaS`, `#BuildInPublic`
- 0-1 campaign-specific: `#DigitalFTE`, `#Automation`

**Popular Hashtags for AI/SaaS:**
```
#AI
#Tech
#AIAgents
#SaaS
#BuildInPublic
#Automation
#MachineLearning
#Innovation
#StartupLife
#AICommunity
```

### Engagement Best Practices

- **Post timing:** Tue-Thu, 9:00 AM - 12:00 PM (local timezone)
- **Frequency:** 1-3 posts per day max
- **Engagement window:** First 30 minutes critical for algorithm
- **Thread strategy:** Number tweets (1/5, 2/5, etc.) for readability
- **Visual content:** Tweets with images/videos get 3x more engagement

---

## 🔧 Technical Implementation

### Session Management

**Saved Session Location:** `./twitter_session/`

The session folder contains:
- `cookies.json` - Twitter/X authentication cookies
- Session persists across runs (scan QR code OR login ONLY once)

**Session Setup Script:**

```bash
python3 -c "
from playwright.sync_api import sync_playwright
import json, os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://x.com')
    input('Login to Twitter/X and press Enter...')

    cookies = context.cookies()
    os.makedirs('./twitter_session', exist_ok=True)
    with open('./twitter_session/cookies.json', 'w') as f:
        json.dump(cookies, f)

    browser.close()
    print('✅ Twitter/X session saved!')
"
```

**Session Validation:**

```bash
python3 -c "
from playwright.sync_api import sync_playwright
import json, os

session_file = './twitter_session/cookies.json'
if not os.path.exists(session_file):
    print('❌ No saved session found')
    exit(1)

with open(session_file) as f:
    cookies = json.load(f)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(storage_state=session_file)
    page = context.new_page()
    page.goto('https://x.com/home')
    page.wait_for_load_state('networkidle')

    if '/login' in page.url:
        print('❌ Session expired - re-authentication required')
    else:
        print('✅ Session is valid!')

    browser.close()
"
```

### Playwright MCP Function

**File:** `Agent_Skills/SKILL_Twitter_X_Post.py`

```python
from Agent_Skills.SKILL_Twitter_X_Post import post_to_twitter

result = post_to_twitter(
    content="Your tweet text here...",
    image_path=None,  # Optional: path to image
    is_thread=False   # Set True for multi-tweet threads
)

# Returns:
{
    "success": True/False,
    "message": "Post successfully created on Twitter/X",
    "post_url": "https://x.com/username/status/...",
    "tweet_count": 1  # Number of tweets posted (for threads)
}
```

**For Threads:**

```python
result = post_to_twitter(
    content=["Tweet 1 content...", "Tweet 2 content...", "Tweet 3 content..."],
    image_path=None,
    is_thread=True
)
```

### Core Playwright Implementation

```python
from playwright.sync_api import sync_playwright
import json, os, time
from datetime import datetime

def post_to_twitter(content, image_path=None, is_thread=False):
    """Post to Twitter/X using Playwright with saved session."""
    session_file = './twitter_session/cookies.json'

    if not os.path.exists(session_file):
        return {"success": False, "message": "No saved Twitter/X session found"}

    with open(session_file) as f:
        cookies = json.load(f)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=session_file)
            page = context.new_page()

            # Navigate to home
            page.goto('https://x.com/home', wait_until='networkidle')
            time.sleep(2)

            # Check if logged in
            if '/login' in page.url:
                browser.close()
                return {"success": False, "message": "Session expired"}

            # Click tweet compose button
            compose_btn = page.get_by_role('button', name='Post')
            if not compose_btn.count():
                compose_btn = page.get_by_test_id('tweetButtonInline')

            compose_btn.click()
            time.sleep(1)

            # Get compose area and type content
            if isinstance(content, list):
                # Thread posting
                for i, tweet in enumerate(content):
                    textarea = page.get_by_role('textbox').first
                    textarea.fill(tweet)
                    time.sleep(1)

                    if i < len(content) - 1:
                        # Add another tweet to thread
                        add_btn = page.get_by_role('button', name='Add another post')
                        if add_btn.count():
                            add_btn.click()
                            time.sleep(1)
                    else:
                        # Post the thread
                        post_btn = page.get_by_role('button', name='Post all')
                        post_btn.click()
            else:
                # Single tweet
                textarea = page.get_by_role('textbox').first
                textarea.fill(content)
                time.sleep(1)

                # Attach image if provided
                if image_path:
                    file_input = page.get_by_test_id('fileInput')
                    file_input.set_input_files(image_path)
                    time.sleep(2)

                # Post
                post_btn = page.get_by_role('button', name='Post')
                post_btn.click()

            # Wait for post to complete
            time.sleep(3)
            page.wait_for_load_state('networkidle')

            browser.close()

            return {
                "success": True,
                "message": "Post successfully created on Twitter/X",
                "post_url": f"https://x.com/home",
                "tweet_count": len(content) if isinstance(content, list) else 1
            }

    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}
```

---

## 🔄 Workflow: From Trigger to Published Post

### Step 1: Trigger Detection

Orchestrator detects Twitter/X trigger:
- File in `/Needs_Action/TWITTER_DAILY_POST.md`
- Task type contains "twitter" or "x"
- Command: `python3 orchestrator.py tasks "Post on Twitter: ..."`

### Step 2: Generate Post + Summary

System creates post with:
- ✅ Hook (first 100 chars)
- ✅ Core message (concise)
- ✅ CTA or engagement question
- ✅ 1-3 hashtags
- ✅ Character count verification
- ✅ **Post summary** (topic, tone, target audience, estimated reach)

**Summary Format:**
```markdown
## 📊 Post Summary

**Topic:** AI Agents Development
**Tone:** Professional, informative
**Target Audience:** SaaS developers, AI engineers
**Character Count:** 245/280
**Hashtags:** #AI #AIAgents #BuildInPublic
**Estimated Reach:** 500-2000 impressions (based on follower count)
**Engagement Prediction:** 15-30 likes, 3-8 retweets
```

### Step 3: Save Draft to Pending_Approval

**File:** `/Pending_Approval/TWITTER_POST_{YYYYMMDD_HHMMSS}.md`

Draft includes:
- Full post content
- Post summary with metrics
- Character count validation
- Hashtag analysis
- Approval instructions
- Estimated engagement metrics

### Step 4: Human Review

Human reviews draft and chooses:
- ✅ **Approve** → Move to `/Approved/`
- 🔄 **Regenerate** → Move to `/Needs_Action/` with notes
- ❌ **Reject** → Move to `/Rejected/`
- ⏳ **Pending** → Leave in `/Pending_Approval/`

### Step 5: Publish via Playwright MCP

After human moves to `/Approved/`:
1. Orchestrator detects approved file
2. Extracts post content
3. Validates session exists in `./twitter_session/`
4. Calls `post_to_twitter()` from Playwright MCP
5. Uses saved session from `./twitter_session/`
6. Posts to Twitter/X automatically

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
│   └── TWITTER_DAILY_POST.md           ← Trigger file
├── Pending_Approval/
│   └── TWITTER_POST_20260410_120000.md ← Draft awaiting approval
├── Approved/
│   └── TWITTER_POST_20260410_120000.md ← Human-approved, ready to post
├── Done/
│   └── TWITTER_POST_20260410_120000.md ← Successfully posted
├── Rejected/
│   └── TWITTER_POST_20260410_120000.md ← Rejected draft
├── Agent_Skills/
│   ├── SKILL_Twitter_X_Post.py         ← Playwright MCP implementation
│   └── SKILL_Twitter_X_Post.md         ← This skill documentation
├── twitter_session/
│   └── cookies.json                    ← Saved session (DO NOT COMMIT)
└── Dashboard.md                        ← Control panel with Twitter section
```

---

## 🛡️ Safety & Compliance

### Rate Limits

- ⏳ **Minimum 30 seconds** between tweets
- 📊 **Max 1-3 posts per day** (Twitter/X safe limit for organic)
- 🧵 **Max 25 tweets per thread** (Twitter/X limit)
- 🕐 **Optimal posting times:** Tue-Thu, 9:00 AM - 12:00 PM

### Content Rules

- ✅ Professional business content only
- ✅ No spam, no controversial topics
- ✅ Respect Twitter/X Rules and Terms of Service
- ✅ No automated follows, likes, or DMs
- ✅ No scraping or data harvesting
- ✅ No engagement manipulation

### Session Security

- 🔒 Session cookies are file-based (local only)
- 🔒 **NEVER commit** `twitter_session/` to Git (in `.gitignore`)
- 🔒 Session expires after ~30 days (refresh via login)
- 🔒 If session fails, fallback to visible mode for re-authentication

---

## 📋 Approval File Structure

```markdown
---
type: approval_request | twitter_post_draft
action: publish_twitter_post
status: pending_approval
priority: high | normal
created: YYYY-MM-DDTHH:MM:SS
---

# ✅ Approval Required: Twitter/X Post

## 📊 Post Summary

**Topic:** [Topic description]
**Tone:** [Professional/Informative/Casual]
**Target Audience:** [Audience description]
**Character Count:** [X/280]
**Hashtags:** #Tag1 #Tag2 #Tag3
**Estimated Reach:** [Range] impressions
**Engagement Prediction:** [Range] likes, [Range] retweets

---

## 🐦 Post Content

[Full tweet text here...]

---

## 🎯 Action Buttons

| Action | Destination | Description |
|--------|-------------|-------------|
| ✅ **Approve** | `/Approved/` | Post via Playwright MCP |
| 🔄 **Regenerate** | `/Needs_Action/` | Add notes and request new draft |
| ❌ **Reject** | `/Rejected/` | Discard this draft |
| ⏳ **Pending** | `/Pending_Approval/` | Keep for later review |

---

## 📝 Human Notes

*Add any comments, edits, or instructions here:*

```

---

## 🐛 Troubleshooting

### "No saved Twitter/X session found"

**Solution:** Run the session setup script shown in Session Management section above.

### "Session expired"

**Solution:** Re-authenticate using the session setup script. Twitter/X sessions typically last 2-4 weeks.

### "Could not find compose button"

**Causes:**
- Twitter/X UI changed
- Session expired
- Page didn't load fully

**Solution:**
- Check session is valid: Login to Twitter/X in browser
- Increase wait times in Playwright implementation
- Update selectors in `SKILL_Twitter_X_Post.py`

### "Post failed - character limit exceeded"

**Solution:** Ensure content is under 280 characters (or 25,000 for Premium). The draft generation step should validate this automatically.

### "Rate limit exceeded"

**Solution:** Wait 30+ seconds before attempting another post. Twitter/X enforces strict rate limits.

---

## 📊 Metrics & Analytics

After posting, track:
- ✅ Post URL
- ✅ Timestamp
- ✅ Character count
- ✅ Hashtag count
- ✅ Tweet count (for threads)
- ✅ Engagement (manual check after 24h)

**Dashboard Section:**
```
🐦 Twitter/X Posts This Week:
| Date       | Topic          | Type    | Status | URL |
|------------|----------------|---------|--------|-----|
| 2026-04-10 | AI Agents      | Single  | ✅ Live | [link] |
| 2026-04-10 | SaaS Tips      | Thread  | ✅ Live | [link] |
```

---

## 🎓 Best Practices

1. **Post Consistency** - Daily posting builds audience momentum
2. **Engagement Window** - First 30 minutes are critical for algorithm distribution
3. **Visual Content** - Tweets with images get 3x more engagement
4. **Thread Strategy** - Use threads for educational/how-to content
5. **Hashtag Balance** - 1-3 relevant hashtags, no more
6. **Human Touch** - Always review before posting (no fully automated posts)
7. **Analytics Review** - Check performance weekly, adjust strategy
8. **Timing** - Post when your audience is most active (check Twitter Analytics)
9. **Engagement** - Respond to replies within first hour to boost visibility
10. **Cross-Platform** - Adapt content from LinkedIn posts, don't duplicate

---

## 🔗 MCP Configuration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "twitter-playwright": {
      "type": "stdio",
      "command": "python3",
      "args": ["/absolute/path/to/Agent_Skills/SKILL_Twitter_X_Post.py"],
      "env": {
        "TWITTER_SESSION_PATH": "/absolute/path/to/twitter_session"
      }
    }
  }
}
```

---

## 🔗 Related Files

- `orchestrator.py` - Main orchestrator with Twitter/X integration (TODO)
- `Agent_Skills/SKILL_Twitter_X_Post.py` - Playwright MCP implementation (TODO)
- `Agent_Skills/SKILL_LinkedIn_Playwright_MCP.py` - Reference Playwright implementation
- `.env` - Environment configuration
- `.mcp.json` - MCP server configuration
- `.gitignore` - Ensure `twitter_session/` is excluded

---

## 📝 TODO: Implementation Checklist

- [ ] Create `SKILL_Twitter_X_Post.py` with Playwright implementation
- [ ] Set up `twitter_session/` directory and add to `.gitignore`
- [ ] Run session setup script to save cookies
- [ ] Add Twitter/X MCP server to `.mcp.json`
- [ ] Add Twitter/X detection logic to `orchestrator.py`
- [ ] Create `create_twitter_approval_file()` function in orchestrator
- [ ] Add Twitter/X section to `Dashboard.md`
- [ ] Test end-to-end workflow (draft → approval → post)
- [ ] Set up rate limiting in orchestrator
- [ ] Add engagement tracking (manual or automated)

---

*🤖 SKILL_Twitter_X_Post v1.0.0 | Silver Tier - Human-in-the-Loop*
*📍 Digital Employee System | Always require human approval before posting*
