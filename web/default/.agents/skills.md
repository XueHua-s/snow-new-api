# Codex Frontend Skills Guide

Use this file when Codex is working inside `web/default`. Do not scan all skills by default. Load the smallest matching root skill from `../../skills/`.

## Skill Routing

- `../../skills/frontend-design/SKILL.md`
  Use for UI/page/component visual design and polished implementation.
- `../../skills/product-designer/SKILL.md`
  Use for UX flows, journey maps, information architecture, usability, and design systems.
- `../../skills/vercel-react-best-practices/SKILL.md`
  Use for React performance, rerenders, bundle size, async waterfalls, and data fetching efficiency.
- `../../skills/i18n-translate/SKILL.md`
  Use for adding, completing, syncing, or auditing locale keys.
- `../../skills/shadcn-ui/SKILL.md`
  Use for shadcn/ui component composition, registry, theming, and CLI context.
- `../../skills/classic-to-default-sync/SKILL.md`
  Use when comparing or porting `web/classic` changes into `web/default`.
- `../../skills/code-review-expert/SKILL.md`
  Use when reviewing frontend diffs for bugs, security, reliability, and maintainability.

## Guardrails

- Always read `AGENTS.md` in this directory before editing frontend code.
- Use Bun scripts from this directory.
- User-visible strings need i18n coverage.
- Do not import Semi Design patterns from `web/classic` into `web/default`.
