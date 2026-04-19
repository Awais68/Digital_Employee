# 📘 SKILL: Facebook & Instagram Posting via Playwright MCP

**Version:** 1.0.0 (Silver Tier)
**Tier:** Silver - Human-in-the-Loop
**Type:** Action Skill
**Last Updated:** 2026-04-10

---

## 📋 Overview

This skill enables **professional Facebook and Instagram post creation and publishing** using Playwright browser automation with a **saved session** (no repeated logins required).

**Critical Safety Rules:**
- ✅ **ALWAYS requires Human-in-the-Loop approval** before posting
- ✅ **NEVER auto-post** without explicit human approval
- ✅ **ALWAYS save drafts** to `/Pending_Approval/` first
- ✅ **USE saved session** from `/facebook_session/` and `/instagram_session/` folders
- ✅ **FOLLOW professional business post standards**
- ✅ **RESPECT Facebook & Instagram rate limits and content policies**

---

## 🎯 When to Use This Skill

Use this skill when:
- Task type contains `"facebook"`, `"FACEBOOK"`, `"instagram"`, `"INSTAGRAM"`, `"fb"`, or `"ig"`
- File named `FACEBOOK_DAILY_POST.md` or `INSTAGRAM_DAILY_POST.md` appears in `/Needs_Action/`
- Human requests Facebook or Instagram post creation
- Orchestrator detects Facebook/Instagram-related tasks
- Command: `python3 orchestrator.py tasks "Post on Facebook: ..."` or `"Post on Instagram: ..."`

---

## 📝 Professional Facebook Post Guidelines

### Post Structure

```
[Hook - First 125 characters, attention-grabbing]

[Body - 2-3 paragraphs with value/insights/story]

[Call-to-Action - Clear next step for audience]

[2-5 Relevant Hashtags]
```

### Post Types

**Announcement:**
- 🚀 "Exciting news! We're thrilled to announce..."
- "Big milestone alert! We just reached..."
- "It's official! After months of work..."

**Educational/Tips:**
- 💡 "Here's a quick tip for..."
- "Did you know? 78% of businesses..."
- "3 things we learned about..."

**Behind-the-Scenes:**
- "Take a peek behind the curtain..."
- "Here's what goes into building..."
- "Meet the team behind..."

**Engagement/Question:**
- "We'd love to hear your thoughts on..."
- "Question for our community:"
- "What's your experience with...?"

### Facebook Post Rules

**✅ DO:**
- Use conversational, friendly tone
- Include images/videos (posts with images get 2.3x more engagement)
- Ask questions to drive comments
- Keep paragraphs short (2-3 sentences)
- Use 2-5 relevant hashtags
- Tag relevant people/pages when appropriate
- Include links to drive traffic

**❌ DON'T:**
- Write walls of text
- Overuse hashtags or emojis
- Post controversial or divisive content
- Share sensitive company information
- Use clickbait or misleading headlines
- Post without visual content

### Hashtag Strategy

**Always use 2-5 hashtags:**
- 1-2 broad: `#AI`, `#Tech`, `#Innovation`, `#Business`
- 1-2 niche: `#AIAgents`, `#SaaS`, `#DigitalTransformation`
- 0-1 campaign-specific: `#DigitalFTE`, `#Automation`

**Popular Hashtags for AI/SaaS:**
```
#AI
#Tech
#Innovation
#AIAgents
#SaaS
#DigitalTransformation
#Automation
#MachineLearning
#StartupLife
#BusinessGrowth
```

---

## 📸 Professional Instagram Post Guidelines

### Post Structure (Caption)

```
[Hook - First 125 characters (visible before "more")]

[Body - 1-2 short paragraphs or bullet points]

[Call-to-Action - Clear engagement prompt]

[.
.
. (line breaks for spacing)
3-10 Relevant Hashtags]
```

### Caption Best Practices

**Hook Examples:**
- "Stop scrolling! 🛑 Here's why this matters..."
- "The truth about AI in 2026..."
- "Behind every great product is a great team 💪"

**Body:**
- Use line breaks for readability
- Include bullet points or emojis strategically
- Share stories, tips, or insights
- Keep it conversational and authentic

**Call-to-Action:**
- "Double-tap if you agree! ❤️"
- "Drop your thoughts in the comments 👇"
- "Save this post for later 📌"
- "Share with someone who needs this 🔄"

### Instagram Post Rules

**Character Limits:**
- Caption: 2,200 characters max
- Hashtags: 30 max (use 5-10 for best results)

**✅ DO:**
- Hook in first 125 characters (before "more")
- Use 5-10 relevant hashtags per post
- Include strong visual content (image/video required)
- Add line breaks for readability (use "." or spacing)
- Engage with comments within first hour
- Use Instagram Stories for additional reach
- Tag relevant accounts and locations

**❌ DON'T:**
- Exceed 2,200 characters
- Use irrelevant or banned hashtags
- Post without high-quality visuals
- Overuse emojis (keep to 3-5 max)
- Include links in captions (not clickable)
- Use "engagement bait" phrases excessively

### Instagram Hashtag Strategy

**Use a mix of hashtag sizes:**
- 2-3 large (500K+ posts): `#AI`, `#Tech`, `#Innovation`
- 2-3 medium (50K-500K posts): `#AIAgents`, `#SaaS`, `#TechStartup`
- 1-2 niche (<50K posts): `#DigitalFTE`, `#AgenticAI`

**Banned Hashtags to Avoid:**
- Check hashtags against Instagram's banned list
- Common banned: `#alone`, `#always`, `#assday`, etc.
- Use tools like Flick or Later to validate hashtags

### Visual Content Requirements

**Image Specs:**
- Square: 1080x1080px (1:1 ratio)
- Portrait: 1080x1350px (4:5 ratio) - **Best for engagement**
- Landscape: 1080x566px (1.91:1 ratio)

**Video Specs:**
- Max length: 60 seconds (feed posts)
- Format: MP4 or MOV
- Resolution: 1080x1080px minimum

---

## 🔧 Technical Implementation

### Session Management

#### Facebook Session

**Saved Session Location:** `./facebook_session/`

The session folder contains:
- `cookies.json` - Facebook authentication cookies
- Session persists across runs (login ONLY once)

**Facebook Session Setup Script:**

```bash
python3 -c "
from playwright.sync_api import sync_playwright
import json, os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://www.facebook.com')
    input('Login to Facebook and press Enter...')

    cookies = context.cookies()
    os.makedirs('./facebook_session', exist_ok=True)
    with open('./facebook_session/cookies.json', 'w') as f:
        json.dump(cookies, f)

    browser.close()
    print('✅ Facebook session saved!')
"
```

#### Instagram Session

**Saved Session Location:** `./instagram_session/`

The session folder contains:
- `cookies.json` - Instagram authentication cookies
- Session persists across runs (login ONLY once)

**Instagram Session Setup Script:**

```bash
python3 -c "
from playwright.sync_api import sync_playwright
import json, os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://www.instagram.com')
    input('Login to Instagram and press Enter...')

    cookies = context.cookies()
    os.makedirs('./instagram_session', exist_ok=True)
    with open('./instagram_session/cookies.json', 'w') as f:
        json.dump(cookies, f)

    browser.close()
    print('✅ Instagram session saved!')
"
```

### Playwright MCP Functions

**File:** `Agent_Skills/SKILL_Facebook_Instagram_Post.py`

#### Facebook Posting Function

```python
from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook

result = post_to_facebook(
    content="Your Facebook post text here...",
    image_path=None,  # Optional: path to image
    link_url=None     # Optional: URL to share
)

# Returns:
{
    "success": True/False,
    "message": "Post successfully created on Facebook",
    "post_url": "https://www.facebook.com/yourpage/posts/...",
    "platform": "facebook"
}
```

#### Instagram Posting Function

```python
from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram

result = post_to_instagram(
    content="Your Instagram caption here...",
    image_path="/path/to/image.jpg",  # Required for Instagram
    post_type="feed"  # "feed", "carousel", or "story"
)

# Returns:
{
    "success": True/False,
    "message": "Post successfully created on Instagram",
    "post_url": "https://www.instagram.com/p/POST_ID/",
    "platform": "instagram",
    "post_type": "feed"
}
```

### Core Playwright Implementation

```python
from playwright.sync_api import sync_playwright
import json, os, time
from datetime import datetime

def post_to_facebook(content, image_path=None, link_url=None):
    """Post to Facebook using Playwright with saved session."""
    session_file = './facebook_session/cookies.json'

    if not os.path.exists(session_file):
        return {"success": False, "message": "No saved Facebook session found"}

    with open(session_file) as f:
        cookies = json.load(f)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=session_file)
            page = context.new_page()

            # Navigate to Facebook
            page.goto('https://www.facebook.com', wait_until='networkidle')
            time.sleep(2)

            # Check if logged in
            if '/login' in page.url:
                browser.close()
                return {"success": False, "message": "Session expired - re-authentication required"}

            # Click "What's on your mind?" post box
            post_box = page.get_by_placeholder("What's on your mind?")
            if not post_box.count():
                post_box = page.get_by_role('textbox').first

            post_box.click()
            time.sleep(1)

            # Type content
            post_box.fill(content)
            time.sleep(1)

            # Attach image if provided
            if image_path:
                file_input = page.get_by_test_id('photo-input')
                if file_input.count():
                    file_input.set_input_files(image_path)
                else:
                    # Alternative: click photo/video button
                    photo_btn = page.get_by_role('button', name='Photo/video')
                    photo_btn.click()
                    time.sleep(1)
                    file_input = page.locator('input[type="file"]')
                    file_input.set_input_files(image_path)
                time.sleep(2)

            # Attach link if provided
            if link_url:
                # Facebook auto-expands links when pasted
                post_box.press('Control+a')
                post_box.press('Control+c')
                post_box.fill(content + '\n\n' + link_url)
                time.sleep(2)

            # Post
            post_btn = page.get_by_role('button', name='Post', exact=True)
            if not post_btn.count():
                post_btn = page.get_by_text('Post', exact=True)

            post_btn.click()
            time.sleep(3)
            page.wait_for_load_state('networkidle')

            browser.close()

            return {
                "success": True,
                "message": "Post successfully created on Facebook",
                "post_url": f"https://www.facebook.com",
                "platform": "facebook"
            }

    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


def post_to_instagram(content, image_path, post_type="feed"):
    """Post to Instagram using Playwright with saved session."""
    session_file = './instagram_session/cookies.json'

    if not os.path.exists(session_file):
        return {"success": False, "message": "No saved Instagram session found"}

    if not image_path:
        return {"success": False, "message": "Image is required for Instagram posts"}

    with open(session_file) as f:
        cookies = json.load(f)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=session_file)
            page = context.new_page()

            # Navigate to Instagram
            page.goto('https://www.instagram.com', wait_until='networkidle')
            time.sleep(2)

            # Check if logged in
            if '/accounts/login' in page.url:
                browser.close()
                return {"success": False, "message": "Session expired - re-authentication required"}

            # Click create post (+ button)
            create_btn = page.get_by_role('button', name='Create')
            if not create_btn.count():
                create_btn = page.locator('svg[aria-label="New post"]')
            if not create_btn.count():
                create_btn = page.locator('svg[aria-label="Create"]')

            create_btn.click()
            time.sleep(2)

            # Upload image
            file_input = page.locator('input[type="file"]')
            file_input.set_input_files(image_path)
            time.sleep(2)

            # Click Next (crop/adjust)
            next_btn = page.get_by_role('button', name='Next')
            if next_btn.count():
                next_btn.click()
                time.sleep(2)

            # Add caption
            if post_type == "feed":
                textarea = page.get_by_role('textbox')
                if textarea.count():
                    textarea.fill(content)
                    time.sleep(1)

            # Share post
            share_btn = page.get_by_role('button', name='Share')
            if not share_btn.count():
                share_btn = page.get_by_text('Share', exact=True)

            share_btn.click()
            time.sleep(3)
            page.wait_for_load_state('networkidle')

            browser.close()

            return {
                "success": True,
                "message": "Post successfully created on Instagram",
                "post_url": f"https://www.instagram.com",
                "platform": "instagram",
                "post_type": post_type
            }

    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}
```

---

## 🔄 Workflow: From Trigger to Published Post

### Step 1: Trigger Detection

Orchestrator detects Facebook/Instagram trigger:
- File in `/Needs_Action/FACEBOOK_DAILY_POST.md` or `INSTAGRAM_DAILY_POST.md`
- Task type contains "facebook" or "instagram"
- Command: `python3 orchestrator.py tasks "Post on Facebook: ..."`

### Step 2: Generate Post + Summary

System creates post with:

**For Facebook:**
- ✅ Hook (first 125 chars)
- ✅ Body (2-3 paragraphs)
- ✅ CTA (clear engagement prompt)
- ✅ 2-5 hashtags
- ✅ Character count verification
- ✅ **Post summary** (topic, tone, target audience, estimated reach)

**For Instagram:**
- ✅ Hook (first 125 chars before "more")
- ✅ Body (1-2 short paragraphs)
- ✅ CTA (engagement prompt)
- ✅ Line breaks for spacing
- ✅ 5-10 hashtags
- ✅ Character count verification (max 2,200)
- ✅ **Post summary** (topic, visual description, hashtags, estimated reach)

**Summary Format:**
```markdown
## 📊 Post Summary

**Platform:** Facebook | Instagram
**Topic:** AI Agents Development
**Tone:** Professional, engaging
**Target Audience:** SaaS developers, business owners
**Character Count:** 487/5000 (FB) | 892/2200 (IG)
**Hashtags:** #AI #AIAgents #SaaS #Innovation #Tech
**Visual:** [Description of suggested image]
**Estimated Reach:** 500-2000 impressions (organic)
**Engagement Prediction:** 20-50 likes, 5-15 comments
```

### Step 3: Save Draft to Pending_Approval

**Facebook File:** `/Pending_Approval/FACEBOOK_POST_{YYYYMMDD_HHMMSS}.md`
**Instagram File:** `/Pending_Approval/INSTAGRAM_POST_{YYYYMMDD_HHMMSS}.md`

Draft includes:
- Full post content
- Post summary with metrics
- Character count validation
- Hashtag analysis
- Visual content suggestion
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
2. Extracts post content and image path
3. Calls `post_to_facebook()` or `post_to_instagram()` from Playwright MCP
4. Uses saved session from `./facebook_session/` or `./instagram_session/`
5. Posts to Facebook or Instagram automatically

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
│   ├── FACEBOOK_DAILY_POST.md          ← Facebook trigger file
│   └── INSTAGRAM_DAILY_POST.md         ← Instagram trigger file
├── Pending_Approval/
│   ├── FACEBOOK_POST_20260410_120000.md    ← Facebook draft awaiting approval
│   └── INSTAGRAM_POST_20260410_120000.md   ← Instagram draft awaiting approval
├── Approved/
│   ├── FACEBOOK_POST_20260410_120000.md    ← Human-approved, ready to post
│   └── INSTAGRAM_POST_20260410_120000.md   ← Human-approved, ready to post
├── Done/
│   ├── FACEBOOK_POST_20260410_120000.md    ← Successfully posted
│   └── INSTAGRAM_POST_20260410_120000.md   ← Successfully posted
├── Rejected/
│   ├── FACEBOOK_POST_20260410_120000.md    ← Rejected draft
│   └── INSTAGRAM_POST_20260410_120000.md   ← Rejected draft
├── Agent_Skills/
│   ├── SKILL_Facebook_Instagram_Post.py    ← Playwright MCP implementation
│   └── SKILL_Facebook_Instagram_Post.md    ← This skill documentation
├── facebook_session/
│   └── cookies.json                        ← Facebook saved session (DO NOT COMMIT)
├── instagram_session/
│   └── cookies.json                        ← Instagram saved session (DO NOT COMMIT)
└── Dashboard.md                            ← Control panel with social media section
```

---

## 🛡️ Safety & Compliance

### Rate Limits

**Facebook:**
- ⏳ **Minimum 60 seconds** between posts
- 📊 **Max 3-5 posts per day** (Facebook safe limit)
- 🕐 **Optimal posting times:** Mon-Fri, 9:00 AM - 2:00 PM

**Instagram:**
- ⏳ **Minimum 60 seconds** between posts
- 📊 **Max 1-2 feed posts per day** (Instagram safe limit)
- 🕐 **Optimal posting times:** Mon-Fri, 11:00 AM - 2:00 PM
- 📱 **Stories:** Max 5-10 per day

### Content Rules

- ✅ Professional business content only
- ✅ No spam, no controversial topics
- ✅ Respect Facebook & Instagram Community Guidelines
- ✅ No automated likes, comments, or follows
- ✅ No scraping or data harvesting
- ✅ No engagement manipulation or bought followers
- ✅ Include proper disclosures for sponsored content

### Session Security

- 🔒 Session cookies are file-based (local only)
- 🔒 **NEVER commit** `facebook_session/` or `instagram_session/` to Git (in `.gitignore`)
- 🔒 Session expires after ~30 days (refresh via login)
- 🔒 If session fails, fallback to visible mode for re-authentication

---

## 📋 Approval File Structure

```markdown
---
type: approval_request | facebook_post_draft | instagram_post_draft
action: publish_facebook_post | publish_instagram_post
status: pending_approval
priority: high | normal
created: YYYY-MM-DDTHH:MM:SS
---

# ✅ Approval Required: Facebook/Instagram Post

## 📊 Post Summary

**Platform:** Facebook | Instagram
**Topic:** [Topic description]
**Tone:** [Professional/Engaging/Casual]
**Target Audience:** [Audience description]
**Character Count:** [X/5000 (FB) | X/2200 (IG)]
**Hashtags:** #Tag1 #Tag2 #Tag3 #Tag4 #Tag5
**Visual:** [Description of suggested image]
**Estimated Reach:** [Range] impressions
**Engagement Prediction:** [Range] likes, [Range] comments

---

## 📘 Facebook Post / 📸 Instagram Post

[Full post text here...]

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

### "No saved Facebook/Instagram session found"

**Solution:** Run the session setup script shown in Session Management section above.

### "Session expired"

**Solution:** Re-authenticate using the session setup script. Sessions typically last 2-4 weeks.

### "Could not find post composer element"

**Causes:**
- Platform UI changed
- Session expired
- Page didn't load fully

**Solution:**
- Check session is valid: Login to platform in browser
- Increase wait times in Playwright implementation
- Update selectors in `SKILL_Facebook_Instagram_Post.py`

### "Post failed - character limit exceeded"

**Solution:** Ensure Instagram caption is under 2,200 characters. Facebook allows up to 63,206 characters, but shorter posts (200-500 chars) perform better.

### "Rate limit exceeded"

**Solution:** Wait 60+ seconds before attempting another post. Both platforms enforce strict rate limits.

### "Instagram requires an image"

**Solution:** Instagram posts MUST include an image. Provide a valid `image_path` when calling `post_to_instagram()`.

---

## 📊 Metrics & Analytics

After posting, track:
- ✅ Post URL
- ✅ Timestamp
- ✅ Character count
- ✅ Hashtag count
- ✅ Image attached (yes/no)
- ✅ Engagement (manual check after 24h)

**Dashboard Section:**
```
📘 Facebook Posts This Week:
| Date       | Topic          | Status | URL |
|------------|----------------|--------|-----|
| 2026-04-10 | AI Agents      | ✅ Live | [link] |

📸 Instagram Posts This Week:
| Date       | Topic          | Visual | Status | URL |
|------------|----------------|--------|--------|-----|
| 2026-04-10 | Product Launch | Image  | ✅ Live | [link] |
```

---

## 🎓 Best Practices

### Facebook Best Practices

1. **Post Consistency** - Daily or every other day builds audience momentum
2. **Engagement Window** - First 60 minutes are critical for algorithm distribution
3. **Visual Content** - Posts with images get 2.3x more engagement
4. **Link Sharing** - Include links strategically to drive traffic
5. **Question Posts** - Posts with questions get 2x more comments
6. **Human Touch** - Always review before posting (no fully automated posts)
7. **Analytics Review** - Check Facebook Insights weekly, adjust strategy
8. **Timing** - Post when your audience is most active (check Page Insights)
9. **Community Management** - Respond to comments within first 2 hours
10. **Cross-Platform** - Adapt content from LinkedIn posts, don't duplicate

### Instagram Best Practices

1. **Visual First** - High-quality images/videos are non-negotiable
2. **Hook Early** - First 125 characters determine if users read more
3. **Hashtag Strategy** - Mix of large, medium, and niche hashtags (5-10 total)
4. **Engagement** - First hour is critical for algorithm push
5. **Stories** - Use Stories for behind-the-scenes and daily updates
6. **Carousels** - Multi-image posts get 3x more engagement
7. **Line Breaks** - Use "." or spacing for readable captions
8. **CTA** - Always include clear engagement prompt
9. **Consistency** - Post 3-5 times per week minimum
10. **Analytics** - Review Instagram Insights weekly for optimization

---

## 🔗 MCP Configuration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "facebook-instagram-playwright": {
      "type": "stdio",
      "command": "python3",
      "args": ["/absolute/path/to/Agent_Skills/SKILL_Facebook_Instagram_Post.py"],
      "env": {
        "FACEBOOK_SESSION_PATH": "/absolute/path/to/facebook_session",
        "INSTAGRAM_SESSION_PATH": "/absolute/path/to/instagram_session"
      }
    }
  }
}
```

---

## 🔗 Related Files

- `orchestrator.py` - Main orchestrator with Facebook/Instagram integration (TODO)
- `Agent_Skills/SKILL_Facebook_Instagram_Post.py` - Playwright MCP implementation (TODO)
- `Agent_Skills/SKILL_LinkedIn_Playwright_MCP.py` - Reference Playwright implementation
- `Agent_Skills/SKILL_Twitter_X_Post.py` - Reference Playwright implementation
- `.env` - Environment configuration
- `.mcp.json` - MCP server configuration
- `.gitignore` - Ensure `facebook_session/` and `instagram_session/` are excluded

---

## 📝 TODO: Implementation Checklist

- [ ] Create `SKILL_Facebook_Instagram_Post.py` with Playwright implementation
- [ ] Set up `facebook_session/` and `instagram_session/` directories
- [ ] Add session directories to `.gitignore`
- [ ] Run session setup scripts to save cookies
- [ ] Add Facebook/Instagram MCP server to `.mcp.json`
- [ ] Add Facebook/Instagram detection logic to `orchestrator.py`
- [ ] Create `create_facebook_approval_file()` and `create_instagram_approval_file()` functions
- [ ] Add Facebook and Instagram sections to `Dashboard.md`
- [ ] Test end-to-end workflow (draft → approval → post)
- [ ] Set up rate limiting in orchestrator
- [ ] Add engagement tracking (manual or automated)
- [ ] Create image generation/selection workflow for Instagram posts

---

*📘 SKILL_Facebook_Instagram_Post v1.0.0 | Silver Tier - Human-in-the-Loop*
*📍 Digital Employee System | Always require human approval before posting*
