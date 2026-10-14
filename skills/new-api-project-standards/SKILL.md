---
name: new-api-project-standards
description: "new-api 仓库默认入口技能。用于后端 Go relay/provider 适配、计费、配置、数据库迁移、前端 web 变更、跨层影响分析和验证命令选择。开始任何 new-api 功能开发、缺陷修复、重构或审查前优先读取。"
---

# new-api Project Standards

## Quick Start

- 先读仓库根 `AGENTS.md`，再按任务范围选择其他技能。
- 编码前先定位目标模块和既有模式；不要凭记忆改 provider、计费或数据库路径。
- 依赖优先复用现有 `go.mod`、`web/package.json` 和本地工具；新增依赖前说明收益、替代方案和迁移成本。

## Backend Boundaries

- 架构主线：`router/` -> `controller/` -> `service/` -> `model/`。
- AI 转发主线在 `relay/`；provider 适配在 `relay/channel/<provider>/`，共享 relay 行为优先放 `relay/common/`、`relay/helper/` 或 `service/`。
- DTO 在 `dto/`，错误与跨 provider 类型在 `types/`；不要把 provider 私有协议泄漏到无关 provider。
- 配置入口在 `setting/`，常量在 `constant/`；共享默认值应单点定义，避免魔法数散落。

## Required Rules

- 全仓手写生产业务源码单文件不得超过 **500 个物理行**（格式化后含导入、注释、空行）。按业务职责拆分，保持行为与公共契约，不得压缩格式、删有用注释或移入豁免目录规避限制。测试、生成代码、第三方依赖、纯配置、翻译数据和文档不属于业务代码。
- 完成代码修改前在仓库根执行 `python3 scripts/check-business-file-size.py`；必须消除全部超限项。使用 `--json` 查看逐文件结果和明确的豁免原因，扫描包含 Git 未跟踪的新文件。

- JSON 编解码必须使用 `common/json.go` 的 `common.Marshal`、`common.Unmarshal`、`common.DecodeJson` 等封装；业务代码不要直接调用 `encoding/json` marshal/unmarshal。
- SQLite、MySQL、PostgreSQL 必须同时兼容。raw SQL 不可避免时，使用 `model/main.go` 中的 reserved-word 列名变量和 DB 方言分支。
- 转发到上游的可选标量字段使用 pointer + `omitempty`，保留客户端显式传入的 `0`、`0.0`、`false`。
- 新增 channel 时确认 `StreamOptions` 支持情况；支持时同步更新 `streamSupportedChannels`。
- 触碰 `pkg/billingexpr/` 或分层/动态计费前，先读 `pkg/billingexpr/expr.md`。
- 不提交密钥、OAuth token、真实账号凭据、证书或敏感环境变量。

## Frontend Scope

- 触碰 `web` 前，继续读取 `web/AGENTS.md`。
- 默认前端栈：React 19、TypeScript、Rsbuild、Base UI、Tailwind、TanStack Query/Router、Zustand、i18next。
- 前端包管理和脚本使用 Bun：`bun install`、`bun run typecheck`、`bun run lint`、`bun run build`。
- 新增用户可见文案时使用 `useTranslation()` / `t()`，并同步 locale。

## Verification

- Go 后端常规验证：`go test ./...`。
- 目标包快速验证：`go test ./relay/channel/<provider> ./service ./types` 等，按影响面选择。
- 前端 TS/TSX 改动：在 `web` 执行 `bun run typecheck`，必要时补 `bun run lint` 和 `bun run build`。
- Docker/部署链路改动：至少验证 `docker compose` 配置或构建命令，不要只跑单元测试。

## Pair With

- 模块设计、复杂度治理：`skills/software-design-philosophy/SKILL.md`
- 当前 diff 审查：`skills/code-review-expert/SKILL.md`
- React 性能：`skills/vercel-react-best-practices/SKILL.md`
- UI/UX 设计：`skills/frontend-design/SKILL.md` 或 `skills/product-designer/SKILL.md`
- SDD 触发暗语与规格化任务规划：`skills/sdd-plan/SKILL.md`，覆盖 `SDD模式`、`sdd:plan`、`/sdd:plan`、`/plan-task`；实际 upstream 技能内容在 `skills/plan-task/SKILL.md`
