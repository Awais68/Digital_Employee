#!/usr/bin/env python3
"""
chatbot_send_email.py — JSON-in / JSON-out email sender for the dashboard chatbot.

The chatbot (Node, server/chatbotRouter.js) spawns this with a JSON payload on
stdin and reads a single JSON object from stdout. email_mcp.py's own CLI prints a
banner and free-form text, which is not machine-parseable — hence this wrapper.

Payload:
  {"to": "a@b.com", "subject": "...", "body": "...",
   "cc": null, "bcc": null, "is_html": false,
   "priority": "normal", "dry_run": false}

Output (stdout, always exactly one line of JSON):
  {"success": true, "message": "...", "to": "...", "dry_run": false}
"""
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def fail(message):
    print(json.dumps({"success": False, "error": message}))
    sys.exit(1)


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        fail("empty payload on stdin")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        fail(f"invalid JSON payload: {e}")

    to = (payload.get("to") or "").strip()
    subject = (payload.get("subject") or "").strip()
    body = payload.get("body") or ""

    if not to:
        fail("'to' (recipient address) is required")
    if "@" not in to:
        fail(f"'{to}' is not a valid email address")
    if not subject:
        fail("'subject' is required")
    if not body.strip():
        fail("'body' is required")

    try:
        from email_mcp import send_email
    except Exception as e:  # noqa: BLE001 - surface any import failure as JSON
        fail(f"could not load email_mcp: {e}")

    try:
        result = send_email(
            to=to,
            subject=subject,
            body=body,
            is_html=bool(payload.get("is_html")),
            cc=payload.get("cc") or None,
            bcc=payload.get("bcc") or None,
            priority=payload.get("priority") or "normal",
            dry_run=payload.get("dry_run"),
        )
    except Exception as e:  # noqa: BLE001 - SMTP/network errors -> JSON, not traceback
        fail(f"send failed: {e}")

    print(json.dumps({
        "success": bool(result.get("success")),
        "message": result.get("message", ""),
        "error": result.get("error"),
        "to": to,
        "subject": subject,
        "dry_run": bool(result.get("dry_run", payload.get("dry_run"))),
    }))


if __name__ == "__main__":
    main()
