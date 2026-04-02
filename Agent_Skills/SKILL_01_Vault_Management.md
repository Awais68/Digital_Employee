---
skill_id: SKILL_01
name: Vault Management
version: 1.0.0
tier: Bronze
description: Core file and folder management capabilities for the Digital Employee vault
status: active
---

# SKILL_01: Vault Management

## Purpose
Manage files and folders within the Digital Employee vault, including reading, writing, organizing, and maintaining the knowledge base structure.

## Capabilities

### File Operations
- **Read**: Access and parse any file in the vault
- **Write**: Create new files with proper formatting
- **Update**: Modify existing files while preserving structure
- **Organize**: Move files between folders based on status

### Folder Structure Awareness
- `/Inbox/` – New incoming items requiring processing
- `/Needs_Action/` – Items requiring human attention or decision
- `/Plans/` – Strategic plans and roadmaps
- `/Done/` – Completed tasks and logs
- `/Logs/` – Activity and audit logs
- `/Skills/` – Skill definitions and documentation
- `/Agent_Skills/` – Active agent skill files

### Best Practices
1. Always log actions in `/Done/` or `/Logs/`
2. Preserve YAML frontmatter when editing files
3. Maintain consistent naming conventions
4. Flag uncertain operations for human review

## Usage
This skill is automatically invoked when performing any vault-related operations.

## Dependencies
- None (core skill)
