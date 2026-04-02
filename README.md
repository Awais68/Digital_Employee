# AI Employee Vault

> **Personal AI Employee Hackathon 2026** — A file-based task orchestration system that automates workflow processing using markdown files.

## Project Overview

**Goal:** Create an autonomous "digital employee" that monitors folders, processes tasks, creates action plans, and maintains a dashboard — all using simple markdown files and Python scripts (no external dependencies).

---

## Tier Progress

| Tier | Status | Completion Date |
|------|--------|-----------------|
| **Bronze** | ✅ Complete | 2026-04-02 |
| **Silver** | 🔄 In Progress | — |
| **Gold** | ⏳ Pending | — |
| **Platinum** | ⏳ Pending | — |

---

## Folder Structure

```
AI_Employee_Vault/
├── Needs_Action/          # Incoming tasks requiring processing
├── Plans/                 # Generated action plans for each task
├── Done/                  # Completed/archived tasks
├── Inbox/                 # Raw incoming items (pre-processing)
├── Logs/                  # System logs and history
├── Agent_Skills/          # AI skill definitions
├── Skills/                # Custom skill modules
├── .obsidian/             # Obsidian vault configuration
├── Dashboard.md           # Central status & activity dashboard
├── Company_Handbook.md    # Rules, guidelines, and operating procedures
└── process_needs_action.py # Bronze Tier orchestrator script
```

### Key Folders & Files

| Path | Purpose |
|------|---------|
| `Needs_Action/` | Queue for tasks that need immediate attention. Drop `.md` files here to trigger processing. |
| `Plans/` | Auto-generated plan files (`PLAN_*.md`) with frontmatter, objectives, and steps. |
| `Done/` | Archive of processed tasks. Moved here after successful processing. |
| `Dashboard.md` | Live dashboard showing status, recent activity, and processed items. |
| `Company_Handbook.md` | Operating rules, guidelines, and company policies for the AI employee. |
| `process_needs_action.py` | Main orchestrator script — reads, plans, logs, and archives tasks. |

---

## How to Use (Step by Step)

### 1. Manual Setup

```bash
# Navigate to the vault root
cd /path/to/AI_Employee_Vault

# Ensure directories exist (script creates them if missing)
mkdir -p Needs_Action Plans Done Logs
```

### 2. How to Run the Processor

```bash
# Run the Bronze Tier orchestrator
python process_needs_action.py
```

**What it does:**
- Scans `Needs_Action/` for `.md` files
- Creates corresponding `PLAN_*.md` files in `Plans/`
- Updates `Dashboard.md` with processed entries
- Moves processed files to `Done/`

### 3. How to Test (with Example)

```bash
# Step 1: Create a test task in Needs_Action
cat > Needs_Action/test_task.md << 'EOF'
---
type: task
priority: medium
---

Please review the quarterly report and send feedback.
EOF

# Step 2: Run the processor
python process_needs_action.py

# Step 3: Verify results
ls Plans/           # Should show: PLAN_test_task.md
ls Done/            # Should show: test_task.md
tail Dashboard.md   # Should show new processed entry
```

---

## Bronze Tier Status

| Component | Status |
|-----------|--------|
| Obsidian Vault Setup | ✅ Complete |
| Dashboard & Handbook | ✅ Complete |
| `process_needs_action.py` | ✅ Complete |
| Filesystem Watcher | 🔄 In Progress (Silver Tier) |
| Auto-trigger on File Drop | ⏳ Pending (Silver Tier) |

---

## Commands

| Command | Description |
|---------|-------------|
| `python process_needs_action.py` | Run the Bronze Tier orchestrator |
| `ls Needs_Action/` | Check pending tasks |
| `ls Plans/` | View generated plans |
| `ls Done/` | View completed tasks |
| `tail -f Dashboard.md` | Monitor dashboard updates |

---

## Rules (from Company Handbook)

### Core Operating Principles

1. **Process First, Ask Later** — Handle all items in `Needs_Action/` before idle
2. **Log Everything** — Every action must be recorded in `Dashboard.md`
3. **Archive Completed Work** — Move processed files to `Done/` immediately
4. **Maintain Clean State** — Keep `Needs_Action/` empty when possible
5. **Follow Priority Order** — High priority items first (if marked)

### File Naming Conventions

- Plans: `PLAN_{original_filename}.md`
- Dates: `YYYYMMDD_HHMMSS_` prefix for timestamped files
- Extensions: `.md` for all task/plan files

### Dashboard Updates

- Format: `- [x] Processed {filename} at {HH:MM}`
- Append only (never overwrite existing entries)
- Include timestamp for every action

---

## Next Tiers

| Tier | Features |
|------|----------|
| **Silver** | Auto-watcher daemon, email integration, priority sorting |
| **Gold** | LLM integration, natural language understanding, auto-responses |
| **Platinum** | Full autonomy, multi-channel support, learning & adaptation |

---

**Hackathon:** Personal AI Employee Hackathon 2026  
**Tier:** Bronze  
**Version:** 1.0  
**Last Updated:** 2026-04-01
