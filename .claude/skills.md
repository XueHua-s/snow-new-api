# Claude Skills Guide

Use this file when Claude needs to load local skills in `new-api`. Do not scan the entire `skills/` tree by default. Pick the smallest relevant set, then read only the matching `SKILL.md` files and the referenced resources you actually need.

## How To Use

- Canonical skill entry points live at `skills/*/SKILL.md`.
- Start most implementation, bug fix, refactor, or review tasks with `skills/new-api-project-standards/SKILL.md`.
- If a task is only frontend work under `web/default`, also read `web/default/AGENTS.md`.
- When a skill references `references/`, `rules/`, `scripts/`, or `vendor/`, load only the files needed for the current task.
- Codex CLI should use `.agents/skills.md`; Claude should use this file.

## Skill Routing

- `skills/new-api-project-standards/SKILL.md`
  Default entry for Go backend, relay/provider adapters, billing, settings, database migrations, frontend scope selection, and verification commands.
- `skills/sdd-plan/SKILL.md`
  Use when the user says `sdd:plan`, `/sdd:plan`, `/plan-task`, or asks for SDD-style task planning. This local alias delegates to the upstream `skills/plan-task/SKILL.md` content currently published by `context-engineering-kit`.
- `skills/plan-task/SKILL.md`
  Upstream `context-engineering-kit` planning skill installed from the published `plan-task` skill name.
- `skills/software-design-philosophy/SKILL.md`
  Use for module design, complexity reduction, deep abstractions, information hiding, and architecture tradeoffs.
- `skills/code-review-expert/SKILL.md`
  Use for reviewing current diffs, PRs, SOLID/security/reliability risks, and removal candidates.
- `skills/frontend-design/SKILL.md`
  Use for UI/page/component visual design and polished frontend implementation.
- `skills/product-designer/SKILL.md`
  Use for UX strategy, journey maps, IA, design systems, usability testing, and product design decisions.
- `skills/vercel-react-best-practices/SKILL.md`
  Use for React performance, rerendering, bundle size, async waterfalls, and frontend performance reviews.
- `skills/i18n-translate/SKILL.md`
  Use when frontend i18n keys or locale files need to be added, completed, synced, or audited.
- `skills/shadcn-ui/SKILL.md`
  Use for `web/default` shadcn/ui work, component composition, registry usage, theming, and component CLI context.
- `skills/classic-to-default-sync/SKILL.md`
  Use when porting or auditing changes from `web/classic` into `web/default`.

## Guardrails

- Trust live code over stale docs when they conflict, but update docs/skills if the project rule itself changed.
- Do not load broad performance or design skills for a narrow Go-only bug unless the task truly needs them.
- Do not add new dependencies before checking `go.mod`, `web/default/package.json`, and local helper packages.
- Keep generated task specs under `.specs/`; do not mix them with product docs or source code.
