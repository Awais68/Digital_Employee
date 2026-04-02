#!/usr/bin/env python3
"""
Silver Tier Orchestrator v4.0 - Central Brain with Human-in-the-Loop

The central coordination engine for the Digital Employee system.
NEW in v4.0:
- Automatic reply draft generation for emails
- Human-in-the-Loop approval workflow
- Colorful priority-based Dashboard
- Pending_Approval with Approve/Regenerate/Reject buttons
- Rejected folder handling

Author: Digital Employee System
Tier: Silver v4.0 - Human-in-the-Loop Ready
"""

import os
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any, Tuple
from dotenv import load_dotenv

# Optional imports with graceful fallback
try:
    import schedule
    SCHEDULE_AVAILABLE = True
except ImportError:
    schedule = None
    SCHEDULE_AVAILABLE = False


# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent

# Folder structure
FOLDERS = {
    "needs_action": BASE_DIR / "Needs_Action",
    "done": BASE_DIR / "Done",
    "rejected": BASE_DIR / "Rejected",  # NEW: For rejected drafts
    "plans": BASE_DIR / "Plans",
    "pending_approval": BASE_DIR / "Pending_Approval",
    "approved": BASE_DIR / "Approved",
    "logs": BASE_DIR / "Logs",
    "metrics": BASE_DIR / "Metrics",
}

# File paths
DASHBOARD_FILE = BASE_DIR / "Dashboard.md"
LOG_FILE = BASE_DIR / "Logs" / "orchestrator.log"
METRICS_FILE = BASE_DIR / "Metrics" / "orchestrator_metrics.json"
CONFIG_FILE = BASE_DIR / ".env"

# Email reply templates
EMAIL_TEMPLATES = {
    "meeting_request": """
Dear {sender_name},

Thank you for reaching out regarding {subject_topic}.

I would be happy to schedule a meeting to discuss this further. Please let me know your availability for the following time slots:

- {date_option_1}
- {date_option_2}
- {date_option_3}

Alternatively, please feel free to suggest a time that works best for you.

Looking forward to our conversation.

Best regards,
{my_name}
{my_title}
""",

    "general_inquiry": """
Dear {sender_name},

Thank you for your email regarding {subject_topic}.

I appreciate you reaching out. {positive_acknowledgment}

Please let me know if you need any additional information from my end.

Best regards,
{my_name}
{my_title}
""",

    "urgent_action": """
Dear {sender_name},

I acknowledge receipt of your urgent request regarding {subject_topic}.

I am prioritizing this matter and will {action_commitment} by {deadline}.

Should you need immediate assistance, please don't hesitate to contact me directly.

Best regards,
{my_name}
{my_title}
""",

    "saas_developer_response": """
Dear {sender_name},

Thank you for considering me for the Agent/Developer position at {company_name}.

I am excited about the opportunity to work on AI integration and SaaS development. 
I would be available for a meeting this week to discuss:

1. Project requirements and scope
2. Technical stack and architecture
3. Timeline and deliverables
4. Collaboration framework

Please let me know your preferred meeting time. I am flexible and can accommodate 
your schedule.

Looking forward to contributing to your team's success.

Best regards,
{my_name}
{my_title}
""",
}

# Task type patterns for auto-routing
TASK_PATTERNS = {
    "email": ["email", "gmail", "message", "inbox", "send", "reply"],
    "linkedin": ["linkedin", "post", "connection", "message", "network"],
    "document": ["document", "doc", "report", "summary", "write", "create"],
    "calendar": ["calendar", "meeting", "schedule", "event", "appointment"],
    "file": ["file", "folder", "move", "copy", "organize", "save"],
    "web": ["website", "url", "browse", "search", "fetch", "scrape"],
    "data": ["data", "analyze", "process", "extract", "transform"],
    "notification": ["alert", "notify", "reminder", "warning", "critical"],
}

# Skill agent mapping
SKILL_AGENT_MAP = {
    "email": "email_mcp.py",
    "linkedin": "Agent_Skills/SKILL_LinkedIn_Posting.md",
    "document": "Agent_Skills/document_skill.py",
    "calendar": "Agent_Skills/calendar_skill.py",
    "file": "filesystem_watcher.py",
    "web": "Agent_Skills/web_skill.py",
    "data": "Agent_Skills/data_skill.py",
    "notification": "Agent_Skills/notification_skill.py",
}

# Default sender info (can be customized via .env)
DEFAULT_SENDER = {
    "name": os.getenv("SENDER_NAME", "Awais Niaz"),
    "email": os.getenv("SENDER_EMAIL", "awaisniaz720@gmail.com"),
    "title": os.getenv("SENDER_TITLE", "CTO / AI Engineer"),
}


# =============================================================================
# LOGGING SYSTEM
# =============================================================================

class Logger:
    """Advanced file and console logger with color support."""

    COLORS = {
        "INFO": "\033[94m",
        "WARNING": "\033[93m",
        "ERROR": "\033[91m",
        "SUCCESS": "\033[92m",
        "CRITICAL": "\033[95m",
        "RESET": "\033[0m",
    }

    def __init__(self, log_file: Path = None, enable_colors: bool = True):
        self.log_file = log_file
        self.enable_colors = enable_colors
        self.messages: List[Dict[str, str]] = []

        if log_file:
            log_file.parent.mkdir(parents=True, exist_ok=True)

    def _colorize(self, message: str, level: str) -> str:
        if not self.enable_colors:
            return message
        color = self.COLORS.get(level, self.COLORS["RESET"])
        return f"{color}{message}{self.COLORS['RESET']}"

    def _write_to_file(self, message: str) -> None:
        if self.log_file:
            with open(self.log_file, "a", encoding="utf-8") as f:
                clean_msg = message.replace("\033[0m", "").replace("\033[94m", "")\
                    .replace("\033[93m", "").replace("\033[91m", "")\
                    .replace("\033[92m", "").replace("\033[95m", "")
                f.write(f"{clean_msg}\n")

    def _log(self, message: str, level: str) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted = f"[{timestamp}] [{level:8}] {message}"
        colored = self._colorize(formatted, level)
        print(colored)
        self._write_to_file(formatted)
        self.messages.append({"timestamp": timestamp, "level": level, "message": message})

    def info(self, message: str) -> None:
        self._log(message, "INFO")

    def warning(self, message: str) -> None:
        self._log(message, "WARNING")

    def error(self, message: str) -> None:
        self._log(message, "ERROR")

    def success(self, message: str) -> None:
        self._log(message, "SUCCESS")

    def critical(self, message: str) -> None:
        self._log(f"🚨 {message}", "CRITICAL")

    def get_recent_errors(self, limit: int = 5) -> List[str]:
        errors = [m for m in self.messages if m["level"] in ("ERROR", "CRITICAL")]
        return [f"{e['timestamp']}: {e['message']}" for e in errors[-limit:]]


logger = Logger(LOG_FILE)


# =============================================================================
# REPLY DRAFT GENERATION
# =============================================================================

def extract_sender_name(from_addr: str) -> str:
    """Extract sender name from email address."""
    if "<" in from_addr:
        return from_addr.split("<")[0].strip()
    return from_addr.split("@")[0].strip()


def detect_email_intent(content: str, subject: str) -> str:
    """Detect the intent of the email for template selection."""
    combined = f"{subject} {content}".lower()

    if any(kw in combined for kw in ["meeting", "schedule", "available", "time", "call"]):
        return "meeting_request"
    elif any(kw in combined for kw in ["urgent", "asap", "immediately", "deadline"]):
        return "urgent_action"
    elif any(kw in combined for kw in ["saas", "developer", "agent", "position", "company", "ct"]):
        return "saas_developer_response"
    else:
        return "general_inquiry"


def generate_reply_draft(email_data: Dict) -> Dict[str, str]:
    """
    Generate a professional reply draft for an email.

    Args:
        email_data: Dictionary with email details (from, subject, body, etc.)

    Returns:
        Dictionary with draft details
    """
    sender_name = extract_sender_name(email_data.get("from", "Sender"))
    subject = email_data.get("subject", "")
    body = email_data.get("body", "")

    # Detect intent
    intent = detect_email_intent(body, subject)
    template = EMAIL_TEMPLATES.get(intent, EMAIL_TEMPLATES["general_inquiry"])

    # Generate dates for meeting requests
    today = datetime.now()
    dates = [
        (today.replace(hour=10, minute=0)).strftime("%A, %B %d at 10:00 AM"),
        (today.replace(hour=14, minute=0)).strftime("%A, %B %d at 2:00 PM"),
        (today.replace(hour=16, minute=0)).strftime("%A, %B %d at 4:00 PM"),
    ]

    # Fill template
    draft_body = template.format(
        sender_name=sender_name,
        subject_topic=subject[:50] if subject else "your inquiry",
        date_option_1=dates[0],
        date_option_2=dates[1],
        date_option_3=dates[2],
        positive_acknowledgment="I've reviewed your request and will be happy to assist.",
        action_commitment="provide a complete update",
        deadline="end of business today",
        company_name="AS Developers",
        my_name=DEFAULT_SENDER["name"],
        my_title=DEFAULT_SENDER["title"],
    )

    # Generate reply subject
    reply_subject = f"Re: {subject}" if not subject.startswith("Re:") else subject

    return {
        "intent": intent,
        "to": email_data.get("from", ""),
        "subject": reply_subject,
        "body": draft_body.strip(),
        "in_reply_to": email_data.get("email_id", ""),
        "thread_id": email_data.get("thread_id", ""),
        "generated_at": datetime.now().isoformat(),
    }


# =============================================================================
# DIRECTORY MANAGEMENT
# =============================================================================

def ensure_directories() -> None:
    """Create all required directories if they don't exist."""
    for name, path in FOLDERS.items():
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            logger.info(f"📁 Created directory: {name}")
        else:
            logger.info(f"📂 Directory ready: {name}")


# =============================================================================
# ENVIRONMENT LOADING
# =============================================================================

def load_environment() -> bool:
    """Load environment variables from .env file."""
    if CONFIG_FILE.exists():
        load_dotenv(CONFIG_FILE)
        logger.info("✅ Loaded .env file successfully")
        return True
    else:
        logger.warning("⚠️  .env file not found - continuing with defaults")
        return False


# =============================================================================
# TASK TYPE DETECTION & ROUTING
# =============================================================================

def detect_task_type(content: str, filename: str) -> str:
    """Detect task type from content and filename."""
    combined_text = f"{content} {filename}".lower()

    type_scores = {}
    for task_type, patterns in TASK_PATTERNS.items():
        score = sum(1 for pattern in patterns if pattern in combined_text)
        type_scores[task_type] = score

    if max(type_scores.values()) > 0:
        return max(type_scores, key=type_scores.get)

    return "general"


def get_skill_agent(task_type: str) -> Optional[str]:
    """Get the appropriate skill agent for a task type."""
    agent_path = SKILL_AGENT_MAP.get(task_type)
    if agent_path:
        full_path = BASE_DIR / agent_path
        if full_path.exists():
            return str(full_path)
        logger.warning(f"Skill agent not found: {agent_path}")
    return None


def analyze_task_complexity(content: str) -> Dict[str, Any]:
    """Analyze task content to determine complexity."""
    words = content.split()
    word_count = len(words)
    lines = content.strip().split("\n")
    line_count = len(lines)

    if word_count < 50 and line_count < 5:
        complexity = "simple"
        estimated_time = "5-15 min"
    elif word_count < 200 and line_count < 20:
        complexity = "moderate"
        estimated_time = "15-45 min"
    else:
        complexity = "complex"
        estimated_time = "45+ min"

    urgency_keywords = ["urgent", "asap", "immediately", "critical", "emergency"]
    is_urgent = any(kw in content.lower() for kw in urgency_keywords)

    return {
        "level": complexity,
        "word_count": word_count,
        "line_count": line_count,
        "estimated_time": estimated_time,
        "is_urgent": is_urgent,
        "priority": "high" if is_urgent else "medium" if complexity == "complex" else "low",
    }


# =============================================================================
# LINKEDIN POST GENERATION
# =============================================================================

def generate_linkedin_post(content: str, filename: str) -> Dict[str, Any]:
    """
    Generate a professional LinkedIn post from trigger content.

    Args:
        content: Trigger file content describing the post request
        filename: Original filename

    Returns:
        Dictionary with post content, hashtags, and metadata
    """
    now = datetime.now()

    # Extract topic from content
    topic = extract_topic_from_content(content)

    # Generate hook based on content type
    hook = generate_linkedin_hook(content, topic)

    # Generate body content
    body = generate_linkedin_body(content, topic)

    # Generate CTA
    cta = generate_linkedin_cta(content)

    # Generate hashtags
    hashtags = generate_linkedin_hashtags(topic)

    # Assemble full post
    full_post = f"""{hook}

{body}

{cta}

{" ".join(hashtags)}"""

    # Calculate metrics
    word_count = len(full_post.split())
    char_count = len(full_post)
    emoji_count = sum(1 for c in full_post if c in '🚀🎯💡📈✅🔥👇💼🤖⚡')
    hashtag_count = len(hashtags)

    # Estimate reach based on hashtag popularity
    estimated_reach = calculate_estimated_reach(hashtags)

    return {
        "topic": topic,
        "full_post": full_post,
        "hook": hook,
        "body": body,
        "cta": cta,
        "hashtags": hashtags,
        "word_count": word_count,
        "char_count": char_count,
        "emoji_count": emoji_count,
        "hashtag_count": hashtag_count,
        "estimated_reach": estimated_reach,
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "optimal_post_time": "Tue-Thu, 10:00 AM - 12:00 PM",
    }


def extract_topic_from_content(content: str) -> str:
    """Extract main topic from trigger content."""
    # Look for common patterns
    lines = content.strip().split("\n")

    for line in lines:
        line_lower = line.lower()
        if "topic" in line_lower or "about" in line_lower:
            # Extract after colon or use rest of line
            if ":" in line:
                return line.split(":", 1)[1].strip()
            return line.strip()

    # Fallback: use first meaningful line
    for line in lines:
        line = line.strip()
        if len(line) > 10 and not line.startswith("---") and not line.startswith("#"):
            return line[:100]

    return "AI and SaaS Development Update"


def generate_linkedin_hook(content: str, topic: str) -> str:
    """Generate an attention-grabbing hook (first 150 characters)."""
    content_lower = content.lower()

    # Detect content type and generate appropriate hook
    if any(word in content_lower for word in ["announce", "launch", "release", "new"]):
        hooks = [
            f"🚀 Excited to share what we've been building...",
            f"Big news! We're launching something special...",
            f"After months of development, it's finally here...",
        ]
    elif any(word in content_lower for word in ["learn", "insight", "thought", "opinion"]):
        hooks = [
            f"Unpopular opinion about AI development...",
            f"Here's what most people miss about building AI agents...",
            f"💡 Hot take: The future of SaaS isn't what you think...",
        ]
    elif any(word in content_lower for word in ["how", "tutorial", "guide", "tips"]):
        hooks = [
            f"Here's how to build AI agents in 2026...",
            f"🎯 5 lessons learned from shipping AI features...",
            f"Want to integrate AI into your SaaS? Start here...",
        ]
    elif any(word in content_lower for word in ["daily", "update", "progress"]):
        hooks = [
            f"📈 Daily build update: Here's what we shipped today...",
            f"Building in public: Day X of our AI journey...",
            f"Today's win: Solved a problem that saved us 10+ hours...",
        ]
    else:
        hooks = [
            f"🤖 The intersection of AI agents and SaaS is exploding...",
            f"Here's why AI agents are changing how we build software...",
            f"💼 What we're learning about AI + SaaS development...",
        ]

    return hooks[0]  # Return first hook (could be randomized)


def generate_linkedin_body(content: str, topic: str) -> str:
    """Generate the main body of the LinkedIn post (2-4 paragraphs)."""
    content_lower = content.lower()

    # Template-based body generation
    if "daily" in content_lower or "update" in content_lower:
        body = f"""Today's focus: {topic}

We're diving deep into building AI agents that actually ship value. Not just demos or prototypes—production-ready systems that handle real workflows.

Key areas we're exploring:
• Agentic workflows that reduce manual tasks
• SaaS integrations that feel seamless
• Automation that scales with your team

The goal? Build once, automate forever."""

    elif "ai" in content_lower and "saas" in content_lower:
        body = f"""The convergence of AI agents and SaaS is creating unprecedented opportunities.

We're seeing three major trends:

1️⃣ Autonomous workflows replacing manual processes
2️⃣ Intelligent integrations that understand context
3️⃣ Self-improving systems that learn from usage

This isn't the future—it's happening now.

Companies that embrace agentic AI will have a fundamental advantage in speed, efficiency, and customer value."""

    else:
        body = f"""Here's what we're learning about {topic.lower()}:

The landscape is shifting faster than most realize. What worked 6 months ago is already outdated.

Key insights from our work:
• Start with the workflow, not the technology
• Human-in-the-loop isn't optional—it's essential
• Measure outcomes, not just outputs

The teams winning in this space are those that ship fast, learn faster, and keep humans in control."""

    return body


def generate_linkedin_cta(content: str) -> str:
    """Generate a clear call-to-action."""
    content_lower = content.lower()

    if any(word in content_lower for word in ["learn", "read", "article", "blog"]):
        return "👉 Link in comments to learn more.\n\nWhat's your experience with AI agents? Share below! 👇"
    elif any(word in content_lower for word in ["connect", "network", "collaborate"]):
        return "Let's connect if you're building in the AI + SaaS space! 🤝\n\nDrop a comment or send a DM—always happy to chat shop."
    elif any(word in content_lower for word in ["share", "repost", "spread"]):
        return "♻️ Repost to help your network discover this.\n\nFollow for more insights on AI agents and SaaS development!"
    else:
        return "What's your take on this? I'd love to hear your thoughts in the comments! 👇\n\nFollow along as we build in public."


def generate_linkedin_hashtags(topic: str) -> list:
    """Generate 3-5 relevant hashtags based on topic."""
    topic_lower = topic.lower()

    # Base hashtags for AI/SaaS content
    base_hashtags = ["#AI", "#SaaS", "#AIAgents"]

    # Topic-specific additions
    if "agent" in topic_lower:
        base_hashtags.append("#AgenticAI")
    elif "build" in topic_lower or "development" in topic_lower:
        base_hashtags.append("#BuildInPublic")
    elif "startup" in topic_lower or "business" in topic_lower:
        base_hashtags.append("#StartupLife")
    elif "automation" in topic_lower or "workflow" in topic_lower:
        base_hashtags.append("#Automation")
    elif "machine learning" in topic_lower or "ml" in topic_lower:
        base_hashtags.append("#MachineLearning")
    else:
        base_hashtags.append("#TechInnovation")

    # Ensure we have 3-5 hashtags
    if len(base_hashtags) < 3:
        base_hashtags.append("#Innovation")
    if len(base_hashtags) > 5:
        base_hashtags = base_hashtags[:5]

    return base_hashtags


def calculate_estimated_reach(hashtags: list) -> Dict[str, Any]:
    """Calculate estimated reach based on hashtags."""
    # Approximate hashtag reach (based on LinkedIn data)
    hashtag_reach = {
        "#AI": 5000000,
        "#SaaS": 2000000,
        "#AIAgents": 100000,
        "#AgenticAI": 50000,
        "#BuildInPublic": 500000,
        "#StartupLife": 800000,
        "#Automation": 1500000,
        "#MachineLearning": 3000000,
        "#TechInnovation": 600000,
        "#Innovation": 4000000,
    }

    total_hashtag_reach = sum(hashtag_reach.get(tag, 50000) for tag in hashtags)

    # Estimate based on typical engagement rates (2-4%)
    estimated_impressions = total_hashtag_reach // 1000  # Conservative estimate
    engagement_rate_low = 0.02
    engagement_rate_high = 0.04

    return {
        "impressions_low": max(100, estimated_impressions // 10),
        "impressions_high": max(500, estimated_impressions // 2),
        "engagement_rate": f"{engagement_rate_low*100:.0f}-{engagement_rate_high*100:.0f}%",
        "expected_likes": f"{int(estimated_impressions * engagement_rate_low)}-{int(estimated_impressions * engagement_rate_high)}",
        "expected_comments": f"{int(estimated_impressions * engagement_rate_low * 0.2)}-{int(estimated_impressions * engagement_rate_high * 0.2)}",
        "expected_shares": f"{int(estimated_impressions * engagement_rate_low * 0.1)}-{int(estimated_impressions * engagement_rate_high * 0.1)}",
        "confidence": "Medium",
    }


def create_linkedin_approval_file(post_data: Dict[str, Any], original_filename: str) -> tuple:
    """
    Create LinkedIn post approval file in Pending_Approval folder.

    Args:
        post_data: Generated post data from generate_linkedin_post()
        original_filename: Original trigger filename

    Returns:
        Tuple of (filename, content)
    """
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    expires = datetime.now().replace(day=min(28, now.day + 7)).strftime("%Y-%m-%d %H:%M:%S")

    # Build hashtag table
    hashtag_table = ""
    hashtag_info = {
        "#AI": "5M+ posts",
        "#SaaS": "2M+ posts",
        "#AIAgents": "100K+ posts",
        "#AgenticAI": "50K+ posts",
        "#BuildInPublic": "500K+ posts",
        "#StartupLife": "800K+ posts",
        "#Automation": "1.5M+ posts",
        "#MachineLearning": "3M+ posts",
        "#TechInnovation": "600K+ posts",
        "#Innovation": "4M+ posts",
    }

    for tag in post_data["hashtags"]:
        reach = hashtag_info.get(tag, "50K+ posts")
        hashtag_table += f"| {tag} | Broad/Niche | {reach} |\n"

    approval_content = f"""---
type: linkedin_post_draft
status: pending_approval
priority: normal
created: {now.strftime("%Y-%m-%d %H:%M:%S")}
expires: {expires}
skill_reference: SKILL_LinkedIn_Posting
original_trigger: {original_filename}
---

# 📱 LinkedIn Post Draft

## Proposed Post Content

{post_data["full_post"]}

---

## Hashtags

| Hashtag | Category | Estimated Reach |
|---------|----------|-----------------|
{hashtag_table}
---

## Estimated Reach

| Metric | Estimate | Confidence |
|--------|----------|------------|
| **Impressions** | {post_data["estimated_reach"]["impressions_low"]:,} - {post_data["estimated_reach"]["impressions_high"]:,} | {post_data["estimated_reach"]["confidence"]} |
| **Engagement Rate** | {post_data["estimated_reach"]["engagement_rate"]} | {post_data["estimated_reach"]["confidence"]} |
| **Expected Likes** | {post_data["estimated_reach"]["expected_likes"]} | Low-Medium |
| **Expected Comments** | {post_data["estimated_reach"]["expected_comments"]} | Low |
| **Expected Shares** | {post_data["estimated_reach"]["expected_shares"]} | Low |

*Estimates based on hashtag reach and average account performance*

---

## Post Metadata

| Property | Value |
|----------|-------|
| **Word Count** | {post_data["word_count"]} / 300 words |
| **Character Count** | {post_data["char_count"]} / 2,800 characters |
| **Hashtag Count** | {post_data["hashtag_count"]} / 5 hashtags |
| **Emoji Count** | {post_data["emoji_count"]} / 5 emojis |
| **Readability Score** | Easy (short paragraphs, bullet points) |
| **Optimal Post Time** | {post_data["optimal_post_time"]} |

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
*⏰ Generated: {now.strftime("%Y-%m-%d %H:%M:%S")}*
"""

    approval_filename = f"LINKEDIN_POST_{timestamp}.md"
    return approval_filename, approval_content


# =============================================================================
# PLAN CREATION WITH REPLY DRAFT
# =============================================================================

def generate_yaml_frontmatter(file_type: str, status: str,
                               priority: str = "medium",
                               task_type: str = "general") -> str:
    """Generate standardized YAML frontmatter."""
    now = datetime.now()
    return f"""---
type: {file_type}
status: {status}
priority: {priority}
task_type: {task_type}
created: {now.strftime("%Y-%m-%d %H:%M:%S")}
created_timestamp: {now.isoformat()}
orchestrator_tier: Silver v4.0
version: 4.0.0
---
"""


def create_plan_content(original_content: str, filename: str,
                        email_data: Optional[Dict] = None) -> Tuple[str, Optional[Dict]]:
    """
    Create comprehensive structured plan with reply draft.

    Returns:
        Tuple of (plan_content, reply_draft_dict)
    """
    now = datetime.now()
    task_type = detect_task_type(original_content, filename)
    complexity = analyze_task_complexity(original_content)
    skill_agent = get_skill_agent(task_type)

    # Generate reply draft if email data provided
    reply_draft = None
    reply_draft_section = ""

    if email_data:
        reply_draft = generate_reply_draft(email_data)

        reply_draft_section = f"""
## 📧 Proposed Reply Draft

**Intent Detected:** {reply_draft['intent'].replace('_', ' ').title()}
**Generated:** {reply_draft['generated_at']}

---

**To:** {reply_draft['to']}
**Subject:** {reply_draft['subject']}

```
{reply_draft['body']}
```

---

### ✏️ Draft Actions

- [ ] Review and edit draft content
- [ ] Approve for sending → Move to `/Approved/`
- [ ] Request regeneration → Add notes in file
- [ ] Reject draft → Move to `/Rejected/`

**Approval File:** `Pending_Approval/REPLY_{filename}`

---
"""

    frontmatter = generate_yaml_frontmatter(
        file_type="plan",
        status="pending",
        priority=complexity["priority"],
        task_type=task_type
    )

    steps_section = """## Steps

### Standard Workflow
- [ ] Read and understand task requirements
- [ ] Identify required tools/skills/agents
- [ ] Check dependencies and prerequisites
"""

    if skill_agent:
        steps_section += f"- [ ] Route to skill agent: `{skill_agent}`\n"

    steps_section += """
### Completion
- [ ] Execute primary action(s)
- [ ] Verify successful completion
- [ ] Document results and outcomes
- [ ] Archive to appropriate folder
"""

    plan_content = f"""{frontmatter}
# 📋 Plan: {filename}

## 🎯 Objective
Execute the task with precision and document all outcomes.

| Property | Value |
|----------|-------|
| **Task Type** | {task_type.title()} |
| **Complexity** | {complexity['level'].title()} |
| **Priority** | {complexity['priority'].title()} |
| **Estimated Time** | {complexity['estimated_time']} |
| **Urgent** | {'Yes ⚠️ ' if complexity['is_urgent'] else 'No'} |
| **Skill Agent** | `{skill_agent or 'To be assigned'}` |
| **Created** | {now.strftime("%Y-%m-%d %H:%M:%S")} |

---

## 📝 Original Task Content

```
{original_content.strip()}
```

---

{steps_section}

{reply_draft_section}

## 🧠 Decision Framework

### Analysis
- **Detected Type:** {task_type.title()} (auto-detected)
- **Content Analysis:** {complexity['word_count']} words, {complexity['line_count']} lines

### Decision Log
| Timestamp | Decision | Reasoning |
|-----------|----------|-----------|
| {now.strftime("%Y-%m-%d %H:%M")} | Plan created | Auto-analysis complete |

---

## ✅ Approval Required?

**Status:** ⏳ Yes - Human review required before execution

---

*🤖 Generated by Silver Tier Orchestrator v4.0*
*📅 Created: {now.strftime("%Y-%m-%d %H:%M:%S")}*
"""

    return plan_content, reply_draft


# =============================================================================
# APPROVAL FILE CREATION
# =============================================================================

def create_approval_file(filename: str, reply_draft: Dict, original_subject: str) -> Optional[Path]:
    """
    Create approval file in /Pending_Approval/ with interactive buttons.

    Args:
        filename: Original task filename
        reply_draft: Generated reply draft dictionary
        original_subject: Original email subject

    Returns:
        Path to created approval file
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        approval_filename = f"REPLY_{filename}"
        approval_path = FOLDERS["pending_approval"] / approval_filename

        # Create interactive approval content
        content = f"""---
type: approval_request
action: send_email_reply
status: pending
priority: high
created: {datetime.now().isoformat()}
original_file: {filename}
---

# ✅ Approval Required: Email Reply

## 📋 Original Email

**Subject:** {original_subject}
**From:** {reply_draft['to']}
**Intent:** {reply_draft['intent'].replace('_', ' ').title()}

---

## 📧 Proposed Reply

**To:** {reply_draft['to']}
**Subject:** {reply_draft['subject']}

```
{reply_draft['body']}
```

---

## 🎯 Action Buttons

**Please select an action by moving this file:**

| Action | Destination | Description |
|--------|-------------|-------------|
| ✅ **Approve** | `/Approved/` | Send this reply via email_mcp.py |
| 🔄 **Regenerate** | `/Needs_Action/` | Add notes and request new draft |
| ❌ **Reject** | `/Rejected/` | Discard this draft |
| ⏳ **Pending** | `/Pending_Approval/` | Keep for later review |

---

## 📝 Human Notes

*Add any comments, edits, or instructions here:*



---

## 🔧 Metadata

- **Generated By:** Silver Tier Orchestrator v4.0
- **Approval ID:** {timestamp}
- **Thread ID:** {reply_draft.get('thread_id', 'N/A')}
- **In Reply To:** {reply_draft.get('in_reply_to', 'N/A')}

---

*Instructions: Move this file to the appropriate folder based on your decision.*
"""

        with open(approval_path, "w", encoding="utf-8") as f:
            f.write(content)

        logger.success(f"✅ Created approval file: {approval_filename}")
        return approval_path

    except Exception as e:
        logger.error(f"Failed to create approval file: {e}")
        return None


# =============================================================================
# DASHBOARD MANAGEMENT (COLORFUL)
# =============================================================================

def get_folder_counts() -> Dict[str, int]:
    """Get item counts for all folders."""
    counts = {}
    for name, path in FOLDERS.items():
        if path.exists():
            counts[name] = len(list(path.glob("*.md")))
        else:
            counts[name] = 0
    return counts


def get_priority_items() -> Dict[str, List[Dict]]:
    """Get items grouped by priority from Needs_Action."""
    priorities = {"high": [], "medium": [], "low": []}
    na_dir = FOLDERS["needs_action"]

    if not na_dir.exists():
        return priorities

    for md_file in na_dir.glob("*.md"):
        try:
            with open(md_file, "r", encoding="utf-8") as f:
                content = f.read()[:1000]  # Read first 1000 chars for frontmatter

            # Extract priority from YAML frontmatter
            priority = "low"
            subject = md_file.stem

            if "priority: high" in content.lower():
                priority = "high"
            elif "priority: medium" in content.lower():
                priority = "medium"

            # Extract subject if available
            for line in content.split("\n"):
                if line.startswith("subject:"):
                    subject = line.replace("subject:", "").strip()
                    break

            priorities[priority].append({
                "filename": md_file.name,
                "subject": subject,
                "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
            })
        except Exception:
            continue

    return priorities


def get_pending_approvals() -> List[Dict]:
    """Get list of pending approval files."""
    approvals = []
    pa_dir = FOLDERS["pending_approval"]

    if not pa_dir.exists():
        return approvals

    for md_file in pa_dir.glob("*.md"):
        approvals.append({
            "filename": md_file.name,
            "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
        })

    return approvals


def generate_colorful_dashboard() -> str:
    """Generate a colorful, priority-based dashboard."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    counts = get_folder_counts()
    priorities = get_priority_items()
    pending_approvals = get_pending_approvals()

    # Build dashboard
    dashboard = f"""# 🎛️ Digital Employee Control Panel

*Last Updated: {now}*

---

## 📊 Live Summary

| Status | Count | Status | Count |
|--------|-------|--------|-------|
| 📥 Needs Action | **{counts.get('needs_action', 0)}** | ✅ Approved | **{counts.get('approved', 0)}** |
| ⏳ Pending Approval | **{counts.get('pending_approval', 0)}** | 📁 Done | **{counts.get('done', 0)}** |
| ❌ Rejected | **{counts.get('rejected', 0)}** | 📋 Plans | **{counts.get('plans', 0)}** |

---

## 🚨 Today's Priorities

"""

    # High Priority (Red)
    dashboard += "### 🔴 High Priority\n\n"
    if priorities["high"]:
        for item in priorities["high"]:
            dashboard += f"- [ ] **{item['subject']}** `({item['modified']})` → `{item['filename']}`\n"
    else:
        dashboard += "- ✅ No high priority items\n"
    dashboard += "\n"

    # Medium Priority (Orange)
    dashboard += "### 🟠 Medium Priority\n\n"
    if priorities["medium"]:
        for item in priorities["medium"]:
            dashboard += f"- [ ] {item['subject']} `({item['modified']})` → `{item['filename']}`\n"
    else:
        dashboard += "- ✅ No medium priority items\n"
    dashboard += "\n"

    # Low Priority (Yellow)
    dashboard += "### 🟡 Low Priority\n\n"
    if priorities["low"]:
        for item in priorities["low"]:
            dashboard += f"- [ ] {item['subject']} `({item['modified']})` → `{item['filename']}`\n"
    else:
        dashboard += "- ✅ No low priority items\n"
    dashboard += "\n"

    # Pending Approvals
    dashboard += "---\n\n## ⏳ Pending Approval (Human-in-the-Loop)\n\n"
    if pending_approvals:
        dashboard += "| File | Time | Actions |\n"
        dashboard += "|------|------|--------|\n"
        for item in pending_approvals:
            dashboard += f"| `{item['filename']}` | {item['modified']} | ✅ Approve / 🔄 Regenerate / ❌ Reject |\n"
    else:
        dashboard += "- ✅ No pending approvals\n"
    dashboard += "\n"

    # Quick Actions
    dashboard += f"""---

## ⚡ Quick Actions

| Command | Description |
|---------|-------------|
| `python3 orchestrator.py` | Process Needs_Action folder |
| `python3 gmail_watcher.py --start` | Start Gmail monitoring (30s) |
| `python3 gmail_watcher.py --status` | Check Gmail watcher status |
| `tmux attach -t gmail_watcher` | View Gmail watcher logs |

---

## 📈 Activity Log

"""

    # Read existing activity log entries
    if DASHBOARD_FILE.exists():
        try:
            with open(DASHBOARD_FILE, "r", encoding="utf-8") as f:
                existing = f.read()

            # Extract recent activity entries
            for line in existing.split("\n"):
                if line.startswith("- [✓]") or line.startswith("- [x]"):
                    dashboard += f"{line}\n"
        except Exception:
            pass

    dashboard += "\n---\n\n*Generated by Silver Tier Orchestrator v4.0*\n"

    return dashboard


def update_dashboard() -> None:
    """Update Dashboard.md with colorful priority-based view."""
    content = generate_colorful_dashboard()

    with open(DASHBOARD_FILE, "w", encoding="utf-8") as f:
        f.write(content)

    logger.info("📊 Dashboard updated with priority view")


# =============================================================================
# METRICS & JSON EXPORT
# =============================================================================

class MetricsManager:
    """Track and export orchestrator metrics."""

    def __init__(self, metrics_file: Path):
        self.metrics_file = metrics_file
        self.metrics_file.parent.mkdir(parents=True, exist_ok=True)
        self.session_metrics = {
            "started_at": datetime.now().isoformat(),
            "files_processed": 0,
            "approvals_created": 0,
            "approvals_triggered": 0,
            "errors": 0,
            "task_types": {},
            "processing_times": [],
        }

    def load_metrics(self) -> Dict[str, Any]:
        if self.metrics_file.exists():
            with open(self.metrics_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"history": [], "totals": {"processed": 0, "approved": 0, "errors": 0}}

    def record_file_processed(self, task_type: str, duration: float) -> None:
        self.session_metrics["files_processed"] += 1
        self.session_metrics["task_types"][task_type] = \
            self.session_metrics["task_types"].get(task_type, 0) + 1
        self.session_metrics["processing_times"].append(duration)

    def record_approval_created(self) -> None:
        self.session_metrics["approvals_created"] += 1

    def record_approval_triggered(self) -> None:
        self.session_metrics["approvals_triggered"] += 1

    def record_error(self) -> None:
        self.session_metrics["errors"] += 1

    def save_metrics(self) -> None:
        self.session_metrics["ended_at"] = datetime.now().isoformat()

        times = self.session_metrics["processing_times"]
        self.session_metrics["avg_processing_time"] = sum(times) / len(times) if times else 0

        all_metrics = self.load_metrics()
        all_metrics["history"].append(self.session_metrics.copy())
        all_metrics["totals"]["processed"] += self.session_metrics["files_processed"]
        all_metrics["totals"]["approved"] += self.session_metrics["approvals_triggered"]
        all_metrics["totals"]["errors"] += self.session_metrics["errors"]
        all_metrics["history"] = all_metrics["history"][-100:]

        with open(self.metrics_file, "w", encoding="utf-8") as f:
            json.dump(all_metrics, f, indent=2, default=str)

        logger.info(f"📈 Metrics saved")

    def get_summary(self) -> str:
        return (
            f"Files: {self.session_metrics['files_processed']} | "
            f"Approvals: {self.session_metrics['approvals_created']} | "
            f"Errors: {self.session_metrics['errors']}"
        )


# =============================================================================
# FILE OPERATIONS
# =============================================================================

def move_file(source: Path, destination: Path) -> bool:
    """Safely move a file."""
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            destination = destination.parent / f"{timestamp}_{destination.name}"

        shutil.move(str(source), str(destination))
        logger.success(f"📦 Moved: {source.name} → {destination.parent.name}/")
        return True
    except Exception as e:
        logger.error(f"Move failed: {e}")
        return False


def read_file_content(file_path: Path) -> str:
    """Read file content with encoding fallback."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            return f.read()


def extract_email_data_from_task(content: str) -> Optional[Dict]:
    """Extract email data from task file content."""
    email_data = {}

    # Extract from YAML frontmatter
    lines = content.split("\n")
    in_frontmatter = False

    for line in lines:
        if line.strip() == "---":
            if not in_frontmatter:
                in_frontmatter = True
            else:
                break
            continue

        if in_frontmatter:
            if ":" in line:
                key, value = line.split(":", 1)
                email_data[key.strip()] = value.strip()

    # Extract body content (after frontmatter)
    body_start = content.find("---", 3) + 3
    email_data["body"] = content[body_start:].strip()

    # Check if we have minimum required fields
    if "from" in email_data or "subject" in email_data:
        return email_data

    return None


# =============================================================================
# NEEDS_ACTION PROCESSING
# =============================================================================

def process_needs_action_files(metrics: MetricsManager) -> int:
    """Process all .md files in Needs_Action folder."""
    needs_action_dir = FOLDERS["needs_action"]

    if not needs_action_dir.exists():
        logger.warning("Needs_Action directory does not exist")
        return 0

    md_files = sorted(
        needs_action_dir.glob("*.md"),
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )

    if not md_files:
        logger.info("📭 No .md files found in Needs_Action folder")
        return 0

    logger.info(f"📥 Found {len(md_files)} file(s) to process")
    processed_count = 0
    approvals_created = 0
    linkedin_posts_generated = 0

    for file_path in md_files:
        start_time = datetime.now()
        logger.info(f"{'─' * 60}")
        logger.info(f"Processing: {file_path.name}")

        try:
            # Read content
            original_content = read_file_content(file_path)
            logger.info(f"📄 Read {len(original_content)} characters")

            # Detect task type
            task_type = detect_task_type(original_content, file_path.name)
            logger.info(f"🎯 Detected task type: {task_type.title()}")

            # Check for LinkedIn trigger (special handling)
            is_linkedin_trigger = (
                task_type == "linkedin" or
                "LINKEDIN" in file_path.name.upper() or
                "task_type: linkedin" in original_content.lower()
            )

            if is_linkedin_trigger:
                # Generate LinkedIn post and create approval file directly
                logger.info("📱 LinkedIn trigger detected - generating post draft...")
                post_data = generate_linkedin_post(original_content, file_path.name)
                
                approval_filename, approval_content = create_linkedin_approval_file(
                    post_data, file_path.name
                )
                
                approval_path = FOLDERS["pending_approval"] / approval_filename
                with open(approval_path, "w", encoding="utf-8") as f:
                    f.write(approval_content)
                
                logger.success(f"✅ Created LinkedIn post draft: {approval_filename}")
                logger.info(f"📍 Saved to: /Pending_Approval/{approval_filename}")
                linkedin_posts_generated += 1
                approvals_created += 1

                # Move trigger file to Done
                destination_path = FOLDERS["done"] / file_path.name
                if move_file(file_path, destination_path):
                    processed_count += 1
                    duration = (datetime.now() - start_time).total_seconds()
                    metrics.record_file_processed(task_type, duration)
                    logger.success(f"✓ Completed: {file_path.name} ({duration:.2f}s)")
                else:
                    metrics.record_error()
                    logger.error(f"✗ Failed to move: {file_path.name}")
                continue

            # Extract email data if applicable (non-LinkedIn handling)
            email_data = None
            if task_type == "email":
                email_data = extract_email_data_from_task(original_content)
                if email_data:
                    logger.info(f"📧 Email detected: {email_data.get('subject', 'N/A')}")

            # Create plan with reply draft
            plan_filename = f"PLAN_{file_path.name}"
            plan_path = FOLDERS["plans"] / plan_filename
            plan_content, reply_draft = create_plan_content(
                original_content, file_path.name, email_data
            )

            with open(plan_path, "w", encoding="utf-8") as f:
                f.write(plan_content)
            logger.success(f"✅ Created plan: {plan_filename}")

            # Create approval file if reply draft generated
            if reply_draft and email_data:
                approval_path = create_approval_file(
                    file_path.name,
                    reply_draft,
                    email_data.get("subject", "Email Reply")
                )
                if approval_path:
                    approvals_created += 1
                    logger.success(f"✅ Created approval request: {approval_path.name}")

            # Move to Done
            destination_path = FOLDERS["done"] / file_path.name
            if move_file(file_path, destination_path):
                processed_count += 1
                duration = (datetime.now() - start_time).total_seconds()
                metrics.record_file_processed(task_type, duration)
                logger.success(f"✓ Completed: {file_path.name} ({duration:.2f}s)")
            else:
                metrics.record_error()
                logger.error(f"✗ Failed to move: {file_path.name}")

        except Exception as e:
            metrics.record_error()
            logger.error(f"✗ Error: {file_path.name} - {e}")

    # Update dashboard
    update_dashboard()

    if linkedin_posts_generated > 0:
        logger.info(f"📱 LinkedIn posts generated: {linkedin_posts_generated}")

    return processed_count


# =============================================================================
# APPROVAL WORKFLOW
# =============================================================================

def check_pending_approvals(metrics: MetricsManager) -> int:
    """Check Approved folder and trigger actions."""
    approved_dir = FOLDERS["approved"]

    if not approved_dir.exists():
        return 0

    approved_files = list(approved_dir.iterdir())

    if not approved_files:
        logger.info("📭 No approved files to process")
        return 0

    logger.info(f"✅ Found {len(approved_files)} approved file(s)")
    approved_count = 0

    for file_path in approved_files:
        logger.info(f"{'─' * 60}")
        logger.success(f"🎉 Action Approved: {file_path.name}")
        approved_count += 1
        metrics.record_approval_triggered()

        try:
            content = read_file_content(file_path)

            # Extract original file reference
            original_file = None
            for line in content.split("\n"):
                if line.startswith("original_file:"):
                    original_file = line.replace("original_file:", "").strip()
                    break

            logger.info(f"📧 Original file: {original_file or 'N/A'}")
            logger.info("📬 Triggering email send via email_mcp.py...")

            # TODO: Actually send email via email_mcp.py
            # For now, just log
            logger.info("✅ Email would be sent here (integration pending)")

            # Move approved file to Done
            done_path = FOLDERS["done"] / file_path.name
            move_file(file_path, done_path)

        except Exception as e:
            logger.error(f"Error processing approval {file_path.name}: {e}")
            metrics.record_error()

    # Update dashboard after processing approvals
    update_dashboard()

    return approved_count


# =============================================================================
# STATUS REPORTING
# =============================================================================

def generate_status_report(processed: int, approved: int,
                           metrics: MetricsManager) -> str:
    """Generate comprehensive status report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    counts = get_folder_counts()

    report = f"""
{'=' * 70}
ORCHESTRATOR STATUS REPORT - {now}
{'=' * 70}

📊 SESSION SUMMARY
{'─' * 70}
  Files Processed:     {processed:>6}
  Approvals Created:   {metrics.session_metrics['approvals_created']:>6}
  Approvals Triggered: {approved:>6}
  Status:              {'✓ Active' if processed > 0 or approved > 0 else '○ No Activity'}

{metrics.get_summary()}

📁 FOLDER STATUS
{'─' * 70}"""

    for name, path in FOLDERS.items():
        if path.exists():
            count = len(list(path.glob("*.md")))
            report += f"\n  {name.title():>22}: {count:>6} item(s)"
        else:
            report += f"\n  {name.title():>22}: N/A"

    report += f"""

📈 METRICS
{'─' * 70}"""

    all_metrics = metrics.load_metrics()
    totals = all_metrics.get("totals", {})
    report += f"\n  Lifetime Processed: {totals.get('processed', 0):>10}"
    report += f"\n  Lifetime Approved:  {totals.get('approved', 0):>10}"
    report += f"\n  Lifetime Errors:    {totals.get('errors', 0):>10}"

    report += f"""

{'=' * 70}
"""
    return report


# =============================================================================
# MAIN ORCHESTRATOR
# =============================================================================

def main(run_mode: str = "once") -> None:
    """
    Main orchestrator entry point.

    Args:
        run_mode: 'once' for single run, 'scheduled' for continuous
    """
    print("\n" + "=" * 70)
    print("  SILVER TIER ORCHESTRATOR v4.0 - Human-in-the-Loop")
    print("=" * 70 + "\n")

    logger.info("🚀 Orchestrator starting...")

    # Initialize
    load_environment()
    ensure_directories()

    # Initialize managers
    metrics = MetricsManager(METRICS_FILE)

    # Handle scheduled mode
    if run_mode == "scheduled":
        interval = int(os.getenv("ORCHESTRATOR_INTERVAL", "30"))
        logger.info(f"⏰ Scheduled mode not fully implemented. Use cron instead.")

    # Process Needs_Action
    print("\n" + "─" * 70)
    logger.info("📥 Scanning Needs_Action folder...")
    print("─" * 70)
    processed_count = process_needs_action_files(metrics)

    if processed_count == 0:
        logger.info("📭 Nothing to process in Needs_Action folder.")

    # Check Approvals
    print("\n" + "─" * 70)
    logger.info("✅ Checking approval workflow...")
    print("─" * 70)
    approved_count = check_pending_approvals(metrics)

    # Save metrics
    metrics.save_metrics()

    # Generate report
    print("\n" + generate_status_report(processed_count, approved_count, metrics))

    logger.info("✨ Orchestrator run complete.")
    print("=" * 70 + "\n")


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    run_mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    main(run_mode)
