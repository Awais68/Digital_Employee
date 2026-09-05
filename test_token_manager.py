#!/usr/bin/env python3
"""
test_token_manager.py — offline regression tests for the token auto-renew path.

No live API calls and no writes to the real .env: every store is redirected to a
temp dir and the Graph calls are stubbed. Run it after touching token_manager.py:

    PYTHONPATH=. python3 test_token_manager.py
"""
import sys, json, tempfile, shutil
from pathlib import Path
from datetime import datetime, timedelta
import token_manager as tm

tmpdir = Path(tempfile.mkdtemp())
tm.ENV_FILES = [tmpdir / ".env"]
tm.STATE_FILE = tmpdir / "state.json"
tm.FACEBOOK_CONFIG = tmpdir / "fb.json"
tm.INSTAGRAM_CONFIG = tmpdir / "ig.json"
tm.LINKEDIN_SESSION = tmpdir / "session.json"
tm.LINKEDIN_CONFIG = tmpdir / "li.json"
tm.NEEDS_ACTION_DIR = tmpdir / "na"; tm.NEEDS_ACTION_DIR.mkdir()
(tmpdir / ".env").write_text("FOO=bar\n")

fails = []
def eq(label, got, want):
    ok = got == want
    print(("  PASS " if ok else "  FAIL ") + label + f"  got={got!r} want={want!r}")
    if not ok: fails.append(label)

# 1. write_env is idempotent and never grows the file
print("[1] write_env idempotency")
env = tmpdir / ".env"
eq("first write changes", tm.write_env(env, {"A": "1"}, "marker"), True)
before = env.read_text()
eq("second identical write is a no-op", tm.write_env(env, {"A": "1"}, "marker"), False)
eq("file byte-identical", env.read_text(), before)
eq("empty updates skipped", tm.write_env(env, {}, "marker"), False)
eq("blank value skipped", tm.write_env(env, {"B": ""}, "marker"), False)
eq("marker appears once", env.read_text().count("# marker"), 1)

# 2. tz-aware vs naive no longer explodes
print("[2] parse_dt normalisation")
aware = tm.parse_dt("2026-10-05T01:23:13Z")
eq("returns naive", aware.tzinfo, None)
try:
    (aware - tm.now()).days
    print("  PASS subtraction works")
except TypeError as e:
    print("  FAIL subtraction", e); fails.append("tz subtraction")
eq("quoted/garbage -> None", tm.parse_dt("not-a-date"), None)

# 3. read_env strips quotes and `export `
print("[3] read_env parsing")
(tmpdir / "q.env").write_text('export TOK="abc123"\nPLAIN=xyz\n')
parsed = tm.read_env(tmpdir / "q.env")
eq("export prefix stripped", parsed.get("TOK"), "abc123")
eq("plain value", parsed.get("PLAIN"), "xyz")

# 4. Instagram check no longer falls back to /me
print("[4] instagram check has no /me false positive")
calls = []
def fake_graph_get(path, token, params=None):
    calls.append(path)
    return {"status_code": 400, "data": {"error": {"message": "Invalid OAuth token"}}}
orig_get = tm.graph_get
tm.graph_get = fake_graph_get
res = tm.check_instagram("EAAtoken", "17841451263132127")
eq("reports failure", res["ok"], False)
eq("only the IG account was queried", calls, ["17841451263132127"])
eq("not flagged as network error", res["network_error"], False)

# 5. transport failure is 'unknown', not 'token is dead'
print("[5] network error classification")
tm.graph_get = lambda path, token, params=None: {"status_code": None, "data": {"error": "timeout"}}
res = tm.check_instagram("EAAtoken", "ig123")
eq("network_error set", res["network_error"], True)
tm.graph_get = orig_get

# 6. alert cooldown
print("[6] alert cooldown")
state = {}
eq("first alert allowed", tm.alert_allowed(state, "linkedin"), True)
tm.mark_alerted(state, "linkedin")
eq("immediate repeat suppressed", tm.alert_allowed(state, "linkedin"), False)
state["alerts"]["linkedin"] = tm.ts(tm.now() - timedelta(hours=tm.ALERT_COOLDOWN_HOURS + 1))
eq("allowed again after cooldown", tm.alert_allowed(state, "linkedin"), True)

# 7. secrets never reach an alert file
print("[7] redaction")
leaked = "error for EAASEyauPlAbCdEf0123456789ABCDEFabcdefGHIJ"
eq("meta token redacted", "EAASEyauPl" in tm.redact(leaked), False)
eq("linkedin token redacted", "AQUlF2QFak" in tm.redact("bad AQUlF2QFakXXXXXXXXXXXXXXXXXXXXXXXX"), False)

# 8. atomic_write follows symlinks instead of replacing them
print("[8] symlink safety")
target = tmpdir / "real.env"; target.write_text("K=v\n")
link = tmpdir / "link.env"; link.symlink_to(target)
tm.atomic_write(link, "K=v2\n")
eq("link is still a symlink", link.is_symlink(), True)
eq("target got the write", target.read_text(), "K=v2\n")

shutil.rmtree(tmpdir)
print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
