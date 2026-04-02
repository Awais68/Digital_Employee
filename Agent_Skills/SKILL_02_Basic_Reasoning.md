---
skill_id: SKILL_02
name: Basic Reasoning
version: 1.0.0
tier: Bronze
description: Fundamental reasoning and decision-making capabilities for routine tasks
status: active
---

# SKILL_02: Basic Reasoning

## Purpose
Apply logical reasoning to analyze situations, make decisions, and determine appropriate actions within defined boundaries.

## Capabilities

### Decision Making
- **Triage**: Categorize incoming items by urgency and type
- **Prioritize**: Rank tasks based on importance and deadlines
- **Route**: Direct items to appropriate folders or handlers
- **Escalate**: Flag complex issues for human review

### Reasoning Rules
1. **Payment Rule**: Any payment > $100 requires human approval
2. **Response Rule**: Reply to messages within 24 hours
3. **Logging Rule**: Every action must be logged in `/Done/`
4. **Safety Rule**: Never execute financial transactions without approval file

### Analysis Framework
1. **Identify** the type of request/task
2. **Check** against company rules and constraints
3. **Determine** if action is within Bronze Tier scope
4. **Execute** or **escalate** accordingly

## Usage
This skill is invoked for all decision-making processes and task evaluations.

## Dependencies
- SKILL_01 (Vault Management)
