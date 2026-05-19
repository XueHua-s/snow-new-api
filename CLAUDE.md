# Claude Workspace Entry

在开始任何分析、命令执行、代码修改前，先完整阅读同级 `AGENTS.md`，并将其视为当前仓库的一线执行规范。

然后按任务范围继续：

- 需要选择本地技能时，读取 `.claude/skills.md`
- 默认项目入口技能是 `skills/new-api-project-standards/SKILL.md`
- 任务涉及 `web/default` 时，再读取 `web/default/AGENTS.md`
- 用户说 `SDD模式`、`sdd:plan`、`/sdd:plan` 或任务涉及 SDD 规格化规划时，使用 `skills/sdd-plan/SKILL.md`；它会路由到 upstream `skills/plan-task/SKILL.md`

如果通用习惯与本仓库 `AGENTS.md` 冲突，以本仓库 `AGENTS.md` 为准。
