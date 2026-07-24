"""
provider_config.py
Auto-detects which AI provider to use.
Priority: Claude Code CLI > Anthropic API > OpenAI > Gemini > OpenRouter
"""
import os, shutil

# Auto-load .env (base + environment overlay via env_loader)
try:
    import env_loader  # noqa: F401 — loads .env + .env.development/.env.production
except ImportError:
    for _env_candidate in ['.env', '../.env']:
        if os.path.exists(_env_candidate):
            try:
                from dotenv import load_dotenv
                load_dotenv(_env_candidate)
                break
            except ImportError:
                pass

def detect_provider():
    """
    Returns: ('claude_code', None) | ('anthropic', key) | 
             ('openai', key) | ('gemini', key) | (None, None)
    """
    # 1. Claude Code CLI available AND Anthropic key set?
    claude_cli = shutil.which('claude')
    anthropic_key = os.getenv('ANTHROPIC_API_KEY', '')
    if claude_cli and anthropic_key and anthropic_key.startswith('sk-ant-'):
        return ('claude_code', anthropic_key)
    
    # 2. Anthropic API key (no CLI — API-only mode)
    if anthropic_key and anthropic_key.startswith('sk-ant-'):
        return ('anthropic', anthropic_key)
    
    # 3. OpenAI key (also handles OpenRouter sk-or-v1- format)
    openai_key = os.getenv('OPENAI_API_KEY', '')
    if openai_key and openai_key.startswith('sk-'):
        # Check if it's OpenRouter (uses their API base)
        if openai_key.startswith('sk-or-v1-'):
            os.environ.setdefault('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1')
        return ('openai', openai_key)
    
    # 4. Gemini key
    gemini_key = os.getenv('GEMINI_API_KEY', '')
    if gemini_key:
        return ('gemini', gemini_key)
    
    return (None, None)

def get_model_name(provider):
    models = {
        'claude_code': 'claude-sonnet-4-5',
        'anthropic':   'claude-sonnet-4-5',
        'openai':      os.getenv('OPENAI_MODEL', 'gpt-4o'),
        'gemini':      os.getenv('GEMINI_MODEL', 'gemini-2.0-flash'),
    }
    return models.get(provider, 'unknown')

def call_ai(system_prompt, user_prompt, max_tokens=2000):
    """Universal AI caller — uses whichever provider is available."""
    provider, key = detect_provider()
    
    if provider in ('claude_code', 'anthropic'):
        import anthropic
        client = anthropic.Anthropic(api_key=key)
        resp = client.messages.create(
            model=get_model_name(provider),
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        return resp.content[0].text, provider

    elif provider == 'openai':
        from openai import OpenAI
        base_url = os.getenv('OPENAI_BASE_URL') or os.getenv('LITELLM_API_BASE')
        client_kwargs = {"api_key": key}
        if base_url:
            client_kwargs["base_url"] = base_url
        client = OpenAI(**client_kwargs)
        resp = client.chat.completions.create(
            model=get_model_name(provider),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt}
            ],
            max_tokens=max_tokens
        )
        return resp.choices[0].message.content, provider

    elif provider == 'gemini':
        import google.generativeai as genai
        genai.configure(api_key=key)
        model = genai.GenerativeModel(
            get_model_name(provider),
            system_instruction=system_prompt
        )
        resp = model.generate_content(user_prompt)
        return resp.text, provider

    else:
        raise RuntimeError(
            "No AI provider found!\n"
            "Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY"
        )

if __name__ == '__main__':
    provider, key = detect_provider()
    if provider:
        print(f"[OK] Provider detected: {provider} | Model: {get_model_name(provider)}")
    else:
        print("[FAIL] No AI provider found. Check your .env file.")
