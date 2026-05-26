# 🔵 LinkedIn Integration Setup Guide

**Version:** 1.0  
**Last Updated:** 2026-04-04  
**Tier:** Silver - Human-in-the-Loop

---

## 🎯 Overview

This guide walks you through setting up **complete LinkedIn integration** for your Digital Employee system using Playwright MCP with saved session.

**What You'll Get:**
- ✅ Automated professional LinkedIn post creation
- ✅ Human-in-the-Loop approval workflow
- ✅ Saved session (QR code scan ONCE)
- ✅ Scheduled daily posts
- ✅ Dashboard tracking

---

## 📋 Step 1: Save LinkedIn Session (QR Code Scan)

The Playwright MCP uses browser automation with a saved session. You only need to scan the QR code **ONCE**.

### Run Session Setup:

```bash
cd "/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee"

python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save
```

### What Happens:
1. A browser window opens
2. Navigate to LinkedIn login page
3. **Scan QR code** or login with credentials
4. Wait for detection (checks every 3 seconds)
5. Session saves to `linkedin_session/cookies.json`
6. Browser closes

### Verify Session:

```bash
python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py test
```

You should see: `✅ Session is valid!`

---

## 📝 Step 2: Create LinkedIn Post Request

### Option A: Use Sample Trigger (Recommended)

A sample trigger file has been created at:
```
/Needs_Action/LINKEDIN_DAILY_POST.md
```

The orchestrator will automatically detect and process it.

### Option B: Create Custom Post Request

```bash
# From command line
python3 orchestrator.py tasks "Post on LinkedIn: Your custom content here"

# Or create a file manually
cat > Needs_Action/LINKEDIN_CUSTOM_POST.md << EOF
---
type: linkedin_post
topic: Your topic here
priority: medium
---

# LinkedIn Post Request

## Content Guidelines
Describe what you want the post to be about...
EOF
```

---

## 🔄 Step 3: Run Orchestrator

The orchestrator will:
1. Detect the LinkedIn trigger file
2. Generate a professional post draft
3. Save draft to `/Pending_Approval/`
4. Move trigger to `/Done/`
5. Update Dashboard with post status

```bash
python3 orchestrator.py
```

### Check Dashboard:

Open `Dashboard.md` and look for the **"🔵 LinkedIn Pending Posts"** section.

---

## ✅ Step 4: Review & Approve Post

### Open the Draft:

Navigate to `/Pending_Approval/` and open the latest `LINKEDIN_POST_*.md` file.

### Review Includes:
- ✅ Full post content (hook, body, CTA, hashtags)
- ✅ Hashtag reach estimates
- ✅ Post metadata (word count, char count, emoji count)
- ✅ Optimal posting time

### Choose Action:

**To Approve:**
```bash
mv Pending_Approval/LINKEDIN_POST_*.md Approved/
```

**To Reject:**
```bash
mv Pending_Approval/LINKEDIN_POST_*.md Rejected/
```

**To Regenerate:**
```bash
# Add notes to file explaining what to change
mv Pending_Approval/LINKEDIN_POST_*.md Needs_Action/
```

---

## 🚀 Step 5: Automatic Posting

After you move the file to `/Approved/`, run orchestrator again:

```bash
python3 orchestrator.py
```

### What Happens:
1. Orchestrator detects approved LinkedIn file
2. **Tries Playwright MCP first** (uses saved session)
3. Falls back to LinkedIn API MCP if Playwright fails
4. Posts to LinkedIn automatically
5. Moves file to `/Done/` with success note
6. Updates Dashboard with post URL

### Posting Flow:

```
Needs_Action/ → Pending_Approval/ → Approved/ → Done/
     ↓                ↓                  ↓          ↓
  Trigger       Draft Created     Human      Posted!
                                  Review
```

---

## 📊 Step 6: Monitor Dashboard

Open `Dashboard.md` to see:

### 🔵 LinkedIn Pending Posts Section:

| Status | Description | Action |
|--------|-------------|--------|
| 🟡 Awaiting Review | Draft in Pending_Approval | Review & approve/reject |
| 🟢 Approved | Ready to publish | Will post on next run |
| ✅ Posted | Successfully published | Check LinkedIn |

---

## 🎨 Post Quality Guidelines

Every generated post follows these rules:

### Structure:
```
[Hook - First 150 chars, attention-grabbing]

[Body - 2-4 short paragraphs]

[Call-to-Action]

[3-5 Hashtags]
```

### Best Practices:
- ✅ **Length:** 150-300 words (sweet spot)
- ✅ **Emojis:** 2-5 max (professional)
- ✅ **Hashtags:** 3-5 (mix of broad + niche)
- ✅ **Paragraphs:** Short (2-3 sentences)
- ✅ **Tone:** Professional, conversational
- ✅ **Value:** Insights, not fluff

### Optimal Posting Times:
- **Best:** Tue-Thu, 10:00 AM - 12:00 PM
- **Good:** Mon-Fri, 8:00 AM - 10:00 AM
- **Avoid:** Weekends, late evenings

---

## 🛡️ Safety Features

### Human-in-the-Loop:
- ❌ NEVER auto-posts without approval
- ✅ ALWAYS requires human review
- ✅ Draft saved before posting
- ✅ Easy reject/regenerate options

### Rate Limits:
- ⏳ Minimum 60 seconds between posts
- 📊 Max 3-5 posts per day (LinkedIn safe limit)
- 🕐 Respects LinkedIn rate limits

### Session Security:
- 🔒 Cookies encrypted (file permissions: `0600`)
- 🔒 Session folder in `.gitignore`
- 🔒 Session expires ~30 days (refresh via QR scan)

---

## 🐛 Troubleshooting

### "No saved LinkedIn session found"

**Solution:**
```bash
python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save
```

Then login to LinkedIn when browser opens.

### "Session expired"

**Solution:**
```bash
# Re-login
python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save
```

### "Could not find 'Start a post' element"

**Causes:**
- LinkedIn UI changed
- Session invalid

**Solution:**
1. Test session: `python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py test`
2. If expired, re-login
3. If UI changed, update selectors in Playwright MCP

### Post not appearing on LinkedIn

**Check:**
1. File is in `/Approved/` (not still in `/Pending_Approval/`)
2. Orchestrator ran after approval
3. Check `/Logs/orchestrator.log` for errors
4. Verify session is valid

---

## 📁 File Structure

```
Digital_Employee/
├── Needs_Action/
│   └── LINKEDIN_DAILY_POST.md          ← Trigger (created for you)
├── Pending_Approval/
│   └── LINKEDIN_POST_*.md              ← Draft awaiting your review
├── Approved/
│   └── LINKEDIN_POST_*.md              ← Human-approved, ready to post
├── Done/
│   └── LINKEDIN_POST_*.md              ← Successfully posted
├── Agent_Skills/
│   ├── SKILL_LInkedin_Playwright_MCP.py ← Playwright automation
│   └── SKILL_LinkedIn_Playwright_MCP.md ← Skill documentation
├── orchestrator.py                      ← Main orchestrator
├── Dashboard.md                         ← Status overview
└── linkedin_session/                    ← Saved session (DO NOT COMMIT)
    └── cookies.json
```

---

## 🎓 Advanced Usage

### Schedule Daily Posts:

Add to crontab:
```bash
# Run orchestrator every 5 minutes
*/5 * * * * cd /path/to/Digital_Employee && python3 orchestrator.py >> Logs/cron.log 2>&1
```

### Batch Post:

```bash
python3 orchestrator.py tasks \
  "Post on LinkedIn: Post 1 content" \
  "Post on LinkedIn: Post 2 content"
```

### Check Logs:

```bash
tail -f Logs/orchestrator.log | grep -i linkedin
```

---

## 🔗 Related Documentation

- `Agent_Skills/SKILL_LinkedIn_Playwright_MCP.md` - Complete skill guide
- `Company_Handbook.md` - Overall system guide
- `LINKEDIN_MCP_GUIDE.md` - LinkedIn API MCP (alternative)
- `.env` - API credentials (if using API instead of Playwright)

---

## ✅ Quick Start Checklist

- [ ] Step 1: Save LinkedIn session (`python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save`)
- [ ] Step 2: Verify session (`python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py test`)
- [ ] Step 3: Check trigger file exists (`Needs_Action/LINKEDIN_DAILY_POST.md`)
- [ ] Step 4: Run orchestrator (`python3 orchestrator.py`)
- [ ] Step 5: Review draft in `Pending_Approval/`
- [ ] Step 6: Approve post (`mv Pending_Approval/LINKEDIN_POST_* Approved/`)
- [ ] Step 7: Run orchestrator again to post
- [ ] Step 8: Check Dashboard.md for status

---

*🤖 LinkedIn Integration Setup Guide v1.0*  
*📍 Digital Employee System - Silver Tier*  
*🔵 Always require human approval before posting!*
