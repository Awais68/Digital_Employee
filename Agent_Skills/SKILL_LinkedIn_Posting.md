---
skill_id: SKILL_LinkedIn_Posting
name: LinkedIn Auto-Posting
version: 2.0.0
tier: Silver
description: Automated LinkedIn post generation with human-in-the-loop approval workflow
status: active
created: 2026-04-02
updated: 2026-04-02
author: Digital Employee System
reviewers: [Human-in-the-Loop, Marketing Team]
---

# SKILL_LinkedIn_Posting: LinkedIn Auto-Posting Capability

## Overview

This skill automatically generates professional LinkedIn posts when triggered by files in `/Needs_Action/` containing `task_type: linkedin` or filenames with `LINKEDIN`. All posts require human approval before publishing and are saved to `/Pending_Approval/` with clear action options.

## Purpose

- **Auto-Detect**: Identify LinkedIn post requests from Needs_Action folder
- **Generate Drafts**: Create professional, engaging LinkedIn content automatically
- **Approval Workflow**: Route all posts through human review before publishing
- **Track Metrics**: Estimate reach and engagement potential
- **Maintain Brand Voice**: Ensure professional business communication

---

## 📋 Rules for Professional Business Posts

### Tone & Style Guidelines

| Rule | Description | Example |
|------|-------------|---------|
| **Professional Yet Approachable** | Business-appropriate but not overly formal | "Excited to share" vs "We hereby announce" |
| **Clear & Concise** | Short sentences, active voice, scannable | Bullet points, numbered lists |
| **Value-First** | Lead with benefit to reader | "Here's how AI can save you 10hrs/week" |
| **Authentic Voice** | Genuine enthusiasm, avoid corporate jargon | "We built this because..." |
| **Inclusive Language** | Welcoming to diverse audiences | Avoid assumptions about reader background |

### Content Structure Rules

```
✅ DO:
- Hook in first 150 characters (critical for engagement)
- Use 2-4 short paragraphs with line breaks
- Include 1 clear call-to-action (CTA)
- Add 3-5 relevant hashtags (mix of popular + niche)
- Use emojis sparingly (max 3-5, context-appropriate)
- Keep total length 150-300 words (optimal engagement)

❌ DON'T:
- Write walls of text (hard to scan)
- Use more than 5 hashtags (appears spammy)
- Overuse emojis (unprofessional appearance)
- Make unverified claims or promises
- Include sensitive/confidential information
- Tag people without permission
```

### Hashtag Strategy

| Category | Count | Examples | Purpose |
|----------|-------|----------|---------|
| **Broad/Popular** | 1-2 | #AI, #SaaS, #Technology | Maximum reach |
| **Industry-Specific** | 1-2 | #AIAgents, #SaaSGrowth | Targeted audience |
| **Niche/Community** | 1-2 | #AgenticAI, #BuildInPublic | Engaged community |

### Call-to-Action (CTA) Guidelines

| CTA Type | When to Use | Examples |
|----------|-------------|----------|
| **Learn More** | Product/features | "Visit our website to learn more" |
| **Engage** | Discussion topics | "What's your experience? Share below!" |
| **Share** | Valuable content | "Repost to help your network" |
| **Connect** | Networking | "Let's connect if you're building in AI" |
| **Try** | Free trials/demos | "Start your free trial today" |

---

## 🎨 How to Generate Engaging LinkedIn Content

### Content Generation Framework

```
┌─────────────────────────────────────────────────────────────┐
│                    LINKEDIN POST STRUCTURE                  │
├─────────────────────────────────────────────────────────────┤
│  1. HOOK (First 150 chars)                                  │
│     • Surprising stat, bold statement, or question          │
│     • Must grab attention in feed preview                   │
│                                                             │
│  2. BODY (2-4 paragraphs)                                   │
│     • Expand on the hook with context                       │
│     • Include specific details, benefits, or insights       │
│     • Use line breaks for readability                       │
│                                                             │
│  3. VALUE PROPOSITION                                       │
│     • What's in it for the reader?                          │
│     • Clear benefit or takeaway                             │
│                                                             │
│  4. CALL-TO-ACTION (CTA)                                    │
│     • One clear next step                                   │
│     • Comment, visit, share, connect                        │
│                                                             │
│  5. HASHTAGS (3-5)                                          │
│     • Mix of broad + specific tags                          │
│     • Placed at end for clean appearance                    │
└─────────────────────────────────────────────────────────────┘
```

### Hook Templates (First 150 Characters)

| Type | Template | Example |
|------|----------|---------|
| **Question** | "Ever wonder why...?" | "Ever wonder why 80% of AI projects fail?" |
| **Statistic** | "X% of [audience]..." | "73% of SaaS companies are missing this AI opportunity" |
| **Contrarian** | "Unpopular opinion:..." | "Unpopular opinion: Most AI agents are overengineered" |
| **Story** | "Last week, we..." | "Last week, we shipped a feature in 2 hours that saved 100+ hrs" |
| **Announcement** | "Excited to share..." | "Excited to share what we've been building for 6 months" |
| **How-To** | "Here's how to..." | "Here's how to build an AI agent in under 1 hour" |

### Engagement Boosters

| Technique | Description | Impact |
|-----------|-------------|--------|
| **Numbered Lists** | "5 ways to..." | +40% readability |
| **Before/After** | Show transformation | +35% engagement |
| **Behind-the-Scenes** | Process insights | +50% connection |
| **Lessons Learned** | Honest reflections | +45% comments |
| **Data-Driven** | Stats and research | +30% shares |
| **Tag Relevant Parties** | Strategic mentions | +25% reach |

---

## ✅ Approval Workflow for Posting

### Workflow Diagram

```
/Needs_Action/LINKEDIN_*.md
         ↓
[Orchestrator detects task_type: linkedin or LINKEDIN in filename]
         ↓
[Auto-generate professional LinkedIn post draft]
         ↓
/Pending_Approval/LINKEDIN_POST_{timestamp}.md
         ↓
    ┌────────────────────────────────────┐
    │     HUMAN REVIEW REQUIRED          │
    │                                    │
    │  Options (via file move method):   │
    │  ✅ Approve → /Approved/           │
    │  🔄 Regenerate → /Needs_Action/    │
    │  ❌ Reject → /Done/ (archived)     │
    │  ⏳ Pending → Stay in place        │
    └────────────────────────────────────┘
         ↓
[If Approved]
         ↓
[Ready for MCP LinkedIn integration or manual posting]
         ↓
/Done/LINKEDIN_POST_{timestamp}.md (with metrics tracking)
```

### Approval Options (File Move Method)

| Action | File Movement | Result |
|--------|---------------|--------|
| **✅ Approve** | Move to `/Approved/` | Post ready for publishing |
| **🔄 Regenerate** | Move to `/Needs_Action/` with notes | New draft will be generated |
| **❌ Reject** | Move to `/Done/` | Post archived, not published |
| **⏳ Pending** | Keep in `/Pending_Approval/` | Awaiting review |

### Approval Checklist for Reviewers

```markdown
## Pre-Approval Review

- [ ] Facts and claims are accurate
- [ ] Tone matches brand voice (professional, approachable)
- [ ] No confidential information included
- [ ] Hashtags are relevant (3-5, not spammy)
- [ ] CTA is clear and appropriate
- [ ] Character count within limits (<2800)
- [ ] Emojis used appropriately (max 3-5)
- [ ] No typos or grammatical errors
- [ ] Tags/mentions are appropriate and approved
```

---

## 📁 File Locations

| Location | Purpose |
|----------|---------|
| `/Needs_Action/LINKEDIN_*.md` | Trigger files for post generation |
| `/Pending_Approval/LINKEDIN_POST_{timestamp}.md` | Draft posts awaiting approval |
| `/Approved/LINKEDIN_*.md` | Approved posts ready for publishing |
| `/Done/LINKEDIN_*.md` | Published posts with metrics |
| `/Logs/linkedin_posts.log` | Activity and audit log |

---

## 📝 Output Format: Pending Approval File

When the orchestrator generates a LinkedIn post draft, it creates a file in `/Pending_Approval/` with this structure:

```markdown
---
type: linkedin_post_draft
status: pending_approval
priority: normal
created: YYYY-MM-DD HH:MM:SS
expires: YYYY-MM-DD HH:MM:SS (7 days)
skill_reference: SKILL_LinkedIn_Posting
---

# 📱 LinkedIn Post Draft

## Proposed Post Content

[Full post content with hook, body, value prop, and CTA]

---

## Hashtags

| Hashtag | Category | Estimated Reach |
|---------|----------|-----------------|
| #AI | Broad | 5M+ posts |
| #SaaS | Industry | 2M+ posts |
| #AIAgents | Niche | 100K+ posts |
| #AgenticAI | Community | 50K+ posts |
| #BuildInPublic | Community | 500K+ posts |

---

## Estimated Reach

| Metric | Estimate | Confidence |
|--------|----------|------------|
| **Impressions** | 1,000 - 5,000 | Medium |
| **Engagement Rate** | 2-4% | Medium |
| **Expected Likes** | 20-200 | Low-Medium |
| **Expected Comments** | 5-25 | Low |
| **Expected Shares** | 3-15 | Low |

*Estimates based on average account performance and hashtag reach*

---

## Post Metadata

| Property | Value |
|----------|-------|
| **Word Count** | XXX / 300 words |
| **Character Count** | XXXX / 2800 characters |
| **Hashtag Count** | X / 5 hashtags |
| **Emoji Count** | X / 5 emojis |
| **Readability Score** | Easy/Medium/Hard |
| **Optimal Post Time** | Tue-Thu, 10AM-12PM |

---

## Approval Options

**Choose one action by moving this file:**

| Option | Action | File Movement |
|--------|--------|---------------|
| ✅ **Approve** | Post is ready for publishing | Move to `/Approved/` |
| 🔄 **Regenerate** | Create new draft with changes | Move to `/Needs_Action/` with notes |
| ❌ **Reject** | Do not publish this post | Move to `/Done/` (archived) |
| ⏳ **Pending** | More time needed for review | Keep in `/Pending_Approval/` |

**To Regenerate:** Add notes below explaining required changes, then move to `/Needs_Action/`

### Revision Notes
*Add your feedback here if requesting regeneration...*

---

## Approval Status

- [ ] ✅ Approved for publishing
- [ ] 🔄 Requires regeneration (see notes)
- [ ] ❌ Rejected (archived)
- [ ] ⏳ Pending review

**Approved By:** _______________  
**Approval Date:** _______________  
**Scheduled Post Date:** _______________

---

*🤖 Generated by SKILL_LinkedIn_Posting v2.0.0*
*📍 Digital Employee System - Silver Tier*
```

---

## 🔧 Orchestrator Integration

### Detection Patterns

The orchestrator triggers LinkedIn post generation when:

| Pattern | Example Filename |
|---------|------------------|
| `task_type: linkedin` in YAML frontmatter | Any .md file with this metadata |
| `LINKEDIN` in filename | `LINKEDIN_DAILY_POST.md` |
| `linkedin_post` in content | Files mentioning this task type |

### Auto-Generation Process

```python
# Pseudocode for orchestrator LinkedIn handling
if task_type == "linkedin" or "LINKEDIN" in filename:
    draft = generate_linkedin_post(content)
    approval_file = f"LINKEDIN_POST_{timestamp}.md"
    save_to_pending_approval(draft, approval_file)
    update_dashboard_with_linkedin_section()
```

---

## 📊 Content Templates

### Template 1: Product/Feature Announcement

```markdown
🚀 Excited to announce [Feature Name]!

After [timeframe] of development, we're launching [what it does].

Here's what makes it different:
• [Benefit 1]
• [Benefit 2]
• [Benefit 3]

[Optional: Brief story or problem it solves]

Try it today: [Link]

#AI #SaaS #ProductLaunch #Innovation
```

### Template 2: Thought Leadership

```markdown
Unpopular opinion: [Contrarian but thoughtful statement]

Here's what most people miss about [topic]:

[2-3 paragraphs of insight]

The real opportunity? [Key insight]

What's your take? Share your thoughts below. 👇

#ThoughtLeadership #AI #Industry #Insights
```

### Template 3: Behind-the-Scenes

```markdown
Last week, our team [accomplishment].

Here's what happened behind the scenes:

[Story with specific details]

Key lessons learned:
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

Building in public means sharing both wins and learnings.

#BuildInPublic #Startup #AI #TeamWork
```

### Template 4: Educational/How-To

```markdown
Here's how to [achieve result] in [timeframe]:

Step 1: [Action]
Step 2: [Action]
Step 3: [Action]

Pro tip: [Insider advice]

This approach has saved us [metric] and can work for you too.

Save this for later and share with someone who needs it!

#HowTo #AI #Productivity #Tips
```

---

## 📈 Metrics & Analytics

### Estimated Reach Calculation

| Factor | Weight | Description |
|--------|--------|-------------|
| **Follower Count** | 30% | Base reach from followers |
| **Hashtag Reach** | 25% | Potential discovery via tags |
| **Engagement Rate** | 25% | Historical account performance |
| **Content Quality** | 20% | Hook strength, relevance |

### Post-Publish Tracking

After publishing, track these metrics in `/Done/`:

```markdown
## Performance Metrics (24-48 hours)

| Metric | Value |
|--------|-------|
| Impressions | XXXX |
| Engagement Rate | X.X% |
| Likes | XXX |
| Comments | XX |
| Shares | XX |
| Clicks | XXX |
| New Followers | XX |
```

---

## ⚠️ Error Handling

| Error | Cause | Resolution |
|-------|-------|-----------|
| `INSUFFICIENT_CONTENT` | Trigger file lacks details | Request more info via log |
| `INAPPROPRIATE_TOPIC` | Content violates guidelines | Flag for manual review |
| `DUPLICATE_POST` | Similar post in last 48hrs | Warn reviewer, suggest changes |
| `HASHTAG_LIMIT` | More than 5 hashtags | Auto-truncate, log warning |
| `CHARACTER_LIMIT` | Over 2800 characters | Auto-summarize, flag for review |

---

## 🔗 Related Files

| File | Purpose |
|------|---------|
| `/orchestrator.py` | Main orchestration with LinkedIn detection |
| `/Dashboard.md` | Dashboard with LinkedIn pending posts section |
| `/Needs_Action/LINKEDIN_DAILY_POST.md` | Sample trigger file |
| `/Company_Handbook.md` | Brand voice and approval guidelines |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-04-02 | Initial release | Digital Employee System |
| 1.1.0 | 2026-04-02 | Added error handling, MCP integration | Digital Employee System |
| 2.0.0 | 2026-04-02 | Enhanced approval workflow, Pending_Approval integration, estimated reach | Digital Employee System |

---

*Part of Silver Tier Digital Employee System*  
*Human-in-the-Loop Required for All Publishing Actions*  
*Auto-generation enabled via orchestrator.py LinkedIn detection*
