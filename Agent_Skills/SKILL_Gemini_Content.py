#!/usr/bin/env python3
"""
SKILL_Gemini_Content.py - Research-Grounded Unified Social Media Content Generator

PHASE 1: One master post per topic — a single source of truth for the core message,
key points, and tone. Each platform variant is derived from that master post by
reformatting (length, tone, hashtag density), not by re-generating independently.

PHASE 2: Research-grounded generation. The agent searches the topic before writing,
extracts 2-4 concrete points from real results, and bans generic filler patterns.

Usage:
    from Agent_Skills.SKILL_Gemini_Content import generate_master_content, adapt_master_to_platform, generate_complete_post

    master = generate_master_content(topic)
    linkedin_post = adapt_master_to_platform(master, 'linkedin')
    instagram_post = adapt_master_to_platform(master, 'instagram')
"""

import os
import json
import re
import requests
import urllib.parse
from pathlib import Path
import google.generativeai as genai

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
UNSPLASH_KEY = os.getenv('UNSPLASH_API_KEY', '')

RULES_FILE = Path(__file__).resolve().parent.parent / "config" / "social_media_rules.json"

# ── BANNED GENERIC FILLER PATTERNS (Phase 2) ──────────────────────────────
BANNED_PATTERNS = [
    r'\d+%\s+of\s+(enterprises|companies|businesses|organizations|consumers)',
    r'\$\d+(\.\d+)?\s*(trillion|billion|million)\s+(market|opportunity|industry)',
    r'Here\'?s what happened this week that blew my mind',
    r'Drop your thoughts below',
    r'Let\'?s have a real conversation',
    r'the numbers speak for themselves',
    r'here\'?s what most people miss',
    r"I've been saying this for years",
    r'nobody is talking about this',
    r'The most interesting part of working with \w+ has been',
    r'One pattern that keeps coming up',
]

# ── GENERIC HOOK SENTENCE BAN ─────────────────────────────────────────────
GENERIC_HOOKS = [
    "here's what happened this week that blew my mind",
    "let's talk about",
    "in today's fast-paced world",
    "the intersection of",
    "here's why",
    "unpopular opinion",
    "hot take",
]

# ── PLATFORM ADAPTATION RULES ─────────────────────────────────────────────
PLATFORM_RULES = {
    'linkedin': {
        'min_words': 80, 'max_words': 300,
        'min_hashtags': 3, 'max_hashtags': 5,
        'tone': 'professional, insightful, specific',
    },
    'facebook': {
        'min_words': 50, 'max_words': 250,
        'min_hashtags': 2, 'max_hashtags': 5,
        'tone': 'friendly, conversational, relatable',
    },
    'instagram': {
        'min_words': 30, 'max_words': 150,
        'min_hashtags': 10, 'max_hashtags': 15,
        'tone': 'casual, inspiring, authentic',
    },
    'twitter': {
        'min_words': 10, 'max_words': 50,
        'min_hashtags': 1, 'max_hashtags': 3,
        'tone': 'punchy, concise, specific',
    },
}


def load_rules():
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}


def get_platform_rules(platform):
    rules = load_rules()
    return rules.get("platforms", {}).get(platform, {}).get("rules", {})


def contains_banned_patterns(text):
    for pattern in BANNED_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    for hook in GENERIC_HOOKS:
        if hook in text.lower():
            return True
    return False


# ── REAL WEB RESEARCH (Phase 2) ───────────────────────────────────────────
def web_search(query, max_results=5):
    results = []

    # Wikipedia API
    try:
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&format=json&srlimit={max_results + 3}"
        resp = requests.get(wiki_url, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            for r in (data.get('query', {}).get('search', [])[:max_results]):
                results.append({
                    'title': r['title'],
                    'url': f"https://en.wikipedia.org/wiki/{urllib.parse.quote(r['title'])}",
                    'snippet': re.sub(r'<\/?[^>]+>', '', r.get('snippet', '')),
                })
    except Exception as e:
        print(f"[WebSearch] Wikipedia failed: {e}")

    # DuckDuckGo Instant Answer API
    if len(results) < max_results:
        try:
            ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
            resp = requests.get(ddg_url, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                if data.get('AbstractText'):
                    results.append({
                        'title': data.get('Heading', query),
                        'url': data.get('AbstractURL', ''),
                        'snippet': data['AbstractText'],
                    })
                for rt in (data.get('RelatedTopics') or []):
                    if len(results) >= max_results:
                        break
                    if isinstance(rt, dict) and rt.get('Text'):
                        title = rt['Text'].split(' - ')[0] if ' - ' in rt['Text'] else query
                        results.append({
                            'title': title,
                            'url': rt.get('FirstURL', ''),
                            'snippet': rt['Text'][:300],
                        })
        except Exception as e:
            print(f"[WebSearch] DuckDuckGo failed: {e}")

    return results[:max_results]


def format_web_results(results):
    if not results:
        return "No web results available."
    lines = []
    for i, r in enumerate(results):
        lines.append(f"{i+1}. {r['title']}")
        lines.append(f"   {r['snippet'][:200]}")
        if r['url']:
            lines.append(f"   Source: {r['url']}")
        lines.append("")
    return "\n".join(lines)


# ── PHASE 1: MASTER POST GENERATION (one source of truth) ─────────────────
def generate_master_content(topic):
    """
    Research the topic via web search, then generate ONE platform-neutral
    master post — the single source of truth for all platform variants.

    Returns dict with master content, research data, and sources.
    """
    print(f"[MasterGen] Researching topic: \"{topic}\"")
    search_results = web_search(topic)
    web_data = format_web_results(search_results)
    print(f"[MasterGen] Sources found: {len(search_results)}")

    model = genai.GenerativeModel('gemini-pro')

    research_prompt = f"""You are a MARKETING research analyst. Below are real web search results for the topic "{topic}".

WEB SEARCH RESULTS:
{web_data}

Based on these web results AND your knowledge, produce a structured research brief.
Focus on hard-hitting, specific insights — not generic statements.
Include actual numbers, statistics, company names, and real examples when available.

Return ONLY valid JSON — no markdown, no code fences:
{{
  "key_facts": ["4-5 specific, factual, engaging facts about the topic"],
  "trending_angle": "The most compelling, shareable angle for this topic right now",
  "target_audience": "Exactly who should read this (job titles, industries, interests)",
  "best_hashtags": ["#5-7", "#relevant", "#trending", "#specific", "#tags"],
  "hook_ideas": ["2-3 opening hooks that grab attention immediately"],
  "pain_points": ["2-3 real problems this audience faces that this post addresses"],
  "social_proof": ["statistics, quotes, or examples that add credibility"]
}}"""

    research_raw = model.generate_content(research_prompt).text.strip()
    try:
        research = json.loads(re.sub(r'```json|```', '', research_raw).strip())
    except json.JSONDecodeError:
        research = {
            "key_facts": [f"Real, specific developments in {topic}"],
            "trending_angle": f"A concrete recent development in {topic}",
            "target_audience": "Builders and technical decision-makers",
            "best_hashtags": [f"#{topic.replace(' ', '')}"],
            "hook_ideas": [f"A specific observation about {topic}"],
            "pain_points": [f"Practical challenge teams face with {topic}"],
            "social_proof": ["Verified source citation needed"],
        }

    hashtag_pool = ' '.join(research.get('best_hashtags', [])[:7]) or f"#{topic.replace(' ', '')}"
    core_prompt = f"""Write ONE final, ready-to-publish social media caption about "{topic}".
This SINGLE caption will be posted VERBATIM to LinkedIn, Facebook, and Instagram — the
exact same text on all three platforms. Do NOT write platform variations. Write one caption
that reads naturally on every platform.

TOPIC: {topic}
TRENDING ANGLE: {research.get('trending_angle', '')}
KEY FACTS: {' | '.join(research.get('key_facts', [])[:4])}
HOOK IDEAS: {' | '.join(research.get('hook_ideas', [])[:3])}
PAIN POINTS: {' | '.join(research.get('pain_points', [])[:3])}
SUGGESTED HASHTAGS: {hashtag_pool}

WEB RESEARCH DATA:
{web_data[:1000]}

EXACT STRUCTURE (follow precisely):
1. HOOK LINE — one sentence specific to "{topic}". No generic openers.
2. Blank line.
3. 2-3 KEY POINTS — each on its own line, each specific and concrete, drawn from the research above.
4. Blank line.
5. CLOSING QUESTION / CTA — one line ending in a question.
6. Blank line.
7. HASHTAGS — 5-7 hashtags on the final line, tied to "{topic}".

Emojis are optional. If used, keep professional and engaging — never spammy.

CONTENT RULES:
- Sound like a real practitioner, first person, no corporate-guru fluff.
- Do NOT @-mention or tag any person, company, or handle.
- Every point must trace to something concrete from the research. No vague reflections.
- At most ONE concrete data point, and only if it appears in the research (never invented).
- BANNED (violation will cause rejection):
  • Unsourced statistics ("78% of enterprises...", "$2.3 trillion market...")
  • Generic hook openers ("Here's what happened this week that blew my mind", "Let's talk about...")
  • Engagement-bait CTAs ("Drop your thoughts below", "Let's have a real conversation")
  • Vague filler ("the numbers speak for themselves", "here's what most people miss")
  • Corporate-guru framing ("I've been saying this for years", "nobody is talking about this")

Return ONLY the final caption text, formatted exactly as structured above."""

    core = model.generate_content(core_prompt).text.strip()

    if contains_banned_patterns(core):
        print("[MasterGen] Banned patterns detected — regenerating once.")
        core = model.generate_content(core_prompt + "\n\nCRITICAL: previous draft was rejected for generic/banned patterns. Rewrite from scratch, be specific and real.").text.strip()

    return {
        'topic': topic,
        'core': core,
        'research': research,
        'sources': search_results,
        'web_data': web_data,
    }


# ── PHASE 1: SINGLE UNIFIED CAPTION (same text on every platform) ─────────
def adapt_master_to_platform(master, platform='linkedin'):
    """
    Return the ONE master caption unchanged for the requested platform.

    We intentionally do NOT re-generate or reshape per platform anymore. The
    master caption produced by generate_master_content() is already the final,
    ready-to-publish text (hook + key points + CTA + hashtags), and the SAME
    caption is posted verbatim to LinkedIn, Facebook, and Instagram. This keeps
    one consistent message everywhere and avoids three divergent generations.
    """
    core = master['core']
    research = master['research']

    # Hashtags are already embedded in the caption; surface them for callers
    # that track them separately, falling back to the research pool.
    in_content_tags = re.findall(r'#[\w]+', core)
    hashtags = list(dict.fromkeys(in_content_tags)) if in_content_tags else research.get('best_hashtags', [])[:7]

    return {
        'platform': platform,
        'content': core,
        'hashtags': hashtags,
    }


# ── BACKWARD-COMPATIBLE WRAPPER ───────────────────────────────────────────
def generate_post_content(topic, platform='linkedin'):
    """
    Backward-compatible wrapper. Generates one master post, then adapts to
    the requested platform. Never generates independently per platform.
    """
    master = generate_master_content(topic)
    adapted = adapt_master_to_platform(master, platform)
    return adapted['content']


# ── TOPIC GENERATION (now research-enhanced) ──────────────────────────────
def generate_topic_options(industry='AI & Technology', count=5):
    """Generate topic options with engagement potential, grounded in web research."""
    trending_topics = []
    try:
        search = web_search(f"trending topics in {industry} 2026", max_results=5)
        for r in search:
            trending_topics.append(r['title'])
    except Exception:
        pass

    model = genai.GenerativeModel('gemini-pro')
    research_context = ""
    if trending_topics:
        research_context = f"\nRecent trending topics found: {', '.join(trending_topics[:3])}\n"

    prompt = f'''Generate {count} engaging {industry} post topics that are:
- Trending and highly relevant in 2026
- Professional but engaging
- Suitable for Pakistani tech audience
- Have high engagement potential
- Can be paired with professional images
{research_context}
Return as JSON array:
[{{"topic": "...", "angle": "...", "hook": "...", "image_concept": "..."}}]
'''
    response = model.generate_content(prompt)
    try:
        return json.loads(response.text)
    except Exception:
        return [{"topic": topic, "angle": "Professional insight", "hook": "Key takeaway", "image_concept": "Modern tech visual"} for topic in [industry] if isinstance(industry, str)]


# ── POST VALIDATION (Phase 2 compliance) ──────────────────────────────────
def validate_post(content, platform):
    """
    Strictly validate post content against rules including banned pattern check.
    Returns (is_valid, list_of_errors)
    """
    rules = get_platform_rules(platform)
    content_rules = load_rules().get("content_validation", {})
    errors = []

    if not content or len(content.strip()) == 0:
        return False, ["Content is empty"]

    words = content.split()
    min_words = rules.get('min_words', 50)
    max_words = rules.get('max_words', 300)
    if len(words) < min_words:
        errors.append(f"Too few words: {len(words)} (min: {min_words})")
    if len(words) > max_words:
        errors.append(f"Too many words: {len(words)} (max: {max_words})")

    hashtags = re.findall(r'#\w+', content)
    min_hashtags = rules.get('min_hashtags', 3)
    max_hashtags = rules.get('max_hashtags', 5)
    if len(hashtags) < min_hashtags:
        errors.append(f"Too few hashtags: {len(hashtags)} (min: {min_hashtags})")
    if len(hashtags) > max_hashtags:
        errors.append(f"Too many hashtags: {len(hashtags)} (max: {max_hashtags})")


    # Banned patterns check (Phase 2)
    if contains_banned_patterns(content):
        errors.append("Banned generic filler pattern detected")

    # Forbidden words
    forbidden = rules.get('forbidden_words', [])
    content_lower = content.lower()
    for word in forbidden:
        if word.lower() in content_lower:
            errors.append(f"Forbidden word found: '{word}'")

    # Spam detection
    spam_keywords = content_rules.get('spam_keywords', [])
    for spam in spam_keywords:
        if spam.lower() in content_lower:
            errors.append(f"Spam keyword detected: '{spam}'")

    if rules.get('require_line_breaks', True):
        if '\n' not in content:
            errors.append("No line breaks found (required)")

    is_valid = len(errors) == 0
    return is_valid, errors


def generate_post_image(topic, style='professional'):
    try:
        from canva_image_generator import ensure_image_exists
        image_path, status = ensure_image_exists(topic, style=style)
        if image_path:
            return image_path
    except ImportError:
        print("[CANVA] Canva module not available, using fallback")

    if UNSPLASH_KEY:
        try:
            query = '+'.join(topic.split()[:3])
            url = f"https://api.unsplash.com/photos/random?query={query}&client_id={UNSPLASH_KEY}"
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                img_url = response.json()['urls']['regular']
                img_data = requests.get(img_url).content
                image_path = Path('generated_images') / f"{topic[:20].replace(' ', '_')}.jpg"
                image_path.parent.mkdir(exist_ok=True)
                image_path.write_bytes(img_data)
                return str(image_path)
        except Exception as e:
            print(f"[UNSPLASH] Error: {e}")

    print(f"[ERROR] No image generated for: {topic}")
    return None


def generate_complete_post(topic, platform='linkedin'):
    """
    Generate COMPLETE post using the unified flow:
    1. One master post from research
    2. Adapt to platform
    3. Validate
    """
    try:
        master = generate_master_content(topic)
        adapted = adapt_master_to_platform(master, platform)
        content = adapted['content']
    except Exception as e:
        return {
            "success": False,
            "error": f"Content generation failed: {e}",
        }

    is_valid, errors = validate_post(content, platform)
    if not is_valid:
        return {
            "success": False,
            "error": "Content validation failed",
            "errors": errors,
            "content": content,
        }

    image_path = generate_post_image(topic)
    if not image_path:
        return {
            "success": False,
            "error": "Image generation failed - POST BLOCKED",
            "content": content,
            "image_required": True,
        }

    return {
        "success": True,
        "content": content,
        "image": image_path,
        "platform": platform,
        "topic": topic,
        "validation": "passed",
        "hashtags": adapted['hashtags'],
        "sources": master.get('sources', []),
    }


def generate_unified_posts(topic, platforms=None):
    """
    Generate ONE master post, then adapt to MULTIPLE platforms.
    Returns dict with master + per-platform adaptations.
    """
    if platforms is None:
        platforms = ['linkedin', 'facebook', 'instagram']

    master = generate_master_content(topic)
    adaptations = {}

    for platform in platforms:
        adapted = adapt_master_to_platform(master, platform)
        adaptations[platform] = adapted

    return {
        'topic': topic,
        'core': master['core'],
        'research': master['research'],
        'sources': master['sources'],
        'posts': adaptations,
    }


if __name__ == "__main__":
    test_topic = "AI in Healthcare: Transforming Patient Care"

    print(f"Testing research-grounded unified post generation...")
    print(f"Topic: {test_topic}")

    master = generate_master_content(test_topic)
    print(f"\n[MASTER POST]\n{master['core']}\n")
    print(f"Research facts: {len(master['research'].get('key_facts', []))}")

    for platform in ['linkedin', 'facebook', 'instagram']:
        adapted = adapt_master_to_platform(master, platform)
        is_valid, errors = validate_post(adapted['content'], platform)
        status = "PASS" if is_valid else f"FAIL ({'; '.join(errors[:3])})"
        print(f"\n[{platform.upper()} — {status}]\n{adapted['content'][:200]}...\n")
