# S01 actual-main prerequisite 独立审计

日期：2026-10-14。最终状态：**最小 main 前置兼容门 PASS**。实际实施树 `/tmp/new-api-codex-plan-pr`，基于本仓库 `origin/main` 的 `517075d5658ad59372859407df9e27de8f914542`。下文早期 HOLD 与发现保留为评审记录，最终复审结果见末节。本门仅允许在已移植前置上继续业务接入，不证明 S03–S10、正式 transport、部署/live 或 S08 全账务不变式已经完成。

本次先完整读取原树 `.agents/rules/billing.md`；读取 OWASP Authentication / Session Management Cheat Sheets，审查范围为 WebSocket API token 认证、每消息重新授权、身份隔离、撤销和日志秘密排除。没有读取或使用真实账号凭据；没有对整个应用作 ASVS 合规声明。前端尚未逐行审查，不以此报告替代前端技能及验证门禁。

## 当前证据

- `git worktree list`、`git rev-parse` 证实独立树从目标 main 开始；本次 `git diff HEAD --stat` 是定向移植而非 310 提交合并。初版/后续 WS 来源需结合作者 integration 报告保存，未提交 diff 中还含规划 skill 修改，最终提交须分开审核。
- HTTP billing 预扣及退款改成调用共享 `PrepareRequestBilling` / `RefundFailedRequestBilling`，调用顺序与 main 原流程对应；WS 复用相同结算入口，没有独立扣费系统。
- 新 WS request runner 每次 `response.create` 新建 Gin 处理上下文并执行 TokenAuth + ModelRequestRateLimit；`GetChannelConstraints` 在该次 TokenAuth 之后首次构造，锁定上游 context 只恢复渠道字段，没有跨请求恢复 token/user/pin 缓存。后续 create 校验 channel/key/group/model/route/proxy，静态上保留重新授权边界。
- HTTP router 原 POST/Realtime/其他路由保留，仅在模型限流前注册 GET `/responses`，每条 create 再执行模型限流；没有整体覆盖 router。
- `relaykit` 修改保留 cache token 字段的值复制；未改 module 依赖。独立 module build 及最终根编译仍以作者实际完成结果为准。

## 已反馈作者的待修正或说明项

1. **非法 token channel pin 静默退化随机选路。** `service.GetChannelConstraints` 对 `specific_channel_id` 的 `strconv.Atoi` 失败直接忽略；HTTP `Distribute` 会拒绝 400，而 WS 使用约束路径可能继续随机选择其他渠道。要求显式失败并覆盖非法 suffix，不能把无效 pin 当作未指定。
2. **无关 plugin/origin-task 框架残留。** 新 DTO 含 OriginTask pin、TaskPlugin filter/字段，service 含 plugin `NoAvailableChannel` 和特殊 origin-task 错误分支。本次搜索未找到 main 生产调用者，仅迁入测试引用。要求删除非必要路径及对应测试，或给出真实前置依赖；不能把测试引用当成业务必要性。
3. **HTTP token 模型限制行为改变。** `TokenModelLimitAllows` 从 main 的 normalized-key 存在判断改成 raw-or-normalized bool 值判断。需要解释预期兼容边界并覆盖 HTTP/WS 一致行为，避免为 WS 隐式改 HTTP 授权语义。
4. **部分 usage 更新的 billing snapshot 一致性。** `ApplyResponsesUsage` 覆盖 converter 自动构造的 snapshot，并在后续无 snapshot 的 usage 更新时保持旧 snapshot。现有迁入测试接受 input20/output10 snapshot 后 output12 更新却保留旧 snapshot；而 `effectiveBillingUsage` 优先 snapshot，存在结算仍为 output10 的风险。要求按原生 usage 来源语义解释/修正，并用有效计费量或最终扣费断言保护，不能只断言旧结构不变。

## S01 rubric 与硬门

官方 baseline 产物评分沿用独立 `judge-baseline.md` 的 **4.65/5 ≥ 4.0**，本报告不重评未变更的官方二进制。实际分支兼容性是额外硬门，不能由加权高分抵消。

| 门禁 | 当前结果 |
|---|---|
| 指向本仓库 main、隔离无关 310 提交 | 已确认基点；最终提交文件清单待审 |
| WS/HTTP billing/路由/auth 前置完整性 | 上述具体问题待处理；HOLD |
| 作者最终 controller/relay/service/middleware/wsmanager 回归 | 作者称部分包已通过，controller仍修复；未计为完整 PASS |
| 实际 SQLite/MySQL/PostgreSQL channel 数据库行为 | 尚无执行证据；HOLD，不能声称数据库兼容 |
| relaykit `GOWORK=off go build ./...` | 作者早期报告通过，最终树结果待确认 |
| frontend 复用/i18n/typecheck/lint/test/build | 待最终结果及独立审查；本次未覆盖 |
| 独立 Rust S03 解锁 | **可以拆分**：固定官方基线产物已 PASS，S02 全部契约审计 PASS 后可启动；Rust 不导入 main Go 模块，没有 actual-main WS 前置的真实依赖 |
| Go 业务接入 / S04c 解锁 | actual-main 兼容性仍 HOLD；本报告尚未授权，不能因独立 Rust 开始便把整体 S01 标完成 |

最终 verdict 必须等待作者停止本轮修改并提供确切命令/结果，再复查以上发现及最终 diff。后续 transport 三库、Docker/live 不能用于倒填未实际执行的前置证据。

## 最终复审（作者释放前置所有权后）

**Verdict: PASS，评分沿用 S01 固定基线 4.65/5，actual-main prerequisite compatibility 硬门通过。** S02 门禁及各实施步骤自身验收保持独立；Go 业务接入可以基于本前置继续，不能由本报告替代 S04c 等新增实现的 Judge。

四项发现逐项关闭：

1. 非法/非正 token pin 现在保留为无效 pin（ID -1），选路返回 400，不再成为随机选择；现有 WS 测试增加无效 pin 回归，锁定不重试。
2. `dto/channel_constraints.go` 仅保留单 token pin 与 request-path/Responses-WS filters；OriginTask、TaskPlugin、Rank/RetryMode 及其无关测试已移除。
3. `TokenModelLimitAllows` 恢复 main 原 normalized-key 存在判断；WS 模型权限测试验证普通模型准入与未经允许后缀拒绝。
4. native Responses snapshot 在部分更新后 clone 并同步已合并计费事实；测试覆盖新片段带/不带 snapshot，直接断言 `effectiveBillingUsage` 为 20 input / 12 output，并保留原始 snapshot output10 不被修改。非 Responses 原生 dialect snapshot 仍按来源保留。初次无内部 snapshot 的输入保留 main 原计费路径，不要求本前置创建新的定价语义。

额外复核作者自查修复：非 memory-cache DB 选路先筛 WS capability 再确定可用优先级，避免高优先级 WS-disabled 渠道遮蔽低优先级 WS-enabled 渠道；普通 HTTP 仍使用原优先级路径。对应 controller 路由测试纳入真实三库执行。

### 本审计新执行结果

- `/tmp/new-api-codex-plan-pr`: `go test ./service ./relay ./controller ./middleware ./pkg/wsmanager -run 'Responses|WebSocket|MultiKeyEnable|ApplyResponsesUsage' -count=1 -timeout 120s`，exit 0。service 1.013s、relay 1.120s、controller 7.426s、middleware 0.884s。该筛选未命中 wsmanager 用例，因此另跑下一条，不将 no-tests 当成功覆盖。
- `go test ./pkg/wsmanager -count=1`：PASS，0.186s。
- `relaykit/`: `GOWORK=off go build ./...`：exit 0。
- `web/`: `bunx vitest run src/features/channels/components/__tests__/responses-websocket-setting.test.tsx`：1 文件 / 11 用例 PASS；包含开关默认关闭、五渠道类型、键盘切换、保存/回读、不可用类型、敏感锁禁用。
- Python 逐语言比较 `git show HEAD:web/src/i18n/locales/<lang>.json` 与工作树 JSON：七语言各仅增加两个 key，已有键值零修改/删除；全文核对新增译文与组件两个 `t(...)` 调用一致。

前端只读复审已补读实际 main 的 `web/AGENTS.md`、项目 shadcn-ui/i18n-translate/vercel-react-best-practices 技能及相关 derived-state 指导。检查 shared components 搜索结果、现有 Form/Switch 实现、drawer 同类设置调用点：新 feature 组件组合已有 Form/Switch，未重造通用交互，直接由 props/form 控制，没有多余 state/effect；敏感字段列表及 disabled 传递存在。作者最终 typecheck、targeted lint/format、build 结果见 integration 报告；本审计没有重复执行整个构建。

### 作者原始结果与覆盖边界复核

实际读取 `/tmp/codex-prereq-root-final.log`，末尾全包结果为 `ok` / no-test-files，无 FAIL；作者最终 `go test ./... -timeout 120s` 和根 `GOWORK=off go build ./...` 在最后 snapshot-only 修复后成功。当前其他代理正在写 transport adapter，不能将其未来结果归入此前提验证。

实际读取 `/tmp/codex-prereq-mysql-final.log`、`/tmp/codex-prereq-postgres-final.log`，controller 分别 PASS 41.100s / 72.020s；SQLite 版本日志实际为 3.50.4。作者记录 MySQL **8.0.46**、PostgreSQL **16.15 aarch64 Alpine**，命令 `TEST_CHANNEL_SQL_DSN=<main> TEST_RESPONSES_SQL_DSN=<main> TEST_RESPONSES_LOG_SQL_DSN=<log> go test ./controller -run 'TestMultiKeyEnable|TestResponses' -count=1 -timeout 120s`。读 fixture 确认实际传 DSN 至 `model.InitDB/InitLogDB`、独立日志库、无 Skip、失败使用 require；测试覆盖实际模型选择、账务、multi-key 状态更新。容器已按作者交接清理，本审计未重建三库。三库与 race 结果早于最后 service snapshot-only 修复；该修复无 SQL/schema/driver/事务变化，由本轮独立 service/controller 用例重新验证，不据此声称运行过修复后的外部三库。没有 schema/driver 变更，因此不声明发行版迁移矩阵。

### 保留事项

- main 原有“零 token 常量表达式收费时 user/channel used-quota 统计未同步”已明确列入 **S08 未解决账务缺口**；本前置保留基线，不将现有行为当成最终全部不变式通过。最终目标验收前必须处理。
- main HTTP-200 terminal failure 的既有健康/限流统计语义被保留；正式 transport 不能藉此隐瞒异常终结或重放。
- 不含真实凭据、真实上游、sidecar Docker 部署、完整 protocol 对照验收，也不批准最终 PR。最终 staging 仍应排除无关改动并确认 fork main 的 base/head。
