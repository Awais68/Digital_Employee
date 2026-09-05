#!/usr/bin/env python3
"""
token_manager.py — Centralized social media token health & auto-renewal
=======================================================================
Digital Employee system.

What it does:
  - Validates every social token against its live API (LinkedIn, Facebook, Instagram)
  - Tracks expiry per token in config/token_state.json
  - Auto-refreshes LinkedIn via get_token (if LINKEDIN_REFRESH_TOKEN is set)
  - Auto-refreshes Meta long-lived user token + permanent page token via Graph API
  - Syncs refreshed tokens across every store (.env, vault-control .env, config JSONs, session.json)
  - When manual re-auth is unavoidable, drops an alert file into Needs_Action/ and logs

Commands:
  python3 token_manager.py status     Show all tokens, expiry, health (no network calls for secrets)
  python3 token_manager.py check      Validate tokens live, write token_state.json
  python3 token_manager.py renew      Attempt auto-renewal for everything refreshable
  python3 token_manager.py watch      Loop periodically, renewing then checking

Exit codes:
  0  healthy (or only transient/network problems, or expiring-with-warning)
  1  a token is genuinely broken / a refresh call failed
  2  renew only: nothing is broken in code, a human must re-auth

Environment:
  TOKEN_MANAGER_PM2_RELOAD=1   restart PM2 apps after a token actually changes
                               (PM2 caches the env it booted with, so without a
                               restart the new token in .env is never read)
  TOKEN_MANAGER_PM2_APPS       comma-separated app list, default "all"
"""

import json
import re
import sys
import time
import logging
import argparse
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

BASE_DIR = Path(__file__).resolve().parent

# Environment loading
try:
    import env_loader
    env_loader.load_env()
    LOADED = True
except Exception:
    try:
        from dotenv import load_dotenv
        load_dotenv(BASE_DIR / ".env", override=True)
        LOADED = True
    except Exception:
        LOADED = False

import os

LOGS_DIR = BASE_DIR / "Logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
NEEDS_ACTION_DIR = BASE_DIR / "Needs_Action"
NEEDS_ACTION_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "token_manager.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("token_manager")

STATE_FILE = BASE_DIR / "config" / "token_state.json"

# Cron runs this every 6h. Without a cooldown a single dead token buries
# Needs_Action/ under a fresh TOKEN_ALERT_*.md four times a day.
ALERT_COOLDOWN_HOURS = 24
# Renew this many days before expiry rather than waiting for the token to die.
RENEW_WINDOW_DAYS = 10
# Warn the owner this far ahead when a token cannot be auto-renewed.
EXPIRY_WARN_DAYS = 14
# Only these say "the service is having a bad day". A bare 500 does NOT:
# LinkedIn answers 500 GATEWAY_INTERNAL_ERROR for a corrupted access token, so
# treating all 5xx as transient hid genuinely dead tokens as "unreachable".
TRANSIENT_HTTP = {502, 503, 504}

def _unique_env_files(*paths: Path) -> List[Path]:
    """Drop duplicates by real path — the vault .env is a symlink to the root
    one, so writing "both" meant writing the same file twice every run."""
    seen, out = set(), []
    for path in paths:
        key = os.path.realpath(path)
        if key not in seen:
            seen.add(key)
            out.append(path)
    return out


ENV_FILES = _unique_env_files(BASE_DIR / ".env", BASE_DIR / "vault-control" / "server" / ".env")

LINKEDIN_CONFIG = BASE_DIR / "config" / "linkedin_config.json"
LINKEDIN_SESSION = BASE_DIR / ".linkedin_session" / "session.json"
FACEBOOK_CONFIG = BASE_DIR / "config" / "facebook_tokens.json"
INSTAGRAM_CONFIG = BASE_DIR / "config" / "instagram_config.json"

GRAPH = "https://graph.facebook.com/v19.0"
LINKEDIN_API = "https://api.linkedin.com/v2"
LINKEDIN_OAUTH = "https://www.linkedin.com/oauth/v2/accessToken"


def ts(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def now() -> datetime:
    return datetime.now()


def parse_dt(value: Any) -> Optional[datetime]:
    """Parse a stored timestamp into a *naive local* datetime.

    Stores disagree: session.json writes naive isoformat, some writers append a
    Z. Mixing the two blew up every `expires_at - now()` with
    "can't subtract offset-naive and offset-aware datetimes", so normalise here.
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


TOKEN_RE = re.compile(r"\b(?:EAA|AQ[A-Za-z]|IGQ)[A-Za-z0-9_\-]{20,}")


def redact(text: str) -> str:
    """Strip anything token-shaped out of text that lands in logs/alert files."""
    return TOKEN_RE.sub("<redacted-token>", text or "")


def mask(token: str, show: int = 6) -> str:
    if not token:
        return "(none)"
    if len(token) <= show + 4:
        return token[:4] + "..."
    return f"{token[:show]}...{token[-4:]}"


# ── .env read/write helpers ───────────────────────────────────────────────────

def read_env(env_path: Path) -> Dict[str, str]:
    result = {}
    if not env_path.exists():
        return result
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[key] = value
    return result


def atomic_write(path: Path, content: str) -> None:
    """Write via temp file + rename.

    A crash or a concurrent worker halfway through a plain write would leave a
    truncated .env — i.e. every secret in it gone. Rename is atomic, so the file
    is either the old one or the new one.
    """
    # Resolve first: vault-control/server/.env is a symlink to the root .env,
    # and os.replace on the link would swap the link itself for a real file,
    # silently splitting the two stores apart.
    path = Path(os.path.realpath(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def write_env(env_path: Path, updates: Dict[str, str], insert_comment: str = "") -> bool:
    """In-place update of a .env file, preserving comments and ordering.

    Returns True only when the file actually changed. Callers re-send the same
    token every run, so a no-op must not rewrite the file — the old version
    appended a fresh `# auto-renewed ...` line on every single call and the .env
    grew a line every 6 hours forever.
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

    marker = f"# {insert_comment}" if insert_comment else ""
    if marker and marker not in new_lines:
        new_lines.append("")
        new_lines.append(marker)

    content = "\n".join(new_lines) + "\n"
    if content == original:
        return False
    atomic_write(env_path, content)
    return True


def load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"JSON parse error {path}: {e}")
        return {}


def save_json(path: Path, data: Dict[str, Any]) -> bool:
    """Persist JSON atomically. Returns True only if the content changed."""
    content = json.dumps(data, indent=2)
    if path.exists():
        try:
            if path.read_text(encoding="utf-8") == content:
                return False
        except Exception:
            pass
    atomic_write(path, content)
    return True


def write_state(state: Dict[str, Any]) -> None:
    save_json(STATE_FILE, state)


def load_state() -> Dict[str, Any]:
    return load_json(STATE_FILE)


# ── LinkedIn helpers ─────────────────────────────────────────────────────────

def collect_linkedin() -> Dict[str, Any]:
    """Best-effort gather of LinkedIn creds from .env + session.json + config."""
    env = {}
    for ef in ENV_FILES:
        env.update(read_env(ef))

    session = load_json(LINKEDIN_SESSION)
    config = load_json(LINKEDIN_CONFIG)

    access = env.get("LINKEDIN_ACCESS_TOKEN") or session.get("access_token") or config.get("access_token") or ""
    refresh = env.get("LINKEDIN_REFRESH_TOKEN") or session.get("refresh_token") or ""
    client_id = env.get("LINKEDIN_CLIENT_ID") or session.get("client_id") or ""
    client_secret = env.get("LINKEDIN_CLIENT_SECRET") or session.get("client_secret") or ""
    person_urn = env.get("LINKEDIN_PERSON_URN") or env.get("LINKEDIN_URN") or session.get("person_urn") or config.get("urn") or ""
    expires_at = parse_dt(session.get("expires_at"))

    return {
        "access_token": access,
        "refresh_token": refresh,
        "client_id": client_id,
        "client_secret": client_secret,
        "person_urn": person_urn,
        "expires_at": expires_at,
    }


def linkedin_test(access_token: str) -> Dict[str, Any]:
    """Live-check a LinkedIn token. Returns status dict."""
    result = {"ok": False, "message": "", "profile_id": "", "status_code": None, "network_error": False}
    if not access_token:
        result["message"] = "no token"
        return result
    try:
        resp = requests.get(
            f"{LINKEDIN_API}/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        if resp.status_code == 500:
            # Ambiguous: a real blip or a corrupted token. Retry once; if it
            # repeats, it is the token, not LinkedIn.
            time.sleep(2)
            resp = requests.get(
                f"{LINKEDIN_API}/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
        result["status_code"] = resp.status_code
        if resp.status_code == 200:
            data = resp.json()
            result["ok"] = True
            result["profile_id"] = data.get("sub", "")
            result["message"] = f"valid — {data.get('name', 'user')}"
        else:
            result["network_error"] = resp.status_code in TRANSIENT_HTTP
            result["message"] = redact(resp.text[:300])
    except Exception as e:
        result["network_error"] = True
        result["message"] = f"network error: {e}"
    return result


def linkedin_refresh(client_id: str, client_secret: str, refresh_token: str) -> Dict[str, Any]:
    """Attempt LinkedIn refresh-token grant. Returns tokens if successful."""
    result = {"ok": False, "message": "", "access_token": None, "refresh_token": None, "expires_in": None}
    if not all([client_id, client_secret, refresh_token]):
        result["message"] = "missing client_id / client_secret / refresh_token"
        return result
    try:
        resp = requests.post(
            LINKEDIN_OAUTH,
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
            timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            result["ok"] = True
            result["access_token"] = data.get("access_token")
            result["refresh_token"] = data.get("refresh_token") or refresh_token
            result["expires_in"] = data.get("expires_in")
            result["message"] = "refresh succeeded"
        else:
            result["message"] = resp.text[:300]
    except Exception as e:
        result["message"] = f"network error: {e}"
    return result


def sync_linkedin_tokens(access_token: str, refresh_token: str, expires_in: Optional[int] = None) -> bool:
    """Write a fresh token set into every LinkedIn store. True if anything changed."""
    if not access_token:
        return False
    expires_at = now() + timedelta(seconds=expires_in) if expires_in else None
    changed = False

    updates = {"LINKEDIN_ACCESS_TOKEN": access_token}
    if refresh_token:
        updates["LINKEDIN_REFRESH_TOKEN"] = refresh_token
    for ef in ENV_FILES:
        try:
            changed |= write_env(ef, updates, insert_comment="auto-renewed by token_manager.py")
        except Exception as e:
            logger.error(f"env write failed {ef}: {e}")

    session = load_json(LINKEDIN_SESSION)
    session["access_token"] = access_token
    session["refresh_token"] = refresh_token or session.get("refresh_token", "")
    session["expires_at"] = ts(expires_at) if expires_at else session.get("expires_at")
    session["saved_at"] = ts(now())
    changed |= save_json(LINKEDIN_SESSION, session)

    config = load_json(LINKEDIN_CONFIG)
    config["access_token"] = access_token
    changed |= save_json(LINKEDIN_CONFIG, config)
    return changed


# ── Meta (Facebook / Instagram) helpers ──────────────────────────────────────

def collect_meta() -> Dict[str, Any]:
    env = {}
    for ef in ENV_FILES:
        env.update(read_env(ef))
    fb_config = load_json(FACEBOOK_CONFIG)
    ig_config = load_json(INSTAGRAM_CONFIG)

    page_token = fb_config.get("page_access_token") or ig_config.get("page_access_token") or ""
    user_token = fb_config.get("user_access_token") or ""
    system_token = env.get("META_SYSTEM_USER_TOKEN") or ""
    insta_token = env.get("INSTAGRAM_ACCESS_TOKEN") or page_token

    return {
        "page_id": env.get("FACEBOOK_PAGE_ID") or fb_config.get("page_id") or "",
        "ig_account_id": env.get("INSTAGRAM_ACCOUNT_ID") or ig_config.get("instagram_business_account_id") or "",
        "system_token": system_token,
        "user_token": user_token,
        "page_token": page_token,
        "insta_token": insta_token,
    }


def graph_get(path: str, token: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    try:
        p = {"access_token": token}
        if params:
            p.update(params)
        resp = requests.get(f"{GRAPH}/{path}", params=p, timeout=20)
        return {"status_code": resp.status_code, "data": resp.json() if resp.text else {}}
    except Exception as e:
        return {"status_code": None, "data": {"error": str(e)}}


def graph_post(path: str, token: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    try:
        p = {"access_token": token}
        if params:
            p.update(params)
        resp = requests.post(f"{GRAPH}/{path}", data=p, timeout=20)
        return {"status_code": resp.status_code, "data": resp.json() if resp.text else {}}
    except Exception as e:
        return {"status_code": None, "data": {"error": str(e)}}


def extract_error(result: Dict[str, Any]) -> str:
    data = result.get("data", {})
    err = data.get("error", {}) if isinstance(data, dict) else {}
    if isinstance(err, dict) and err.get("message"):
        return err["message"]
    return str(data)[:300]


def sync_meta_tokens(page_token: str, user_token: str = "", insta_token: str = "") -> bool:
    """Push a page token into every Meta store. True if anything changed.

    `insta_token` is what socialMediaService.js actually reads
    (INSTAGRAM_ACCESS_TOKEN); the old code skipped the env write whenever it
    equalled the page token, which is exactly the case we want written.
    """
    changed = False

    fb = load_json(FACEBOOK_CONFIG)
    if user_token:
        fb["user_access_token"] = user_token
    if page_token:
        fb["page_access_token"] = page_token
    changed |= save_json(FACEBOOK_CONFIG, fb)

    ig = load_json(INSTAGRAM_CONFIG)
    if page_token:
        ig["page_access_token"] = page_token
    changed |= save_json(INSTAGRAM_CONFIG, ig)

    updates = {}
    token_for_env = insta_token or page_token
    if token_for_env:
        updates["INSTAGRAM_ACCESS_TOKEN"] = token_for_env
    if updates:
        for ef in ENV_FILES:
            try:
                changed |= write_env(ef, updates, insert_comment="auto-renewed by token_manager.py")
            except Exception as e:
                logger.error(f"env write failed {ef}: {e}")
    return changed


# ── Alerts ───────────────────────────────────────────────────────────────────

def alert_allowed(state: Dict[str, Any], platform: str) -> bool:
    """True if we have not already alerted about this platform recently."""
    last = parse_dt(state.get("alerts", {}).get(platform))
    return last is None or (now() - last) >= timedelta(hours=ALERT_COOLDOWN_HOURS)


def mark_alerted(state: Dict[str, Any], platform: str) -> None:
    state.setdefault("alerts", {})[platform] = ts(now())


def drop_alert(platform: str, subject: str, body: str) -> None:
    fname = NEEDS_ACTION_DIR / f"TOKEN_ALERT_{platform.upper()}_{now().strftime('%Y%m%d_%H%M%S')}.md"
    content = (
        "---\n"
        "type: token_alert\n"
        f"platform: {platform}\n"
        f"created: {now().isoformat()}\n"
        "priority: high\n"
        "---\n\n"
        f"# Token Alert: {subject}\n\n{redact(body)}\n"
    )
    fname.write_text(content, encoding="utf-8")
    logger.warning(f"⚠ alert written: {fname.name}")
    return


# ── Platform checks ──────────────────────────────────────────────────────────

def check_linkedin() -> Dict[str, Any]:
    info = collect_linkedin()
    expires_at = info["expires_at"]
    test = linkedin_test(info["access_token"])

    # days_left used to be None whenever the token was already invalid — which
    # is precisely when we want to say how long it has been dead.
    days_left = (expires_at - now()).days if expires_at else None

    return {
        "platform": "linkedin",
        "ok": test["ok"],
        "network_error": test["network_error"],
        "message": test["message"],
        "has_refresh": bool(info["refresh_token"]),
        "expires_at": ts(expires_at),
        "days_left": days_left,
        "token_masked": mask(info["access_token"]),
    }


def check_meta_page(system_token: str, page_id: str, pull_page_token: bool = False) -> Dict[str, Any]:
    """Validate the system-user token; optionally mint a fresh page token.

    Minting is opt-in because Graph returns a *different* token string on every
    call. Pulling one unconditionally made "nothing changed" impossible to
    detect: every run rewrote .env and would have bounced PM2 every 6 hours.
    Only mint when the token we already hold has actually stopped working.
    """
    result = {"system_ok": False, "system_message": "", "page_token": None,
              "page_token_fresh": None, "network_error": False}

    if not system_token:
        result["system_message"] = "META_SYSTEM_USER_TOKEN not set"
        return result

    me = graph_get("me", system_token, {"fields": "id,name"})
    result["system_ok"] = me.get("status_code") == 200
    if not result["system_ok"]:
        code = me.get("status_code")
        result["network_error"] = code is None or code in TRANSIENT_HTTP
    result["system_message"] = "valid" if result["system_ok"] else redact(extract_error(me))
    if result["system_ok"]:
        name = me.get("data", {}).get("name", "")
        result["system_message"] = f"valid — {name}"

    if pull_page_token and result["system_ok"] and page_id:
        page = graph_get(page_id, system_token, {"fields": "access_token"})
        if page.get("status_code") == 200 and page.get("data", {}).get("access_token"):
            result["page_token"] = page["data"]["access_token"]
            result["page_token_fresh"] = True
        else:
            result["page_token_error"] = redact(extract_error(page))
    return result


def check_instagram(insta_token: str, ig_account_id: str) -> Dict[str, Any]:
    """Verify the IG business account is reachable with the token we publish with.

    The old /me fallback made a broken Instagram look healthy: a page token
    answers GET /me with the *page*, so it returned 200 and we reported "valid"
    while every IG publish kept failing. There is no fallback now — either the
    IG account id resolves with this token or the check fails.
    """
    result = {"ok": False, "message": "", "account": "", "network_error": False}
    if not insta_token:
        result["message"] = "no token"
        return result
    if not ig_account_id:
        result["message"] = "INSTAGRAM_ACCOUNT_ID not set — cannot verify the IG account"
        return result

    me = graph_get(ig_account_id, insta_token, {"fields": "id,username,media_count"})
    code = me.get("status_code")
    if code == 200:
        data = me.get("data", {})
        result["ok"] = True
        result["account"] = data.get("username", "")
        result["message"] = f"valid — @{result['account']}"
    else:
        result["network_error"] = code is None or code in TRANSIENT_HTTP
        result["message"] = redact(extract_error(me))
    return result


# ── Main flows ───────────────────────────────────────────────────────────────

def cmd_status() -> None:
    state = load_state()
    print("=" * 70)
    print("🔐 SOCIAL MEDIA TOKEN STATUS")
    print(f"   Last check: {state.get('last_check', 'never')}")
    print("=" * 70)

    linkedin = collect_linkedin()
    print("\n[LinkedIn]")
    print(f"  access token : {mask(linkedin['access_token'])}")
    print(f"  refresh token: {'SET' if linkedin['refresh_token'] else 'NOT SET ⚠'}")
    print(f"  client id    : {linkedin['client_id'] or '(none)'}")
    print(f"  person urn   : {linkedin['person_urn'] or '(none)'}")
    if linkedin["expires_at"]:
        days = (linkedin["expires_at"] - now()).days
        print(f"  expiry       : {linkedin['expires_at']} ({days} days left)")
    else:
        print("  expiry       : unknown (no session file)")
    if not linkedin["refresh_token"]:
        print("  ⚠ no refresh token — this token CANNOT be auto-renewed;")
        print("    run `python3 renew_linkedin_token.py` before it expires")

    meta = collect_meta()
    print("\n[Facebook]")
    print(f"  system user token: {mask(meta['system_token'])}")
    print(f"  page id          : {meta['page_id'] or '(none)'}")
    print("\n[Instagram]")
    print(f"  account id  : {meta['ig_account_id'] or '(none)'}")
    print(f"  token       : {mask(meta['insta_token'])}")

    if state:
        print("\n[Last check results]")
        for k, v in state.get("checks", {}).items():
            ok = "✅" if isinstance(v, dict) and v.get("ok") else "❌"
            msg = v.get("message", "") if isinstance(v, dict) else ""
            print(f"  {ok} {k}: {msg}")


def reload_consumers() -> None:
    """Ask the node services to pick up the new .env.

    PM2 caches the environment it started with, so a renewed token sitting in
    .env changes nothing until the process is restarted. Opt-in, because a
    restart is not something a cron job should do behind the owner's back.
    """
    if os.getenv("TOKEN_MANAGER_PM2_RELOAD", "").strip().lower() not in ("1", "true", "yes"):
        logger.info("tokens changed — set TOKEN_MANAGER_PM2_RELOAD=1 to auto-restart PM2 apps")
        return
    import subprocess
    apps = os.getenv("TOKEN_MANAGER_PM2_APPS", "all").split(",")
    for app in [a.strip() for a in apps if a.strip()]:
        try:
            subprocess.run(["pm2", "restart", app, "--update-env"], check=False, timeout=60)
            logger.info(f"pm2 restart {app} --update-env issued")
        except Exception as e:
            logger.error(f"pm2 restart {app} failed: {e}")


def cmd_check(alert: bool = False) -> int:
    checks = {}
    failing = []   # token is genuinely bad — needs renewal or re-auth
    unknown = []   # we could not reach the API; say so instead of crying wolf
    warnings = []  # still valid, but expiring and not auto-renewable
    changed = False

    # LinkedIn
    li = check_linkedin()
    checks["linkedin"] = li
    if not li["ok"]:
        (unknown if li.get("network_error") else failing).append("linkedin")
    elif not li["has_refresh"] and li["days_left"] is not None and li["days_left"] <= EXPIRY_WARN_DAYS:
        # No refresh token means nothing can save this automatically; the owner
        # needs lead time, not a post-mortem after posting starts failing.
        warnings.append("linkedin")

    # Meta system token + page token
    meta = collect_meta()
    page_check = check_meta_page(meta["system_token"], meta["page_id"])
    checks["facebook_system"] = {
        "ok": page_check["system_ok"],
        "network_error": page_check["network_error"],
        "message": page_check["system_message"],
        "token_masked": mask(meta["system_token"]),
    }
    if not page_check["system_ok"]:
        (unknown if page_check["network_error"] else failing).append("facebook_system")

    # Instagram: test the token we actually publish with, and only rotate it if
    # that token is genuinely dead.
    ig = check_instagram(meta["insta_token"], meta["ig_account_id"])
    if not ig["ok"] and not ig["network_error"] and page_check["system_ok"] and meta["page_id"]:
        logger.info(f"Instagram token rejected ({ig['message']}) — minting a fresh page token")
        pull = check_meta_page(meta["system_token"], meta["page_id"], pull_page_token=True)
        if pull["page_token_fresh"]:
            changed |= sync_meta_tokens(page_token=pull["page_token"], insta_token=pull["page_token"])
            ig = check_instagram(pull["page_token"], meta["ig_account_id"])
            checks["facebook_page_refresh"] = {
                "ok": ig["ok"],
                "message": "page token rotated" if ig["ok"] else "rotated, still failing",
            }
        else:
            checks["facebook_page_refresh"] = {
                "ok": False,
                "message": pull.get("page_token_error", "could not mint page token"),
            }
    checks["instagram"] = ig
    if not ig["ok"]:
        (unknown if ig.get("network_error") else failing).append("instagram")

    state = load_state()
    state["last_check"] = ts(now())
    state["checks"] = checks
    state["failing"] = failing
    state["unknown"] = unknown

    print("=" * 70)
    print("🔍 LIVE TOKEN CHECK")
    print("=" * 70)
    for name, c in checks.items():
        ok = "✅" if c.get("ok") else ("⚠" if c.get("network_error") else "❌")
        print(f"  {ok} {name}: {c.get('message', '')}")
    for name in warnings:
        c = checks.get(name, {})
        print(f"  ⚠ {name}: valid but expires in {c.get('days_left')} day(s) and has no refresh token")
    print("=" * 70)

    if alert:
        for platform in failing + warnings:
            if not alert_allowed(state, platform):
                logger.info(f"alert for {platform} suppressed (cooldown {ALERT_COOLDOWN_HOURS}h)")
                continue
            c = checks.get(platform, {})
            expiring = platform in warnings
            days_left = c.get("days_left")
            expiry = c.get("expires_at") or "unknown"
            if days_left is not None:
                expiry = f"{expiry} ({days_left} days left)"
            body = (
                f"- Platform: {platform}\n"
                f"- Health : {c.get('message', '')}\n"
                f"- Token  : {c.get('token_masked', '(none)')}\n"
                f"- Expires: {expiry}\n\n"
                "```\n"
                "python3 renew_linkedin_token.py       # LinkedIn\n"
                "python3 renew_meta_tokens.py          # Facebook / Instagram\n"
                "```"
            )
            subject = "token expiring soon" if expiring else "token needs attention"
            drop_alert(platform, subject, body)
            mark_alerted(state, platform)

    write_state(state)

    if changed:
        reload_consumers()

    if unknown:
        print(f"⚠ {len(unknown)} unreachable (network/API): {', '.join(unknown)}")
    if failing:
        print(f"❌ {len(failing)} failing: {', '.join(failing)}")
        return 1
    if warnings:
        print(f"⚠ {len(warnings)} expiring soon: {', '.join(warnings)}")
        return 0
    if unknown:
        return 0
    print("✅ All tokens valid")
    return 0


def cmd_renew() -> int:
    logger.info("Starting token renewal pass...")
    renewed = []
    failed = []
    manual = []
    skipped = []   # unreachable this run — say so instead of claiming "healthy"
    changed = False

    # ── LinkedIn ──────────────────────────────────────────────────────────────
    li = collect_linkedin()
    test = linkedin_test(li["access_token"])
    expires_at = li["expires_at"]
    days_left = (expires_at - now()).days if expires_at else None
    expiring = days_left is not None and days_left <= RENEW_WINDOW_DAYS
    dead = (not test["ok"]) and not test["network_error"]

    if test["network_error"]:
        # LinkedIn unreachable: refreshing now would burn the refresh token on a
        # request that may not even land. Try again next run.
        logger.warning(f"LinkedIn unreachable, skipping renewal: {test['message']}")
        skipped.append("linkedin (unreachable)")
    elif not li["refresh_token"]:
        # The old code only refreshed when the token was still *valid*, so a dead
        # token was never renewed — the one case auto-renewal exists for.
        msg = "LinkedIn has NO refresh_token — manual re-auth required (python3 renew_linkedin_token.py)"
        logger.warning(msg)
        if dead or expiring:
            manual.append(msg)
        else:
            logger.info(f"LinkedIn token still valid ({days_left} days left)")
    elif dead or expiring or not expires_at:
        why = "invalid" if dead else f"expiring in {days_left}d"
        logger.info(f"LinkedIn token {why} — refreshing via refresh_token...")
        rr = linkedin_refresh(li["client_id"], li["client_secret"], li["refresh_token"])
        if rr["ok"]:
            changed |= sync_linkedin_tokens(rr["access_token"], rr["refresh_token"], rr["expires_in"])
            renewed.append("linkedin")
            logger.info(f"✅ LinkedIn refreshed (expires_in={rr['expires_in']})")
        else:
            failed.append(f"linkedin refresh: {redact(rr['message'])}")
    else:
        logger.info(f"LinkedIn token healthy ({days_left} days left), skipping refresh")

    # ── Meta ──────────────────────────────────────────────────────────────────
    meta = collect_meta()
    page = check_meta_page(meta["system_token"], meta["page_id"])
    if page["network_error"]:
        logger.warning(f"Meta unreachable, skipping renewal: {page['system_message']}")
        skipped.append("meta (unreachable)")
    elif not page["system_ok"]:
        # The system-user token is the root of the Meta chain; nothing can mint
        # a page token without it, so this is always a human hand-off.
        manual.append(
            f"meta system-user token invalid ({page['system_message']}) — "
            "run python3 auto_setup_facebook.py"
        )
    else:
        ig = check_instagram(meta["insta_token"], meta["ig_account_id"])
        if ig["ok"]:
            logger.info("Meta page/IG token still valid, no rotation needed")
        elif ig["network_error"]:
            logger.warning(f"Instagram unreachable, skipping rotation: {ig['message']}")
            skipped.append("instagram (unreachable)")
        else:
            pull = check_meta_page(meta["system_token"], meta["page_id"], pull_page_token=True)
            if pull["page_token_fresh"]:
                changed |= sync_meta_tokens(page_token=pull["page_token"], insta_token=pull["page_token"])
                verify = check_instagram(pull["page_token"], meta["ig_account_id"])
                if verify["ok"] or not meta["ig_account_id"]:
                    renewed.append("facebook/instagram page token")
                    logger.info("✅ Meta page token regenerated from system-user token")
                else:
                    failed.append(f"meta page token rotated but IG still failing: {verify['message']}")
            else:
                failed.append(f"meta page token mint failed: {pull.get('page_token_error', 'unknown')}")

    if changed:
        reload_consumers()

    print("=" * 70)
    print("🔄 TOKEN RENEWAL RESULTS")
    print("=" * 70)
    for r in renewed:
        print(f"  ✅ renewed: {r}")
    for m in manual:
        print(f"  ⚠ manual action: {m}")
    for f in failed:
        print(f"  ❌ {f}")
    for s in skipped:
        print(f"  ⏭ skipped: {s}")
    if not renewed and not failed and not manual and not skipped:
        print("  Nothing to renew — all healthy")
    print("=" * 70)

    if failed:
        return 1
    # 2 = nothing is broken in code, a human has to re-auth. Kept distinct from 1
    # so cron logs and monitors can tell a bug from an expected hand-off.
    return 2 if manual else 0


def cmd_watch(interval_minutes: int = 480) -> None:
    logger.info(f"Watch mode: checking every {interval_minutes} minutes")
    while True:
        try:
            # Watch used to only check — it never renewed anything, despite the
            # docstring promising "renewing only when needed".
            cmd_renew()
            cmd_check(alert=True)
        except KeyboardInterrupt:
            logger.info("watch stopped")
            return
        except Exception as e:
            logger.error(f"watch iteration error: {e}")
        try:
            time.sleep(interval_minutes * 60)
        except KeyboardInterrupt:
            logger.info("watch stopped")
            return


def main() -> int:
    parser = argparse.ArgumentParser(description="Social media token manager")
    parser.add_argument("command", nargs="?", default="status", choices=["status", "check", "renew", "watch"])
    parser.add_argument("--interval", type=int, default=480, help="watch interval in minutes (default 480 = 8h)")
    parser.add_argument("--alert", action="store_true", help="write Needs_Action alert on failure")
    args = parser.parse_args()

    if args.command == "status":
        cmd_status()
        return 0
    if args.command == "check":
        return cmd_check(alert=args.alert)
    if args.command == "renew":
        return cmd_renew()
    if args.command == "watch":
        cmd_watch(args.interval)
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())