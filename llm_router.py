#!/usr/bin/env python3
"""
LLM Router for Digital FTE Brain
=================================
Smart multi-provider LLM router with automatic failover.

Priority: Claude → Qwen → OpenAI → OpenRouter (fallback)

Features:
- Auto-detects rate limits, quota errors, timeouts → tries next model
- Uses LiteLLM for unified multi-provider interface
- Reads all API keys from .env
- Logs every switch clearly
- Lightweight context (no heavy history)

Author: Digital Employee System
Tier: Silver v4.0
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env in vault root
BASE_DIR = Path(__file__).resolve().parent
_env_path = BASE_DIR / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# ---------------------------------------------------------------------------
# LiteLLM import (install via: pip install litellm)
# ---------------------------------------------------------------------------
try:
    import litellm
    from litellm import completion
    LITELLM_AVAILABLE = True
except ImportError:
    litellm = None
    completion = None
    LITELLM_AVAILABLE = False

# ---------------------------------------------------------------------------
# Router Logger
# ---------------------------------------------------------------------------

class RouterLogger:
    """Dedicated logger for the LLM router."""

    LOG_FILE = BASE_DIR / "Logs" / "llm_router.log"

    def __init__(self):
        self.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        self._setup_logger()

    def _setup_logger(self):
        self.logger = logging.getLogger("llm_router")
        self.logger.setLevel(logging.DEBUG)
        # Avoid duplicate handlers on re-import
        if not self.logger.handlers:
            # File handler
            fh = logging.FileHandler(self.LOG_FILE, encoding="utf-8")
            fh.setLevel(logging.DEBUG)
            # Console handler
            ch = logging.StreamHandler()
            ch.setLevel(logging.INFO)
            # Format
            fmt = logging.Formatter(
                "[%(asctime)s] [%(levelname)-7s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
            fh.setFormatter(fmt)
            ch.setFormatter(fmt)
            self.logger.addHandler(fh)
            self.logger.addHandler(ch)

    def info(self, msg: str):
        self.logger.info(f"🔵 {msg}")

    def warning(self, msg: str):
        self.logger.warning(f"🟡 {msg}")

    def error(self, msg: str):
        self.logger.error(f"🔴 {msg}")

    def success(self, msg: str):
        self.logger.info(f"🟢 {msg}")

    def switch(self, from_model: str, to_model: str, reason: str):
        self.logger.warning(
            f"⚡ {from_model} {reason} → switching to {to_model}"
        )


router_logger = RouterLogger()

# ---------------------------------------------------------------------------
# Model Configuration
# ---------------------------------------------------------------------------

class ModelConfig:
    """Holds configuration for a single LLM provider."""

    def __init__(
        self,
        name: str,
        model_id: str,
        env_key: str,
        api_base: Optional[str] = None,
    ):
        self.name = name
        self.model_id = model_id
        self.env_key = env_key
        self.api_base = api_base
        self.api_key = os.getenv(env_key, "")

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key.strip())

    def __repr__(self):
        status = "✅" if self.is_configured else "❌"
        return f"[{status}] {self.name}: {self.model_id}"


# Default model priority order (first = highest priority)
DEFAULT_MODEL_PRIORITY = [
    ModelConfig(
        name="Claude",
        model_id=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
        env_key="ANTHROPIC_API_KEY",
    ),
    ModelConfig(
        name="Qwen",
        model_id=os.getenv("QWEN_MODEL", "qwen/qwen-plus"),
        env_key="OPENROUTER_API_KEY",
        api_base=os.getenv("QWEN_API_BASE", "https://openrouter.ai/api/v1"),
    ),
    ModelConfig(
        name="OpenAI",
        model_id=os.getenv("OPENAI_MODEL", "gpt-4o"),
        env_key="OPENAI_API_KEY",
    ),
    ModelConfig(
        name="OpenRouter Fallback",
        model_id=os.getenv("FALLBACK_MODEL", "google/gemini-2.0-flash-exp:free"),
        env_key="OPENROUTER_API_KEY",
        api_base="https://openrouter.ai/api/v1",
    ),
]

# ---------------------------------------------------------------------------
# Error Classification
# ---------------------------------------------------------------------------

# HTTP status codes that should trigger a failover
RETRYABLE_ERRORS = {429, 500, 502, 503, 504}

# Error message keywords that indicate retryable issues
RETRYABLE_KEYWORDS = [
    "rate limit",
    "rate_limit",
    "quota",
    "quota exceeded",
    "insufficient_quota",
    "insufficient_funds",
    "too many requests",
    "overloaded",
    "temporarily unavailable",
    "service unavailable",
    "timeout",
    "timed out",
    "connection error",
    "bad gateway",
    "gateway timeout",
]


def is_retryable_error(error: Exception) -> bool:
    """Determine if an error is retryable (should trigger failover)."""
    error_str = str(error).lower()

    # Check for known retryable keywords
    if any(kw in error_str for kw in RETRYABLE_KEYWORDS):
        return True

    # Check for HTTP status codes in error message
    for code in RETRYABLE_ERRORS:
        if str(code) in error_str:
            return True

    return False


def classify_error(error: Exception) -> str:
    """Classify the error for logging purposes."""
    error_str = str(error).lower()

    if any(kw in error_str for kw in ["rate limit", "rate_limit", "429", "too many requests"]):
        return "rate limit"
    elif any(kw in error_str for kw in ["quota", "insufficient_quota", "insufficient_funds"]):
        return "quota exceeded"
    elif any(kw in error_str for kw in ["timeout", "timed out"]):
        return "timeout"
    elif any(kw in error_str for kw in ["500", "502", "503", "504", "unavailable", "overloaded"]):
        return "server error"
    elif any(kw in error_str for kw in ["connection error", "connection refused"]):
        return "connection error"
    else:
        return "unknown error"


# ---------------------------------------------------------------------------
# LiteLLM Configuration
# ---------------------------------------------------------------------------

def configure_litellm():
    """Set LiteLLM defaults for the router."""
    if not LITELLM_AVAILABLE:
        return

    # Request timeout (seconds)
    litellm.request_timeout = int(os.getenv("LLM_TIMEOUT", "120"))

    # Max retries (we handle retries ourselves, so disable LiteLLM retries)
    litellm.num_retries = 0

    # Drop params that some providers don't support
    litellm.drop_params = True

    # Optional: Set custom API bases
    # litellm.api_base = ...

    router_logger.info("LiteLLM configured (timeout=120s, retries=0, drop_params=True)")


# ---------------------------------------------------------------------------
# Core Router
# ---------------------------------------------------------------------------

class LLMRouter:
    """
    Smart LLM router with automatic failover.

    Priority order: Claude → Qwen → OpenAI → OpenRouter fallback
    Auto-detects rate limit / quota / timeout → tries next model
    """

    def __init__(
        self,
        models: Optional[list[ModelConfig]] = None,
        default_model: Optional[str] = None,
    ):
        """
        Initialize the LLM router.

        Args:
            models: Optional custom model priority list.
                    Defaults to DEFAULT_MODEL_PRIORITY.
            default_model: Optional override for the primary model name
                          (e.g. "Qwen" to make Qwen primary).
        """
        if not LITELLM_AVAILABLE:
            raise ImportError(
                "LiteLLM is not installed. Install with: pip install litellm"
            )

        self.models = models or DEFAULT_MODEL_PRIORITY[:]
        self.default_model = default_model or "Claude"

        # Reorder if user specified a different default
        if self.default_model != "Claude":
            self._reorder_priority(self.default_model)

        # Filter to only configured models
        self.available_models = [m for m in self.models if m.is_configured]

        # Log startup
        router_logger.info(f"LLM Router initialized | Default: {self.default_model}")
        router_logger.info(f"Available models: {len(self.available_models)}/{len(self.models)}")
        for m in self.models:
            router_logger.info(f"  {m}")

        # Configure LiteLLM
        configure_litellm()

        # Track which models failed this session
        self.failed_models: set[str] = set()

    def _reorder_priority(self, model_name: str):
        """Reorder model priority to make the specified model first."""
        for i, model in enumerate(self.models):
            if model.name.lower() == model_name.lower():
                self.models.insert(0, self.models.pop(i))
                router_logger.info(f"Priority reordered: {model_name} is now primary")
                break

    def _build_messages(
        self,
        prompt: str,
        system_prompt: str = "",
    ) -> list[dict]:
        """Build the messages list for the completion call."""
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        messages.append({"role": "user", "content": prompt})

        return messages

    def _call_model(
        self,
        model: ModelConfig,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """
        Call a single model and return the response text.

        Raises exception on failure (caught by caller for failover).
        """
        kwargs = {
            "model": model.model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        # Pass API key
        if model.api_key:
            kwargs["api_key"] = model.api_key

        # Pass custom API base if set
        if model.api_base:
            kwargs["api_base"] = model.api_base

        # Track start time
        start = time.time()

        router_logger.info(f"Calling {model.name} ({model.model_id})...")

        response = completion(**kwargs)

        elapsed = time.time() - start
        router_logger.success(
            f"{model.name} responded in {elapsed:.1f}s "
            f"({len(response.choices[0].message.content)} chars)"
        )

        return response.choices[0].message.content

    def get_response(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> dict:
        """
        Get a response from the best available LLM.

        Automatically fails over to the next model if the current one
        hits a rate limit, quota issue, timeout, or server error.

        Args:
            prompt:        The user prompt / message.
            system_prompt: Optional system prompt.
            temperature:   Sampling temperature (0.0 – 1.0).
            max_tokens:    Maximum tokens in response.

        Returns:
            Dictionary with:
                - content:     The response text
                - model_used:  Which model actually answered
                - attempts:    Number of models tried
                - latency:     Total time in seconds
                - error:       Error message if all models failed (None on success)
        """
        messages = self._build_messages(prompt, system_prompt)
        start_time = time.time()
        attempts = 0
        last_error = None

        for model in self.available_models:
            # Skip models that already failed this session (optional)
            # Uncomment the next line to skip permanently failed models:
            # if model.name in self.failed_models:
            #     continue

            attempts += 1

            try:
                content = self._call_model(
                    model, messages, temperature, max_tokens
                )
                latency = time.time() - start_time

                return {
                    "content": content,
                    "model_used": model.name,
                    "model_id": model.model_id,
                    "attempts": attempts,
                    "latency": round(latency, 2),
                    "error": None,
                }

            except Exception as e:
                last_error = e
                error_type = classify_error(e)
                self.failed_models.add(model.name)

                router_logger.error(
                    f"{model.name} failed: {error_type} — {str(e)[:150]}"
                )

                # Check if there's a next model to try
                next_model = self._get_next_model(model)
                if next_model:
                    router_logger.switch(model.name, next_model.name, error_type)
                else:
                    router_logger.error(
                        f"All models exhausted. Last error: {error_type}"
                    )

        # All models failed
        latency = time.time() - start_time
        return {
            "content": None,
            "model_used": None,
            "model_id": None,
            "attempts": attempts,
            "latency": round(latency, 2),
            "error": str(last_error),
        }

    def _get_next_model(self, current: ModelConfig) -> Optional[ModelConfig]:
        """Get the next available model after the current one."""
        try:
            idx = self.available_models.index(current)
            return self.available_models[idx + 1] if idx + 1 < len(self.available_models) else None
        except ValueError:
            return None

    def set_primary_model(self, model_name: str):
        """Change the primary (first-attempt) model at runtime."""
        for i, model in enumerate(self.available_models):
            if model.name.lower() == model_name.lower():
                self.available_models.insert(0, self.available_models.pop(i))
                self.default_model = model_name
                router_logger.info(f"Primary model changed: {model_name}")
                return
        router_logger.warning(
            f"Cannot set primary model to '{model_name}': model not available"
        )

    def get_status(self) -> dict:
        """Return the current status of all models."""
        return {
            "default_model": self.default_model,
            "available_models": [
                {"name": m.name, "model_id": m.model_id, "configured": m.is_configured}
                for m in self.models
            ],
            "failed_models": list(self.failed_models),
            "litellm_version": litellm.__version__ if LITELLM_AVAILABLE else "not installed",
        }

    def reset_failures(self):
        """Clear the failed models set (e.g. after a cooldown period)."""
        self.failed_models.clear()
        router_logger.info("Failed models cache cleared")


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------

# Global singleton (lazy-init on first call)
_router: Optional[LLMRouter] = None


def _get_router() -> LLMRouter:
    """Get or create the global LLMRouter singleton."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


def get_response(
    prompt: str,
    system_prompt: str = "",
    temperature: float = 0.7,
    max_tokens: int = 4000,
) -> dict:
    """
    Convenience function: get a response from the LLM router.

    Args:
        prompt:        The user prompt.
        system_prompt: Optional system prompt.
        temperature:   Sampling temperature (0.0 – 1.0).
        max_tokens:    Maximum tokens in response.

    Returns:
        Dictionary with content, model_used, attempts, latency, error.

    Example:
        result = get_response("Summarize this email...", system_prompt="You are an assistant")
        if result["content"]:
            print(f"Response from {result['model_used']}: {result['content']}")
        else:
            print(f"All models failed: {result['error']}")
    """
    return _get_router().get_response(prompt, system_prompt, temperature, max_tokens)


def set_primary_model(model_name: str):
    """Change the primary model at runtime."""
    _get_router().set_primary_model(model_name)


def get_router_status() -> dict:
    """Check which models are available."""
    return _get_router().get_status()


# ---------------------------------------------------------------------------
# CLI Test / Demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  LLM Router — Quick Test")
    print("=" * 60)

    if not LITELLM_AVAILABLE:
        print("\n❌ LiteLLM is not installed.")
        print("   Install with:  pip install litellm")
        print("   Then set API keys in .env and run again.")
        exit(1)

    # Show status
    router = LLMRouter()
    status = router.get_status()
    print(f"\n✅ Default model : {status['default_model']}")
    print(f"✅ Available  : {len([m for m in status['available_models'] if m['configured']])} models")
    for m in status['available_models']:
        icon = "✅" if m['configured'] else "❌"
        print(f"   {icon} {m['name']}: {m['model_id']}")

    # Test call
    print("\n" + "-" * 60)
    print("  Sending test prompt...")
    print("-" * 60)

    result = get_response(
        prompt="Reply with exactly: LLM Router is working!",
        system_prompt="You are a test assistant. Keep responses minimal.",
        temperature=0.1,
        max_tokens=50,
    )

    print(f"\n📡 Model used : {result['model_used']}")
    print(f"📡 Attempts   : {result['attempts']}")
    print(f"📡 Latency    : {result['latency']}s")

    if result["content"]:
        print(f"\n✅ Response: {result['content']}")
    else:
        print(f"\n❌ Error: {result['error']}")

    print("\n" + "=" * 60)
