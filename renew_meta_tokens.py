#!/usr/bin/env python3
"""
renew_meta_tokens.py — Facebook / Instagram token renewal
==========================================================
Renews the Meta token chain using the system-user token:

  META_SYSTEM_USER_TOKEN  (long-lived, never expires normally)
        │  GET /{page_id}?fields=access_token
        ▼
  Permanent page access token  → written to:
        config/facebook_tokens.json (page_access_token)
        config/instagram_config.json (page_access_token)
        .env / vault-control .env    (INSTAGRAM_ACCESS_TOKEN)

A system-user token is the ONLY Meta token that is truly permanent without a
refresh dance — individual user tokens (short 2h / long 60d) always die. So this
script treats META_SYSTEM_USER_TOKEN as the source of truth and regenerates the
page/IG tokens from it on demand.

If you do NOT have a system-user token yet, run:
    python3 auto_setup_facebook.py

Usage:
  python3 renew_meta_tokens.py            # validate + renew FB/IG tokens
  python3 renew_meta_tokens.py --token <SYSTEM_TOKEN>   # override token
"""

import sys
import argparse
import requests
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _unique_env_files(*paths):
    """Drop duplicates by real path — the vault .env is a symlink to the root one."""
    import os
    seen, out = set(), []
    for path in paths:
        key = os.path.realpath(path)
        if key not in seen:
            seen.add(key)
            out.append(path)
    return out


ENV_FILES = _unique_env_files(BASE_DIR / ".env", BASE_DIR / "vault-control" / "server" / ".env")
FACEBOOK_CONFIG = BASE_DIR / "config" / "facebook_tokens.json"
INSTAGRAM_CONFIG = BASE_DIR / "config" / "instagram_config.json"
GRAPH = "https://graph.facebook.com/v19.0"


def load_dotenv_file(env_path):
    result = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                if key.startswith("export "):
                    key = key[len("export "):].strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                result[key] = value
    return result


def atomic_write(path, content):
    """Temp file + rename, so a crash can never leave a truncated .env behind
    (which would take every secret in it with it)."""
    import os
    from pathlib import Path as _Path
    # vault-control/server/.env is a symlink to the root .env; replacing the
    # link itself would split the two stores apart.
    path = _Path(os.path.realpath(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def write_env(env_path, updates, marker_comment):
    """Update .env in place. Returns True only if the file actually changed.

    The marker comment is appended once, not once per run — the old version
    grew the file by a line on every invocation.
    """
    updates = {k: v for k, v in (updates or {}).items() if v}
    if not updates:
        return False
    if not env_path.exists():
        env_path.parent.mkdir(parents=True, exist_ok=True)
        env_path.touch()
    original = env_path.read_text(encoding="utf-8")
    lines = original.splitlines()
    seen = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key.startswith("export "):
                key = key[len("export "):].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        new_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            new_lines.append(f"{key}={value}")
    marker = f"# {marker_comment}"
    if marker not in new_lines:
        new_lines.append("")
        new_lines.append(marker)
    content = "\n".join(new_lines) + "\n"
    if content == original:
        return False
    atomic_write(env_path, content)
    return True


def save_json(path, data):
    content = json_dump(data)
    if path.exists():
        try:
            if path.read_text(encoding="utf-8") == content:
                return False
        except Exception:
            pass
    atomic_write(path, content)
    return True


def json_dump(data):
    import json
    return json.dumps(data, indent=2)


def graph_call(path, params):
    try:
        r = requests.get(f"{GRAPH}/{path}", params=params, timeout=20)
        return r.status_code, r.json()
    except Exception as e:
        return None, {"error": {"message": str(e)}}


def main():
    parser = argparse.ArgumentParser(description="Renew Facebook/Instagram tokens")
    parser.add_argument("--token", help="override META_SYSTEM_USER_TOKEN")
    args = parser.parse_args()

    env = {}
    for ef in ENV_FILES:
        env.update(load_dotenv_file(ef))

    fb_config = {"page_id": env.get("FACEBOOK_PAGE_ID", "")}
    try:
        if FACEBOOK_CONFIG.exists():
            import json
            fb_config = json.loads(FACEBOOK_CONFIG.read_text())
    except Exception:
        pass

    ig_config = {}
    try:
        if INSTAGRAM_CONFIG.exists():
            import json
            ig_config = json.loads(INSTAGRAM_CONFIG.read_text())
    except Exception:
        pass

    system_token = args.token or env.get("META_SYSTEM_USER_TOKEN", "")
    page_id = fb_config.get("page_id") or env.get("FACEBOOK_PAGE_ID", "")
    ig_account_id = ig_config.get("instagram_business_account_id") or env.get("INSTAGRAM_ACCOUNT_ID", "")

    if not system_token:
        print("❌ META_SYSTEM_USER_TOKEN not set. Run auto_setup_facebook.py first.")
        return 1
    if not page_id:
        print("❌ FACEBOOK_PAGE_ID not set.")
        return 1

    print("=" * 70)
    print("🔐 META TOKEN RENEWAL")
    print("=" * 70)
    print(f"  page id       : {page_id}")
    print(f"  ig account id : {ig_account_id}")

    # Step 1: validate system-user token
    code, me = graph_call("me", {"access_token": system_token, "fields": "id,name"})
    if code == 200:
        print(f"  ✅ system-user token valid — {me.get('name', '')} ({me.get('id', '')})")
    else:
        err = me.get("error", {}).get("message", "unknown") if isinstance(me, dict) else str(me)
        print(f"  ❌ system-user token INVALID: {err}")
        return 1

    # Step 2: get permanent page token
    code, page = graph_call(page_id, {"access_token": system_token, "fields": "access_token"})
    if code != 200 or not page.get("access_token"):
        err = page.get("error", {}).get("message", "unknown") if isinstance(page, dict) else str(page)
        print(f"  ❌ could not fetch page access token: {err}")
        return 1
    page_token = page["access_token"]
    print(f"  ✅ permanent page token obtained: {page_token[:15]}...")

    # Step 3: verify the page token can see the IG account
    ig_status = "skipped"
    if ig_account_id:
        code, ig = graph_call(ig_account_id, {"access_token": page_token, "fields": "id,username"})
        if code == 200:
            ig_status = f"✅ @{ig.get('username', '')}"
            print(f"  {ig_status}")
        else:
            err = ig.get("error", {}).get("message", "unknown") if isinstance(ig, dict) else str(ig)
            ig_status = f"⚠ could not verify IG: {err}"
            print(f"  {ig_status}")

    # Step 4: save everywhere
    updates_en = {}
    if ig_account_id:
        updates_en["INSTAGRAM_ACCESS_TOKEN"] = page_token
    if updates_en:
        for ef in ENV_FILES:
            try:
                write_env(ef, updates_en, "Meta tokens renewed by renew_meta_tokens.py")
            except Exception as e:
                print(f"  ⚠ env write failed {ef}: {e}")

    if FACEBOOK_CONFIG.exists() or page_token:
        store = {}
        try:
            import json
            store = json.loads(FACEBOOK_CONFIG.read_text()) if FACEBOOK_CONFIG.exists() else {}
        except Exception:
            store = {}
        store["page_access_token"] = page_token
        store["page_id"] = page_id
        save_json(FACEBOOK_CONFIG, store)

    if ig_account_id:
        store = {}
        try:
            import json
            store = json.loads(INSTAGRAM_CONFIG.read_text()) if INSTAGRAM_CONFIG.exists() else {}
        except Exception:
            store = {}
        store["page_access_token"] = page_token
        store["instagram_business_account_id"] = ig_account_id
        save_json(INSTAGRAM_CONFIG, store)

    print("  💾 saved to config/facebook_tokens.json, config/instagram_config.json, .env")
    print("=" * 70)
    print("✅ Meta tokens renewed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())