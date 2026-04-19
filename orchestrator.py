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
import re
import json
import time
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any, Tuple
from dotenv import load_dotenv

# Gold Tier Audit Logging
from audit_log import (
    AuditLogManager,
    AuditEntry,
    AuditCategory,
    AuditLevel,
    ErrorRecoveryManager,
    RetryPolicy,
    get_audit_manager,
    get_recovery_manager,
)

# Ralph Wiggum Loop — Autonomous Task Completion (Stop Hook Pattern)
try:
    from ralph_wiggum import RalphWiggumLoop, ralph_process_task
    RALPH_WIGGUM_AVAILABLE = True
except ImportError:
    RalphWiggumLoop = None
    ralph_process_task = None
    RALPH_WIGGUM_AVAILABLE = False

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
    "whatsapp": ["whatsapp", "type: whatsapp"],
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
# WHATSAPP REPLY DRAFT GENERATION
# =============================================================================

def generate_whatsapp_reply_draft(sender: str, message_body: str, message_id: str) -> Dict[str, str]:
    """
    Generate a WhatsApp reply draft.

    CRITICAL: This draft is ONLY for human review. It must NEVER be auto-sent.
    WhatsApp has strict rate limits — all replies require Human-in-the-Loop approval.

    Args:
        sender: WhatsApp sender name/number
        message_body: Original message content
        message_id: Unique message identifier

    Returns:
        Dictionary with draft content
    """
    sender_name = sender.split(" · ")[0].strip() if " · " in sender else sender

    # Detect intent for contextual reply
    low = message_body.lower()
    if any(kw in low for kw in ["urgent", "asap", "immediate"]):
        intent = "urgent_response"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"I received your urgent message and I'm looking into this right away. "
            f"I'll get back to you with a detailed response as soon as possible.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )
    elif any(kw in low for kw in ["invoice", "payment", "price", "quote"]):
        intent = "billing_inquiry"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"Thank you for your message regarding billing. I'm reviewing the details "
            f"and will respond with complete information shortly.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )
    elif any(kw in low for kw in ["meeting", "schedule", "available"]):
        intent = "meeting_request"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"Thanks for reaching out about scheduling a meeting. "
            f"I'd be happy to connect. Let me check my availability and get back to you "
            f"with some time options.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )
    elif any(kw in low for kw in ["help", "required", "need"]):
        intent = "help_request"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"I got your message and I'm here to help. "
            f"Let me review what you need and I'll follow up with a proper response.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )
    elif any(kw in low for kw in ["saas", "ai", "developer", "project"]):
        intent = "business_inquiry"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"Thank you for your interest. I'd love to discuss this further. "
            f"Let me review your message in detail and respond with next steps.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )
    else:
        intent = "general_acknowledgment"
        reply_body = (
            f"Hi {sender_name},\n\n"
            f"Thanks for your message. I've received it and will get back to you properly soon.\n\n"
            f"Best regards,\n{DEFAULT_SENDER['name']}"
        )

    return {
        "intent": intent,
        "sender": sender,
        "message_id": message_id,
        "reply_body": reply_body,
        "generated_at": datetime.now().isoformat(),
    }


def create_whatsapp_approval_file(filename: str, whatsapp_data: Dict) -> Optional[Path]:
    """
    Create WhatsApp approval file in /Pending_Approval/.

    ⚠️  CRITICAL SAFETY RULE:
    WhatsApp replies MUST NEVER be auto-sent. Every reply requires human approval
    to avoid WhatsApp rate limit bans ("api rate limit exceed please try again later").

    The human MUST move this file to /Approved/ before any reply is sent.

    Args:
        filename: Original WhatsApp task filename
        whatsapp_data: Dict with sender, body, message_id, priority

    Returns:
        Path to created approval file or None on error
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_sender = re.sub(r'[^\w\s-]', '', whatsapp_data.get('sender', 'unknown')[:40])
        safe_sender = re.sub(r'[-\s]+', '_', safe_sender.strip()).lower()
        approval_filename = f"WHATSAPP_{timestamp}_{safe_sender}.md"
        approval_path = FOLDERS["pending_approval"] / approval_filename

        sender = whatsapp_data.get("sender", "Unknown")
        body = whatsapp_data.get("body", "")
        priority = whatsapp_data.get("priority", "medium")

        # Generate contextual reply draft
        reply_draft = generate_whatsapp_reply_draft(
            sender=sender,
            message_body=body,
            message_id=whatsapp_data.get("message_id", ""),
        )

        priority_emoji = "🔴" if priority == "high" else "🟠"

        content = f"""---
type: whatsapp_reply_approval
action: send_whatsapp_reply
status: pending
priority: {priority}
created: {datetime.now().isoformat()}
original_file: {filename}
sender: {sender}
message_id: {whatsapp_data.get('message_id', 'N/A')}
---

# {priority_emoji} WhatsApp Reply — Human Approval Required

## ⚠️  IMPORTANT SAFETY RULE

**WhatsApp replies MUST be manually reviewed and approved by a human.**
**NEVER auto-send WhatsApp messages — rate limits will cause bans.**

Only send this reply after moving this file to `/Approved/`.

---

## 📋 Original WhatsApp Message

**From:** {sender}
**Received:** {whatsapp_data.get('received_iso', 'N/A')}
**Priority:** {priority.upper()}
**Message ID:** {whatsapp_data.get('message_id', 'N/A')}

---

### Message Content

```
{body}
```

---

## 💬 Proposed Reply Draft

**Intent Detected:** {reply_draft['intent'].replace('_', ' ').title()}
**Generated:** {reply_draft['generated_at']}

```
{reply_draft['reply_body']}
```

---

## 🎯 Action Buttons

**Please select an action by moving this file:**

| Action | Destination | Description |
|--------|-------------|-------------|
| ✅ **Approve** | `/Approved/` | Reply draft is ready — human will send via WhatsApp Web |
| 🔄 **Edit & Approve** | `/Approved/` | Edit the draft above, then move to `/Approved/` |
| ❌ **Reject** | `/Rejected/` | Discard this draft, no reply needed |
| ⏳ **Pending** | `/Pending_Approval/` | Need more time to decide |

---

## 📝 Human Notes

*Add any comments, edits, or instructions here:*



---

## 🔧 Metadata

- **Generated By:** Silver Tier Orchestrator v4.0
- **Approval ID:** {timestamp}
- **Source:** WhatsApp Watcher v1.1
- **Rate Limit Safety:** 60-second minimum delay between sends

---

*⚠️  REMINDER: Do NOT send WhatsApp replies without human approval.*
*📖 See Company_Handbook.md → WhatsApp Approval Rules*
"""

        with open(approval_path, "w", encoding="utf-8") as f:
            f.write(content)

        logger.success(f"✅ Created WhatsApp approval file: {approval_filename}")
        logger.info("   📋 Draft created in Pending_Approval — Waiting for human approval")
        print(f"   📋 Draft created in Pending_Approval — Waiting for human approval")
        return approval_path

    except Exception as e:
        logger.error(f"Failed to create WhatsApp approval file: {e}")
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
    """Get list of pending approval files with type detection."""
    approvals = []
    pa_dir = FOLDERS["pending_approval"]

    if not pa_dir.exists():
        return approvals

    for md_file in pa_dir.glob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")[:500]
            item_type = "email"
            if "type: linkedin" in content.lower() or "LINKEDIN" in md_file.name.upper():
                item_type = "linkedin"
            elif "type: whatsapp" in content.lower() or "WHATSAPP" in md_file.name.upper():
                item_type = "whatsapp"

            approvals.append({
                "filename": md_file.name,
                "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
                "type": item_type,
            })
        except Exception:
            approvals.append({
                "filename": md_file.name,
                "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
                "type": "email",
            })

    return approvals


def get_linkedin_pending_posts() -> List[Dict]:
    """Get list of pending LinkedIn posts with status tracking."""
    linkedin_posts = []
    pa_dir = FOLDERS["pending_approval"]
    approved_dir = FOLDERS["approved"]
    done_dir = FOLDERS["done"]

    # Check pending approvals
    if pa_dir.exists():
        for md_file in pa_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")[:1000]
                if "type: linkedin" in content.lower() or "LINKEDIN" in md_file.name.upper():
                    # Extract topic/subject if available
                    topic = "LinkedIn Post"
                    for line in content.split("\n"):
                        if line.startswith("topic:") or line.startswith("subject:"):
                            topic = line.split(":", 1)[1].strip()[:60]
                            break
                    
                    linkedin_posts.append({
                        "filename": md_file.name,
                        "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
                        "status": "pending",
                        "topic": topic,
                    })
            except Exception:
                continue

    # Check approved (ready to post)
    if approved_dir.exists():
        for md_file in approved_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")[:500]
                if "type: linkedin" in content.lower() or "LINKEDIN" in md_file.name.upper():
                    linkedin_posts.append({
                        "filename": md_file.name,
                        "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
                        "status": "approved",
                        "topic": "LinkedIn Post",
                    })
            except Exception:
                continue

    # Check done (posted)
    if done_dir.exists():
        for md_file in done_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")[:500]
                if "LINKEDIN" in md_file.name.upper() or "type: linkedin" in content.lower():
                    # Check if successfully posted
                    if "✅" in content or "published" in content.lower():
                        linkedin_posts.append({
                            "filename": md_file.name,
                            "modified": datetime.fromtimestamp(md_file.stat().st_mtime).strftime("%H:%M"),
                            "status": "posted",
                            "topic": "LinkedIn Post",
                        })
            except Exception:
                continue

    return sorted(linkedin_posts, key=lambda x: x["modified"], reverse=True)


def get_daily_email_stats() -> Dict[str, int]:
    """Get email statistics for today from logs."""
    today = datetime.now().strftime("%Y%m%d")
    log_file = FOLDERS["logs"] / f"email_log_{today}.md"

    stats = {
        "sent": 0,
        "failed": 0,
        "dry_run": 0,
    }

    if log_file.exists():
        try:
            content = log_file.read_text(encoding="utf-8")
            stats["sent"] = content.count("✅ Sent")
            stats["failed"] = content.count("❌ Failed")
            stats["dry_run"] = content.count("🔍 Dry Run")
        except Exception:
            pass

    return stats


def get_today_completed() -> List[Dict]:
    """Get files completed today from Done folder."""
    completed = []
    done_dir = FOLDERS["done"]
    today = datetime.now().strftime("%Y-%m-%d")

    if not done_dir.exists():
        return completed

    for md_file in done_dir.glob("*.md"):
        try:
            mtime = datetime.fromtimestamp(md_file.stat().st_mtime)
            if mtime.strftime("%Y-%m-%d") == today:
                completed.append({
                    "filename": md_file.name,
                    "time": mtime.strftime("%H:%M"),
                })
        except Exception:
            continue

    # Return last 10 completed items, sorted by time (newest first)
    return sorted(completed, key=lambda x: x["time"], reverse=True)[:10]


def generate_colorful_dashboard() -> str:
    """Generate a colorful, priority-based dashboard with instant status visibility."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    counts = get_folder_counts()
    priorities = get_priority_items()
    pending_approvals = get_pending_approvals()
    email_stats = get_daily_email_stats()
    today_completed = get_today_completed()
    linkedin_posts = get_linkedin_pending_posts()

    # Calculate today's stats
    today_sent = email_stats["sent"] + email_stats["dry_run"]
    today_pending = counts.get("pending_approval", 0)
    today_rejected = counts.get("rejected", 0)
    needs_action_count = counts.get("needs_action", 0)
    approved_count = counts.get("approved", 0)
    linkedin_pending_count = len([p for p in linkedin_posts if p["status"] == "pending"])
    linkedin_approved_count = len([p for p in linkedin_posts if p["status"] == "approved"])
    linkedin_posted_count = len([p for p in linkedin_posts if p["status"] == "posted"])

    # Determine overall system status
    if today_pending > 0 or needs_action_count > 0:
        system_status = "🟡 Action Required"
    elif approved_count > 0:
        system_status = "🟢 Processing"
    else:
        system_status = "🟢 All Clear"

    # Build dashboard
    dashboard = f"""# 🎛️ Digital Employee Control Panel

*Last Updated: {now}* | **Status:** {system_status}

---

## 📊 Quick Status Overview

| 🔴 Needs Action | 🟠 Pending Approval | 🟡 Sent Today | 🟢 Completed Today |
|:---------------:|:-------------------:|:-------------:|:------------------:|
| **{needs_action_count}** | **{today_pending}** | **{today_sent}** | **{len(today_completed)}** |

---

## 📈 Today's Activity Summary

| Metric | Count | Visual Status |
|--------|-------|---------------|
| **Emails Sent** | {today_sent} | {"🟢 Active" if today_sent > 0 else "⚪ None"} |
| **Pending Review** | {today_pending} | {"🟡 Waiting" if today_pending > 0 else "🟢 Clear"} |
| **Rejected** | {today_rejected} | {"🔴 Attention" if today_rejected > 0 else "🟢 None"} |
| **Dry Run Mode** | {email_stats["dry_run"]} | {"🔍 Testing" if email_stats["dry_run"] > 0 else "✅ Live"} |

---

"""

    # 🔴 HIGH PRIORITY - Needs Action
    dashboard += "## 🔴 High Priority - Needs Action\n\n"
    if priorities["high"]:
        dashboard += "**Immediate attention required:**\n\n"
        for item in priorities["high"]:
            dashboard += f"- 🔴 `{item['filename']}` — {item['subject']} `[{item['modified']}]`\n"
        dashboard += "\n"
    elif needs_action_count > 0:
        dashboard += "- 🟢 No high priority items\n\n"
    else:
        dashboard += "- ✅ No items in Needs Action\n\n"

    # 🟠 PENDING APPROVALS
    dashboard += "---\n\n## 🟠 Pending Approvals - Human Review Required\n\n"
    if pending_approvals:
        # Separate by type
        whatsapp_approvals = [a for a in pending_approvals if a.get("type") == "whatsapp"]
        linkedin_approvals = [a for a in pending_approvals if a.get("type") == "linkedin"]
        email_approvals = [a for a in pending_approvals if a.get("type") == "email"]

        # ─── WhatsApp Approvals (Highlighted for safety) ────────────────
        if whatsapp_approvals:
            dashboard += "### 💬 WhatsApp Replies — Manual Approval Required\n\n"
            dashboard += "> ⚠️ **WhatsApp replies are NEVER auto-sent. Human must approve and send manually.**\n\n"
            dashboard += "| # | File | Sender | Since | Action |\n"
            dashboard += "|---|------|--------|-------|--------|\n"
            for i, item in enumerate(whatsapp_approvals, 1):
                # Extract sender from filename
                sender = item["filename"].replace("WHATSAPP_", "").rsplit("_", 3)[0] if "_" in item["filename"] else "Unknown"
                dashboard += f"| {i} | 💬 `{item['filename']}` | {sender} | {item['modified']} | Review → `/Approved/` |\n"
            dashboard += f"\n**WhatsApp:** {len(whatsapp_approvals)} reply(ies) awaiting your review\n\n"

        # ─── General Approvals ──────────────────────────────────────────
        other_approvals = email_approvals + linkedin_approvals
        if other_approvals:
            dashboard += "**Move files to `/Approved/` to execute:**\n\n"
            dashboard += "| # | Type | File | Since | Quick Action |\n"
            dashboard += "|---|------|------|-------|-------------|\n"
            for i, item in enumerate(other_approvals, 1):
                if item.get("type") == "linkedin":
                    icon = "📱"
                    action = "Post LinkedIn"
                else:
                    icon = "📧"
                    action = "Send Email"

                dashboard += f"| {i} | {icon} | `{item['filename']}` | {item['modified']} | → `/Approved/` |\n"

            dashboard += f"\n**Total (Email + LinkedIn):** {len(other_approvals)} file(s) awaiting your decision\n"

        dashboard += "\n**Quick Commands:**\n"
        dashboard += "```\n# Approve: mv Pending_Approval/<file> Approved/\n# Reject: mv Pending_Approval/<file> Rejected/\n```\n"
    else:
        dashboard += "✅ **All clear!** No pending approvals\n"

    dashboard += "\n"

    # 🔵 LINKEDIN PENDING POSTS
    dashboard += "---\n\n## 🔵 LinkedIn Pending Posts\n\n"
    if linkedin_posts:
        dashboard += f"**LinkedIn Post Queue:** {linkedin_pending_count} pending, {linkedin_approved_count} approved, {linkedin_posted_count} posted\n\n"
        
        # Pending posts
        pending_li = [p for p in linkedin_posts if p["status"] == "pending"]
        if pending_li:
            dashboard += "### 🟡 Awaiting Human Review\n\n"
            dashboard += "| # | File | Topic | Since | Action |\n"
            dashboard += "|---|------|-------|-------|--------|\n"
            for i, item in enumerate(pending_li, 1):
                dashboard += f"| {i} | `{item['filename']}` | {item['topic']} | {item['modified']} | Review → `/Approved/` |\n"
            dashboard += f"\n**{len(pending_li)} post(s)** awaiting your review\n\n"
        
        # Approved posts (ready to publish)
        approved_li = [p for p in linkedin_posts if p["status"] == "approved"]
        if approved_li:
            dashboard += "### 🟢 Approved - Ready to Publish\n\n"
            dashboard += "| # | File | Since | Status |\n"
            dashboard += "|---|------|-------|--------|\n"
            for i, item in enumerate(approved_li, 1):
                dashboard += f"| {i} | `{item['filename']}` | {item['modified']} | ⏳ Waiting for orchestrator |\n"
            dashboard += f"\n**{len(approved_li)} post(s)** approved, will be posted on next orchestrator run\n\n"
        
        # Posted successfully
        posted_li = [p for p in linkedin_posts if p["status"] == "posted"]
        if posted_li:
            dashboard += "### ✅ Successfully Posted\n\n"
            dashboard += "| # | File | Posted | Status |\n"
            dashboard += "|---|------|--------|--------|\n"
            for i, item in enumerate(posted_li, 1):
                dashboard += f"| {i} | `{item['filename']}` | {item['modified']} | ✅ Live on LinkedIn |\n"
            dashboard += f"\n**{len(posted_li)} post(s)** published successfully\n\n"
        
        dashboard += "**Quick Commands:**\n"
        dashboard += "```\n"
        dashboard += "# Approve post: mv Pending_Approval/LINKEDIN_POST_* Approved/\n"
        dashboard += "# Reject post: mv Pending_Approval/LINKEDIN_POST_* Rejected/\n"
        dashboard += "# Create new post request: echo 'topic' > Needs_Action/LINKEDIN_DAILY_POST.md\n"
        dashboard += "```\n"
    else:
        dashboard += "✅ **No LinkedIn posts in queue**\n\n"
        dashboard += "**To create a post:**\n"
        dashboard += "```\n"
        dashboard += "python3 orchestrator.py tasks \"Post on LinkedIn: Your content here\"\n"
        dashboard += "```\n"
        dashboard += "Or place a file in `/Needs_Action/LINKEDIN_DAILY_POST.md`\n"

    dashboard += "\n"

    # 🟡 TODAY'S COMPLETED
    dashboard += "---\n\n## 🟡 Today's Completed Tasks\n\n"
    if today_completed:
        dashboard += "**Successfully processed today:**\n\n"
        for item in today_completed:
            # Determine completion icon
            if "REJECTED" in item["filename"].upper():
                icon = "❌"
            elif "EMAIL" in item["filename"].upper() or "REPLY" in item["filename"].upper():
                icon = "📧"
            elif "LINKEDIN" in item["filename"].upper():
                icon = "📱"
            else:
                icon = "✅"

            dashboard += f"- {icon} `{item['filename']}` `[{item['time']}]`\n"
    else:
        dashboard += "- ⏳ No tasks completed yet today\n"

    dashboard += "\n"

    # 📋 QUICK ACTIONS & SCHEDULING
    dashboard += f"""---

## ⚡ Quick Actions & Scheduling

### Manual Commands

| Command | Purpose |
|---------|---------|
| `python3 orchestrator.py` | Process all pending items |
| `python3 gmail_watcher.py --start` | Start Gmail monitor (30s interval) |
| `python3 gmail_watcher.py --status` | Check watcher status |
| `python3 email_mcp.py test` | Test email connection |

### Automated Scheduling (Recommended)

**Option 1: Cron Job (Linux/Mac)**
```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * cd /path/to/Digital_Employee && python3 orchestrator.py >> Logs/cron.log 2>&1
```

**Option 2: tmux Session (Background)**
```bash
# Start Gmail watcher in tmux
tmux new -d -s gmail_watcher "python3 gmail_watcher.py --start"

# View logs anytime
tmux attach -t gmail_watcher
```

**Option 3: Systemd Service (Production)**
```ini
# /etc/systemd/system/digital-employee.service
[Unit]
Description=Digital Employee Orchestrator
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Digital_Employee
ExecStart=/usr/bin/python3 orchestrator.py
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 📝 Recent Activity Log

"""

    # Recent activity from existing dashboard
    if DASHBOARD_FILE.exists():
        try:
            with open(DASHBOARD_FILE, "r", encoding="utf-8") as f:
                existing = f.read()

            # Extract recent activity entries (last 10)
            activity_lines = []
            for line in existing.split("\n"):
                if line.startswith("- [✓]") or line.startswith("- [x]"):
                    activity_lines.append(line)

            for line in activity_lines[-10:]:
                dashboard += f"{line}\n"
        except Exception:
            pass

    dashboard += "\n---\n\n"
    dashboard += f"*🤖 Silver Tier Orchestrator v4.0 | {system_status}*\n"

    return dashboard


def update_dashboard() -> None:
    """Update Dashboard.md with colorful priority-based view."""
    content = generate_colorful_dashboard()

    with open(DASHBOARD_FILE, "w", encoding="utf-8") as f:
        f.write(content)

    logger.info("📊 Dashboard updated with priority view")


def update_dashboard_linkedin_success(filename: str, message: str) -> None:
    """Update Dashboard.md with LinkedIn post success status."""
    try:
        if not DASHBOARD_FILE.exists():
            return

        with open(DASHBOARD_FILE, "r", encoding="utf-8") as f:
            content = f.read()

        # Add success entry to Recently Published section
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        success_entry = f"| {timestamp} | {filename.replace('LINKEDIN_POST_', '').replace('.md', '')} | ✅ Live | Posted |"

        # Check if Recently Published section exists
        if "Recently Published:" in content:
            # Find the table and add entry
            lines = content.split("\n")
            new_lines = []
            added = False
            for line in lines:
                new_lines.append(line)
                if "| Date |" in line or "|------|" in line:
                    continue
                if "Recently Published:" in line and not added:
                    # Add entry after header
                    new_lines.append("")
                    new_lines.append(success_entry)
                    added = True

            content = "\n".join(new_lines)
        else:
            # Add new section
            linkedin_section = f"""
---

## 🔵 LinkedIn Recently Published

| Date | File | Status | Post URL |
|------|------|--------|----------|
{success_entry}
"""
            content += linkedin_section

        with open(DASHBOARD_FILE, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info(f"📊 Dashboard updated: LinkedIn post success - {filename}")
    except Exception as e:
        logger.warning(f"Could not update Dashboard with LinkedIn success: {e}")


def update_dashboard_linkedin_failure(filename: str, message: str) -> None:
    """Update Dashboard.md with LinkedIn post failure status."""
    try:
        if not DASHBOARD_FILE.exists():
            return

        with open(DASHBOARD_FILE, "r", encoding="utf-8") as f:
            content = f.read()

        # Add failure entry
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        failure_entry = f"| {timestamp} | {filename} | ❌ Failed | {message[:50]}... |"

        # Check if failure section exists
        if "LinkedIn Post Failures:" in content:
            lines = content.split("\n")
            new_lines = []
            for line in lines:
                new_lines.append(line)
                if "|------|" in line and "Date" not in line:
                    new_lines.append(failure_entry)
            content = "\n".join(new_lines)
        else:
            # Add new section
            failure_section = f"""
---

## 🔴 LinkedIn Post Failures

| Date | File | Status | Error |
|------|------|--------|-------|
{failure_entry}
"""
            content += failure_section

        with open(DASHBOARD_FILE, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info(f"📊 Dashboard updated: LinkedIn post failure - {filename}")
    except Exception as e:
        logger.warning(f"Could not update Dashboard with LinkedIn failure: {e}")


# =============================================================================
# METRICS & JSON EXPORT
# =============================================================================

class MetricsManager:
    """Track and export orchestrator metrics with audit logging."""

    def __init__(self, metrics_file: Path, audit_manager: Optional[AuditLogManager] = None):
        self.metrics_file = Path(metrics_file) if isinstance(metrics_file, str) else metrics_file
        self.metrics_file.parent.mkdir(parents=True, exist_ok=True)
        self.audit = audit_manager or get_audit_manager()
        self.session_metrics = {
            "started_at": datetime.now().isoformat(),
            "files_processed": 0,
            "approvals_created": 0,
            "approvals_triggered": 0,
            "errors": 0,
            "task_types": {},
            "processing_times": [],
        }

        # Audit session start
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.INFO,
            action="session_start",
            details={"metrics_file": str(metrics_file)},
            source="orchestrator",
        )
        self.audit.log(entry)

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

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.SUCCESS,
            action="file_processed",
            details={"task_type": task_type, "duration_seconds": round(duration, 2)},
            duration_ms=round(duration * 1000, 2),
            source="orchestrator",
        )
        self.audit.log(entry)

    def record_approval_created(self) -> None:
        self.session_metrics["approvals_created"] += 1

    def record_approval_triggered(self) -> None:
        self.session_metrics["approvals_triggered"] += 1

    def record_error(self, error_msg: str = "", error_type: str = "") -> None:
        self.session_metrics["errors"] += 1

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.ERROR,
            action="error_occurred",
            details={"error_msg": error_msg, "error_type": error_type},
            error={"type": error_type or "Unknown", "message": error_msg},
            source="orchestrator",
        )
        self.audit.log(entry)

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

        # Audit session end
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.INFO,
            action="session_end",
            details={
                "files_processed": self.session_metrics["files_processed"],
                "approvals_created": self.session_metrics["approvals_created"],
                "errors": self.session_metrics["errors"],
            },
            source="orchestrator",
        )
        self.audit.log(entry)

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
    """Safely move a file with audit logging."""
    audit = get_audit_manager()
    correlation_id = str(uuid.uuid4())
    start_time = datetime.now()

    try:
        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            destination = destination.parent / f"{timestamp}_{destination.name}"

        shutil.move(str(source), str(destination))
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        logger.success(f"📦 Moved: {source.name} → {destination.parent.name}/")

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.SUCCESS,
            action="file_move",
            correlation_id=correlation_id,
            details={
                "source": str(source),
                "destination": str(destination),
                "source_name": source.name,
                "destination_folder": destination.parent.name,
            },
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return True
    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        logger.error(f"Move failed: {e}")

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.ERROR,
            action="file_move",
            correlation_id=correlation_id,
            details={
                "source": str(source),
                "destination": str(destination),
                "source_name": source.name,
            },
            error={"type": type(e).__name__, "message": str(e)},
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return False


def read_file_content(file_path: Path) -> str:
    """Read file content with encoding fallback and audit logging."""
    audit = get_audit_manager()
    correlation_id = str(uuid.uuid4())
    start_time = datetime.now()

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.SUCCESS,
            action="file_read",
            correlation_id=correlation_id,
            details={
                "file_path": str(file_path),
                "file_name": file_path.name,
                "content_length": len(content),
                "encoding": "utf-8",
            },
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return content
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            content = f.read()

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Audit log with encoding fallback
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.WARNING,
            action="file_read",
            correlation_id=correlation_id,
            details={
                "file_path": str(file_path),
                "file_name": file_path.name,
                "content_length": len(content),
                "encoding": "latin-1",
                "fallback_used": True,
            },
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return content
    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Audit log
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.ERROR,
            action="file_read",
            correlation_id=correlation_id,
            details={
                "file_path": str(file_path),
                "file_name": file_path.name,
            },
            error={"type": type(e).__name__, "message": str(e)},
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        raise


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
    """Process all .md files in Needs_Action folder with audit logging."""
    audit = get_audit_manager()
    correlation_id = str(uuid.uuid4())

    needs_action_dir = FOLDERS["needs_action"]

    if not needs_action_dir.exists():
        logger.warning("Needs_Action directory does not exist")
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.WARNING,
            action="scan_needs_action",
            correlation_id=correlation_id,
            details={"directory": str(needs_action_dir), "exists": False},
            source="orchestrator",
        )
        audit.log(entry)
        return 0

    md_files = sorted(
        needs_action_dir.glob("*.md"),
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )

    if not md_files:
        logger.info("📭 No .md files found in Needs_Action folder")
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.INFO,
            action="scan_needs_action",
            correlation_id=correlation_id,
            details={"directory": str(needs_action_dir), "file_count": 0},
            source="orchestrator",
        )
        audit.log(entry)
        return 0

    logger.info(f"📥 Found {len(md_files)} file(s) to process")
    processed_count = 0
    approvals_created = 0
    linkedin_posts_generated = 0

    # Audit: batch scan complete
    entry = AuditEntry(
        category=AuditCategory.ORCHESTRATOR,
        level=AuditLevel.INFO,
        action="scan_needs_action",
        correlation_id=correlation_id,
        details={
            "directory": str(needs_action_dir),
            "file_count": len(md_files),
            "files": [f.name for f in md_files],
        },
        source="orchestrator",
    )
    audit.log(entry)

    for file_path in md_files:
        start_time = datetime.now()
        file_correlation_id = str(uuid.uuid4())
        logger.info(f"{'─' * 60}")
        logger.info(f"Processing: {file_path.name}")

        # Audit: file processing started
        entry = AuditEntry(
            category=AuditCategory.ORCHESTRATOR,
            level=AuditLevel.INFO,
            action="process_file_start",
            correlation_id=file_correlation_id,
            details={"file_name": file_path.name, "file_path": str(file_path)},
            source="orchestrator",
        )
        audit.log(entry)

        try:
            # Read content
            original_content = read_file_content(file_path)
            logger.info(f"📄 Read {len(original_content)} characters")

            # Detect task type
            task_type = detect_task_type(original_content, file_path.name)
            logger.info(f"🎯 Detected task type: {task_type.title()}")

            # Audit: task type detected
            entry = AuditEntry(
                category=AuditCategory.ORCHESTRATOR,
                level=AuditLevel.INFO,
                action="task_type_detected",
                correlation_id=file_correlation_id,
                details={
                    "file_name": file_path.name,
                    "task_type": task_type,
                    "content_length": len(original_content),
                },
                source="orchestrator",
            )
            audit.log(entry)

            # ─── RALPH WIGGUM LOOP — Complex Task Auto-Detection ─────────
            # If task is complex, delegate to Ralph Wiggum for autonomous
            # multi-iteration completion before falling through to standard flow.
            if RALPH_WIGGUM_AVAILABLE and is_task_candidate_for_ralph(task_type, original_content):
                logger.info("🧸 Complex task detected — delegating to Ralph Wiggum Loop...")

                ralph_result = process_complex_task_with_ralph(
                    task_description=original_content,
                    task_file=file_path,
                    max_iterations=15,
                    metrics=metrics,
                )

                if ralph_result.get("completed"):
                    logger.success(f"✅ Ralph completed task: {file_path.name}")
                    # Move to Done with Ralph completion marker
                    destination_path = FOLDERS["done"] / file_path.name
                    if move_file(file_path, destination_path):
                        # Append Ralph completion note
                        with open(destination_path, "a", encoding="utf-8") as f:
                            f.write(f"\n\n---\n## 🧸 Ralph Wiggum Loop Completion\n")
                            f.write(f"- **Completed:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                            f.write(f"- **Iterations:** {ralph_result['iterations_run']}\n")
                            f.write(f"- **Duration:** {ralph_result['total_duration']:.1f}s\n")
                        processed_count += 1
                        duration = (datetime.now() - start_time).total_seconds()
                        metrics.record_file_processed("ralph_loop", duration)
                    continue
                else:
                    logger.warning("⚠️  Ralph did not complete task — falling back to standard processing")
                    # Fall through to standard handlers below
                    # (Ralph made progress but didn't signal completion)

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
                    metrics.record_error(f"Failed to move: {file_path.name}", "FileMoveError")
                    logger.error(f"✗ Failed to move: {file_path.name}")
                continue

            # ─── WHATSAPP TASK HANDLING ─────────────────────────────────────
            # CRITICAL: WhatsApp tasks ALWAYS create approval drafts — NEVER auto-send.
            # This prevents rate limit bans from WhatsApp.
            is_whatsapp_trigger = (
                task_type == "whatsapp" or
                "WHATSAPP" in file_path.name.upper() or
                "type: whatsapp" in original_content.lower()
            )

            if is_whatsapp_trigger:
                logger.info("💬 WhatsApp trigger detected — creating approval draft (NO auto-send)")

                # Extract WhatsApp data from frontmatter
                whatsapp_data = {}
                lines = original_content.split("\n")
                in_frontmatter = False
                body_lines = []
                in_body = False

                for line in lines:
                    if line.strip() == "---":
                        if not in_frontmatter:
                            in_frontmatter = True
                        else:
                            in_body = True
                        continue

                    if in_frontmatter:
                        if ":" in line:
                            key, value = line.split(":", 1)
                            whatsapp_data[key.strip()] = value.strip()
                    elif in_body and line.strip():
                        body_lines.append(line)

                whatsapp_data["body"] = "\n".join(body_lines).strip()
                whatsapp_data.setdefault("sender", whatsapp_data.get("from", "Unknown"))
                whatsapp_data.setdefault("priority", whatsapp_data.get("priority", "medium"))

                # Create approval file — HUMAN must review before any reply is sent
                approval_path = create_whatsapp_approval_file(
                    file_path.name, whatsapp_data
                )

                if approval_path:
                    approvals_created += 1
                    logger.success(
                        f"✅ WhatsApp approval created: {approval_path.name}"
                    )
                    logger.info(
                        "   🛡️  SAFETY: Reply will NOT be sent automatically. "
                        "Human must move file to /Approved/ first."
                    )
                    # 60-second delay to prevent rate limiting on batch processing
                    logger.info("   ⏳ Enforcing 60-second delay before next action (rate limit safety)")
                    time.sleep(60)
                else:
                    metrics.record_error()
                    logger.error("✗ Failed to create WhatsApp approval file")

                # Move trigger to Done
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

            # Audit: error occurred
            entry = AuditEntry(
                category=AuditCategory.ORCHESTRATOR,
                level=AuditLevel.ERROR,
                action="process_file_error",
                correlation_id=file_correlation_id,
                details={
                    "file_name": file_path.name,
                    "file_path": str(file_path),
                    "task_type": task_type if 'task_type' in locals() else "unknown",
                },
                error={"type": type(e).__name__, "message": str(e)},
                source="orchestrator",
            )
            audit.log(entry)

    # Update dashboard
    update_dashboard()

    # Audit: batch processing complete
    entry = AuditEntry(
        category=AuditCategory.ORCHESTRATOR,
        level=AuditLevel.SUCCESS,
        action="batch_process_complete",
        correlation_id=correlation_id,
        details={
            "total_files": len(md_files),
            "processed_count": processed_count,
            "approvals_created": approvals_created,
            "linkedin_posts_generated": linkedin_posts_generated,
        },
        source="orchestrator",
    )
    audit.log(entry)

    if linkedin_posts_generated > 0:
        logger.info(f"📱 LinkedIn posts generated: {linkedin_posts_generated}")

    return processed_count


# =============================================================================
# APPROVAL WORKFLOW WITH EMAIL MCP INTEGRATION
# =============================================================================

def extract_email_from_approval(content: str) -> Optional[Dict[str, str]]:
    """
    Extract email details from approval file content.
    
    Returns dict with to, subject, body for sending.
    """
    email_data = {
        "to": None,
        "subject": None,
        "body": None,
        "in_reply_to": None,
        "thread_id": None,
    }
    
    # Extract To email
    for line in content.split("\n"):
        if line.startswith("**To:**"):
            email_data["to"] = line.replace("**To:**", "").strip()
            break
    
    # Extract Subject
    for line in content.split("\n"):
        if line.startswith("**Subject:**"):
            email_data["subject"] = line.replace("**Subject:**", "").strip()
            break
    
    # Extract In-Reply-To and Thread-ID from metadata
    for line in content.split("\n"):
        if line.startswith("**In Reply To:**"):
            email_data["in_reply_to"] = line.replace("**In Reply To:**", "").strip()
        if line.startswith("**Thread ID:**"):
            email_data["thread_id"] = line.replace("**Thread ID:**", "").strip()
    
    # Extract body from code block
    in_code_block = False
    body_lines = []
    for line in content.split("\n"):
        if line.strip() == "```":
            if not in_code_block:
                in_code_block = True
            else:
                break
        elif in_code_block:
            body_lines.append(line)
    
    email_data["body"] = "\n".join(body_lines).strip()
    
    return email_data if email_data["to"] and email_data["body"] else None


def send_approved_email(file_path: Path, metrics: MetricsManager) -> Tuple[bool, str]:
    """
    Send email for an approved file using email_mcp with audit logging.

    Args:
        file_path: Path to approved file
        metrics: Metrics manager for tracking

    Returns:
        Tuple of (success: bool, message: str)
    """
    audit = get_audit_manager()
    correlation_id = str(uuid.uuid4())
    start_time = datetime.now()

    try:
        # Import email MCP
        from email_mcp import send_email as mcp_send_email

        content = read_file_content(file_path)
        email_data = extract_email_from_approval(content)

        if not email_data:
            entry = AuditEntry(
                category=AuditCategory.EMAIL,
                level=AuditLevel.ERROR,
                action="send_approved_email",
                correlation_id=correlation_id,
                details={"file_path": str(file_path), "file_name": file_path.name},
                error={"type": "EmailExtractionError", "message": "Could not extract email data from approval file"},
                source="orchestrator",
            )
            audit.log(entry)
            return False, "Could not extract email data from approval file"

        to = email_data["to"]
        subject = email_data["subject"] or "Email Reply"
        body = email_data["body"]

        logger.info(f"📧 Sending email via email_mcp.py:")
        logger.info(f"   To: {to}")
        logger.info(f"   Subject: {subject}")

        # Audit: email send attempt
        entry = AuditEntry(
            category=AuditCategory.EMAIL,
            level=AuditLevel.INFO,
            action="send_approved_email",
            correlation_id=correlation_id,
            details={
                "to": to,
                "subject": subject,
                "file_path": str(file_path),
                "file_name": file_path.name,
            },
            source="orchestrator",
        )
        audit.log(entry)

        # Send email using MCP
        result = mcp_send_email(
            to=to,
            subject=subject,
            body=body,
            is_html=False,
            dry_run=None  # Use DRY_RUN from environment
        )

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        if result.get("success"):
            msg = result.get("message", "Email sent successfully")
            logger.success(f"✅ {msg}")

            # Audit: success
            entry = AuditEntry(
                category=AuditCategory.EMAIL,
                level=AuditLevel.SUCCESS,
                action="send_approved_email",
                correlation_id=correlation_id,
                details={
                    "to": to,
                    "subject": subject,
                    "file_name": file_path.name,
                    "result_message": msg,
                    "message_id": result.get("message_id"),
                },
                duration_ms=round(duration_ms, 2),
                source="orchestrator",
            )
            audit.log(entry)
            return True, msg
        else:
            error_msg = result.get("message", "Unknown error")
            logger.error(f"❌ Email send failed: {error_msg}")

            # Audit: failure
            entry = AuditEntry(
                category=AuditCategory.EMAIL,
                level=AuditLevel.ERROR,
                action="send_approved_email",
                correlation_id=correlation_id,
                details={
                    "to": to,
                    "subject": subject,
                    "file_name": file_path.name,
                    "result_message": error_msg,
                },
                error={"type": "EmailSendError", "message": error_msg},
                duration_ms=round(duration_ms, 2),
                source="orchestrator",
            )
            audit.log(entry)
            return False, error_msg

    except ImportError as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        error_msg = f"email_mcp.py not found or import failed: {e}"
        logger.error(error_msg)

        # Audit: import error
        entry = AuditEntry(
            category=AuditCategory.EMAIL,
            level=AuditLevel.ERROR,
            action="send_approved_email",
            correlation_id=correlation_id,
            details={"file_path": str(file_path), "file_name": file_path.name},
            error={"type": "ImportError", "message": error_msg},
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return False, error_msg
    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        error_msg = f"Error sending email: {e}"
        logger.error(error_msg)

        # Audit: generic error
        entry = AuditEntry(
            category=AuditCategory.EMAIL,
            level=AuditLevel.ERROR,
            action="send_approved_email",
            correlation_id=correlation_id,
            details={"file_path": str(file_path), "file_name": file_path.name},
            error={"type": type(e).__name__, "message": error_msg},
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return False, error_msg


def extract_linkedin_post_content(content: str) -> Optional[Dict[str, str]]:
    """
    Extract LinkedIn post content from an approval file.

    Args:
        content: File content

    Returns:
        Dictionary with post content or None
    """
    post_data = {"content": "", "hashtags": ""}

    # Try to find the post content section
    in_post_section = False
    content_lines = []

    for line in content.split("\n"):
        if "## Proposed Post Content" in line or "## Post Content" in line:
            in_post_section = True
            continue
        elif in_post_section:
            if line.startswith("---") or line.startswith("## "):
                break
            content_lines.append(line)

    if content_lines:
        post_data["content"] = "\n".join(content_lines).strip()
    else:
        # Fallback: extract from code blocks
        in_code_block = False
        body_lines = []
        for line in content.split("\n"):
            if line.strip() == "```":
                if not in_code_block:
                    in_code_block = True
                else:
                    break
            elif in_code_block:
                body_lines.append(line)
        post_data["content"] = "\n".join(body_lines).strip()

    return post_data if post_data["content"] else None


def publish_linkedin_post(file_path: Path, metrics: MetricsManager) -> Tuple[bool, str]:
    """
    Publish LinkedIn post for an approved file using Playwright MCP with audit logging.

    Tries Playwright MCP first (saved session), falls back to LinkedIn API MCP.

    Args:
        file_path: Path to approved LinkedIn post file
        metrics: Metrics manager for tracking

    Returns:
        Tuple of (success: bool, message: str)
    """
    audit = get_audit_manager()
    correlation_id = str(uuid.uuid4())
    start_time = datetime.now()

    try:
        content = read_file_content(file_path)
        post_data = extract_linkedin_post_content(content)

        if not post_data:
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="publish_linkedin_post",
                correlation_id=correlation_id,
                details={"file_path": str(file_path), "file_name": file_path.name},
                error={"type": "ContentExtractionError", "message": "Could not extract LinkedIn post content from approval file"},
                source="orchestrator",
            )
            audit.log(entry)
            return False, "Could not extract LinkedIn post content from approval file"

        post_content = post_data["content"]

        logger.info(f"📱 Publishing LinkedIn post:")
        logger.info(f"   Content preview: {post_content[:100]}...")

        # Audit: publish attempt start
        entry = AuditEntry(
            category=AuditCategory.LINKEDIN,
            level=AuditLevel.INFO,
            action="publish_linkedin_post",
            correlation_id=correlation_id,
            details={
                "file_name": file_path.name,
                "content_length": len(post_content),
                "content_preview": post_content[:200],
            },
            source="orchestrator",
        )
        audit.log(entry)

        # Try Playwright MCP first (uses saved session)
        result = None
        used_method = ""

        try:
            logger.info("   🎭 Attempt 1: Using Playwright MCP (saved session)...")
            from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin

            result = post_to_linkedin(
                content=post_content,
                image_path=None,  # Can be extended to support images
                target="personal"
            )

            if result.get("success"):
                used_method = "Playwright MCP"
                logger.success(f"✅ Posted via Playwright MCP")
            else:
                logger.warning(f"⚠️  Playwright MCP failed: {result.get('message', 'Unknown error')}")
                result = None

        except ImportError as e:
            logger.info(f"   ⚠️  Playwright MCP not available: {e}")
            result = None
        except Exception as e:
            logger.warning(f"⚠️  Playwright MCP error: {e}")
            result = None

        # Fallback to LinkedIn API MCP
        if not result or not result.get("success"):
            try:
                logger.info("   🔌 Attempt 2: Using LinkedIn API MCP...")
                from linkedin_mcp import create_post as mcp_create_post

                result = mcp_create_post(
                    content=post_content,
                    dry_run=None  # Use DRY_RUN from environment
                )

                if result.get("success"):
                    used_method = "LinkedIn API MCP"
                    logger.success(f"✅ Posted via LinkedIn API MCP")
                else:
                    logger.error(f"❌ LinkedIn API MCP failed: {result.get('message', 'Unknown error')}")

            except ImportError as e:
                error_msg = f"linkedin_mcp.py not found or import failed: {e}"
                logger.error(error_msg)

                # Audit: import error
                entry = AuditEntry(
                    category=AuditCategory.LINKEDIN,
                    level=AuditLevel.ERROR,
                    action="publish_linkedin_post",
                    correlation_id=correlation_id,
                    details={"file_name": file_path.name, "attempted_method": "API MCP"},
                    error={"type": "ImportError", "message": error_msg},
                    source="orchestrator",
                )
                audit.log(entry)
                return False, error_msg
            except Exception as e:
                error_msg = f"Error using LinkedIn API MCP: {e}"
                logger.error(error_msg)

                # Audit: API error
                entry = AuditEntry(
                    category=AuditCategory.LINKEDIN,
                    level=AuditLevel.ERROR,
                    action="publish_linkedin_post",
                    correlation_id=correlation_id,
                    details={"file_name": file_path.name, "attempted_method": "API MCP"},
                    error={"type": type(e).__name__, "message": error_msg},
                    source="orchestrator",
                )
                audit.log(entry)
                return False, error_msg

        duration_ms = (datetime.now() - start_time).total_seconds() * 1000

        # Check final result
        if result and result.get("success"):
            msg = result.get("message", "LinkedIn post published successfully")
            post_url = result.get("post_url", "")
            logger.success(f"✅ {msg}")
            if post_url:
                logger.info(f"   Post URL: {post_url}")

            # Audit: success
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.SUCCESS,
                action="publish_linkedin_post",
                correlation_id=correlation_id,
                details={
                    "file_name": file_path.name,
                    "used_method": used_method,
                    "post_url": post_url,
                    "message": msg,
                },
                duration_ms=round(duration_ms, 2),
                source="orchestrator",
            )
            audit.log(entry)
            return True, f"{msg} (via {used_method}) - {post_url}"
        else:
            error_msg = result.get("message", "Unknown error") if result else "No result"
            logger.error(f"❌ LinkedIn post publish failed: {error_msg}")

            # Audit: failure
            entry = AuditEntry(
                category=AuditCategory.LINKEDIN,
                level=AuditLevel.ERROR,
                action="publish_linkedin_post",
                correlation_id=correlation_id,
                details={
                    "file_name": file_path.name,
                    "used_method": used_method or "none",
                },
                error={"type": "LinkedInPublishError", "message": error_msg},
                duration_ms=round(duration_ms, 2),
                source="orchestrator",
            )
            audit.log(entry)
            return False, error_msg

    except Exception as e:
        duration_ms = (datetime.now() - start_time).total_seconds() * 1000
        error_msg = f"Error publishing LinkedIn post: {e}"
        logger.error(error_msg)

        # Audit: generic error
        entry = AuditEntry(
            category=AuditCategory.LINKEDIN,
            level=AuditLevel.ERROR,
            action="publish_linkedin_post",
            correlation_id=correlation_id,
            details={"file_path": str(file_path), "file_name": file_path.name},
            error={"type": type(e).__name__, "message": error_msg},
            duration_ms=round(duration_ms, 2),
            source="orchestrator",
        )
        audit.log(entry)
        return False, error_msg


def handle_rejected_file(file_path: Path, metrics: MetricsManager) -> Tuple[bool, str]:
    """
    Handle a rejected approval file - move to Done with rejection note.
    
    Args:
        file_path: Path to rejected file
        metrics: Metrics manager
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        content = read_file_content(file_path)
        
        # Create rejection note
        rejection_note = f"""
---
## ❌ Rejection Record

- **Rejected At:** {datetime.now().isoformat()}
- **Original File:** {file_path.name}
- **Reason:** Human rejected this draft

### Archived Content

{content}

---
*This file was rejected and archived for record-keeping.*
"""
        
        # Move to Done with rejection note
        done_dir = FOLDERS["done"]
        done_dir.mkdir(parents=True, exist_ok=True)
        
        # Create rejection record in Done
        rejection_filename = f"REJECTED_{file_path.name}"
        rejection_path = done_dir / rejection_filename
        
        with open(rejection_path, "w", encoding="utf-8") as f:
            f.write(rejection_note)
        
        # Remove original from Pending_Approval
        file_path.unlink()
        
        logger.info(f"📁 Rejected file archived: {rejection_filename}")
        return True, f"Rejected file archived to {rejection_filename}"
        
    except Exception as e:
        error_msg = f"Error handling rejection: {e}"
        logger.error(error_msg)
        return False, error_msg


def handle_pending_review(file_path: Path, dashboard_notes: List[str]) -> Tuple[bool, str]:
    """
    Handle a file that remains in Pending_Approval for later review.
    
    Args:
        file_path: Path to pending file
        dashboard_notes: List to add dashboard note
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        modified_time = datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
        note = f"⏳ `{file_path.name}` - Pending review since {modified_time}"
        dashboard_notes.append(note)
        logger.info(f"⏳ File remains in Pending_Approval: {file_path.name}")
        return True, "File remains pending"
    except Exception as e:
        logger.error(f"Error noting pending file: {e}")
        return False, str(e)


def process_approval_folder(metrics: MetricsManager) -> Dict[str, int]:
    """
    Process files in approval workflow folders.

    This function monitors:
    - /Approved/ - Send emails, publish LinkedIn posts, move to Done
    - /Rejected/ - Archive with rejection note
    - /Pending_Approval/ - Track pending items

    Returns:
        Dictionary with counts: {sent: int, rejected: int, pending: int, linkedin_posts: int}
    """
    results = {
        "sent": 0,
        "rejected": 0,
        "pending": 0,
        "linkedin_posts": 0,
        "errors": 0,
    }

    dashboard_notes = []

    # Process Approved folder - send emails and publish LinkedIn posts
    approved_dir = FOLDERS["approved"]
    if approved_dir.exists():
        approved_files = list(approved_dir.glob("*.md"))

        if approved_files:
            logger.info(f"✅ Found {len(approved_files)} approved file(s) to process")

            for file_path in approved_files:
                logger.info(f"{'─' * 60}")
                logger.success(f"🎉 Processing Approved: {file_path.name}")

                # Determine file type and process accordingly
                content = read_file_content(file_path)
                
                if "type: linkedin_post_draft" in content or "type: linkedin_post" in content or "LINKEDIN_POST" in file_path.name.upper():
                    # Process as LinkedIn post
                    success, message = publish_linkedin_post(file_path, metrics)

                    if success:
                        # Move to Done after successful publish
                        done_path = FOLDERS["done"] / file_path.name
                        if move_file(file_path, done_path):
                            results["linkedin_posts"] += 1
                            metrics.record_approval_triggered()

                            # Add success note to file
                            done_content = read_file_content(done_path)
                            if "✅ LinkedIn Post Published" not in done_content:
                                success_note = f"\n\n---\n## ✅ LinkedIn Post Published\n- **Published At:** {datetime.now().isoformat()}\n- **Status:** Live on LinkedIn\n- **Message:** {message}\n"
                                with open(done_path, "a", encoding="utf-8") as f:
                                    f.write(success_note)

                            # Log success in Dashboard.md
                            update_dashboard_linkedin_success(file_path.name, message)

                            logger.success(f"✅ LinkedIn post published: {file_path.name}")
                    else:
                        results["errors"] += 1
                        logger.error(f"❌ Failed to publish LinkedIn post: {file_path.name} - {message}")

                        # Log failure in Dashboard.md
                        update_dashboard_linkedin_failure(file_path.name, message)
                elif "type: whatsapp_reply_approval" in content or "WHATSAPP_" in file_path.name.upper():
                    # ─── WHATSAPP APPROVED — NEVER AUTO-SEND ───────────────────
                    # WhatsApp replies are handled manually by the human via WhatsApp Web.
                    # The orchestrator ONLY logs the approval and moves the file to Done.
                    # This is intentional to prevent WhatsApp rate limit bans.
                    logger.success(f"💬 WhatsApp reply approved: {file_path.name}")
                    logger.info("   📋 Reply approved by human — Human will send manually via WhatsApp Web")
                    logger.info("   🛡️  Auto-send DISABLED for WhatsApp (rate limit safety)")

                    # Move to Done with approval note (no auto-send)
                    done_path = FOLDERS["done"] / file_path.name
                    if move_file(file_path, done_path):
                        results["sent"] += 1  # Count as "handled" not "sent"
                        metrics.record_approval_triggered()

                        # Add approval note
                        try:
                            done_content = read_file_content(done_path)
                            if "✅ WhatsApp Reply Approved" not in done_content:
                                success_note = (
                                    f"\n\n---\n"
                                    f"## ✅ WhatsApp Reply Approved (Manual Send)\n"
                                    f"- **Approved At:** {datetime.now().isoformat()}\n"
                                    f"- **Status:** Human will send manually via WhatsApp Web\n"
                                    f"- **Rate Limit Safety:** 60s minimum delay between sends\n"
                                    f"- **Auto-Send:** DISABLED (prevents API rate limit bans)\n"
                                )
                                with open(done_path, "a", encoding="utf-8") as f:
                                    f.write(success_note)
                        except Exception as e:
                            logger.warning(f"Could not append approval note: {e}")
                    else:
                        results["errors"] += 1
                        logger.error(f"❌ Failed to move approved WhatsApp file: {file_path.name}")
                else:
                    # Process as email
                    success, message = send_approved_email(file_path, metrics)

                    if success:
                        # Move to Done after successful send
                        done_path = FOLDERS["done"] / file_path.name
                        if move_file(file_path, done_path):
                            results["sent"] += 1
                            metrics.record_approval_triggered()

                            # Add success note to file
                            done_content = read_file_content(done_path)
                            if "✅ Email Sent" not in done_content:
                                success_note = f"\n\n---\n## ✅ Email Sent\n- **Sent At:** {datetime.now().isoformat()}\n- **Status:** Delivered successfully\n"
                                with open(done_path, "a", encoding="utf-8") as f:
                                    f.write(success_note)
                    else:
                        results["errors"] += 1
                        logger.error(f"❌ Failed to process: {file_path.name} - {message}")
        else:
            logger.info("📭 No approved files to process")
    
    # Process Rejected folder - archive with note
    rejected_dir = FOLDERS["rejected"]
    if rejected_dir.exists():
        rejected_files = list(rejected_dir.glob("*.md"))
        
        if rejected_files:
            logger.info(f"❌ Found {len(rejected_files)} rejected file(s) to archive")
            
            for file_path in rejected_files:
                logger.info(f"{'─' * 60}")
                logger.warning(f"🗑️ Archiving Rejected: {file_path.name}")
                
                success, message = handle_rejected_file(file_path, metrics)
                
                if success:
                    results["rejected"] += 1
                else:
                    results["errors"] += 1
        else:
            logger.info("📭 No rejected files to archive")
    
    # Check Pending_Approval folder - track pending items
    pending_dir = FOLDERS["pending_approval"]
    if pending_dir.exists():
        pending_files = list(pending_dir.glob("*.md"))
        
        if pending_files:
            logger.info(f"⏳ Found {len(pending_files)} pending approval(s)")
            
            for file_path in pending_files:
                handle_pending_review(file_path, dashboard_notes)
                results["pending"] += 1
        else:
            logger.info("📭 No pending approvals")
    
    # Update dashboard with pending notes
    if dashboard_notes:
        for note in dashboard_notes:
            logger.info(note)
    
    # Update dashboard
    update_dashboard()
    
    return results


# =============================================================================
# STATUS REPORTING
# =============================================================================

def generate_status_report(processed: int, approval_results: Dict[str, int],
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
  Emails Sent:         {approval_results.get('sent', 0):>6}
  Rejected:            {approval_results.get('rejected', 0):>6}
  Pending Approval:    {approval_results.get('pending', 0):>6}
  Errors:              {approval_results.get('errors', 0):>6}
  Status:              {'✓ Active' if processed > 0 or approval_results.get('sent', 0) > 0 else '○ No Activity'}

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

    # Check Approval Workflow (Approved, Rejected, Pending_Approval)
    print("\n" + "─" * 70)
    logger.info("✅ Processing approval workflow...")
    print("─" * 70)
    approval_results = process_approval_folder(metrics)
    
    # Log approval workflow results
    logger.info(f"📊 Approval Workflow Results:")
    logger.info(f"   ✅ Emails Sent: {approval_results['sent']}")
    logger.info(f"   ❌ Rejected: {approval_results['rejected']}")
    logger.info(f"   ⏳ Pending: {approval_results['pending']}")
    logger.info(f"   🐛 Errors: {approval_results['errors']}")

    # Save metrics
    metrics.save_metrics()

    # Generate report
    print("\n" + generate_status_report(processed_count, approval_results, metrics))

    logger.info("✨ Orchestrator run complete.")
    print("=" * 70 + "\n")


# =============================================================================
# ENTRY POINT
# =============================================================================

# =============================================================================
# LLM-POWERED TASK ROUTING (Claude Addition)
# =============================================================================

def process_task_with_llm_routing(task_description: str, metrics: MetricsManager) -> Dict[str, Any]:
    """
    Process tasks using LLM-based routing to appropriate skill agents.
    
    This integrates the LLM router with the existing orchestrator to enable
    intelligent task distribution across LinkedIn, WhatsApp, scheduling, etc.
    
    Args:
        task_description: Natural language description of the task
        metrics: Metrics manager for tracking
        
    Returns:
        Dictionary with task processing results
    """
    logger.info(f"🧠 Processing task with LLM routing: {task_description}")
    
    result = {
        "task": task_description,
        "task_type": None,
        "success": False,
        "message": "",
        "timestamp": datetime.now().isoformat(),
    }
    
    try:
        # Route task using pattern matching (since llm_router doesn't have route_task)
        task_type = detect_task_type(task_description, "task")
        result["task_type"] = task_type
        logger.info(f"🎯 Routed task as: {task_type}")
        
        if task_type == "linkedin":
            # Handle LinkedIn tasks using Playwright MCP or standard MCP
            logger.info("📱 Routing to LinkedIn MCP...")
            
            # Extract content from task description
            if "Post on LinkedIn: " in task_description:
                content = task_description.split("Post on LinkedIn: ")[1]
            else:
                content = task_description
            
            # Determine target (personal or company)
            target = "personal"
            if "company" in task_description.lower():
                target = "company"
            
            # Extract image path if specified
            image_path = None
            if "with image:" in task_description.lower():
                parts = task_description.lower().split("with image:")
                if len(parts) > 1:
                    image_path = parts[1].split()[0].strip()
            
            # Try Playwright MCP first (easier setup - just QR scan), fallback to API MCP
            linkedin_result = {"success": False, "message": "LinkedIn MCP not available"}
            used_method = ""

            # Attempt 1: Playwright MCP (uses saved browser session - NO API tokens needed)
            try:
                from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin
                logger.info("   🎭 Attempt 1: Using Playwright MCP (saved browser session)")

                linkedin_result = post_to_linkedin(content, image_path=image_path, target=target)

                if linkedin_result.get("success"):
                    used_method = "Playwright MCP"
                    result["success"] = True
                    result["message"] = f"LinkedIn post published via Playwright: {linkedin_result.get('message', '')}"
                    logger.success(f"✅ {result['message']}")
                    if linkedin_result.get("post_url"):
                        logger.info(f"   Post URL: {linkedin_result['post_url']}")
                else:
                    logger.warning(f"⚠️  Playwright MCP failed: {linkedin_result.get('message', 'Unknown error')}")
                    linkedin_result = None

            except ImportError:
                logger.info("   ⚠️  Playwright MCP not available")
                linkedin_result = None
            except Exception as e:
                logger.warning(f"⚠️  Playwright MCP error: {e}")
                linkedin_result = None

            # Attempt 2: LinkedIn API MCP (requires API tokens in .env)
            if not linkedin_result or not linkedin_result.get("success"):
                try:
                    from linkedin_mcp import create_post as mcp_create_post
                    logger.info("   🔌 Attempt 2: Using LinkedIn API MCP")

                    linkedin_result = mcp_create_post(
                        content=content,
                        dry_run=None
                    )

                    if linkedin_result.get("success"):
                        used_method = "LinkedIn API MCP"
                        result["success"] = True
                        result["message"] = f"LinkedIn post published via API: {linkedin_result.get('message', '')}"
                        logger.success(f"✅ {result['message']}")
                        if linkedin_result.get("post_url"):
                            logger.info(f"   Post URL: {linkedin_result['post_url']}")
                    else:
                        result["message"] = f"LinkedIn API failed: {linkedin_result.get('message', 'Unknown error')}"
                        logger.error(f"❌ {result['message']}")
                except ImportError as e:
                    result["message"] = "LinkedIn not configured - please save session using: python3 Agent_Skills/SKILL_LInkedin_Playwright_MCP.py save"
                    logger.error(f"❌ {result['message']}")
                except Exception as e:
                    result["message"] = f"LinkedIn API error: {e}"
                    logger.error(f"❌ {result['message']}")

            metrics.record_file_processed("linkedin", 0)
            
        elif task_type == "whatsapp":
            # Handle WhatsApp tasks
            logger.info("💬 Routing to WhatsApp watcher...")
            
            # Extract recipient and message
            recipient = "default_recipient"
            message = task_description
            
            if "Send WhatsApp message to" in task_description:
                # Parse recipient
                parts = task_description.split("Send WhatsApp message to")[1]
                if ":" in parts:
                    recipient = parts.split(":")[0].strip()
                    message = ":".join(parts.split(":")[1:]).strip()
            
            # WhatsApp requires manual sending - create approval file instead
            logger.info("   ⚠️  WhatsApp requires manual approval - creating approval file")
            logger.info("   📋 Please place WhatsApp tasks in Needs_Action/ folder for approval workflow")
            result["message"] = "WhatsApp task logged - use Needs_Action folder for approval workflow"
            
            metrics.record_file_processed("whatsapp", 0)
            
        elif task_type == "calendar" or task_type == "notification":
            # Handle scheduling/calendar tasks
            logger.info("📅 Calendar/Notification task detected")
            logger.info("   📋 Scheduling tasks should use Gmail/Calendar integration")
            result["message"] = "Scheduling task - use Gmail/Calendar integration"
            
            metrics.record_file_processed(task_type, 0)
            
        elif task_type == "email":
            # Handle email tasks using existing email pipeline
            logger.info("📧 Routing to email MCP...")
            result["message"] = "Email task - use Needs_Action folder for processing"
            logger.info("   Email tasks should be placed in Needs_Action/ folder")
            
        elif task_type == "document":
            # Handle document creation tasks
            logger.info("📄 Routing to document skill...")
            result["message"] = "Document task - use Plans folder for processing"
            logger.info("   Document tasks should be placed in Needs_Action/ folder")
            
        else:
            result["message"] = f"Unknown task type: {task_type}"
            logger.warning(f"⚠️  {result['message']}")
        
        return result
        
    except Exception as e:
        error_msg = f"Error processing task: {e}"
        result["message"] = error_msg
        logger.error(f"❌ {error_msg}")
        metrics.record_error()
        return result


# =============================================================================
# BATCH TASK PROCESSING
# =============================================================================

def process_batch_tasks(task_list: List[str], metrics: MetricsManager) -> Dict[str, Any]:
    """
    Process a batch of tasks using LLM routing.
    
    Args:
        task_list: List of task descriptions
        metrics: Metrics manager
        
    Returns:
        Dictionary with batch processing results
    """
    logger.info(f"📦 Processing batch of {len(task_list)} tasks...")
    
    results = {
        "total": len(task_list),
        "successful": 0,
        "failed": 0,
        "task_results": [],
    }
    
    for i, task in enumerate(task_list, 1):
        logger.info(f"{'─' * 60}")
        logger.info(f"Task {i}/{len(task_list)}: {task[:80]}...")
        
        result = process_task_with_llm_routing(task, metrics)
        results["task_results"].append(result)
        
        if result["success"]:
            results["successful"] += 1
        else:
            results["failed"] += 1
        
        # Add delay between tasks to prevent rate limiting
        if i < len(task_list):
            time.sleep(2)
    
    logger.info(f"{'─' * 60}")
    logger.info(f"📊 Batch Results: {results['successful']}/{results['total']} successful")

    return results


# =============================================================================
# RALPH WIGGUM LOOP INTEGRATION (Autonomous Task Completion)
# =============================================================================

def process_complex_task_with_ralph(
    task_description: str,
    task_file: Optional[Path] = None,
    max_iterations: int = 15,
    metrics: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Process important long-running tasks using the Ralph Wiggum Loop.

    This is the Silver Tier's autonomous "keep going until it's actually done"
    mechanism.  Use for complex tasks that may require multiple Claude iterations.

    Completion is detected when:
      1. Claude outputs "TASK_COMPLETE" sentinel
      2. The task file is moved to Done/
      3. A custom completion hook returns True

    Args:
        task_description: The task prompt/description
        task_file: Optional path to the task file for Done/ tracking
        max_iterations: Maximum loop iterations (default 15)
        metrics: Optional MetricsManager for tracking

    Returns:
        Dictionary with ralph loop results
    """
    if not RALPH_WIGGUM_AVAILABLE:
        logger.warning("⚠️  Ralph Wiggum Loop not available — falling back to single-pass processing")
        return {
            "success": False,
            "message": "Ralph Wiggum Loop not available",
            "task": task_description,
            "fallback": True,
        }

    logger.separator("🧸")
    logger.info("🧸 RALPH WIGGUM LOOP — Autonomous Task Activation")
    logger.info(f"📋 Task: {task_description[:120]}...")
    logger.info(f"📋 Max iterations: {max_iterations}")
    logger.separator("🧸")

    result = {
        "task": task_description,
        "task_file": str(task_file) if task_file else None,
        "max_iterations": max_iterations,
        "success": False,
        "completed": False,
        "iterations_run": 0,
        "total_duration": 0,
        "timestamp": datetime.now().isoformat(),
    }

    try:
        # Build an enriched system prompt for the Digital Employee context
        system_prompt = (
            "You are the Digital Employee — an autonomous AI agent working for a SaaS company. "
            "You are thorough, professional, and detail-oriented. "
            "Complete the given task with the highest quality possible. "
            "When you are certain the task is fully complete, output TASK_COMPLETE on its own line."
        )

        # Run the Ralph Wiggum Loop
        ralph_result = ralph_process_task(
            prompt=task_description,
            task_file=task_file,
            max_iterations=max_iterations,
            system_prompt=system_prompt,
        )

        result["completed"] = ralph_result.get("completed", False)
        result["success"] = ralph_result.get("completed", False) and ralph_result.get("all_succeeded", False)
        result["iterations_run"] = ralph_result.get("iterations_run", 0)
        result["total_duration"] = ralph_result.get("total_duration", 0)
        result["ralph_summary"] = ralph_result

        if result["completed"]:
            logger.success(f"✅ Ralph Wiggum Loop completed task in {result['iterations_run']} iterations")
            if metrics:
                metrics.record_task_completed("ralph_loop", result["total_duration"])
        else:
            logger.warning(
                f"⚠️  Ralph Wiggum Loop exhausted after {result['iterations_run']} iterations "
                f"without completion signal"
            )
            if metrics:
                metrics.record_error()

    except Exception as e:
        logger.error(f"❌ Ralph Wiggum Loop failed: {e}")
        result["error"] = str(e)
        if metrics:
            metrics.record_error()

    return result


def is_task_candidate_for_ralph(task_type: str, content: str) -> bool:
    """
    Determine if a task should be processed by Ralph Wiggum Loop.

    Ralph is used for complex, multi-step tasks that benefit from
    autonomous iterative refinement.

    Args:
        task_type: Detected task type (linkedin, email, whatsapp, etc.)
        content: Task content

    Returns:
        True if task should go through Ralph Wiggum Loop
    """
    # Keywords that signal complex, multi-step work
    complex_indicators = [
        "build", "create", "implement", "develop", "design",
        "research", "analysis", "comprehensive", "detailed",
        "multi-step", "full-stack", "complete system", "end-to-end",
        "refactor", "migrate", "debug", "fix all", "optimize",
        "write a", "generate a", "full report", "deep dive",
    ]

    content_lower = content.lower()

    # Count complexity indicators
    complexity_score = sum(1 for word in complex_indicators if word in content_lower)

    # Ralph activates if:
    # 1. Multiple complexity indicators found (score >= 2)
    # 2. Task is explicitly marked as complex
    # 3. Content is long enough (>500 chars) suggesting non-trivial work
    if complexity_score >= 2:
        return True

    if complexity_score >= 1 and len(content_lower) > 500:
        return True

    # Check for explicit Ralph trigger
    if "use ralph" in content_lower or "ralph wiggum" in content_lower or "autonomous" in content_lower:
        return True

    return False


# =============================================================================
# MAIN ORCHESTRATOR (Updated with LLM Routing)
# =============================================================================

def main(run_mode: str = "once") -> None:
    """
    Main orchestrator entry point.

    Supports three modes:
    1. 'once' - Single run (process Needs_Action + approval workflow)
    2. 'scheduled' - Continuous monitoring (not fully implemented, use cron)
    3. 'tasks' - Process specific tasks from command line

    Args:
        run_mode: Execution mode
    """
    print("\n" + "=" * 70)
    print("  SILVER TIER ORCHESTRATOR v4.0 - Human-in-the-Loop")
    print("=" * 70 + "\n")

    logger.info("🚀 Orchestrator starting...")

    # Initialize Gold Tier Audit Manager
    audit = get_audit_manager()
    recovery = get_recovery_manager()

    # Initialize
    load_environment()
    ensure_directories()

    # Initialize managers with audit integration
    metrics = MetricsManager(METRICS_FILE, audit_manager=audit)
    
    # Handle task mode (new)
    if run_mode == "tasks" and len(sys.argv) > 2:
        # Process specific tasks from command line
        tasks = sys.argv[2:]
        logger.info(f"📦 Task mode: Processing {len(tasks)} task(s)")
        
        batch_results = process_batch_tasks(tasks, metrics)
        
        print("\n" + "=" * 70)
        print("  TASK PROCESSING RESULTS")
        print("=" * 70)
        print(f"\n  Total: {batch_results['total']}")
        print(f"  Successful: {batch_results['successful']}")
        print(f"  Failed: {batch_results['failed']}")
        print("\n" + "=" * 70 + "\n")
        
        metrics.save_metrics()
        return
    
    # Handle scheduled mode
    if run_mode == "scheduled":
        interval = int(os.getenv("ORCHESTRATOR_INTERVAL", "30"))
        logger.info(f"⏰ Scheduled mode not fully implemented. Use cron instead.")
        logger.info("   Recommended: python setup_cron.py")
    
    # Process Needs_Action
    print("\n" + "─" * 70)
    logger.info("📥 Scanning Needs_Action folder...")
    print("─" * 70)
    processed_count = process_needs_action_files(metrics)
    
    if processed_count == 0:
        logger.info("📭 Nothing to process in Needs_Action folder.")
    
    # Check Approval Workflow (Approved, Rejected, Pending_Approval)
    print("\n" + "─" * 70)
    logger.info("✅ Processing approval workflow...")
    print("─" * 70)
    approval_results = process_approval_folder(metrics)
    
    # Log approval workflow results
    logger.info(f"📊 Approval Workflow Results:")
    logger.info(f"   ✅ Emails Sent: {approval_results['sent']}")
    logger.info(f"   ❌ Rejected: {approval_results['rejected']}")
    logger.info(f"   ⏳ Pending: {approval_results['pending']}")
    logger.info(f"   🐛 Errors: {approval_results['errors']}")
    
    # Save metrics
    metrics.save_metrics()
    
    # Generate report
    print("\n" + generate_status_report(processed_count, approval_results, metrics))
    
    logger.info("✨ Orchestrator run complete.")
    print("=" * 70 + "\n")


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    run_mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    main(run_mode)