#!/usr/bin/env python3
"""
renew_linkedin_token.py — LinkedIn token renewal
================================================
Two paths:
  A) PASTE path (default): You paste the JSON/token from LinkedIn's
     "OAuth 2.0 Token Generator" at
        https://www.linkedin.com/developers/tools/oauth/token-generator
     That page returns access_token + refresh_token (refresh token valid 1 year).
     Choose your app, check scopes (w_member_social, r_liteprofile, r_emailaddress),
     generate, then paste. This is the recommended flow because LinkedIn only
     hands refresh tokens to apps with a registered redirect + approved scopes.

  B) 3-legged auth-code flow: only works if you have a redirect_uri registered
     for your LinkedIn app. Provide --redirect-uri.

After a successful renewal the new token SET is written to every store:
  - .env                      (LINKEDIN_ACCESS_TOKEN / LINKEDIN_REFRESH_TOKEN)
  - vault-control/server/.env (same keys)
  - .linkedin_session/session.json
  - config/linkedin_config.json

Usage:
  python3 renew_linkedin_token.py                  # interactive paste path
  python3 renew_linkedin_token.py --redirect-uri http://localhost:8080/callback
  python3 renew_linkedin_token.py --token-file /tmp/linkedin_token.json
"""

import sys
import json
import time
import argparse
import requests
import subprocess
from pathlib import Path
from datetime import datetime, timedelta

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
SESSION_FILE = BASE_DIR / ".linkedin_session" / "session.json"
CONFIG_FILE = BASE_DIR / "config" / "linkedin_config.json"

OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
OAUTH_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
API_BASE = "https://api.linkedin.com/v2"


def load_dotenv_file(env_path: Path) -> dict:
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


def save_json(path: Path, data: dict) -> None:
    atomic_write(path, json.dumps(data, indent=2))


def load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def get_creds() -> dict:
    env = {}
    for ef in ENV_FILES:
        env.update(load_dotenv_file(ef))
    session = load_json(SESSION_FILE)
    return {
        "client_id": env.get("LINKEDIN_CLIENT_ID") or session.get("client_id", ""),
        "client_secret": env.get("LINKEDIN_CLIENT_SECRET") or session.get("client_secret", ""),
        "person_urn": env.get("LINKEDIN_PERSON_URN") or env.get("LINKEDIN_URN") or session.get("person_urn", ""),
    }


def validate_token(access_token: str) -> dict:
    try:
        r = requests.get(
            f"{API_BASE}/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json()
            return {"ok": True, "sub": data.get("sub", ""), "name": data.get("name", ""), "raw": data}
        return {"ok": False, "message": r.text[:300]}
    except Exception as e:
        return {"ok": False, "message": str(e)}


def exchange_code(client_id, client_secret, code, redirect_uri):
    return requests.post(
        OAUTH_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
        timeout=20,
    )


def persist(access_token, refresh_token, expires_in, person_urn, sub_id) -> None:
    if not person_urn and sub_id:
        person_urn = f"urn:li:person:{sub_id}"

    updates = {"LINKEDIN_ACCESS_TOKEN": access_token}
    if refresh_token:
        updates["LINKEDIN_REFRESH_TOKEN"] = refresh_token
    for ef in ENV_FILES:
        try:
            write_env(ef, updates, "LinkedIn tokens auto-renewed by renew_linkedin_token.py")
        except Exception as e:
            print(f"  ⚠ env write failed {ef}: {e}")

    session = load_json(SESSION_FILE)
    session.update({
        "access_token": access_token,
        "refresh_token": refresh_token or session.get("refresh_token", ""),
        "person_urn": person_urn or session.get("person_urn", ""),
        "expires_at": (datetime.now() + timedelta(seconds=expires_in)).isoformat() if expires_in else session.get("expires_at"),
        "saved_at": datetime.now().isoformat(),
    })
    save_json(SESSION_FILE, session)

    config = load_json(CONFIG_FILE)
    config["access_token"] = access_token
    if person_urn and ":" in person_urn:
        config["urn"] = person_urn.split(":")[-1]
    save_json(CONFIG_FILE, config)


def paste_path() -> int:
    print("=" * 70)
    print("🔑 LINKEDIN TOKEN RENEWAL — PASTE PATH")
    print("=" * 70)
    print("1. Open: https://www.linkedin.com/developers/tools/oauth/token-generator")
    print("2. Select your app, check scopes: w_member_social, r_liteprofile, r_emailaddress")
    print("3. Click Generate token, then 'Allow'.")
    print("4. Paste the ENTIRE JSON response below (or just the access_token in one line form):")
    print()
    prompt = input("Paste JSON/token: ").strip()
    if not prompt:
        print("❌ Nothing pasted.")
        return 1

    data = None
    try:
        data = json.loads(prompt)
    except Exception:
        data = None

    if data and isinstance(data, dict) and data.get("access_token"):
        access_token = data["access_token"]
        refresh_token = data.get("refresh_token", "")
        expires_in = data.get("expires_in", None)
        print(f"  ✓ Parsed as JSON: access={access_token[:12]}... refresh={'yes' if refresh_token else 'NO ⚠'}")
    else:
        access_token = prompt.strip().strip('"').strip("'")
        refresh_token = ""
        expires_in = None
        print(f"  ✓ Using raw token: {access_token[:12]}...")

    print("\n⏳ Validating token against LinkedIn API...")
    result = validate_token(access_token)
    if not result["ok"]:
        print(f"❌ Token invalid: {result.get('message', 'unknown')}")
        return 1
    print(f"✅ Token valid — {result.get('name', 'user')} ({result.get('sub', '')})")

    if not refresh_token:
        print("\n⚠ No refresh_token in response. Without it, auto-renewal is impossible.")
        print("  LinkedIn refreshes only work for apps whose token generator returns a refresh_token.")
        print("  You can still save this access token (lasts ~30-60 days).")

    creds = get_creds()
    person_urn = creds["person_urn"]
    persist(access_token, refresh_token, expires_in, person_urn, result.get("sub", ""))
    print("💾 Saved to .env, vault-control .env, session.json, linkedin_config.json")
    print("=" * 70)
    return 0


def oauth_path(redirect_uri: str) -> int:
    creds = get_creds()
    if not creds["client_id"] or not creds["client_secret"]:
        print("❌ LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set in .env")
        return 1

    state = f"de_{int(time.time())}"
    auth_url = (
        f"{OAUTH_AUTH_URL}?response_type=code&client_id={creds['client_id']}"
        f"&redirect_uri={urllib_quote(redirect_uri)}"
        f"&scope=w_member_social%20r_liteprofile%20r_emailaddress&state={state}"
    )
    print("=" * 70)
    print("🔑 LINKEDIN TOKEN RENEWAL — OAUTH PATH")
    print("=" * 70)
    print("Open this URL in your browser and approve:")
    print()
    print(auth_url)
    print()
    try:
        subprocess.run(["xdg-open", auth_url], check=False)
    except Exception:
        pass

    code = input("Paste the 'code' parameter from the redirect URL: ").strip()
    if not code:
        print("❌ No code entered.")
        return 1

    print("\n⏳ Exchanging code for tokens...")
    resp = exchange_code(creds["client_id"], creds["client_secret"], code, redirect_uri)
    if resp.status_code != 200:
        print(f"❌ Exchange failed: {resp.text[:400]}")
        return 1
    data = resp.json()
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token", "")
    expires_in = data.get("expires_in")
    if not access_token:
        print(f"❌ No access_token in response: {data}")
        return 1

    print(f"  ✓ access_token obtained ({access_token[:12]}...)")
    print(f"  ✓ refresh_token: {'yes' if refresh_token else 'NO ⚠'}")

    result = validate_token(access_token)
    if not result["ok"]:
        print(f"❌ Token validation failed: {result.get('message')}")
        return 1

    persist(access_token, refresh_token, expires_in, creds["person_urn"], result.get("sub", ""))
    print("✅ Token renewed and saved everywhere.")
    print("=" * 70)
    return 0


def urllib_quote(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")


def token_file_path(file_path: str) -> int:
    p = Path(file_path)
    if not p.exists():
        print(f"❌ File not found: {p}")
        return 1
    data = json.loads(p.read_text(encoding="utf-8"))
    access = data.get("access_token") or data.get("token")
    refresh = data.get("refresh_token", "")
    expires_in = data.get("expires_in")
    if not access:
        print("❌ No access_token/token in file")
        return 1
    result = validate_token(access)
    if not result["ok"]:
        print(f"❌ Token invalid: {result.get('message')}")
        return 1
    creds = get_creds()
    persist(access, refresh, expires_in, creds["person_urn"], result.get("sub", ""))
    print(f"✅ Token loaded from {p} and saved everywhere. Valid for {result.get('name')}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Renew LinkedIn access/refresh tokens")
    parser.add_argument("--redirect-uri", help="use 3-legged OAuth flow with this registered redirect URI")
    parser.add_argument("--token-file", help="load token set from a JSON file")
    args = parser.parse_args()

    if args.token_file:
        return token_file_path(args.token_file)
    if args.redirect_uri:
        return oauth_path(args.redirect_uri)
    return paste_path()


if __name__ == "__main__":
    sys.exit(main())