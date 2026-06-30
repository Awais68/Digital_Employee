# Digital Employee — Agent Guide

## What this is

A file-based AI agent orchestration system ("Personal AI Employee Hackathon 2026"). Markdown files are the state carrier. Folders are workflow stages. No database, no API server for core logic.

## Project structure essentials

| Path | Purpose |
|---|---|
| `Needs_Action/` | Incoming task files (dropped by watchers) |
| `Plans/` | Generated action plans |
| `Pending_Approval/` | Drafts awaiting human review |
| `Approved/` | Human-approved, ready to execute |
| `Done/` | Completed/archived |
| `Rejected/` | Rejected drafts |
| `Logs/` | System logs + audit trail |
| `Agent_Skills/` | Skill definitions (markdown + Python) |
| `mcp_servers/` | MCP server implementations (facebook, instagram, linkedin) |
| `server/` | Chatbot backend (Node.js) |
| `vault-control/` | Vault web UI (Docker Compose stack) |

## Two execution paths

The system auto-selects via `smart_run.py` or `provider_config.py`:

- **Path A (Claude Code):** `claude` CLI + `.mcp.json` MCP servers + `.claude/hooks/stop.py` for Ralph Wiggum looping
- **Path B (API-only):** `universal_orchestrator.py` + `universal_tool_executor.py` — works with OpenAI, Gemini, or Anthropic API directly

Provider detection priority (`provider_config.py`): Claude Code CLI > Anthropic API > OpenAI > Gemini.

## Key commands

```bash
pip install -r requirements.txt          # install Python deps
npm install                               # install Node deps
python3 orchestrator.py                   # main orchestrator (Silver tier)
python3 smart_run.py                      # universal launcher (auto-detects provider)
python3 email_mcp.py test                 # test email connection
python3 linkedin_mcp.py test              # test LinkedIn connection
python3 ralph_wiggum.py -f Needs_Action/task.md  # autonomous loop
python3 setup_cron.py --start-tmux        # start background watchers
python3 run_silver_test.py                # test suite
python3 run_comprehensive_test.py         # full system test
```

## MCP servers (defined in `.mcp.json`)

- `email_mcp` — Node.js, Gmail API
- `linkedin-playwright` — Python, Playwright-based LinkedIn automation
- `odoo-gold-tier` — Python, Odoo JSON-RPC
- `facebook-mcp` — Node.js, Meta Graph API
- `instagram-mcp` — Node.js, Meta Graph API
- `canva-mcp` — remote, Canva MCP

All `.mcp.json` paths are **absolute** (hardcoded to local machine) — update if the repo is cloned to a different path.

## Workflow (file-based state machine)

```
Watchers → Needs_Action/ → orchestrator → Plans/ + Pending_Approval/
                                              ↓ human moves file
                                          Approved/ → orchestrator → Done/
```

Human actions: `mv Pending_Approval/FILE.md Approved/` (approve), `mv Pending_Approval/FILE.md Rejected/` (reject).

## Hard rules

- **NEVER hardcode credentials** — all from `.env`
- **ALL social media posts require human approval** — never auto-post
- **WhatsApp replies NEVER auto-sent** — strict rate limits, human-in-the-loop always
- **Payments >$100 require human approval**
- **Max 3-5 social media posts/day per platform**, 60s minimum delay between posts
- **`TASK_COMPLETE`** sentinel ends autonomous loops
- **YAML frontmatter** in all markdown task files
- **Set `DRY_RUN=false` only for production** — `true` by default for testing

## AI provider config

All keys in `.env`. The system reads `AI_PROVIDER=auto` or can force a specific provider. Models default to `gpt-4o`, `claude-sonnet-4-5`, `gemini-2.0-flash`.

## Orchestrator variants

| File | When to use |
|---|---|
| `orchestrator.py` | Main Silver/Gold orchestrator with approval workflow, dashboard, templates |
| `universal_orchestrator.py` | Non-Claude-Code path (API-only), Ralph Wiggum loop in Python |
| `process_needs_action.py` | Original Bronze-tier simple processor |

## Testing

No formal test framework. Test scripts run as standalone Python:
- `python3 run_silver_test.py`
- `python3 run_comprehensive_test.py`
- `python3 test_all.py`
- `python3 test_odoo_connection.py`

## Docker

`docker-compose.yml` runs orchestrator, email-mcp, gmail-watcher, and optionally whatsapp-watcher as services with named volumes for state directories.
