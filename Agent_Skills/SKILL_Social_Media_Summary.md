# 📘 SKILL: Social Media Summary Generator

**Version:** 1.0.0 (Gold Tier)
**Tier:** Gold - Automated Reporting
**Type:** Analysis Skill
**Last Updated:** 2026-04-20

---

## 📋 Overview

This skill generates a **comprehensive performance summary** across all integrated social media platforms (Facebook, Instagram, LinkedIn). It fetches recent posts, aggregates engagement metrics, identifies top-performing content, and provides AI-driven recommendations.

---

## 🎯 When to Use This Skill

Use this skill when:
- Weekly/Monthly reporting is required
- Human requests a social media "status check"
- Preparing for CEO Briefings
- Orchestrator detects a need for cross-platform performance analysis
- Command: `python3 Agent_Skills/SKILL_Social_Media_Summary.py`

---

## 🔧 Features

- ✅ **Multi-Platform Data Fetching**: Connects to Facebook, Instagram, and LinkedIn MCP servers.
- ✅ **Metric Aggregation**: Calculates total likes, comments, and impressions.
- ✅ **Content Analysis**: Identifies which posts resonated most with the audience.
- ✅ **AI Recommendations**: Uses the LLM Router to suggest content improvements and strategy adjustments.
- ✅ **Visual Reporting**: Generates a clean Markdown report suitable for CEO consumption.

---

## 📝 Implementation Details

**File:** `Agent_Skills/SKILL_Social_Media_Summary.py`

### Tool: `generate_social_summary`

Fetches data from:
1.  **Facebook MCP**: `get_facebook_posts`, `get_facebook_insights`
2.  **Instagram MCP**: `get_instagram_posts`, `get_instagram_insights`
3.  **LinkedIn Playwright**: Recent post history from `Logs/social_media.log` or direct scraping (TODO).

---

## 📊 Summary Structure

```markdown
# 📈 Social Media Performance Summary

**Period:** [Date Range]
**Total Engagement:** [Number] (Likes + Comments)
**Audience Growth:** [X]%

---

## 📘 Facebook Highlights
- **Total Posts:** [X]
- **Best Post:** "[Hook text...]"
- **Avg. Engagement:** [X] per post

## 📸 Instagram Highlights
- **Total Posts:** [X]
- **Top Visual Content:** [Description]
- **Avg. Likes:** [X]

## 💼 LinkedIn Highlights
- **Total Posts:** [X]
- **Key Insight:** [Summary]

---

## 💡 AI-Driven Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]
```

---

## 🛡️ Safety & Compliance

- ✅ Read-only access for metrics (no destructive actions)
- ✅ Respects platform rate limits by using cached data where possible
- ✅ No sensitive account data (passwords/tokens) logged in the report

---

*📘 SKILL_Social_Media_Summary v1.0.0 | Gold Tier*
*📍 Digital Employee System | Unified Social Media Intelligence*
