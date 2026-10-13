---
name: sdd-plan
description: "Alias for the context-engineering-kit SDD planning workflow. Use when the user says `SDD模式`, `sdd:plan`, `/sdd:plan`, `/plan-task`, spec-driven planning, or asks to refine a draft task into an implementation-ready specification. Delegates to `skills/plan-task/SKILL.md`, the upstream skill name currently published by context-engineering-kit."
---

# SDD Plan Alias

The upstream `context-engineering-kit` currently publishes this workflow as `plan-task`, not `sdd:plan`.

Use this alias when the user says `SDD模式`, `sdd:plan`, `/sdd:plan`, or `/plan-task`.

If the user says `SDD模式` without asking to create or refine a task spec, first load this alias and use it as a planning/quality-gate lens for the current work. Do not automatically start the full `.specs/tasks/draft/` workflow unless the user asks for a task spec, draft, plan file, or `/plan-task` execution.

## Workflow

1. Read `skills/plan-task/SKILL.md`.
2. Follow that skill for argument parsing, draft input handling, planning phases, quality gates, and promotion to `.specs/tasks/todo/`. Apply its Runtime portability rules: use available agents and models, local filesystem tools, and the inline judge method; vendor-specific agents and external plugin files are not prerequisites.
3. Treat this file only as a local compatibility shim for the `sdd:plan` name.
