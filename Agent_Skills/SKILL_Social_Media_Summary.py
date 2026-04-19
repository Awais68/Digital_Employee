#!/usr/bin/env python3
"""
SKILL_Social_Media_Summary.py - Generate cross-platform social media summaries
==========================================================================

Gold Tier v1.0 - Unified Social Media Intelligence

Features:
- Fetches recent posts and insights from Facebook MCP (via Graph API)
- Fetches recent posts and insights from Instagram MCP (via Graph API)
- Aggregates metrics and generates an AI-driven summary
- Saves report to Metrics/

Author: Digital Employee System
"""

import os
import sys
import json
import logging
from datetime import datetime
from pathlib import Path
import requests

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

try:
    from llm_router import completion, LITELLM_AVAILABLE
except ImportError:
    LITELLM_AVAILABLE = False

# Configuration
CONFIG_DIR = BASE_DIR / "config"
METRICS_DIR = BASE_DIR / "Metrics"
LOGS_DIR = BASE_DIR / "Logs"

# Ensure directories exist
METRICS_DIR.mkdir(parents=True, exist_ok=True)

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "social_summary.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("social_summary")

def load_config(file_path):
    """Load JSON configuration."""
    if not file_path.exists():
        return None
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config {file_path}: {e}")
        return None

def fetch_facebook_data(config):
    """Fetch recent posts and insights from Facebook."""
    if not config:
        return {"error": "Facebook config missing"}
    
    token = config.get("page_access_token")
    page_id = config.get("page_id")
    if not token or not page_id:
        return {"error": "Facebook tokens missing"}

    base_url = f"https://graph.facebook.com/v18.0/{page_id}"
    
    try:
        # Get posts
        posts_url = f"{base_url}/posts?fields=id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)&access_token={token}&limit=5"
        posts_resp = requests.get(posts_url)
        posts_data = posts_resp.json()
        
        # Get insights (last 7 days impressions)
        insights_url = f"{base_url}/insights?metric=page_impressions&period=week&access_token={token}"
        insights_resp = requests.get(insights_url)
        insights_data = insights_resp.json()
        
        return {
            "posts": posts_data.get("data", []),
            "insights": insights_data.get("data", [])
        }
    except Exception as e:
        logger.error(f"Facebook API error: {e}")
        return {"error": str(e)}

def fetch_instagram_data(config):
    """Fetch recent posts and insights from Instagram."""
    if not config:
        return {"error": "Instagram config missing"}
    
    token = config.get("page_access_token")
    ig_user_id = config.get("instagram_business_account_id")
    if not token or not ig_user_id:
        return {"error": "Instagram tokens missing"}

    base_url = f"https://graph.facebook.com/v18.0/{ig_user_id}"
    
    try:
        # Get posts
        media_url = f"{base_url}/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&access_token={token}&limit=5"
        media_resp = requests.get(media_url)
        media_data = media_resp.json()
        
        # Get insights
        insights_url = f"{base_url}/insights?metric=impressions,reach&period=day&access_token={token}"
        insights_resp = requests.get(insights_url)
        insights_data = insights_resp.json()
        
        return {
            "posts": media_data.get("data", []),
            "insights": insights_data.get("data", [])
        }
    except Exception as e:
        logger.error(f"Instagram API error: {e}")
        return {"error": str(e)}

def get_ai_summary(data_summary):
    """Use LLM to generate a strategic summary."""
    if not LITELLM_AVAILABLE:
        return "AI Summary unavailable (LiteLLM not installed)."

    prompt = f"""
Analyze the following social media performance data and provide a concise, professional summary for the CEO.
Include:
1. Overall performance trend
2. Key highlight or win
3. One specific area for improvement
4. A recommendation for next week's content

DATA:
{json.dumps(data_summary, indent=2)}

Format: Markdown with sections.
"""

    try:
        response = completion(
            model="claude-3-sonnet-20240229",
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"LLM Error: {e}")
        return f"Failed to generate AI summary: {e}"

def main():
    logger.info("Starting Social Media Summary generation...")
    
    # Load configs
    fb_config = load_config(CONFIG_DIR / "facebook_tokens.json")
    ig_config = load_config(CONFIG_DIR / "instagram_config.json")
    
    # Fetch data
    fb_data = fetch_facebook_data(fb_config)
    ig_data = fetch_instagram_data(ig_config)
    
    # Aggregate Metrics
    summary_data = {
        "timestamp": datetime.now().isoformat(),
        "platforms": {
            "facebook": fb_data,
            "instagram": ig_data
        }
    }
    
    # Generate AI Report
    ai_analysis = get_ai_summary(summary_data)
    
    # Create Final Report
    report_md = f"""# 📈 Social Media Performance Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

## 🤖 AI Strategic Summary
{ai_analysis}

---

## 📘 Facebook Details
- **Recent Posts:** {len(fb_data.get('posts', []))}
- **Status:** {'✅ Operational' if 'error' not in fb_data else '❌ ' + fb_data['error']}

## 📸 Instagram Details
- **Recent Posts:** {len(ig_data.get('posts', []))}
- **Status:** {'✅ Operational' if 'error' not in ig_data else '❌ ' + ig_data['error']}

---
*Generated by SKILL_Social_Media_Summary v1.0*
"""

    # Save Report
    report_file = METRICS_DIR / f"social_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    with open(report_file, 'w') as f:
        f.write(report_md)
    
    logger.info(f"Report generated successfully: {report_file}")
    print(report_md)

if __name__ == "__main__":
    main()
