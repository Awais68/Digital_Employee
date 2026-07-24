"""
env_loader.py — Central multi-file .env loader for Digital Employee Python scripts.

Usage:
    import env_loader  # at top of script — loads .env + environment overlay

Or explicit:
    from env_loader import load_env
    load_env()  # loads .env + .env.development (default)
    load_env('production')  # loads .env + .env.production

Loading order:
    1. .env (base — shared across all environments)
    2. .env.{environment} (override — dev or production)

Environment selection:
    - Explicit: load_env('production')
    - Env var: AI_ENV=production
    - Default: development
"""
import os
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent
_loaded = False


def load_env(env: str | None = None, base_dir: Path | None = None) -> None:
    """Load .env base + environment overlay. Safe to call multiple times."""
    global _loaded
    if _loaded:
        return

    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    d = base_dir or _BASE_DIR

    # 1. Load base .env
    base_env = d / '.env'
    if base_env.exists():
        load_dotenv(base_env, override=False)

    # 2. Determine environment
    if env is None:
        env = os.getenv('AI_ENV', 'development').strip().lower()

    # 3. Load environment overlay
    overlay = d / f'.env.{env}'
    if overlay.exists():
        load_dotenv(overlay, override=True)

    _loaded = True


# Auto-load on import (safe — uses override=False for base, override=True for overlay)
load_env()
