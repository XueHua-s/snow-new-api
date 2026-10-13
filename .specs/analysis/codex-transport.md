# Codex 传输：规划代码查证

日期：2026-10-14。HEAD：`b3531b3df2bfd49c107f5eee4e881b5cd22d207b`。仅静态查证，无实现/运行验收。源计划最初已是未跟踪文件，本轮不修改它。

| 已检查位置 | 实际入口/证据 | 计划影响 |
|---|---|---|
| `router/relay-router.go:78` | `GET("/responses", controller.ResponsesWebSocket)` | 已有 WS 路由，不能因 POC 405 另造业务入口 |
| `controller/responses_websocket.go` | `ResponsesWebSocket`、`newResponsesWSRequestRunner` | 保留每次调用中间件/请求上下文 |
| `relay/channel/api_request.go:379` | `DoWssRequest(...) (*websocket.Conn, error)`，当前 gorilla DialContext；渠道代理/TLS 设置和 header override | 替换拨号出口，保留真实握手错误及头优先级 |
| `relay/channel/api_request.go:523` | `doRequest(...) (*http.Response, error)`，GetHttpClientWithProxySettings 后浅复制 client 禁重定向，管理流 ping/Body | 在此明确 Codex 分流，避免变更全局 client；现错误包装需审视 skip-retry |
| `service/http_client.go`、`service/http_transport_policy.go` | `GetHttpClientWithProxySettings`、`NormalizeHTTPTransportPolicy`、clientCacheKey | 复用配置规范化，不强行按账号拆 HTTP 池 |
| `relay/responses_websocket.go` | `ResponsesWebSocketHelper`、`responsesWSSession.runCall`、`restoreConnectionContext`、`registerChannelClose` | runCall 已有退款/ConsumeResponsesQuota；恢复时检查凭据、设置、代理、路由；新物理 profile 需纳入失效依据 |
| `relay/responses_handler.go` | `ResponsesHelper`、`ConsumeResponsesQuota` | HTTP/WS 共享结算分派，禁止侧车第二套计费 |
| `service/responses_usage.go` | `NewResponsesUsageAccumulator`、`Observe`、`Finish` | 保持原 usage 聚合和缺失规则 |
| `service/codex_oauth.go:204` | `getCodexOAuthHTTPClient` 当前用 GetHttpClientWithProxy 并复制 timeout | 加 Codex 专用选择，不能直接全局重定向 |
| `service/claude_oauth.go:176,188` | Claude refresh/exchange 确实调用 getCodexOAuthHTTPClient | 必须覆盖 Claude 不走侧车回归 |
| `service/codex_channel_models.go` | `FetchCodexChannelModels` 先 GitHub GetLatestCodexClientVersion，再获取渠道 client；401 后刷新并重试 | 启用固定 profile 时应明确模型查询版本；release 查找非上游传输，保留证书验证；禁止无意把最新版本当固定基线 |
| `service/codex_models.go` | `FetchCodexModels` 接受注入 client；GetLatestCodexClientVersion/fetchLatestCodexClientVersion | 优先在调用入口选 client，不凭 URL 字符串推断渠道 |
| `controller/codex_usage.go:103` | GetHttpClientWithProxySettings；传入 WHAM 调用 | 管理请求传输选择不能只改 service 函数内部 |
| `service/codex_wham_usage.go` | FetchCodexWhamUsage、FetchCodexWhamRateLimitResetCredits、ConsumeCodexWhamRateLimitResetCredit 都接收 client | 覆盖读请求和有副作用额度重置请求，禁止不确定重放 |

现有测试文件已查存在：`relay/responses_websocket_test.go`、`service/responses_usage_test.go`、`relay/channel/openai/relay_responses_billing_test.go`、`relay/channel/codex/adaptor_test.go`、`service/text_quota_test.go`、`service/quota_saturation_test.go`、`model/quota_reserve_test.go`。本轮未执行，也未证明它们支持真实三库配置。S08 必须查明并补足真实数据库 harness。

静态命令为 `rg -n` 查入口与调用方、`sed`/`cat` 读取实现、`git status --short`、`git rev-parse HEAD`。未读实际凭据或真实流量；未运行测试、数据库、官方 CLI 或侧车。

规划自检：范围与排除项明确；13 条验收含失败/取消/重放/账务；10 步都有依赖、输出、风险及验证权重（每行 1.00）；独立 Judge 尚未执行。精确 wire schema、数值资源上限、三库 runner 命令和协议采样命令是后续对应步骤产物，当前未定；因此保留 draft。不存在流程 PASS 分数。

## Phase 2b 全面复查（2026-10-14）

本节替代上文“尚未查明三库 harness”等不再准确的判断。工作树 HEAD 仍为 `b3531b3df2bfd49c107f5eee4e881b5cd22d207b`；读取当前源码而非旧行号。已完整读取 billing 规则；没有执行真实账号请求、读取凭据文件或真实流量。风险级别 HIGH：跨进程流生命周期、请求重放、凭据隔离和账务必须一起验证。

### 入口覆盖及具体接口

| 入口/现有接口 | 当前行为 | 实施必须覆盖 |
|---|---|---|
| `relay/channel/api_request.go:doRequest` | `GetHttpClientWithProxySettings`，浅复制后 `CheckRedirect=keepUpstreamRedirectResponse`，维护 SSE pinger，返回 `*http.Response` | 仅 ChannelTypeCodex 选择专用 RoundTripper；保留上下文、body close、ping；禁自动 redirect；将私有错误阶段传入 skip-retry，而非丢在普通 error 中 |
| 同文件 `DoWssRequest` | 返回 `*websocket.Conn`，调用 adaptor URL/headers 后应用 header override，再 gorilla `DialContext`；当前握手错误保留状态却关闭并丢弃响应体 | 本地 WS 仍返回同接口；内部元数据必须在 override 后由服务端覆盖/清理；握手失败需有界保留错误内容，不能先 101；保证非 Codex 不变 |
| `relay/channel/codex/adaptor.go` | 多种输入转换至 Responses，含强制上游流；调用共享 HTTP/WS 出口 | JSON、SSE、强制流、图像请求均走选择点；不修改转换、usage 或 token multiplier 验证 |
| `service/codex_oauth.go:ExchangeCodexOAuthCodeWithProxy/RefreshCodexOAuthTokenWithProxy` | `getCodexOAuthHTTPClient` 复制普通 client 并设置 timeout；`service/claude_oauth.go:176,188` 共用 | 抽出/保留通用 helper，增加明确 Codex Auth profile 分支；Claude 绝不改道；不允许隐藏 token POST 重放 |
| `service/codex_credential_refresh.go:RefreshCodexChannelCredential` 及 `_task.go` | 后台/手动刷新经上述 OAuth 函数，更新 channel key，可重建缓存 | 跟踪所有调用至 Auth 出口；沿用 Go 生命周期，不把刷新搬至 Rust；凭据轮换使旧 WS 失效 |
| `service/codex_channel_models.go:FetchCodexChannelModels` | GitHub latest 查询与实际模型查询使用两个 client；401 后业务刷新并一次重查 | 只 API 查询改道；profile 开启时版本固定 0.162.1；保留 GitHub 证书验证且不能让 latest 覆盖固定版本 |
| `controller/codex_usage.go:fetchCodexChannelWhamData` | 管理用量/重置额度 GET、消费额度 POST 共用，client 取渠道设置；401/403 后刷新并重调 fetch | 三类管理调用都接 API profile；POST 有副作用，真实拒绝状态后的既有业务刷新与传输不明重放必须区分 |
| 同文件 `fetchCodexChannelUsage`（聚合状态入口） | **独立 client 创建**：`GetHttpClientWithProxy`；与上行不是同一路径；刷新后 ResetProxyClientCache | 这是原草案未点名的第四个管理入口；必须接入且决定是否保持旧默认策略或统一渠道设置，不可漏掉 |
| `service/codex_wham_usage.go` 三个注入 client 的函数 | GET usage、GET reset credits、POST consume；consume 每次函数调用创建 `redeem_request_id` | 保持 body/ID 原样过侧车；对发送不明故障不得再次调用函数重新生成 ID；无 token/body 日志 |

### 重试、redirect 和失效边界

1. `controller/relay.go:159–212` 外层重试最终调用 `service.DecideRelayRetry`；`doRequest` 当前将 err 包装成 `ErrorCodeDoRequestFailed`，没有 SkipRetry。S04 必须验证私有 typed error 经 `http.Client.Do` 的 `url.Error` 包装仍能分类，并在这一层映射；只在 Rust 关闭重试不足以杜绝 Go 外层换渠道重发。审查 reqwest/hyper/H2 内部重试以及 Go→侧车本地 transport 的自动重试，尤其 GET/幂等标记与 `GetBody`。
2. relay HTTP 禁 redirect，但 OAuth/管理共享 client 的 `service/http_client.go:checkRedirect` 当前默认可追随最多 10 次并验证 URL。侧车本身一律返回 3xx；S02/S05 必须决定 Go Codex Auth/API 专用 client 的 redirect 策略，推荐禁自动跟随并返回状态。仅声称 Rust 禁 redirect 不能证明 Authorization/账号头不跨域。
3. `responsesWSSession.restoreConnectionContext` 已比较渠道启用、key、baseURL、header override、proxy、advanced route、group/model；**没有比较 TLSInsecureSkipVerify、全局侧车启用状态/profile/socket/config generation**。新连接快照须纳入改变物理连接的字段；全局配置变更不能藏在未变的 ChannelSettings 后面。
4. `registerChannelClose` 与现有 shutdown 保持复用；next-call 校验与正在活动连接的关闭时机分开测试。缓存刷新并不等价于立刻终止已经认证的连接。
5. `ResetProxyClientCache` / `InvalidateProxyClient` 当前仅清理 Go 池。新增 Rust 池需明确策略变更、sidecar 重启、空闲连接清理和受限缓存容量；不应为了 token 轮换强制按账号拆无状态 HTTP 池。

### 配置、代理和目标限制

- `NormalizeHTTPTransportPolicy` 提供 response-header timeout、auto/http1、shards、渠道 insecure；`newRelayHTTPTransport` 另继承全局 `TLS_INSECURE_SKIP_VERIFY`、RELAY_TIMEOUT、RELAY_RESPONSE_HEADER_TIMEOUT、idle/max-idle。单传 ChannelSettings 会遗漏全局有效值，S02 应冻结**解析后的有效策略**。
- 未配置渠道 proxy 时 Go 使用 `http.ProxyFromEnvironment`。必须明确 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 在 Go 还是侧车求值且测试相同目标结果，避免 Docker 环境差异导致静默直连。显式代理支持 http、https、socks5、socks5h（`configureProxyTransport`），代理 URL 可含认证，不能记录原 URL；DNS 解析位置和 NO_PROXY 是支持矩阵的一部分。
- `MAX_REQUEST_BODY_MB` 默认 128（解压后），不能套 POC 1 MiB；正文、响应/WS 消息、待发队列、header/envelope、并发连接和池条目均需有界，并区分 streaming body 与缓冲上限。
- 现有 `ValidateSSRFProtectedFetchURL`/`checkRedirect` 是可复用限制入口，但并非所有渠道初始请求都强制调用它；不能声称现有初始 target 全部经过 SSRF 校验。S02 需明确可信服务端渠道目标、只允许所需 scheme、禁止 userinfo/非法 authority、内部 socket 访问权限和重定向边界；保持合法管理员配置的 baseURL，不能以域名 substring 猜 Codex。
- Dockerfile 当前构建 Go/前端，运行镜像 Debian bookworm；已有 Compose 默认启动 gateway/Redis/Postgres。建议独立 Rust Dockerfile + 可选 Compose override/profile，默认不添加不可用 sidecar 的强依赖。固定 Linux ARM64 基线，其他架构显式能力失败或说明非对齐构建；不能因主项目已有多架构流水线便声称 Rust 全平台基线成立。
- 相关 CI：`.github/workflows/ci.yml`、`docker-build.yml`、`docker-image-branch.yml`、`release.yml`。S10 确定单一构建入口与锁依赖缓存，避免每个流水线重复实现构建。运维说明可放正式工具包 README，不在 docs/ 或 plugins/ 新建文件。

### 三库和测试可执行性（新证据）

已存在 `service/text_quota_test.go:TestFixedPriceBillingDatabaseMatrix`：真实 GORM SQLite/MySQL/Postgres driver，主库环境变量 `TEST_FIXED_MYSQL_DSN` / `TEST_FIXED_POSTGRES_DSN`，独立日志库 `TEST_FIXED_MYSQL_LOG_DSN` / `TEST_FIXED_POSTGRES_LOG_DSN`；调用实际 reservation/settlement/log，输出 `select version()`/`select sqlite_version()`。缺 DSN 会 **t.Skip**，因此 green 不等于三库通过。harness 用 AutoMigrate，必须只指向 disposable 测试库。

可执行已有基线命令：`go test ./service -run '^TestFixedPriceBillingDatabaseMatrix$' -count=1 -v`（配置上述隔离 DSN 后）。当前 harness 直接注入 Usage 并调用账务，并非 Rust→Go HTTP/WS 集成；需在 relay 层集中扩展一个完整 transport fixture，沿用其数据库设置模式，测试逐次预扣、终止、缺 usage、重复终止、余额/预留/consume log。不能把已有矩阵冒充 sidecar 完整链路验收。

已有合适回归文件：`relay/responses_websocket_test.go` 有 route/binding、message limit、busy writer shutdown、stream identity/error attribution；`relay/channel/openai/relay_responses_billing_test.go` 有 Responses usage/tool/image 聚合；`controller/channel_status_codex_usage_test.go` 可保护聚合状态入口；`service/responses_usage_test.go`、`model/quota_reserve_test.go` 可保留原账务基础。优先扩展，不分散新建重复测试。

环境只做了无凭据探测：`go version` = go1.26.0 darwin/arm64；`rustc --version` = 1.91.1；`docker version --format '{{.Server.Version}}'` = 29.2.1；`docker info --format '{{.Architecture}} {{.OSType}}'` = aarch64 linux。因此 Docker daemon 和 ARM64 Linux 可用，不能继续报告“没有三库/ARM64运行条件”。尚未创建测试数据库、拉取镜像或运行测试；Rust 锁定依赖所需 MSRV 尚待核验。可在现有 daemon 新建隔离 MySQL/Postgres 容器，不接触用户服务；镜像精确版本、启动命令与四个 DSN 由实施 runner 固化并记录，不能在规划阶段伪称已经通过。

### 影响文件与后续工作量

预计修改 8 个生产集成入口：`relay/channel/api_request.go`、`relay/responses_websocket.go`、`service/codex_oauth.go`、`service/claude_oauth.go`（helper 分离需要时）、`service/codex_channel_models.go`、`controller/codex_usage.go`、`common/init.go`、`.github/workflows/ci.yml`。预计新增 1 个 Go 适配文件 `service/codex_transport.go`、1 个 Rust crate 目录（Cargo/lock/源码/fixture/README/Dockerfile）及 1 个可选 Compose 配置；确切子文件数在架构/分解阶段冻结。删除 0。现有测试文件按对应边界扩展；本分析不要求改模型、schema、GORM 依赖、relaykit/tokenkit 或前端。

若实际变更触发 schema/driver/migration，补新库+最新发行版升级、二次启动幂等、数据/index/constraint、受影响独立日志库；若只接传输，三库仍按原计划验证完整账务。不得将 planning promotion 与实现完成混淆：这些实施验证可列为 todo 的硬验收门，不要求规划阶段假装已运行。

### 必须回填草案的遗漏摘要

S02 补有效全局策略、环境代理/DNS/NO_PROXY、Go层 redirect、错误跨 url.Error 分类、内部本地 transport 重试；S05 点名聚合状态 WHAM 入口和 consume UUID/401 重试语义；S07 点名 TLS与全局配置代次导致连接失效；S08 复用真实存在的四 DSN 矩阵并明确不覆盖完整 sidecar 链路；S01/S10 更新已可用的 Docker ARM64 环境，补资源/镜像/MSRV 前置；去掉 draft 内“指定角色模型缺失”的旧阻塞叙述。上述不是新增第二套业务系统，而是原目标的必要覆盖。
