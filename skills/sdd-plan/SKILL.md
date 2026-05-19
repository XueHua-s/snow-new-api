---
name: sdd-plan
description: "Alias for the context-engineering-kit SDD planning workflow. Use when the user asks for `sdd:plan`, `/sdd:plan`, `/plan-task`, spec-driven planning, or refining a draft task into an implementation-ready specification. Delegates to `skills/plan-task/SKILL.md`, the upstream skill name currently published by context-engineering-kit."
---

# SDD Plan Alias

The upstream `context-engineering-kit` currently publishes this workflow as `plan-task`, not `sdd:plan`.

Use this alias when the user says `sdd:plan`, `/sdd:plan`, or `/plan-task`.

## Workflow

1. Read `skills/plan-task/SKILL.md`.
2. Follow that skill exactly for argument parsing, `.specs/tasks/draft/` input handling, planning phases, quality gates, and promotion to `.specs/tasks/todo/`.
3. Treat this file only as a local compatibility shim for the `sdd:plan` name.
