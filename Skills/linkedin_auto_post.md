---
skill_id: SKILL_LinkedIn_Posting
name: LinkedIn Posting
version: 1.1.0
tier: Silver
description: Generate professional LinkedIn posts for business updates and company news
status: active
created: 2026-04-02
updated: 2026-04-02
author: Digital Employee System
reviewers: [Human-in-the-Loop]
---

# SKILL_LinkedIn_Posting: LinkedIn Post Generation

## Overview

This skill generates professional LinkedIn posts for business updates and saves drafts in `/Plans/` for human approval before publishing. It follows a Human-in-the-Loop workflow to ensure quality and compliance.

## Purpose

- Create professional LinkedIn content for business updates
- Save drafts for approval process
- Prepare posts for MCP (Multi-Channel Publishing) system
- Follow Human-in-the-Loop workflow
- Track post-performance metrics

## Workflow

```
/Needs_Action/LINKEDIN_*.md (trigger)
         ↓
/Plans/PLAN_LINKEDIN_YYYYMMDD_*.md (draft generation)
         ↓
/Pending_Approval/APPROVAL_LINKEDIN_*.md (human review)
         ↓
    ┌────┴────┐
    │         │
Approved   Requires Changes
    │         │
    ↓         ↓
/Approved/  /Plans/ (revised)
    │
    ↓
/Done/ (after publishing + metrics logged)
```

## Trigger Detection

The skill activates when a file matching these criteria appears in `/Needs_Action/`:

| Pattern | Description |
|---------|-------------|
| `LINKEDIN_*.md` | Standard LinkedIn post request |
| `LINKEDIN_POST_*.md` | Explicit post request |
| `LINKEDIN_DAILY_*.md` | Scheduled daily content |

**Required Metadata in Trigger:**
```yaml
type: linkedin_request
priority: [normal | high | urgent]
topic: [brief description]
```

## Usage

### Step 1: Create Trigger File
Create a file in `/Needs_Action/` with business update details:

```markdown
---
type: linkedin_request
priority: normal
created: 2026-04-02
topic: Product Launch Announcement
---

# LinkedIn Post Request

## Topic
New AI Feature Release

## Key Points
- Feature description and benefits
- Target audience impact
- Availability timeline

## Requirements
- Tone: Professional yet approachable
- Length: 150-300 words
- Include 3-5 hashtags
- CTA: Visit website
- Media: Product screenshot available
```

### Step 2: Generate Draft
The skill will:
1. Read trigger from `/Needs_Action/`
2. Validate required fields and content appropriateness
3. Generate professional post content
4. Calculate word/character count
5. Save draft to `/Plans/PLAN_LINKEDIN_YYYYMMDD_*.md`
6. Create approval request in `/Pending_Approval/`
7. Log generation event to `/Logs/linkedin_posts.log`

### Step 3: Human Approval
Human reviewer:
1. Opens approval request in `/Pending_Approval/`
2. Reviews draft content, facts, and tone
3. Selects approval option:
   - ✅ Approved → Moves to `/Approved/`
   - ✏️ Requires Modifications → Returns to `/Plans/` with notes
   - ❌ Rejected → Moves to `/Done/` with rejection reason
4. Adds media assets if available
5. Confirms posting schedule

### Step 4: Publish
After approval:
1. Final post saved to `/Approved/LINKEDIN_*.md`
2. MCP LinkedIn integration publishes at scheduled time
3. Post ID and timestamp logged
4. Metrics tracking initiated

### Step 5: Track Metrics
Post-publishing (24-48 hours later):
1. MCP fetches engagement metrics from LinkedIn API
2. Metrics updated in `/Done/LINKEDIN_*.md`
3. Performance logged for analytics

## Post Requirements

| Requirement | Details |
|-------------|---------|
| **Tone** | Professional yet approachable |
| **Length** | 150-300 words (optimal engagement) |
| **Hashtags** | 3-5 relevant tags (mix of popular/niche) |
| **Character Limit** | Max 2800 characters (LinkedIn limit) |
| **Formatting** | Short paragraphs, line breaks, spacing |
| **Emojis** | Use sparingly (max 3-5), context-appropriate |
| **CTA** | Clear call-to-action when applicable |
| **Media** | Image/video recommended for 2x engagement |

## Content Types

| Type | Description | Example |
|------|-------------|---------|
| Company Updates | Announcements, milestones | Funding, expansion |
| Product Launches | New features, releases | Feature announcements |
| Team Achievements | Hiring, promotions, awards | New team member intro |
| Thought Leadership | Industry insights, trends | Analysis, commentary |
| Events | Webinars, conferences, meetups | Event promotion/recap |
| Milestones | Celebrations, anniversaries | Company anniversary |
| Educational | Tips, how-tos, best practices | Industry tips |
| Culture | Behind-the-scenes, values | Team culture posts |

## Output Format

### Draft File (`/Plans/PLAN_LINKEDIN_*.md`)
```markdown
---
type: linkedin_draft
status: pending_review
version: 1.0
created: 2026-04-02
updated: 2026-04-02
topic: Business Update
skill_reference: SKILL_LinkedIn_Posting
priority: normal
expires: 2026-04-09
---

# LinkedIn Post Draft

## Topic
[Brief topic description]

## Draft Content
[Post content with proper formatting]

## Metadata
- **Word Count:** XXX / 300 words
- **Character Count:** XXXX / 2800 characters
- **Hashtag Count:** X / 5 hashtags
- **Emoji Count:** X / 5 emojis

## Media Assets
- [ ] Image: `/Assets/LinkedIn/[filename].png`
- [ ] Video: `/Assets/LinkedIn/[filename].mp4`
- [ ] Document: `/Assets/LinkedIn/[filename].pdf`
- [ ] None required

## Tags/Mentions
- @CompanyPage
- @TeamMember (if applicable)
- @Partner (if applicable)

## Suggested Posting Time
- **Best Time:** Tuesday-Thursday, 10:00 AM - 12:00 PM
- **Alternative:** Tuesday-Thursday, 2:00 PM - 4:00 PM
- **Avoid:** Weekends, Monday mornings, Friday afternoons
- **Scheduled:** [YYYY-MM-DD HH:MM Timezone]

## Approval Status
- [ ] ✅ Approved for publishing
- [ ] ✏️ Requires modifications (see notes)
- [ ] ❌ Rejected (see notes)

## Approval Notes
*Pending human review*

## Revision History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-04-02 | Initial draft | SKILL_LinkedIn_Posting |

---

## Publishing Instructions

1. **Verify Content**: Check all facts, figures, and claims
2. **Add Media**: Include company logo or team photo if available
3. **Check Links**: Ensure any linked URLs are working
4. **Tag Relevant Parties**: Mention partners, team members if appropriate
5. **Schedule**: Post at optimal time for maximum engagement
6. **Compliance Check**: Ensure brand voice and legal compliance

## Post Metrics (After Publishing)

| Metric | Target | Actual | Date Recorded |
|--------|--------|--------|---------------|
| Impressions | 1000+ | - | - |
| Engagement Rate | 3%+ | - | - |
| Likes | 50+ | - | - |
| Comments | 10+ | - | - |
| Shares | 5+ | - | - |
| Click-Through Rate | 2%+ | - | - |

---
*Generated by SKILL_LinkedIn_Posting v1.1.0 (Silver Tier)*
*Ready for Human Approval in /Pending_Approval/*
```

## Error Handling

| Error Type | Cause | Resolution |
|------------|-------|------------|
| `INSUFFICIENT_INPUT` | Missing topic or key points | Return error to `/Logs/` with request for more info |
| `INAPPROPRIATE_CONTENT` | Content violates guidelines | Flag for manual review, notify admin |
| `HASHTAG_LIMIT_EXCEEDED` | More than 5 hashtags | Auto-truncate to top 5, log warning |
| `CHARACTER_LIMIT_EXCEEDED` | Over 2800 characters | Auto-truncate with summary, flag for review |
| `DUPLICATE_TOPIC` | Similar post in last 7 days | Warn reviewer, suggest differentiation |
| `MCP_CONNECTION_FAILED` | Cannot connect to LinkedIn MCP | Queue for retry, notify after 3 failures |
| `EXPIRED_DRAFT` | Draft older than 7 days | Archive to `/Archive/`, notify creator |

## MCP Integration

### LinkedIn MCP Server
```python
# MCP Method: linkedin/create_post
# Endpoint: /media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/email_mcp.py (reference)

Parameters:
  - content: str (post text)
  - media_urls: List[str] (optional)
  - scheduled_time: str (ISO 8601, optional)
  - visibility: str (public | connections | private)

Returns:
  - post_id: str
  - post_url: str
  - status: str (scheduled | published)
```

### Metrics Fetch (Post-Publish)
```python
# MCP Method: linkedin/get_post_metrics
# Trigger: 24h and 48h after publishing

Parameters:
  - post_id: str

Returns:
  - impressions: int
  - engagement_rate: float
  - likes: int
  - comments: int
  - shares: int
  - clicks: int
```

## Logging Schema

**Log File:** `/Logs/linkedin_posts.log`

```json
{
  "timestamp": "2026-04-02T10:30:00Z",
  "event": "draft_generated | approved | published | metrics_updated | error",
  "post_id": "PLAN_LINKEDIN_20260402_001",
  "topic": "Business Update",
  "status": "success | failed",
  "word_count": 185,
  "character_count": 1250,
  "hashtag_count": 5,
  "error_code": null,
  "mcp_response": null,
  "published_url": null,
  "metrics": null
}
```

## Best Practices

1. **Professional Tone**: Maintain company voice consistently
2. **Hashtag Strategy**: Mix of popular (1M+ posts) and niche (<100K posts) tags
3. **Engagement Hooks**: Strong opening line (first 150 characters critical)
4. **Call-to-Action**: Clear CTA when appropriate (visit, learn, join, share)
5. **Human Review**: Always require approval before publishing
6. **Visual Content**: Posts with images get 2x engagement
7. **Posting Frequency**: Max 1 post/day, optimal 3-5 posts/week
8. **Response Time**: Reply to comments within 24 hours
9. **A/B Testing**: Test different formats, times, and content types
10. **Analytics Review**: Weekly review of top-performing posts

## Compliance & Brand Voice

| Guideline | Requirement |
|-----------|-------------|
| **Brand Voice** | Professional, approachable, innovative |
| **Legal Review** | Required for financial claims, partnerships |
| **Confidentiality** | No unreleased product details, financials |
| **Attribution** | Credit sources for statistics, quotes |
| **Accessibility** | Alt text for images, camelCase hashtags |

## Related Files

| File | Purpose |
|------|---------|
| `/Skills/linkedin_auto_post.md` | This skill definition |
| `/Skills/linkedin_post_draft.md` | Draft template example |
| `/Agent_Skills/SKILL_LinkedIn_Posting.md` | Alternative skill reference |
| `/Needs_Action/LINKEDIN_DAILY_POST.md` | Trigger template |
| `/Company_Handbook.md` | Silver Tier Rules & Approval Workflow |
| `/Logs/linkedin_posts.log` | Activity log |
| `/email_mcp.py` | MCP integration reference |

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-04-02 | Initial release | Digital Employee System |
| 1.1.0 | 2026-04-02 | Added error handling, MCP integration, logging schema, compliance guidelines, version tracking | Digital Employee System |

---

*Part of Silver Tier Digital Employee System*
*Human-in-the-Loop Required for All Publishing Actions*
