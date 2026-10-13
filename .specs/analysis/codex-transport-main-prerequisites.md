# Codex transport：本仓库 main 前置集成核查

日期：2026-10-14。只读业务核查；没有 checkout、cherry-pick、业务修改或测试运行。依据 git 对象而非历史回答。

- 规划基线 HEAD：`b3531b3df2bfd49c107f5eee4e881b5cd22d207b`。
- PR 基线 `origin/main`：`517075d5658ad59372859407df9e27de8f914542`。
- `git rev-list --count origin/main..HEAD` = 310。PR 应指向 `XueHua-s/new-api:main`，不能把当前分支直接 push 后假定 PR 只含 transport。
- todo 的 15 项 AC 及 C01–C09 全部仍须保留。main 的缺口是新增前置工作，不能删除 WS、三库、OAuth 安全或 live 要求来适应旧 main。

## 结论

可以在 main 隔离工作树实施完整功能，但不能只拷贝拟定 transport 文件：main 尚无 Responses WS 业务状态机及规划假定的部分策略/测试基础。应先移植与目标相关的既有能力并独立验证，再实施 S01–S10。不得整合 310 提交，也不得把 HEAD 中跨功能共享文件整体覆盖 main。下列是已确认的必要边界；移植后的编译/回归仍是发现传递依赖的硬门，本静态报告不声称得到已编译闭包。

## 已确认差异和处理

| 边界 | main 与 HEAD 的确切差异 | 最小必要处理 |
|---|---|---|
| HTTP relay | `relay/channel/api_request.go:doRequest` 已有 `GetHttpClientWithProxySettings`、redirect 禁止、HTTP 策略；主要相关新增是 WS dial。 | 可直接在 main 的既有 `doRequest` 插入 Codex adapter；保留旧 body/错误/keepalive 行为，不搬 unrelated task cancellation 或日志重构。 |
| HTTP 策略 | main `ChannelSettings` 已有 protocol/shards/每渠道 header timeout；缺 `TLSInsecureSkipVerify` 渠道字段和 HEAD 的全局 `RelayResponseHeaderTimeout`。`service/http_client.go:newRelayHTTPTransport` 的 HEAD 设置全局 timeout 并 clone TLS；`newHTTPClientFromPolicy` 才应用渠道 TLS。 | 明确移植本目标所需策略字段、normalize/pool key、初始化及测试；不能引用 main 不存在的字段。若保持 main 全局无限等待默认，必须更新契约证明完整继承；若采用 HEAD 新默认，明确行为改变并测试长流，不假称默认关闭无变化。不能随手复制 TaskPluginKey 等无关 DTO 扩展。 |
| Responses WS 入口 | main 缺 `controller/responses_websocket.go`、`relay/responses_websocket.go`、`pkg/wsmanager/*`；`router/relay-router.go` 缺 GET `/v1/responses`。 | 移植现有 controller→每 create 鉴权/限流/路由→session→usage/终结链及 shutdown/渠道变更通知。保持 main 原 POST `/responses`、images、Suno 等路由；HEAD 路由文件含无关删除，禁止整文件替换。 |
| WS 请求及结算复用 | main 缺 `relay/request_billing.go:PrepareRequestBilling/RefundFailedRequestBilling`、`relay/responses_request.go:PrepareResponsesRequest`、`service/responses_usage.go:ResponsesUsageAccumulator/ObserveResponsesOutcome/ApplyResponsesUsage`。 | 移植公共抽取以及 HTTP 原调用方对应调整，避免 WS 第二套计费。审查 `relay/responses_handler.go`、`relay/channel/openai/relay_responses.go`、`controller/relay.go`、`service/relay_error.go` 的对应相关 hunks，按 main 既有 quota 类型适配，不能直接带入后来 image/tool pricing 改造。 |
| WS 路由/绑定 | HEAD `selectResponsesWSChannel` 调用 `service.SelectChannelForRequest`，main 没有后续共享路由抽取。另需 `ResponsesWebSocketEnabled`、channel constraints、`service/ws_close.go`、channel update/disable hooks、main shutdown。 | 从既有实现移植一致的路由与失效语义及测试；不能简化成固定单渠道。`DoWssRequest` 应保留 URL 转换、proxy、TLS、context、失败响应，同时实现 todo 要求的保留握手错误体。 |
| OAuth transport | `service/codex_oauth.go`、`controller/codex_oauth.go`、`controller/oauth_flow.go` 在两基线完全一致。 | main 可直接实施 adapter 及绑定/一次性消费修复；共享 Claude helper 保持原行为。无需移植所有认证重构。 |
| AuthFlow | main 已有 `CreateAuthFlow`、`GetAuthFlow`、`ConsumeAuthFlowWithAction`、purpose/provider/user/session 匹配及事务消费；HEAD 增加 session/PAT authoritative identity helpers、额外 purposes 和 first-write claim。 | 优先复用 main 已有表和 flow。SQLite 并发原先先读后写升级锁风险必须由 C09 验证；如需 first-write claim，单独移植该函数必要 hunk。不要为调用一个 helper 带入全站 auth/PAT schema。 |
| Step-up / PAT | main 有 `middleware.RequireSecurityProof`、`service.IssueSecurityProof/VerifySecurityProof`、`GetSessionAuthIdentity`；main PAT 只有用户身份，不满足 session proof。HEAD `GetStepUpIdentity` 及 token-bound authoritative proof 依赖新版 `model/user_access_token.go` 和大量认证修改。 | 基于 main session proof 增补受影响 Codex scope/start/complete/refresh 控制、绑定和消费；PAT 必须明确拒绝敏感操作或实现同等 assurance，不能假装 main 已有新版能力。若要求新版 PAT 功能，需单独列出 schema/升级矩阵成本；禁止静默绕过。前端既有 proof 能否支持新 scope 需实际核验并最小扩展。 |
| Models | main `FetchCodexChannelModels` 使用 `NewProxyHttpClient` 同一 client 查询 GitHub 和模型；HEAD 拆 release client 和 channel-settings client。 | 按 todo 明确拆分；启用时固定版本，只模型 API 侧车；关闭保持 main 原语义，GitHub 始终证书验证。避免依赖后来 `constant.GetChannelBaseURL`，main 原常量查表足够。 |
| WHAM | 两基线均有 `fetchCodexChannelWhamData` 和聚合入口；HEAD 前者改用 channel settings，其他大量变化是消息 i18n。 | 两入口均接 adapter；分别保持原入口策略语义，consume POST 发送未知不重放。只改相关 hunk，不复制整个文件引入不齐全的新 i18n API。 |
| 三库 harness | main 无 `TestFixedPriceBillingDatabaseMatrix`；HEAD `service/text_quota_test.go` 比 main 多 441 行，包含后来的固定表达式等业务场景。 | 搬测试基础设施及 main 实际支持的完整扣费不变式，或在现有文件实现等价四 DSN runner；仍需 transport→usage→原结算端到端，不为得到测试函数名迁移 unrelated billing features。四 DSN 与独立日志库、no Skip 硬门保持。 |
| Go/modules | main root `go.mod` 为 Go 1.25.1；HEAD 为 1.26 且依赖集合有 63 行差异。WS 前置触及 relaykit DTO。 | 兼容 main Go 版本或明确单独升级工具链；不要搬整份 go.mod/go.sum。必须 `GOWORK=off go build ./...` 在 relaykit 中独立执行，原计划“无需触及 relaykit”的假设已不成立。 |

## 可追溯移植来源

`git show --stat 9fe0457ee`：最初 Responses WS 共 52 文件（包含测试/UI/7语言），作为业务闭包清单而非无条件 cherry-pick。

后续与目标必需语义相关的来源：

- `ae249f4ec`：扩展 WS channel 支持、共享 HTTP 路由（11 文件）；避免只搬初版旧逻辑。
- `75f3d246e`：stream_id 与错误关联。
- `801456a06`：session 结束发送 close frame。
- WS 后续还受 `977450a3e` 限流错误、`acb347a19` 工具计费、`128089fa7` i18n 影响；逐 hunk 根据 main 业务接口适配，不能把整项工具定价或全站翻译当作运输前置。

建议先以这组提交的 WS 核心变更为素材，保留 main 现有计费及全路由行为。所有编译断点必须追溯业务合同；不得通过删除特性/测试让移植通过。

## 集成顺序与证据门

1. 以 main 建独立交付分支，先跑 main 相关测试基线并记录工具链。核实 origin URL 和最终 PR base。
2. 移植完整已有 Responses WS 链与必要 DTO/通知/配置 UI，原 main HTTP/其他渠道回归；独立 relaykit build。新增测试应复用迁入的既有测试，禁止跨层散建重复文件。
3. 冻结基于新基线的 transport policy 和 OAuth 安全适配；重审 todo 中 baseline、文件 ownership、C04/C05/C09 及 conditional module/build/migration 分支。补真实三库基础，不能让缺 DSN 跳过被记录为 PASS。
4. 完整执行 S01–S10：迁入 WS 基础不能替代侧车测试；原 main 路由、账务、认证与 management 功能也必须继续通过。默认关闭和非 Codex 控制组应在新基线测。
5. 最终对 `origin/main...HEAD` 逐文件检查，仅相关前置与运输实现；C01–C09、AC01–15、独立 Judge 与 Docker/live 证据全部通过才创建 PR。若某项证据缺失，保留 active/pending，不先发实现完成声明。

执行过的核查：`git diff --stat/name-status origin/main HEAD` 对上述路径；`git show origin/main:<file>` 核实 main 实现；`git log origin/main..HEAD -- <paths>` 追溯来源；`rg` 确认当前函数。未运行 Go/Rust/数据库/Docker 测试，本报告没有测试 PASS。

## 最小候选提交顺序与已核实公共 API

`git log --reverse origin/main..HEAD -- relay/responses_websocket.go` 确认顺序为 `9fe0457ee → 75f3d246e → ae249f4ec → (acb347a19) → 801456a06`。最小候选移植集是前述四项，跳过整项 web-search pricing，但必须在应用最后 close 修复时适配中间签名差异。建议在隔离分支依次 `cherry-pick --no-commit` 后审冲突及 scoped diff，逐步编译；这仅是候选，不是已证明四项可无冲突完整 cherry-pick。

main 已核实存在初版 WS 所用 `common.SupportsResponsesCompact`、`common.NewReplayableBodyReader`、`relaycommon.AppendRequestConversionFromRequest`、`ImageGenerationCallCounter`、`IsNonBillableResponsesStatus`、`RelayInfo.CountBillableToolCall`。因此使用初版及上述修复比直接复制 HEAD 当前 WS/usage 更接近 main 接口。`PrepareRequestBilling` 是从原 controller 提取 `EstimateRequestToken → ModelPriceHelper → PreConsumeBilling`，`RefundFailedRequestBilling` 用原 Billing.Refund/ViolationFee；移植要保留原 HTTP 调用顺序和终结，不引入第二份扣费规则。此证据减少无关 billing 前置的必要性，但仍须完整编译及三库语义验证。
