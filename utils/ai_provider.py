#!/usr/bin/env python3
"""
AI Provider Auto-Detector
Checks available keys/tools and selects the best provider.
Never breaks existing Claude Code setup.
"""

import os, subprocess, sys
from pathlib import Path

def detect_provider() -> str:
    """
    Returns: 'claude_code' | 'anthropic' | 'openai' | 'gemini' | 'none'
    Priority: claude_code > anthropic > openai > gemini
    """
    setting = os.getenv('AI_PROVIDER', 'auto').lower()
    if setting != 'auto':
        return setting

    # 1. Check if claude CLI is available AND we are running inside it
    try:
        result = subprocess.run(
            ['claude', '--version'],
            capture_output=True, timeout=3
        )
        if result.returncode == 0:
            # Also check hooks exist
            hooks_exist = (
                Path('.claude/hooks/stop.py').exists() and
                Path('.claude/settings.json').exists()
            )
            if hooks_exist:
                return 'claude_code'
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 2. Anthropic API key
    if os.getenv('ANTHROPIC_API_KEY', '').startswith('sk-ant-'):
        return 'anthropic'

    # 3. OpenAI API key
    if os.getenv('OPENAI_API_KEY', '').startswith('sk-'):
        return 'openai'

    # 4. Gemini API key
    if os.getenv('GEMINI_API_KEY', ''):
        return 'gemini'

    return 'none'


def call_ai(system_prompt: str, user_prompt: str,
            max_tokens: int = 2000, provider: str = None) -> str:
    """
    Universal AI call — works with any provider.
    Uses whichever key is available.
    """
    if provider is None:
        provider = detect_provider()

    if provider == 'claude_code':
        provider = 'anthropic'

    if provider == 'anthropic':
        try:
            import anthropic
            client = anthropic.Anthropic(
                api_key=os.getenv('ANTHROPIC_API_KEY')
            )
            resp = client.messages.create(
                model='claude-sonnet-4-5',
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{'role': 'user', 'content': user_prompt}]
            )
            return resp.content[0].text
        except ImportError:
            raise RuntimeError("anthropic package not installed: pip install anthropic")

    elif provider == 'openai':
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            resp = client.chat.completions.create(
                model='gpt-4o',
                max_tokens=max_tokens,
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user',   'content': user_prompt}
                ]
            )
            return resp.choices[0].message.content
        except ImportError:
            raise RuntimeError("openai package not installed: pip install openai")

    elif provider == 'gemini':
        try:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
            model = genai.GenerativeModel('gemini-2.0-flash')
            resp  = model.generate_content(
                f"SYSTEM: {system_prompt}\n\nUSER: {user_prompt}"
            )
            return resp.text
        except ImportError:
            raise RuntimeError(
                "google-generativeai not installed: "
                "pip install google-generativeai"
            )

    else:
        raise RuntimeError(
            "No AI provider available.\n"
            "Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY in .env"
        )


def get_provider_info() -> dict:
    """Status info for dashboard and health checks."""
    provider = detect_provider()
    return {
        'active_provider':   provider,
        'claude_code_available': Path('.claude/hooks/stop.py').exists(),
        'anthropic_key_set': bool(os.getenv('ANTHROPIC_API_KEY', '').startswith('sk-ant-')),
        'openai_key_set':    bool(os.getenv('OPENAI_API_KEY', '').startswith('sk-')),
        'gemini_key_set':    bool(os.getenv('GEMINI_API_KEY', '')),
        'mcp_configured':    Path('.mcp.json').exists(),
        'hooks_configured':  Path('.claude/settings.json').exists(),
    }
