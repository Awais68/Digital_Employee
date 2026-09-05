#!/usr/bin/env python3
"""
apply_dedup_fixes.py
=====================
Fixes the LinkedIn duplicate-post incident (2026-07-23/24) root causes:

  Fix 1 — Publish-time dedup guard (publish_post.py)
          Computes a content hash (caption + image) before calling
          linkedin_mcp.create_post(). If that hash was already
          successfully published, the call is skipped and logged.
          Store: local JSON file `published_hashes.json` (no DB
          migration, no production DB write — per your protocol,
          DB schema changes need separate explicit approval).

  Fix 2 — Draft-creation dedupe (routes/social.js, POST /post)
          If identical content+image was submitted in the last
          5 minutes, the new draft is skipped (existing draft
          reused) instead of creating a duplicate .md file.

  Fix 3 — Image URL bug (socialMediaService.js, postToLinkedIn)
          Guards against a local filesystem path being sent to
          LinkedIn as image_url (root cause of the 00:39:05
          "Urn doesn't start with 'urn:'" failure). Forces the
          URL through getPublicImageUrl() and validates it starts
          with http before the API call.

SAFETY PROTOCOL (matches your established discipline):
  1. Every touched file is backed up first: <file>.bak.<timestamp>
  2. Each patch uses an anchor search. If the anchor is NOT found
     exactly once, NOTHING is written to that file — instead a
     "MANUAL PATCH NEEDED" block is printed with the exact snippet
     to paste by hand.
  3. After patching, py_compile / `node -c` syntax-checks the file.
     If the syntax check fails, the file is restored from backup
     and the failure is reported.
  4. A unified diff is printed for every file actually changed.
  5. This script NEVER touches PM2, NEVER restarts anything, and
     NEVER writes to Postgres. Those steps are separate, manual,
     and require your explicit go-ahead as usual.

USAGE:
    python3 apply_dedup_fixes.py --root /path/to/Digital_Employee

    Add --apply to actually write changes. Without --apply it just
    runs discovery + dry-run (shows what WOULD happen), same as
    your normal "propose fix" step before approval.

    python3 apply_dedup_fixes.py --root /path/to/Digital_Employee --apply
"""

import argparse
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TS = datetime.now().strftime("%Y%m%d_%H%M%S")


# =============================================================================
# helpers
# =============================================================================

def find_one(root: Path, filename: str):
    """rglob for filename under root. Returns Path or None. Prints all
    matches if more than one is found (ambiguous -> caller should abort)."""
    matches = [p for p in root.rglob(filename) if "node_modules" not in p.parts and ".bak." not in p.name]
    if len(matches) == 0:
        return None
    if len(matches) > 1:
        print(f"  ! AMBIGUOUS: found {len(matches)} files named {filename}:")
        for m in matches:
            print(f"      {m}")
        print("    -> Skipping auto-patch for this file. Use --override-<name> to pin the exact path.")
        return "AMBIGUOUS"
    return matches[0]


def backup(path: Path):
    bak = path.with_name(path.name + f".bak.{TS}")
    shutil.copy2(path, bak)
    return bak


def show_diff(before: str, after: str, path: Path):
    diff = difflib.unified_diff(
        before.splitlines(keepends=True),
        after.splitlines(keepends=True),
        fromfile=str(path) + " (before)",
        tofile=str(path) + " (after)",
    )
    text = "".join(diff)
    print(text if text else "  (no textual diff produced)")


def syntax_check(path: Path) -> bool:
    if path.suffix == ".py":
        r = subprocess.run([sys.executable, "-m", "py_compile", str(path)], capture_output=True, text=True)
    elif path.suffix == ".js":
        r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    else:
        return True
    if r.returncode != 0:
        print(f"  ! SYNTAX CHECK FAILED for {path}:")
        print("   ", r.stderr.strip().replace("\n", "\n    "))
        return False
    return True


def leading_ws(line: str) -> str:
    m = re.match(r"[ \t]*", line)
    return m.group(0) if m else ""


def count_occurrences(text: str, pattern: str) -> int:
    return len(re.findall(pattern, text))


# =============================================================================
# Fix 1: publish_post.py dedup guard
# =============================================================================

DEDUP_MODULE_NAME = "dedup_guard.py"

DEDUP_MODULE_SRC = '''"""
dedup_guard.py — content-hash dedup for social publishing.
Created by apply_dedup_fixes.py on {ts}.

Store: JSON file next to this module, published_hashes.json.
Not a DB table on purpose — avoids an unreviewed production DB
migration. If you later want it in Postgres, promote this store
behind the same function signatures.
"""
import hashlib
import json
import os
import time
from pathlib import Path

_STORE_PATH = Path(__file__).parent / "published_hashes.json"


def _load_store() -> dict:
    if not _STORE_PATH.exists():
        return {{}}
    try:
        with open(_STORE_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {{}}


def _save_store(store: dict):
    tmp = _STORE_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(store, f, indent=2)
    os.replace(tmp, _STORE_PATH)


def compute_hash(caption: str, image_ref: str) -> str:
    """caption: post text. image_ref: local path OR URL OR filename —
    whatever uniquely identifies the image used for this post."""
    norm_caption = " ".join((caption or "").split()).strip().lower()
    norm_image = (image_ref or "").strip().lower()
    raw = f"{{norm_caption}}|{{norm_image}}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def already_published(caption: str, image_ref: str, platform: str) -> dict | None:
    """Returns the existing record if this exact content+image was
    already successfully published to this platform, else None."""
    store = _load_store()
    h = compute_hash(caption, image_ref)
    key = f"{{platform}}:{{h}}"
    return store.get(key)


def register_published(caption: str, image_ref: str, platform: str, post_url: str):
    store = _load_store()
    h = compute_hash(caption, image_ref)
    key = f"{{platform}}:{{h}}"
    store[key] = {{
        "post_url": post_url,
        "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }}
    _save_store(store)
'''.format(ts=TS)


def patch_fix1(root: Path, apply: bool, override: Path | None):
    print("\\n== Fix 1: publish-time dedup guard ==")
    target = override or find_one(root, "publish_post.py")
    if target is None:
        print("  ! publish_post.py not found under root. Skipping Fix 1.")
        print("    -> Pass --publish-post-path if it lives somewhere rglob won't reach.")
        return
    if target == "AMBIGUOUS":
        return

    module_dir = target.parent
    module_path = module_dir / DEDUP_MODULE_NAME

    print(f"  Target: {target}")
    print(f"  Will create: {module_path}")

    if apply:
        if module_path.exists():
            print(f"  - {DEDUP_MODULE_NAME} already exists at destination, leaving it untouched.")
        else:
            module_path.write_text(DEDUP_MODULE_SRC)
            print(f"  + created {module_path}")

    original = target.read_text()

    # Anchor: the exact line that calls linkedin_mcp.create_post(
    anchor_pattern = r"^([ \t]*)(.*linkedin_mcp\.create_post\([^\n]*)$"
    matches = list(re.finditer(anchor_pattern, original, flags=re.MULTILINE))

    if len(matches) != 1:
        print(f"  ! Anchor 'linkedin_mcp.create_post(' found {len(matches)} time(s), expected exactly 1.")
        print("    MANUAL PATCH NEEDED — add near the top of publish_post.py:")
        print("        from dedup_guard import already_published, register_published")
        print("    Then, immediately BEFORE the linkedin_mcp.create_post(...) call, add:")
        print("        _dup = already_published(caption, image_path, \"linkedin\")")
        print("        if _dup:")
        print("            print(f\"SKIPPED_DUPLICATE: already published as {_dup['post_url']}\")")
        print("        else:")
        print("            <existing create_post(...) call, indented one level>")
        print("            register_published(caption, image_path, \"linkedin\", result_url)")
        print("    (swap `caption` / `image_path` / `result_url` for your actual variable names)")
        return

    ws = leading_ws(matches[0].group(0))
    call_line = matches[0].group(0)

    import_line = "from dedup_guard import already_published, register_published\n"
    needs_import = "from dedup_guard import" not in original

    guard_before = (
        f"{ws}_dup_record = already_published(caption, image_path, \"linkedin\")\n"
        f"{ws}if _dup_record:\n"
        f"{ws}    print(f\"SKIPPED_DUPLICATE: content already published as \"\n"
        f"{ws}          f\"{{_dup_record['post_url']}}\")\n"
        f"{ws}else:\n"
    )
    indented_call = ws + "    " + call_line.lstrip()

    new_block = guard_before + indented_call
    new_content = original.replace(call_line, new_block, 1)

    if needs_import:
        # insert import after the last top-of-file import line, fallback to prepend
        import_matches = list(re.finditer(r"^(import .*|from .* import .*)$", new_content, flags=re.MULTILINE))
        if import_matches:
            last = import_matches[-1]
            insert_at = last.end()
            new_content = new_content[:insert_at] + "\n" + import_line.rstrip("\n") + new_content[insert_at:]
        else:
            new_content = import_line + new_content

    print(f"  Anchor matched once at indentation '{ws}'. Proposed change:")
    show_diff(original, new_content, target)

    print("  NOTE: this wraps the create_post(...) call in an else-branch.")
    print("        You must confirm `caption` and `image_path` are the correct")
    print("        variable names in scope at that point in your real file —")
    print("        review the diff above before trusting it blindly.")

    if apply:
        bak = backup(target)
        target.write_text(new_content)
        if syntax_check(target):
            print(f"  + patched {target} (backup: {bak})")
        else:
            shutil.copy2(bak, target)
            print(f"  ! syntax check failed — restored {target} from backup")


# =============================================================================
# Fix 2: draft-creation dedupe in routes/social.js POST /post
# =============================================================================

def patch_fix2(root: Path, apply: bool, override: Path | None):
    print("\\n== Fix 2: draft-creation dedupe (5 min window) ==")
    target = override or find_one(root, "social.js")
    if target is None:
        print("  ! social.js not found under root. Skipping Fix 2.")
        return
    if target == "AMBIGUOUS":
        return

    print(f"  Target: {target}")
    original = target.read_text()

    anchor_pattern = r"router\.post\(\s*['\"]\/post['\"][^\{]*\{"
    matches = list(re.finditer(anchor_pattern, original))

    if len(matches) != 1:
        print(f"  ! Anchor \"router.post('/post', ...)\" found {len(matches)} time(s), expected exactly 1.")
        print("    MANUAL PATCH NEEDED — near the top of the route handler body, add:")
        print("        const crypto = require('crypto');")
        print("        const contentHash = crypto.createHash('sha256')")
        print("          .update((caption || '').trim().toLowerCase() + '|' + (imagePath || '').toLowerCase())")
        print("          .digest('hex');")
        print("        const fiveMinAgo = Date.now() - 5 * 60 * 1000;")
        print("        const recentDup = recentDrafts.find(d =>")
        print("          d.contentHash === contentHash && d.createdAt > fiveMinAgo);")
        print("        if (recentDup) {")
        print("          return res.json({ success: true, reused: true, draft: recentDup });")
        print("        }")
        print("    (you'll need a small in-memory or file-backed `recentDrafts` list —")
        print("     tell me your actual draft-storage shape and I'll wire this exactly)")
        return

    ws = leading_ws(original[:matches[0].start()].splitlines()[-1] if "\n" in original[:matches[0].start()] else "")
    insert_at = matches[0].end()

    guard = (
        "\n"
        f"{ws}    // --- dedup guard (added {TS}) ---\n"
        f"{ws}    const _crypto = require('crypto');\n"
        f"{ws}    const _contentHash = _crypto.createHash('sha256')\n"
        f"{ws}      .update(((req.body.caption || req.body.content || '')).trim().toLowerCase()\n"
        f"{ws}        + '|' + ((req.body.imagePath || req.body.image || '')).toLowerCase())\n"
        f"{ws}      .digest('hex');\n"
        f"{ws}    global.__recentDraftHashes = global.__recentDraftHashes || new Map();\n"
        f"{ws}    const _now = Date.now();\n"
        f"{ws}    for (const [h, t] of global.__recentDraftHashes) {{\n"
        f"{ws}      if (_now - t > 5 * 60 * 1000) global.__recentDraftHashes.delete(h);\n"
        f"{ws}    }}\n"
        f"{ws}    if (global.__recentDraftHashes.has(_contentHash)) {{\n"
        f"{ws}      return res.json({{\n"
        f"{ws}        success: true,\n"
        f"{ws}        skipped: true,\n"
        f"{ws}        reason: 'duplicate_submit_within_5min'\n"
        f"{ws}      }});\n"
        f"{ws}    }}\n"
        f"{ws}    global.__recentDraftHashes.set(_contentHash, _now);\n"
        f"{ws}    // --- end dedup guard ---\n"
    )

    new_content = original[:insert_at] + guard + original[insert_at:]

    print("  Anchor matched once. Proposed change:")
    show_diff(original, new_content, target)
    print("  NOTE: this uses an in-memory Map keyed by process — good enough for a")
    print("        single-instance PM2 fork, but resets on restart. If you want it")
    print("        to survive restarts, say so and I'll back it with a small JSON file.")

    if apply:
        bak = backup(target)
        target.write_text(new_content)
        if syntax_check(target):
            print(f"  + patched {target} (backup: {bak})")
        else:
            shutil.copy2(bak, target)
            print(f"  ! syntax check failed — restored {target} from backup")


# =============================================================================
# Fix 3: image URL bug in socialMediaService.js
# =============================================================================

def patch_fix3(root: Path, apply: bool, override: Path | None):
    print("\\n== Fix 3: image URL guard in postToLinkedIn ==")
    target = override or find_one(root, "socialMediaService.js")
    if target is None:
        print("  ! socialMediaService.js not found under root. Skipping Fix 3.")
        return
    if target == "AMBIGUOUS":
        return

    print(f"  Target: {target}")
    original = target.read_text()

    anchor_pattern = r"(async\s+)?postToLinkedIn\s*\([^\)]*\)\s*\{"
    matches = list(re.finditer(anchor_pattern, original))

    if len(matches) != 1:
        print(f"  ! Anchor 'postToLinkedIn(...) {{' found {len(matches)} time(s), expected exactly 1.")
        print("    MANUAL PATCH NEEDED — right after the local image path / imageUrl")
        print("    variable is assigned and BEFORE it's sent to the LinkedIn API, add:")
        print("        if (imageUrl && !imageUrl.startsWith('http')) {")
        print("          imageUrl = await getPublicImageUrl(imageUrl);")
        print("        }")
        print("        if (imageUrl && !imageUrl.startsWith('http')) {")
        print("          throw new Error(")
        print("            `postToLinkedIn: image_url is not a public URL: ${imageUrl}`")
        print("          );")
        print("        }")
        return

    ws = leading_ws(original[:matches[0].start()].splitlines()[-1] if "\n" in original[:matches[0].start()] else "")
    insert_at = matches[0].end()

    guard = (
        "\n"
        f"{ws}  // --- image URL guard (added {TS}) ---\n"
        f"{ws}  // Root cause of 2026-07-23 00:39:05 failure: a local filesystem\n"
        f"{ws}  // path was sent to LinkedIn as image_url instead of a public URL.\n"
        f"{ws}  if (typeof imageUrl !== 'undefined' && imageUrl && !imageUrl.startsWith('http')) {{\n"
        f"{ws}    imageUrl = await getPublicImageUrl(imageUrl);\n"
        f"{ws}  }}\n"
        f"{ws}  if (typeof imageUrl !== 'undefined' && imageUrl && !imageUrl.startsWith('http')) {{\n"
        f"{ws}    throw new Error(`postToLinkedIn: image_url is not a public URL: ${{imageUrl}}`);\n"
        f"{ws}  }}\n"
        f"{ws}  // --- end image URL guard ---\n"
    )

    new_content = original[:insert_at] + guard + original[insert_at:]

    print("  Anchor matched once. Proposed change:")
    show_diff(original, new_content, target)
    print("  NOTE: this assumes the local var is named `imageUrl` and that")
    print("        `getPublicImageUrl` is already defined/imported in this file")
    print("        (per your investigation notes it is). Confirm both in the")
    print("        diff before applying — if the var name differs, tell me the")
    print("        real name and I'll regenerate the patch.")

    if apply:
        bak = backup(target)
        target.write_text(new_content)
        if syntax_check(target):
            print(f"  + patched {target} (backup: {bak})")
        else:
            shutil.copy2(bak, target)
            print(f"  ! syntax check failed — restored {target} from backup")


# =============================================================================
# main
# =============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True, help="Path to Digital_Employee project root")
    ap.add_argument("--apply", action="store_true", help="Actually write changes (default: dry-run only)")
    ap.add_argument("--publish-post-path", type=Path, default=None)
    ap.add_argument("--social-js-path", type=Path, default=None)
    ap.add_argument("--social-media-service-path", type=Path, default=None)
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"! root path does not exist: {root}")
        sys.exit(1)

    print(f"Project root: {root}")
    print(f"Mode: {'APPLY (writing changes)' if args.apply else 'DRY-RUN (no changes written)'}")
    print("All touched files get a timestamped .bak before any write.")
    print(f"Timestamp for this run: {TS}")

    patch_fix1(root, args.apply, args.publish_post_path)
    patch_fix2(root, args.apply, args.social_js_path)
    patch_fix3(root, args.apply, args.social_media_service_path)

    print("\\n" + "=" * 60)
    if args.apply:
        print("Done. Files with .bak.<timestamp> siblings were touched.")
        print("Next steps (manual, as usual):")
        print("  1. Review each diff above / `git diff` if this is a git repo")
        print("  2. pm2 restart digitalfte-server --update-env   (when you approve)")
        print("  3. Send a real test post to confirm dedup + image URL fix work")
    else:
        print("Dry-run complete. Re-run with --apply to write the changes shown above.")


if __name__ == "__main__":
    main()
