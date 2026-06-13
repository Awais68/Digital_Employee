#!/usr/bin/env python3
"""Generate the 3 hero images for the 2026-06-12 social posts.

Tries Gemini Imagen first; on any failure falls back to downloading a matching
Unsplash photo. Writes real files into generated_images/ and prints a JSON map.
"""
import os
import json
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")

OUT = Path("generated_images")
OUT.mkdir(exist_ok=True)

CONCEPTS = [
    {
        "slot": "morning",
        "name": "ai_closing_tabs",
        "prompt": (
            "A clean modern flat illustration of a glowing AI assistant calmly "
            "closing browser tabs and email windows on a desk at night, soft "
            "blue and teal palette, professional tech aesthetic, minimal, high "
            "contrast, no text, 16:9"
        ),
        "unsplash_query": "automation,technology,night",
    },
    {
        "slot": "afternoon",
        "name": "human_approval",
        "prompt": (
            "A clean modern flat illustration of a human hand approving a green "
            "button while a polite AI robot waits, conveying trust and "
            "human-in-the-loop control, blue and green palette, professional, "
            "minimal, no text, 16:9"
        ),
        "unsplash_query": "approve,checklist,technology",
    },
    {
        "slot": "evening",
        "name": "human_ai_team",
        "prompt": (
            "A cinematic modern illustration of a small human team collaborating "
            "with glowing holographic AI teammates around a table, hopeful warm "
            "lighting, blue and gold palette, professional, no text, 16:9"
        ),
        "unsplash_query": "teamwork,future,technology",
    },
]


def _retry_delay_secs(resp, default):
    try:
        for d in resp.json().get("error", {}).get("details", []):
            if "RetryInfo" in str(d.get("@type", "")):
                return int(str(d.get("retryDelay", "")).rstrip("s")) + 2
    except Exception:
        pass
    return default


def try_gemini_native(concept, max_attempts=4):
    """Native image output via gemini-*-image generateContent, with 429 retry."""
    if not GEMINI_KEY:
        return None
    import base64
    import time

    # gemini-2.5-flash-image is the free-tier image model; pro is paid/limited.
    model = "gemini-2.5-flash-image"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={GEMINI_KEY}"
    )
    body = {"contents": [{"parts": [{"text": concept["prompt"]}]}]}
    for attempt in range(1, max_attempts + 1):
        try:
            r = requests.post(url, json=body, timeout=120)
            if r.status_code == 429:
                wait = _retry_delay_secs(r, 45)
                print(f"  [gemini:{model}] 429, waiting {wait}s "
                      f"(attempt {attempt}/{max_attempts})", file=sys.stderr)
                time.sleep(wait)
                continue
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            for p in parts:
                inline = p.get("inlineData") or p.get("inline_data")
                if inline and inline.get("data"):
                    path = OUT / f"{concept['slot']}_{concept['name']}.png"
                    path.write_bytes(base64.b64decode(inline["data"]))
                    return str(path), model
            print(f"  [gemini:{model}] no image in response", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  [gemini:{model}] failed: {e}", file=sys.stderr)
            return None
    return None


def try_imagen(concept):
    """Imagen 4 via predict endpoint. Return path or None."""
    if not GEMINI_KEY:
        return None
    import base64

    try:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"imagen-4.0-generate-001:predict?key={GEMINI_KEY}"
        )
        body = {
            "instances": [{"prompt": concept["prompt"]}],
            "parameters": {"sampleCount": 1, "aspectRatio": "16:9"},
        }
        r = requests.post(url, json=body, timeout=120)
        r.raise_for_status()
        b64 = r.json()["predictions"][0]["bytesBase64Encoded"]
        path = OUT / f"{concept['slot']}_{concept['name']}.png"
        path.write_bytes(base64.b64decode(b64))
        return str(path), "imagen-4.0"
    except Exception as e:
        print(f"  [imagen-4] failed: {e}", file=sys.stderr)
        return None


def try_unsplash(concept):
    """Download a real Unsplash photo as fallback. Return path or None."""
    if not UNSPLASH_KEY:
        return None
    try:
        url = (
            "https://api.unsplash.com/photos/random"
            f"?orientation=landscape&query={concept['unsplash_query']}"
            f"&client_id={UNSPLASH_KEY}"
        )
        meta = requests.get(url, timeout=30).json()
        img_url = meta["urls"]["regular"]
        data = requests.get(img_url, timeout=30).content
        path = OUT / f"{concept['slot']}_{concept['name']}.jpg"
        path.write_bytes(data)
        return str(path)
    except Exception as e:
        print(f"  [unsplash] failed: {e}", file=sys.stderr)
        return None


def main():
    import time

    results = {}
    for i, c in enumerate(CONCEPTS):
        print(f"[{c['slot']}] {c['name']} ...", file=sys.stderr)
        path = source = None
        got = try_gemini_native(c)  # Imagen 4 is paid-only on this key; skip it
        if got:
            path, source = got
        else:
            path = try_unsplash(c)
            source = "unsplash-fallback" if path else "FAILED"
        results[c["slot"]] = {"path": path, "source": source}
        print(f"  -> {source}: {path}", file=sys.stderr)
        if source.startswith("gemini") and i < len(CONCEPTS) - 1:
            time.sleep(15)  # space requests under the free-tier rate limit
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
