---
title: Codex OAuth 独立出站传输
status: done
issue_type: feature
complexity: XL
depends_on: []
source: CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md
baseline_head: b3531b3df2bfd49c107f5eee4e881b5cd22d207b
updated: 2026-10-14
---

# 原始请求

> CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md;请你按照计划书与skills/plan-task
> skills/sdd-plan 两个任务流程标准落实。 先拟写计划。

## 本轮交付与流程状态

本文件已完成全部独立规划评审及晋升前修订，已完成实现验收并从 in-progress 进入 done，当前实现进度见下方步骤状态表。源计划保持不动。用户追加要求完整实现、充分回归测试、真实三库及 Docker 模拟部署和真实账号全链路验收后，再向当前仓库 XueHua-s/new-api 的 main 创建 PR。规划通过不等于代码完成；S01–S08、S09 合成与 S10 运维已有实现验收，真实调用、最终独立评审与实现交付现已通过，待按授权创建本仓库PR。

依据 `skills/sdd-plan/SKILL.md` 的兼容入口及 `skills/plan-task/SKILL.md` 执行研究、代码影响、业务验收、架构、分解、并行和验证。配置：target-quality=3.5/5，max-iterations=3，全部阶段，skip-judges=false，无额外人工检查点。Phase 2a 研究 Judge [3.94/5 PASS](../../analysis/judge-research.md)、Phase 2b 代码 Judge [4.50/5 PASS](../../analysis/judge-code.md)、Phase 2c 业务 Judge [4.715/5 PASS](../../analysis/judge-business.md) 均已独立执行。Phase 3 架构 Judge [4.640/5 PASS](../../analysis/judge-architecture.md) 已执行；Phase 4 分解 Judge [4.645/5 PASS](../../analysis/judge-decomposition.md) 已执行；Phase 5 并行 Judge [4.725/5 PASS](../../analysis/judge-parallel.md) 已执行；Phase 6 验证 Judge [4.710/5 PASS](../../analysis/judge-verification.md) 已执行并完成其文字修正。上述分数仅证明各规划阶段，不证明实现验收。

用户已授权取消 Opus/Sonnet 及专用代理限制；更新后的技能使用当前可用通用子代理承担明确角色，作者与 Judge 分离。辅助脚本用普通文件操作替代，Judge 采用技能正文评分标准，不再依赖外部插件或 `prompts/judge.md`。这些依赖缺失不再是阻塞；只有实际未完成或未通过的评审阻止晋升。不得补写虚构分数或 PASS。

## 当前执行状态（分项证据，不代表整体完成）

| 步骤 | 状态与证据 |
|---|---|
| S01 | 原基线PASS4.65及实际main前置移植通过；已纠正官方musl/OpenSSL3.6.4溯源并固定侧车GNU/OpenSSL3.6.4构建，校准独立PASS4.6775；libc/feature差异明确保留，最终协议合成对照通过 |
| S02 | 契约 Panel 全部 PASS：协议4.68、安全4.730、Go调用方4.695；40边界、65场景定义（含S03实证后的受影响协议复审）；实际 main 无渠道 insecure 字段、URL规范化拒绝、头限额及正header timeout handoff差异已记录 |
| S03 | 完成：Linux32集成+vendor真实stale-checkout回归通过；独立HTTP4.6625、安全4.69、资源4.6755全部PASS；精确证据见codex-transport-rust-http及三份judge报告 |
| S04 | 完成：真实Linux Go→Rust13场景及controller外层retry计数通过；独立集成4.720、安全4.735、生命周期4.73全部PASS；修复compact截断重放与重复CL校验 |
| S05 | 三位独立审阅通过：安全4.68、事务4.70、管理兼容4.665；C09真实三库各27场景（81项）通过；保留首轮失败与修复证据 |
| S06 | 完成：Linux50集成+2vendor回归；独立协议4.695、安全4.675、资源4.6525全部PASS |
| S07 | 三位独立审阅及C04/C05通过；后续S08发现旧代污染已修复，四代隔离/1024摘要边界/无ID关闭通过最终安全复审；S08完整侧车账务及S10实际进程验收已通过 |
| S08 | 最终三位独立审阅PASS：账务4.7025、安全/并发4.675、数据库4.7275；最终校准Rust5f146实际三库117账务+81认证+6批量退出检查全部通过，无Skip/FAIL；保留旧代污染HOLD及修复证据 |
| S09 | 合成三位独立审阅PASS4.68/4.650/4.695，最终镜像二进制15场景及原始WS字节/offer验证通过；最终三位独立审阅PASS：TLS/H2 4.6875、WS/真实调用4.670、安全取证4.675；查询10个模型后HTTP/SSE与同连接两轮WS通过，usage28/28/42、精确98配额与清理通过；先前夹具路径404保留为历史 |
| S10 | 最终源码镜像、冻结夹具13次调用、两次真实120秒截止结算、256并发资源、实际Compose与回滚通过；独立运维与最终交付评审4.670 PASS，S09前置已关闭；远端CI尚未运行且未冒称通过 |

## Description：目标与范围

让管理员可选择为 Codex ChatGPT OAuth 渠道启用固定官方基线的出站传输，同时保持用户原有请求、鉴权、模型路由、流式输出和计费体验。基线为 Codex CLI 0.162.1 / Linux ARM64。能够比较并解释 TLS、HTTP/2 与 WS 的实际行为，不能承诺上游无法识别或不会触发风控。主要受益者是调用用户（流式响应和正确账务）、管理员（可控启停与诊断）、维护者（锁定依赖及可复现对照）和账号所有者（凭据/会话隔离）。业务成功以 AC 的可观测行为及证据衡量，不捏造性能收益或财务 ROI。

范围包含推理 HTTP/SSE、Responses WS、Codex OAuth 交换/刷新、模型列表和 WHAM 用量/额度管理请求、私有协议、独立构建与受限部署、回归和回滚证据。Go 保持凭据生命周期和计费责任，Rust 只处理传输。

范围不包含原始 TLS 隧道、全提供商客户端替换、强制 HTTP 按账号拆池、第二套 WS/计费状态机、价格修改、数据库架构迁移、前端配置页、自动追随 latest、自动生产发布。不得新增 docs/ 或 plugins/ 下文档。运维说明放正式工具目录，验收记录放 .specs/analysis/。

场景：管理员关闭功能时保持原有出口；启用后用户 HTTP 流和多轮 WS 使用侧车并由原 Go 链路结算；侧车断连或发送状态不明时返回可诊断失败，禁止静默直接重放；管理员关闭开关后仅后续新请求回到旧出口，进行中的调用依现有规则终止/结算。

依赖与假设：官方固定版本源码/锁文件/二进制可校验，具备 Linux ARM64 构建运行环境、Go/Rust 工具链及真实三库测试实例；最终真实调用需要执行时安全提供的可用账号。缺失环境时如实记录待验证项，不用历史 POC 或 mock 替代。无需额外用户决策即可完成规划；私有 schema、资源数值和代理支持表由 S02 固化后才能编码。资源上限由现有请求限制及多模态需求推导，禁止未经测量承诺延迟 SLA；可用性由明确失败、取消回收和不重放保证。

## Acceptance Criteria

勾选只表示当前证据已满足对应验收项；历史失败保留在评审报告。当前逐项证据见 [最终审计索引](../../analysis/codex-transport-final-audit.md)，AC01–14按对应独立评审与最终镜像证据勾选；AC05的凭据边界必须继续在每次live运行保持，AC15真实调用与清理证据现已闭环；全部勾选指向本次最终证据，不代表远端CI或生产发布。

- [x] AC01 默认关闭与隔离：未配置或关闭时 HTTP/WS/OAuth/管理请求保持旧出口；Codex Auth 默认关闭时拒绝 insecure/redirect 是独立安全审阅要求的明确修正，非完全保留旧缺陷；开启时仅明确 Codex 入口进入侧车；Claude OAuth 与其他渠道测试仍走原出口。
- [x] AC02 HTTP 保真：合成 GET/POST 含查询参数、重复端到端头和流式 body，mock 收到对应值；3xx/4xx/5xx 状态与错误体保持；压缩头与实际 body 一致；不跟随跨域重定向携带凭据；Rust 不改业务 body/JSON，Host/SNI 指向真实上游；Connection 列出的头被移除，Content-Length/Transfer-Encoding 不冲突。
- [x] AC03 SSE 增量与资源：mock 用事件同步屏障等待首事件被 Go 观察后再发送终止事件；body 不全量缓冲；取消使上游停止，资源归还；超过已定义大小/连接/队列上限明确失败。S02 必须固化请求/消息大小、并发连接、队列字节上限及超时继承规则，并给出每项 limit−1/limit/limit+1 期望和取消后资源计数断言；不沿用 POC 1 MiB/90 秒限制。
- [x] AC04 错误与重试：连接前失败、请求发送不明、收到头后断流、首事件后截断、503 均有确定错误分类及精确上游请求计数；Rust 不做应用层重试，发送不明或已发送不得透明回退/重放。传输库内部重试也必须受审查。
- [x] AC05 安全边界：客户端伪造内部元数据被剥离；元数据和内部错误头不外泄；无匿名公网代理；目标/代理遵循现有限制；证书默认校验；日志、镜像和 fixture 不含可用凭据、Cookie、真实正文。
- [x] AC06 状态隔离：两账号确定性交错请求不串 Authorization/账号头/取消；默认无共享 Cookie jar；HTTP 池按 origin、代理、TLS/profile、HTTP 策略及信任配置区分，允许无状态账号共享池。
- [x] AC07 WS：只有上游 WSS 握手成功后本地 Upgrade 成功；失败状态与必要错误体可读取；文本/二进制、分片、背压、消息上限、ping/pong、关闭码和双向关闭都有精确断言；侧车不改业务事件 ID 或 usage。
- [x] AC08 WS 绑定：不同账号、会话、凭据代次不复用；token 轮换、渠道关闭、路由/物理策略变化触发既有关闭/重连；同一会话连续两次 response.create 分别预扣/结算。
- [x] AC09 计费：HTTP/WS 成功、失败、取消、缺 usage、重复终止的余额、预留、退款、consume log 与既有规则一致，每次至多一次终结；缺 usage 不伪造精确值；取消不等于无消耗；保持饱和和审计不变式。
- [x] AC10 官方对照：同 CLI 版本、平台、目标、请求、代理及 CA 对比首次/恢复 TLS 与 HTTP/2 SETTINGS、窗口、伪头、HEADERS/HPACK、复用/关闭及 OAuth WS；仅去除随机数/临时密钥等允许差异，保存原始扩展顺序；只有官方实际随机的扩展顺序可做无序比较，不任意排序支持组/密码套件；报告未覆盖路径。
- [x] AC11 代理/覆盖：现有支持的 HTTP CONNECT、HTTPS、SOCKS 按实际配置验证；不支持则显式拒绝，绝不静默直连；人工 HTTP1/shard/CA/insecure 覆盖单列偏离默认基线的声明。
- [x] AC12 数据库：真实 SQLite、MySQL、PostgreSQL 对完整预扣—usage—结算/退款链路得到一致不变式；记录版本、命令、结果。已有 SQLite 基线不替代三库验收。
- [x] AC13 构建与运维：Cargo.lock、features、crypto provider、目标平台可复现；默认关闭、健康/能力/profile 不匹配、长流、进程重启、socket 权限、连接清理和回滚演练有证据；不宣称其他平台自动对齐。开启但协议版本/profile/HTTP或WS能力不匹配时，在发送生成前明确失败，上游请求计数为零；停用后仅新调用回到旧出口，已有调用不重放。

- [x] AC14 辅助请求：开关开启时逐项验证 OAuth code 交换、refresh、模型发现/渠道模型更新、WHAM 用量及额度管理入口进入侧车并选择正确 API/Auth profile；关闭时仍走旧客户端。刷新和凭据轮换仅 Go 发起，侧车不独立刷新；Claude 共享 helper 调用及 GitHub release 查询不被误改；启用 profile 不运行时跟随 latest。
- [x] AC15 真实调用证据：合成契约及安全前置通过后，先查询执行账号当时支持模型，再以最少 HTTP/SSE 与 WS 多轮调用验证实际事件、usage 到 Go 原结算链路，记录脱敏的版本/模型/传输/结果/账务关联；可用凭据缺失则保留此项未通过，不用历史 HTTP 200 或 mock 代替。不在 Git、镜像层、命令参数或报告保存可用凭据。

## Architecture Overview

### 策略与必读依据

客户端 → Go 鉴权/路由/转换/预扣 → 私有 HTTP 或本地 WS → Rust TLS/HTTP/SSE/WSS → 上游；响应事件反向流回 Go 原有 usage/结算。Rust 终止上游 TLS，不能用 CONNECT 隧道让 Go 继续产生 TLS。复用现有 HTTP 响应及 WS 会话接口，避免再造请求转换、刷新或账务状态机。

实施 S01、S02 及未来每次版本升级前，必须阅读[研究技能](../../../.claude/skills/codex-transport-research/SKILL.md)、[版本研究报告](../../analysis/codex-transport-research.md)、[当前代码分析 Phase 2b](../../analysis/codex-transport.md)及[原始计划](../../../CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md)，按技能维护源码/历史/新实测的证据分层。分析前半旧结论由 Phase 2b 全面复查替代。架构将三个已通过 Judge 的遗漏摘要纳入下列边界；实施步骤已由 Phase 4 同步，仍须后续独立门禁才能晋升。

### 组件与接口契约

以下是拟实现的 Go 边界，具体 wire 字段编码和数值限额由 S02 在两端编码前冻结。`CodexTransportOptions` 仅容纳调用方已有的 proxy、渠道 HTTP 策略和 API/Auth 用途；不暴露 TLS 参数列表，不接收账号状态或计费对象。

| 组件/位置 | 对外接口及职责 | 隐藏的决策 |
|---|---|---|
| `service/codex_transport.go`（新） | `GetCodexHTTPClient(opts CodexTransportOptions) (*http.Client, error)`；关闭时委派现有 client，开启时返回专用 RoundTripper；`DialCodexWebSocket(ctx context.Context, target string, headers http.Header, opts CodexTransportOptions) (*websocket.Conn, *http.Response, error)` 保留握手失败响应 | 配置快照、能力检查、策略继承、UDS、本地元数据、错误类型和取消，均集中在适配层 |
| 专用 `http.RoundTripper` | `RoundTrip(*http.Request) (*http.Response, error)`，标准 Body 生命周期；取消关闭本地 body/socket 并传播上游 | method/query/重复头和 streaming body 编码、内部头过滤、URL/Host/SNI 和上游响应头恢复 |
| 同一 service 模块的配置快照 | `CodexTransportGeneration() uint64` 供既有 WS 绑定比较，返回本进程不可变启动快照代次；启停/socket/profile 变更须重启 | 不实现全局热更新；运行时渠道策略沿用原通知与有效策略快照比较，generation 不是账号 ID |
| `tools/codex-transport/`（新 Rust crate） | 私有 `/v1/http`、`/v1/ws` 和 `/v1/health`；健康返回 protocol/profile/目标平台/HTTP及WS能力 | 对外 TLS、池、代理、限额及背压；不认识配额、数据库或 OAuth 刷新 |
| 现有 `doRequest` / `DoWssRequest` | ChannelTypeCodex 且功能开启时选择适配器；保留 adaptor/header override 顺序、ping、body close、非 Codex 行为 | 业务只判断渠道与 transport 错误，不自行拼私有协议 |
| 现有 Responses WS 会话、usage、quota | 继续每次 response.create 鉴权/预扣/聚合/终结 | 一次终结及缺 usage/取消规则保持原链路，Rust 只传字节和事件 |

API/Auth 用途是明确入口参数，不通过 URL 字符串猜渠道。HTTP 返回标准响应使现有解析器保持不变；WS 在适配层保留 `*http.Response`，调用方转换为既有错误时有界读取必要错误体，不能再提前关闭丢失。只有上游 WSS 握手成功才对本地连接发送 101。

### 私有协议、安全与错误

Linux 首期只实现 UDS，Compose 共享受限目录并固定 UID/GID/权限；不同时引入没有需求的 TCP 认证子系统。未来 TCP 必须另有受限网络和服务认证才能启用，本期配置 TCP 显式拒绝。健康/能力不匹配在发送生成前失败。元数据包含版本、完整目标、重复端到端 headers、解析后策略、profile/API或Auth用途和非敏感追踪 ID；业务 body 保持独立流。Go 在用户 header override 后剥离并重建保留字段，Rust 消费且不转发；内部错误字段也不出现在外部响应。

仅接受可信服务端渠道或内置 OAuth 目标，生产目标仅允许 https/wss；http/ws 只允许隔离合成测试 fixture，不携带可用凭据，线上配置明确拒绝。拒绝 userinfo/非法 authority；保留符合该安全边界的管理员 baseURL，不虚称所有旧初始请求已经经过 SSRF 校验。S02 列出需复用的目标/代理校验及明确拒绝项。Host/SNI 使用目标；两端移除固定和 Connection 指定 hop-by-hop 头，确保 Content-Length/Transfer-Encoding/Content-Encoding 与实际流一致。请求/消息/队列/header/连接/池条目分别有限额，不能将请求最大值当作队列缓冲目标；请求上限继承现有解压后 MAX_REQUEST_BODY_MB（当前默认128），其余数值与 limit−1/limit/limit+1 表在 S02 固化。

错误结构至少包含 phase（local-connect / upstream-connect / maybe-sent / headers-received / body-truncated）、mayHaveSent、已获上游状态和脱敏原因。服务端在头前本地错误使用私有标记；正常上游 3xx/4xx/5xx 原样返回；头后错误以 Body.Read 错误/流截断传播，绝不伪造正常 EOF 或补造 usage。Go 用 `errors.As` 穿透 `http.Client.Do` 的 `*url.Error` 查 typed error，在 `doRequest` 构造业务错误处附加 `ErrOptionWithSkipRetry`；发送未知或已发送必须禁止外层换渠道重放。本地连接前失败也不自动换回 Go TLS，是否允许业务重试必须在 S02 明确并通过请求次数断言。

Rust、Go→UDS transport 和业务外层三层均审查重试；不能只禁 reqwest 的应用 retry 而遗漏 hyper/H2 或 Go GetBody/幂等重试。所有 Codex 专用 API/Auth HTTP client **Go 层和 Rust 层均禁自动 redirect**，返回上游状态；这与官方默认 redirect/Cookie 行为的差异是明确安全边界。普通 Claude/GitHub client 保持原策略。

### 有效策略、池与凭据隔离

Go 统一求值渠道与全局的 timeout、response-header timeout、auto/http1、shards、TLSInsecureSkipVerify、idle/max-idle、信任/profile；复用 NormalizeHTTPTransportPolicy 的规范化语义并补全 `newRelayHTTPTransport` 的全局继承。不得只序列化 ChannelSettings。Go 按目标调用现有环境代理规则（HTTP_PROXY/HTTPS_PROXY/NO_PROXY），传给 Rust 的是明确 direct 或完整已选代理；Rust 禁自身环境二次求值，Docker 环境差异不能改变出口。认证代理 URL 不进日志/池诊断；http/https/socks5/socks5h、DNS 解析位置及 NO_PROXY 在 S02 支持矩阵中逐项定义，未实现项显式拒绝。

HTTP 池键使用 origin + 解析后代理 + TLS/profile/信任 + HTTP策略/shard；不含 access token、账号或 Cookie。Authorization/账号头逐请求设置，默认无 Cookie jar，共享物理池不得带共享可变身份。池容量与空闲清理有界；策略变化进入新池键，旧池按空闲生命周期释放；token 刷新不为无状态 HTTP 强制拆池。证书默认验证；Auth profile 显式拒绝 insecure。API profile 的 insecure/CA/HTTP1/shard 兼容则记录偏离基线，否则明确拒绝，不静默忽略。

### 全部入口与 WS 失效

HTTP 推理集中改 `relay/channel/api_request.go`；`service/codex_oauth.go` 的 exchange/refresh 走 Auth，用通用旧 helper 保留 Claude；`codex_credential_refresh*.go` 调用链仍由 Go 控制。`service/codex_channel_models.go` 只将实际模型查询改为 API，启用时固定 client version 0.162.1；GitHub release 查询不改道、不覆盖 profile。`controller/codex_usage.go` 的 **fetchCodexChannelWhamData 和独立 fetchCodexChannelUsage 聚合入口**都接 API，覆盖 usage、reset credits GET 和 consume POST。聚合入口保留原默认传输策略，避免顺手改变其渠道设置语义；将来统一另行变更。consume 的 redeem_request_id/body 原样传输；已有收到401/403后的明确业务刷新重试保留，未知发送故障不能再次调用函数生成新 ID 或重放 POST。

WS 每个业务会话独占上游连接。沿用 `responsesWSSession.restoreConnectionContext` / `registerChannelClose` 的渠道、账号、凭据、模型路由检查，在快照新增有效 TLS/代理/HTTP策略及 transport generation；启动配置的启停/socket/profile 变更经重启关闭旧连接；运行时渠道/凭据/物理信任策略变化通知现有连接关闭路径，下一次调用再验证，分别覆盖活动调用和空闲会话；不把仅缓存清理当作断开已认证 WS。取消、控制帧、关闭码、分片重组及背压属于传输；每次生成的终结账务仍由原 session 负责。

### 构建、依赖与验证边界

固定 CLI 0.162.1 / Linux ARM64。研究已核实 tokio-tungstenite 0.28.0 fork rev `0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186` 与 tungstenite 0.27.0 fork rev `4fffad30fe373adbdcffab9545e9e9bf4f2fc19f`；S01 继续核验传递 git patch 无 SSH 凭据可 fetch、完整 feature graph、MSRV 和官方二进制 hash。HTTP native、显式 CA rustls、WS rustls 分开构建/验证；POC prefer-post-quantum 不能凭顶层 Cargo.toml 声称官方 feature 已确认。Rust 工具链、Cargo.lock、crypto provider、目标和最终 feature graph 一起固定。

现有 Docker daemon 为 Linux aarch64，Go 1.26 和 Rust 1.91.1 已探测可用；这只证明可开展测试。S08 复用 `TestFixedPriceBillingDatabaseMatrix` 的四 DSN 模式（TEST_FIXED_MYSQL_DSN / TEST_FIXED_POSTGRES_DSN / TEST_FIXED_MYSQL_LOG_DSN / TEST_FIXED_POSTGRES_LOG_DSN），在 disposable 主库和独立日志库运行完整侧车 HTTP/WS fixture；缺 DSN 的 Skip 不是 PASS。现有 harness 直接注入 Usage，必须补真实 transport→原用量解析→账务的断言。无 schema/driver 变更；若实际出现，则按项目要求加升级/新库/幂等矩阵。

预计新增正式 crate（源码/lock/合成fixture/README/Dockerfile）、`service/codex_transport.go` 和可选 Compose override；修改 `api_request.go`、`responses_websocket.go`、`codex_oauth.go`、必要时 `claude_oauth.go`、`codex_channel_models.go`、`controller/codex_usage.go`、`controller/oauth_flow.go`、Codex OAuth 控制器及其现有测试、`common/init.go` 与单一 CI 构建入口。S05 优先复用 `model/auth_flow.go:ConsumeAuthFlow`，仅必要时兼容扩展该文件，禁止新增 schema；安全控制证据见 [security](../../analysis/codex-transport-security.md)。优先扩展既有测试，不新增前端配置页；仅安全门必要时兼容既有再认证交互并遵循前端技能。实际 main 前置移植已触及 relaykit DTO/Responses 转换，须执行其独立构建并纳入回归；tokenkit、模型价格和 schema 不在计划改动范围。运维说明放工具 README，验收证据放 .specs/analysis，不在 docs/plugins 新增文档。默认 Compose 不依赖侧车；关闭开关仅影响后续新请求，现存调用按原规则终结，不透明重放。

## Implementation Process

每步 M/L 表示中/大工作量，不承诺日期；L 必须按下列 a/b/c 切片分别审查。共 10 步、30 个切片。命令编号见“验收命令”；均为实施验收要求，已运行的原代码基线另记 [validation](../../analysis/codex-transport-validation.md)，不能混作新实现通过。

| 步骤/阶段 | 可审查切片与明确输出 | 依赖 | 验收与阻塞处理 |
|---|---|---|---|
| S01 Setup / M | a. 核对 HEAD/规则与白名单 POC，记录 `.specs/analysis/codex-transport-validation.md`；b. 在 `tools/codex-transport/fixtures/` 提升纯合成素材，在 `baseline.json` 固定版本/平台/hash/依赖/features/provider；c. 核验双 fork、传递 git patch、MSRV，确定 `rust-toolchain.toml` 与构建容器版本 | 无 | C01；AC10/14。hash 已恢复验证，仍需执行官方版本核验和采样；缺 POC 按官方源码重建，SSH源不可获取则用同 revision HTTPS patch，不替换成最新版。不能复制 target/下载包/CA私钥/真实流量 |
| S02 Foundational / L | a. `tools/codex-transport/README.md` 冻结 v1 wire、`/v1/http`、`/v1/ws`、`/v1/health`、Go接口和共享 `fixtures/contracts.json`；b. 冻结请求/WS消息/队列/header/并发/池限额及边界期望、各超时继承、有效代理/TLS策略；c. 冻结错误阶段/重试/redirect/可信目标与配置生命周期表（下文硬门） | S01 | 契约逐字段双端审阅；AC02–08/11。缺数值或错误期望时禁止 S03/S04 编码；不能以未来补文档替代。Rust/本地Go/业务三层重试均列请求计数，连接前失败也禁自动重放（保守策略），返回可诊断错误供后续新请求处理 |
| S03 Foundational HTTP / L | a. crate `Cargo.toml`/`Cargo.lock`、`src/main.rs`、`src/protocol.rs`：UDS、健康及元数据校验；b. `src/http.rs`：streaming HTTP/SSE、status/重复头/压缩/取消和分阶段错误；c. `src/policy.rs`：有效策略、池、代理、限额；集中 `tests/transport.rs` 复用契约 fixture | S02 | C02/C03；AC02–06/11。首事件同步屏障、断流非正常EOF、请求计数及取消资源归还；防重放须包含 reqwest/hyper/H2内部行为。池有界且无可变身份/Cookie。依赖不满足时停在锁定构建门，不绕过证书/feature要求 |
| S04 User story HTTP / L | a. `common/init.go` 默认关闭启动配置，`service/codex_transport.go` 实现不可变快照、`GetCodexHTTPClient`/RoundTrip/健康能力/typed error；b. `relay/channel/api_request.go:doRequest` 仅Codex分流，override之后构造私有元数据，保留ping/body/redirect；c. 在现有相关测试扩展端到端头/流/取消和三层retry，`errors.As` 穿透 `url.Error` 后附 `ErrOptionWithSkipRetry` | S02；联调 S03 | C03/C04；AC01–06。所有侧车传输错误禁透明回退，真实上游状态保留既有业务分类。认证元数据不泄漏；侧车不可用/能力不符在发送前明确失败。不得替换全局client |
| S05 User story 管理 / L | a. `service/codex_oauth.go` 专用Auth交换/刷新，必要时调整 `claude_oauth.go` 保留旧helper；检查 `codex_credential_refresh*.go` 调用链；在 `controller/oauth_flow.go` 与 Codex OAuth 控制器加入 flow 用户/会话绑定及单次消费，复用 `model/auth_flow.go:ConsumeAuthFlow`，扩展现有控制器测试覆盖错误绑定/过期/重放/并发，以及Codex凭据替换的服务端step-up/PAT防旁路；独立认证三库runner执行C09；b. `codex_channel_models.go` 注入API client和固定0.162.1，GitHub查询保持普通client；c. `controller/codex_usage.go` 同时接 `fetchCodexChannelWhamData` 与独立 `fetchCodexChannelUsage`，覆盖usage/reset credits GET及consume POST | S04；OAuth安全硬门 | C04/C09；AC01/04/05/14。扩展 `controller/channel_status_codex_usage_test.go` 保护聚合入口原默认策略；已获401/403后业务刷新可保留，未知发送不可再调consume产生新redeem_request_id。Claude/GitHub不得误改道；控制未验证时本步不通过 |
| S06 User story WS transport / L | a. `src/ws.rs` 用固定fork实现本地WS→WSS，先上游握手，失败status/body有界返回；b. 双向文本/二进制、分片/deflate、ping/pong/关闭码/原因、背压限额及取消；c. 扩展同一 `tests/transport.rs` 的确定性WS场景及逐次create计数 | S03 | C02/C03；AC07/10。禁止先伪101、改业务ID/usage、create重放；代理/证书按WS实际路径验证，不能拿HTTP通过代替。fork不可构建时修patch/feature，不能静默改用不同实现 |
| S07 User story WS integration / L | a. `service/codex_transport.go:DialCodexWebSocket`、`api_request.go:DoWssRequest` 接入并保留握手响应；b. `relay/responses_websocket.go:restoreConnectionContext/registerChannelClose` 扩展有效策略/generation快照和既有关闭路径；c. 扩展 `relay/responses_websocket_test.go` 活动/空闲两类配置或凭据失效、多轮create及跨身份绑定 | S04、S06；OAuth安全硬门 | C04/C05；AC07/08/14。复用原session/终结账务，关闭一次；未有WS能力直接拒绝。启动配置与运行时渠道变更语义见下文，禁止假设未实现的热更新入口 |
| S08 Verification billing / L | a. 现有 `relay/responses_websocket_test.go` 集中HTTP/WS侧车→usage→结算 fixture（确需新文件仅加一个 `relay/codex_transport_integration_test.go`）；b. 成功/失败/取消/缺usage/重复终止及饱和审计精确余额、预留、退款、consume log断言；c. `tools/codex-transport/scripts/test-databases.sh` 提供隔离真实三库/独立日志库和四DSN，运行全链路 | S05、S07 | C05/C06；AC09/12。沿用 `TestFixedPriceBillingDatabaseMatrix` 模式而非直接注入usage冒充完整链路；任何DSN缺失/Skip不通过。若触及schema/driver，追加新库、发行版升级、两次启动及约束数据检查；无镜像则先恢复隔离实例再验收 |
| S09 Verification protocol / L | a. `tools/codex-transport/scripts/compare-baseline.py` 与合成fixture固化同平台官方/侧车采样；b. 首次/恢复native、CA-rustls、WS-rustls及实际POST /responses H2/WS逐层对照，代理/覆盖独立矩阵；c. 用执行时安全输入的账号先发现支持模型，再少量真实HTTP与多轮WS验证，证据写validation | S03、S06；c等S05/S07/S08 | C07；AC10/11/15。保留原始扩展顺序，仅删除有依据的随机差异；不能用GET /models替代推理H2。缺凭据仅阻塞真实验证，不影响合成验证推进，但AC15保持未通过；禁止沿用历史200/23+5=28 tokens作为新验收 |
| S10 Polish operations / L | a. `tools/codex-transport/Dockerfile` + `.github/workflows/ci.yml` 单一固定Linux ARM64构建入口；b. 根 `docker-compose.codex-transport.yml` 可选override，UDS目录/UID/GID/权限/健康/资源与默认关闭；c. 工具README完成部署、灰度、排空/关闭/回滚、依赖升级重采样，validation汇总所有AC证据与缺口 | a/b可在S03后；最终等S08/S09 | C02/C08及全部AC；重启/长流/取消/空闲清理不丢账，回滚不重放。平台能力不匹配显式拒绝；CI不可运行则本地同构构建先验证，远端结果单列未验证；不自动发布/合并 |

### 实施基线与目标分支前置

本计划依据工作树 `b3531b3df2bfd49c107f5eee4e881b5cd22d207b`；已存在的 Responses WS、auth-flow 原子消费和四DSN harness 是实施前置，不代表较旧目标 main 具备这些能力。2026-10-14 fetch 后 `origin/main=517075d56`，本工作树相对它 ahead 310 / behind 0、差异涉及1646文件。用户要求PR目标为当前仓库 `XueHua-s/new-api` 的 main，最终PR须包含实现及验收，不得不加检查地夹带310项历史变更。

最终交付须在基于目标main的隔离分支集成；保留本baseline引用及能力前置声明。S01在**实际实施分支**重新核验HEAD与上述入口、auth-flow、测试fixture及依赖；若仍为较旧main，先明确同步必要前置或重新分析该基线，再执行本计划，不可直接照路径假设功能存在。必要前置须逐项审查并纳入实现及回归；不得由计划引用隐式视为已合并。PR创建前复核base/head及文件清单，禁止以直接对当前310提交分支开PR代替隔离。

### S01 门禁拆分（实施依赖核验）

S01 分开记录两个门：官方基线/依赖素材由独立 Judge 4.65/5 PASS；实际 main 前置兼容性由 `judge-main-prerequisites.md` 独立复审通过。独立 Rust S03 不依赖 Go 主模块或 Responses WS 实现，因此在 S02 全部三位独立评审通过后可以编码和运行独立合成测试。此依赖拆分已获基线审计员确认，不代表 S03依赖构建或整体传输验收通过。Go 业务接入已获 main 前置兼容门解锁；S04c 跨进程联调仍须 Rust 实现门通过；不得以 Rust 开工豁免原有 Go/认证/计费/三库门。

### S02/S04/S07 配置与契约硬门

一期 `common/init.go` 仅从启动环境读取开关/socket/profile；在服务初始化时构建不可变配置快照，`CodexTransportGeneration()` 返回本进程快照代次。**不提供热更新环境配置 API**。变更环境配置必须重启 Go：旧进程按既有 shutdown 路径关闭活动及空闲 WS，活动调用原账务终结；新进程只接新请求，不跨进程复用连接。S07须测试这两种会话的shutdown行为。代码内不宣称环境变量改动会自动通知连接。

运行期间的渠道关闭/凭据/代理/TLS/路由修改继续经过现有渠道更新通知与 `registerChannelClose`，并在 `restoreConnectionContext` 的下一调用检查有效策略快照；S07先定位并复用该通知调用链，若已有通知未覆盖物理字段则补同一路径，而非新增第二套注册表。活动调用和空闲连接分别断言；只清缓存不通过。未来若加入全局热更新，必须另行定义原子发布、generation递增和关闭通知接口，不能在本期隐含承诺。

S02明确：默认请求上限继承解压后 `MAX_REQUEST_BODY_MB`（当前128 MiB），不全量缓冲；其余消息/队列/header/连接/池上限给具体数值与limit−1/limit/limit+1；不沿用1 MiB/90秒/15秒POC常数。Go统一解析全局与渠道timeout/header-timeout/auto-http1/shards/insecure/idle/CA；Go按目标求值 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`，Rust只接受已选direct/proxy。支持表逐项写http CONNECT、https、socks5、socks5h、代理认证和DNS位置，不支持项明确失败。API人工覆盖记录偏离；Auth拒绝insecure。三层重试和Go/Rust双层redirect都通过精确次数/目标域断言。

### 源计划1–10覆盖追踪（要求索引，不是完成声明）

| 原始章节/要求 | 实施落点/证据 |
|---|---|
| §1 六项决策；§3职责；§10复用与范围 | S02–S07；AC01/06/08/09。Rust终止TLS，Go保留路由/usage/账务，HTTP按策略共享、WS会话独占，不承诺不可识别，不自动latest |
| §2全部历史证据边界、405原因及已有WS入口 | S01/S06/S08/S09；validation区分历史、原代码基线、新集成。9项SQLite、503一次、IncompleteRead、23/5/28 tokens、旧JA3/SETTINGS均不替代验收；不重建WS状态机 |
| §4.1 本机协议/能力/非CONNECT、§4.2完整HTTP | S02–S04；UDS-only及TCP显式拒绝，版本/健康/标准response、stream body、元数据、目标/Host/SNI、重复头/hop-by-hop、压缩/长度、3xx及4xx/5xx/头后错误；AC02–05 |
| §4.3 WS全部事件与绑定/失效 | S06/S07/S08；AC07–09。上游先握手、状态错误体、分片/控制/背压/限额/双向关闭、ID/usage原样、多次create逐次结算、活动/空闲失效 |
| §4.4 池与身份；§4.5 TLS及人工覆盖 | S02/S03/S07/S09；AC06/08/10/11。无token账号池键/全局Cookie；origin/proxy/profile/信任/HTTP策略隔离；native、显式CA-rustls、WS-rustls分路，默认验真 |
| §5依赖数字及可重建features | S01/S03/S09；baseline.json/Cargo.lock固定reqwest0.12.28、native-tls0.2.14、openssl0.10.75/openssl-sys0.9.111/openssl-src300.6.1+3.6.3、rustls0.23.45、aws-lc-rs1.18.1、hyper1.8.1/hyper-util0.1.20/h2 0.4.19、tokio1.52.3；双WS fork revision见研究报告；核验aws_lc_rs/std/tls12/prefer-post-quantum合并图、native-tls-vendored、glibc/musl差异，不误选reqwest0.13 |
| §6所有建议入口及Claude共享helper警告 | S04/S05/S07；AC01/14。按明确provider/渠道选择，含两WHAM入口、额度consume、OAuth后台刷新、GitHub查询例外；service/http_client和policy只复用规范化，adaptor/usage/handler保持业务 |
| §7阶段0–4及命名交付 | S01基线/fixture；S02协议；S03独立HTTP；S04/S05灰度出口；S06/S07完整WS；S08–S10代码+验证+运维。未完成WS时声明能力并拒绝，不静默直连 |
| §8全部验收矩阵及命令 | AC01–15 + C01–C09；原建议 `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model` 纳入C04；三库/账务/饱和审计、代理、H2/HPACK/窗口/复用/关闭、版本声明、取消重启均有责任步骤 |
| §9本机资源、隔离及CA清理 | S01/S09；POC白名单源码/探针可重建，不提交report/manifest真实内容、target/私钥；Colima宿主/tmp用docker cp，停止容器只取资料非部署依赖；离线合成网络，清理new-api-poc.crt后update-ca-certificates --fresh再测不可信拒绝 |
| §10完成定义、复杂度检查及发布边界 | S10逐AC审计；接口/错误契约和既有调用方回归证明替换底层不改业务；独立Rust/Go/条件模块构建、完整数据库/协议实测、默认关闭/灰度/回滚/升级说明；不得用200/JA3/mock概括完成，发布合并另行安排 |

### 并行执行与文件所有权

当前可用执行工具为 `collaboration.spawn_agent` / `followup_task` / `send_message` / `wait_agent`；均为通用代理，由任务 prompt 指定角色并继承当前模型。root 负责调度/验收和共享记录集成，最多同时三个 worker；不固定不可用模型或专用 agent type。Judge 与作者分离，评审占用相同槽位，槽位不足时排队，不突破并发限制。

| 执行批次 | 可并行切片与角色 | 完成屏障 |
|---|---|---|
| A | transport researcher：S01；随后 contract architect：S02 | 顺序执行，两端契约、数值上限及错误期望冻结并评审后才能编码 |
| B | Rust engineer：S03；Go engineer：S04a/b 与本地单测 | S04c 跨进程联调必须等 S03 完成；S04 整步不得提前标记完成 |
| C | Rust engineer：S06；Go engineer：S04c→S05；operations engineer：S10a/b | 各自从 S03 完成启动；S05 等 S04c 通过；S10a/b 仅构建部署框架，不声称最终运维验收 |
| D | Go session engineer：S07；protocol verifier：S09a/b；management engineer：尚未结束的 S05 | S07 等 S04 与 S06，且完成适用安全审查后才通过；S09a/b 等 S03/S06；三者文件独占 |
| E | billing verifier：S08；protocol verifier：尚未结束的 S09a/b | S08 等 S05/S07；仅合成协议验证与账务验证可并行，隔离端口/socket/容器项目及数据库 |
| F | protocol verifier：S09c live | 等 S05/S07/S08 与 S09a/b 合成、安全硬门全部通过及可用凭据；缺凭据保持阻塞，不跳过 AC15 |
| G | operations integrator：S10c 及最终集成 | 等 S08、完整 S09 和 S10a/b；执行全部最终检查、灰度/回滚并逐 AC 审计 |

依赖图按切片展开为 `S01→S02→{S03,S04a/b}`、`{S03,S04a/b}→S04c→S05`、`S03→S06`、`{S04c,S06}→S07`、`{S05,S07}→S08`、`{S03,S06}→S09a/b`、`{S05,S07,S08,S09a/b}→S09c`、`S03→S10a/b`、`{S08,S09c,S10a/b}→S10c`。无循环；主集成链为 S01→S02→S03→S06→S07→S08→S09c→S10c，S04c→S05 是 S08 的另一汇合前置。合成准备不等于对应整步完成。

| 写入所有权 | 文件/交接规则 |
|---|---|
| Rust engineer（S03→S06 顺序） | 独占 crate `src/`、`Cargo.toml`、`Cargo.lock`、`rust-toolchain.toml`、`tests/transport.rs`；所有依赖/锁更新只能由此角色执行。S09/S10 发现依赖问题发变更请求，不能自行改锁；修复完成重跑受影响验证 |
| Go engineer→Go session engineer | `service/codex_transport.go`、`relay/channel/api_request.go` 及相关 service/channel 测试从 S04 完成后显式交接 S07；禁止两者同时写。S04 独占 `common/init.go`；涉及现有 client/policy 修改也先登记到此所有权 |
| management engineer（S05） | 独占 `service/codex_oauth.go`、必要的 `claude_oauth.go`、`codex_credential_refresh*.go`、`codex_channel_models.go`、`controller/codex_usage.go`、`controller/oauth_flow.go`、Codex OAuth 控制器/现有测试；必要时 `model/auth_flow.go`，Codex路由/再认证适配及 `tools/codex-transport/scripts/test-auth-databases.sh`；必要前端适配由root明确登记后再写。S07 只读这些接口，所需修复回交 S05 |
| Go session engineer→billing verifier | S07 独占 `relay/responses_websocket.go` 与 `relay/responses_websocket_test.go`，验收后交接 S08；S08 独占账务回归及 `tools/codex-transport/scripts/test-databases.sh`，不得与 S07 同写会话测试 |
| protocol verifier（S09） | 独占 `tools/codex-transport/scripts/compare-baseline.py` 与 `tools/codex-transport/fixtures/protocol/`；S01/S02 冻结的 baseline/契约只读；需要修改冻结契约先停依赖任务由 root 协调回归 |
| operations engineer（S10） | 独占 Dockerfile、根 Compose override、`.github/workflows/ci.yml`；README 在 S02 契约冻结后交接，协议章节变化仍需双方复审 |
| root / 各独立 Judge | root 独占任务状态与汇总 validation；worker 在各自 scratchpad 记录命令/退出码/版本/脱敏结果，root 集成。每位 Judge 独占自己的评审文件，不修改作者产物 |

执行指令：每次派工明确切片 ID、已通过的前置、允许写入路径、只读契约、必读规则、验收命令与交接对象；先检查当前差异，不覆盖其他代理修改。碰到未分配的共享文件时向 root 交接所有权再写，不用复制实现绕开冲突。切片完成提交实际证据和待解决项，root 在前置/独立评审通过后解锁后继。若前置契约变化，暂停依赖编码并重跑受影响门禁。独立测试进程不共享可变全局测试环境；三库 runner 和 live 由指定 owner 单次运行。三名 worker 是上限而非目标，必要的串行优先于虚假并行。

### 验收命令与环境前置

以下是交付验证接口；实际 main 与初始规划的测试名差异以 C06 和最终审计索引为准。runner任一缺依赖、缺DSN或遗漏场景须非零退出；保存版本、命令、退出码及脱敏结果到validation。

| 编号 | 命令/前置 | 明确完成证据 |
|---|---|---|
| C01 | `go version`、`rustc --version`、`docker info --format '{{.Architecture}} {{.OSType}}'`；S01执行恢复二进制的 `--version` 并记录SHA256；`cargo tree --manifest-path tools/codex-transport/Cargo.toml -e features --locked`（S03包创建后） | 固定CLI0.162.1/Linux ARM64/hash/工具链、双fork与完整feature graph；当前已知hash见validation，执行二进制不携带真实auth |
| C02 | `cargo fmt --manifest-path tools/codex-transport/Cargo.toml --check`；`cargo test --manifest-path tools/codex-transport/Cargo.toml --locked`；`cargo build --manifest-path tools/codex-transport/Cargo.toml --locked --release --target aarch64-unknown-linux-gnu` | 所有契约场景实际运行；ARM64受控容器/链接器构建，不能把宿主darwin编译等同Linux；固定rust-toolchain/MSRV及依赖 |
| C03 | `cargo test --manifest-path tools/codex-transport/Cargo.toml --locked --test transport -- --nocapture`；S04后 `go test ./service ./relay/channel -run CodexTransport -count=1 -v` | HTTP/WS fixture启动侧车与合成上游，执行请求计数、同步屏障、限额边界、取消回收、两身份交错、三层retry/双层redirect；无匹配测试不通过 |
| C04 | `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model`；`go build ./...` | 相关原有和新增回归通过；优先扩展现有测试，require/assert；此命令包含源计划建议全部包，已跑的原代码子集不替代实现后执行 |
| C05 | `go test -race ./service ./relay/...`；新增/扩展的 `go test ./relay -run CodexTransport -count=1 -v` | HTTP/WS真实fixture→原usage解析→预扣/结算、两轮create、活动/空闲关闭、余额/日志和重复终止；race无报错不替代语义断言 |
| C06 | `CODEX_TRANSPORT_TEST_BINARY=<final ARM64 executable> bash tools/codex-transport/scripts/test-databases.sh`；运行实际 main 的 `TestCodexTransportBillingDatabaseMatrix`、`TestCodexOAuthSecurityDatabaseMatrix` 及 batch 关闭检查 | disposable SQLite、MySQL、Postgres真实实例及独立MySQL/Postgres日志库；四个必填环境变量 `TEST_FIXED_MYSQL_DSN` / `TEST_FIXED_POSTGRES_DSN` / `TEST_FIXED_MYSQL_LOG_DSN` / `TEST_FIXED_POSTGRES_LOG_DSN` 仅在runner进程内传递；精确镜像标签/digest及SELECT版本、每个case结果记录，缺DSN/Skip失败 |
| C07 | S09创建 `python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --synthetic`；真实验证同runner `--live`（凭据仅安全文件/输入，参数不含token） | 离线合成运行官方与侧车，首次/恢复TLS、实际Responses H2、OAuth WS、代理/CA覆盖报告；live先查模型、HTTP+多轮WS及账务证据。采样比较规则随工具版本控制，未知项不能PASS |
| C08 | `docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml config`；`docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml build codex-transport`；S10按README在隔离项目启动/health/长流/取消/restart/回滚并记录实际命令 | 默认关闭、可选侧车、权限、健康、清理、排空及后续请求旧出口均可观察；测试项目不用用户现存数据库，不含真实账号 |

环境已探测Go1.26、Rust1.91.1、Docker29.2.1 Linux aarch64可用，不是环境缺失。S01检查固定依赖MSRV与镜像资源；合成CA仅入隔离容器，清理后重新验证不可信拒绝。C06使用支持的SQLite/MySQL>=5.7.8/PostgreSQL>=9.6；runner固定实际版本，若依赖版本特性加最低版本。若引入schema/driver/migration，则新增最新发行版代表数据库升级、新库、迁移两次、索引/唯一约束/数据保持及受影响日志库矩阵；缺该证据不得声称数据库兼容。

实际 main 前置移植已触及 relaykit，必须进入该模块执行独立构建；若后续触及 tokenkit 或其公开API，同样进入对应目录执行 `GOWORK=off go build ./...`，两者分别验收。若触及动态表达式，先完整读 `pkg/billingexpr/expr.md`；新增UI才触发前端/shadcn/i18n必读，不顺手扩范围。

### OAuth 安全前置（S05/S07 硬门）

S05已修复规划时确认的Codex flow用户/会话绑定与一次消费缺口（ASVS5.0.0 10.1.2），复用现有AuthFlow原子消费且在交换前提交；未新增schema或改变独立Claude路径。Codex凭据替换已接入服务器端scope proof与现有再认证交互，错误绑定、过期、重放、并发、PAT/缺失proof旁路均有回归。实际main的PAT继承用户角色，不虚称已有PAT scope授权；scope proof是短期可复用证明，AuthFlow才是一次消费。AdminAuth使用显式bearer，不把它误报为Cookie CSRF。具体适用控制见[安全控制表](../../analysis/codex-transport-security.md)；三位S05独立评审及C09真实三库81项已通过，S08最终生产Rust矩阵又复跑81项认证检查。默认关闭的Codex Auth仍拒绝insecure与redirect是明确安全修正，Claude共享helper保持原行为。

在修改认证相关入口前，完整阅读最新稳定 OWASP ASVS（记录核实版本与适用 requirement IDs），以及 Authentication、Session Management、OAuth2、CSRF Cheat Sheets。起点：

- https://owasp.org/www-project-application-security-verification-standard/
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

S05/S07实现安全验收已由对应独立Panel通过，S08后续旧代事件修复也完成复审；S09真实调用另由三位独立评审基于最终脱敏报告通过。后续修改仍须沿用并核验安全控制表：服务端校验与授权、state/PKCE、过期/重放、刷新与凭据轮换、敏感动作、跨域重定向、密钥传输/日志，明确 transport-only 变更范围与现有安全保证；对受影响失败、过期、重放和旁路写回归，不以 UI 检查代替服务端。依赖/源码版本查询与合成握手不需要真实登录；不得把可用 token 写到命令参数、Git、镜像层或测试输出。

## Verification：每步独立评审

以下为实现 Verification Summary；10/10 步覆盖，10 个步骤门禁，共 26 次独立评价（S01/S10 各 1 次；S02–S09 各 3 次）。Panel 8 步、Single/Per-Item 2 步、None 0 步。规划 Judge 6 只审核这些标准是否足够，不执行或代替下表实现验收。实际完成状态以文首步骤状态及对应独立评审报告为准，未完成步骤不得推定通过。

角色均由可用通用代理承担并继承当前模型；每步作者不得担任该步任何 Judge。Panel 的三位 Judge 分别独立阅读代码、冻结契约、原始命令结果及本步 rubric，每人评价全部适用标准并重点核查指定视角；不互相复制报告。三个评审可顺序执行以满足 root+三 worker 上限。Single/Per-Item 由一名独立 Judge 逐项核验所列产物，不能只评价摘要。每份报告记录 criterion 分数、文件/测试证据、加权和、硬门结果、未决项及 verdict；缺证据标记未验证，不评分推测通过。

评分 1–5（1 缺失/错误，2 明显缺口，3 部分证明，4 要求已证明但可改善，5 完整且可复现），每行权重合计 1.00。各 Judge 均须达到该步阈值且所有硬门通过，禁止以跨 Judge 平均分或高分抵消硬门失败。规划阶段阈值仍为 3.5、最多 3 轮；实现重评同样最多 3 轮，未通过则保留未完成，不把重试次数耗尽当作豁免。

| 步骤 | 级别 / 独立角色 | 本步可测 Rubric（权重） | 阈值 | 必需证据与硬门 |
|---|---|---|---:|---|
| S01 | MEDIUM Single/Per-Item：依赖与基线审计员 | 官方版本/平台/hash可追溯 .35；双fork与传递features可重建 .30；fixture无秘密且可离线重跑 .20；历史/当前证据分层 .15 | 4.0 | C01；baseline.json、工具链与fork来源逐项核验，源码事实不能替代二进制运行。全feature graph依赖S03创建crate，S01记录冻结预期，S03锁定构建实测后才能最终确认依赖一致；不伪称C01全已执行 |
| S02 | HIGH Panel：协议架构、安全、Go调用方审阅员 | 三条路径字段/状态/错误及双端接口 .30；三层重试请求次数和双层redirect规则 .25；可信目标/元数据/UDS/秘密边界 .25；数值边界与超时代理表可直接测试 .20 | 4.5 | README+contracts.json逐字段映射AC02–08/11；大小/队列/header/连接/池具体数值与limit−1/limit/limit+1，超时继承、环境代理/DNS支持表、关闭/重启语义齐全。缺任何一项禁止S03/S04编码；此步以可执行测试向量/预期审查，不冒称生产测试通过 |
| S03 | HIGH Panel：HTTP/SSE协议、安全、并发资源审阅员 | method/query/头/status/body/SSE保真 .35；屏障式增量/取消资源与边界 .25；池键/代理/证书/身份隔离 .25；Linux锁定依赖构建 .15 | 4.5 | C02/C03；覆盖AC02–06/11，包括压缩/hop-by-hop、头后截断非正常EOF、两个账号交错及独立取消、无共享Cookie、三层中Rust内部retry请求计数；未知CA/过期/主机名错误失败；S01实际feature graph核对。没有目标Linux构建或边界用例不能通过 |
| S04 | HIGH Panel：Go集成、安全、流生命周期审阅员 | 开关关闭/非Codex路由精确隔离 .25；errors.As/SkipRetry及发送阶段计数 .30；首事件/body关闭/取消传播 .25；既有client与adaptor回归 .20 | 4.5 | C03/C04；AC01–06/13，Go→UDS与业务外层retry均计数，能力/profile不匹配生成次数为0；用户override后剥离伪元数据，内部错误不外泄；不能用mock RoundTripper替代跨进程S04c |
| S05 | HIGH Panel：OAuth安全、管理入口兼容、数据库事务审阅员 | OAuth身份/会话绑定及原子消费 .30；服务端step-up/PAT防旁路 .25；全部管理出口及Claude/GitHub隔离 .25；Auth profile/重定向/日志安全 .20 | 4.5 | C04和下述C09安全三库门；AC01/04/05/14。逐行验证security控制表：错误state/provider/channel/user/session、过期/未来时间/已消费/并发complete均不交换，合法仅一次；替换凭据需有效再认证，过期/缺失/PAT旁路拒绝，cookie-only及错误scope拒绝。Auth拒绝insecure与明文，五类redirect第二跳0，交换/刷新无传输重放。两WHAM入口及consume POST分别计数且redeem_request_id不被重建；安全任一未验证不通过 |
| S06 | HIGH Panel：WS协议、安全、背压资源审阅员 | 上游先握手及失败status/body .25；文本/二进制/分片/控制/关闭精确传递 .30；双向背压/上限/取消回收 .25；官方fork/features/WS代理证书 .20 | 4.5 | C02/C03；AC07/10/11，失败时本地无101，业务ID/usage未变、create次数精确；deflate按冻结能力测试支持或显式拒绝，双向关闭码/原因及ping/pong有断言；不能用HTTP TLS测试替代WSS路径 |
| S07 | HIGH Panel：会话绑定、安全、账务生命周期审阅员 | 账号/会话/凭据代次隔离 .35；复用原session/终结路径 .25；活动与空闲关闭/轮换/多轮 .25；无能力拒绝及不重放 .15 | 4.5 | C04/C05；AC07/08/14，runtime渠道关闭/凭据/路由/代理/TLS变化与启动配置重启分别覆盖活动/空闲；仅清cache不通过。两次create逐次鉴权预扣/终结，旧事件不污染新调用；S05安全门必须通过，端到端账务精确值仍由S08三库验证 |
| S08 | HIGH Panel：账务、安全与并发、数据库审阅员 | 每调用一次终结且余额/预留/退款/log精确 .35；失败/取消/缺usage/重复终止 .25；真实三库及独立日志库完整链 .25；溢出饱和/审计不变式 .15 | 4.5 | C05/C06；AC09/12。每引擎从侧车HTTP/WS事件进入原usage解析，不能直接注入Usage代替。固定输入价格及期望余额/预留/退款/log；既有估算行为明确，无usage不伪造，取消不等于无消耗。四DSN齐全、没有Skip，每库版本/命令/结果齐全；S05认证DB矩阵单独证据也须存在 |
| S09 | HIGH Panel：TLS/H2协议、WS/真实调用、安全取证审阅员 | 同版本/平台/目标/请求/代理/CA可重现 .25；首次/恢复native与rustls .25；实际Responses H2及OAuth WS对照 .30；真实HTTP/多轮WS与差异报告 .20 | 4.5 | C07；AC10/11/15。H2 SETTINGS/窗口/伪头/HEADERS/HPACK/复用/关闭逐项证据，保留扩展原序，只排除已证实随机项；代理/人工覆盖单列。live先查可用模型再最少调用并关联账务，不用历史200或mock替代；无凭据则S09c及AC15未通过，不影响已执行合成记录 |
| S10 | MEDIUM Single/Per-Item：构建运维与交付审计员 | ARM64锁定构建与可选部署 .30；默认关闭/灰度/回滚可观察 .30；健康不匹配/重启/长流/资源 .25；脱敏说明与逐AC证据索引 .15 | 4.0 | C02/C08及全部前置；AC13及逐AC最终审计。UDS目录/所有者/权限、非socket/软链拒绝、无TCP发布、仅清自己的socket有证据；恢复旧配置不重放，退出/重启不丢账。独立审阅高风险项此前Panel证据，无权豁免；本地构建不替代尚未执行的远端CI，实际影响模块独立构建须通过 |

### 跨步骤证据硬门

1. **认证DB验证 C09（S05完成前）**：S05扩展现有 `controller/oauth_flow_test.go`，集中加入拟定 `TestCodexOAuthSecurityDatabaseMatrix`，覆盖绑定、过期、并发仅一次消费及step-up/PAT旁路，使用真实SQLite、MySQL、PostgreSQL分别执行完整控制器→服务器授权/flow→消费链；mock上游断言拒绝时交换次数为0、合法恰为1。命令 `go test ./controller -run '^TestCodexOAuthSecurityDatabaseMatrix$' -count=1 -v`，复用C06的主库DSN约定；缺任一引擎/DSN或Skip须失败。S05拥有独立认证runner `tools/codex-transport/scripts/test-auth-databases.sh`，可自行启动隔离实例、不等待依赖S05的S08，避免循环；S08 runner随后复跑C09并追加账务及独立日志库矩阵。若实际改变schema/driver仍执行项目完整升级/新库/幂等要求，不能以“不新增schema”免除事务三库实测。
2. **S05交付范围校正**：step-up复用必须在Codex start/complete/refresh等实际可替换凭据的服务端入口核验，明确创建与替换的权限差异、浏览器/PAT主体绑定及再认证有效期；不能只在UI或单一入口设门而留下旁路。优先复用现有全局再认证交互；若既有前端无法满足，先读web/AGENTS和shadcn/i18n/React技能，最小适配并补七语言及要求的检查，不能以原“无前端配置页”范围排除安全必需交互。修改到的路由/中间件/测试加入S05文件所有权后再写。
3. **证据记录格式**：每个AC/安全控制/命令指向具体测试case或capture文件、commit、工具/数据库/平台版本、完整脱敏命令、退出码、精确断言及限制；不得只贴“tests passed”。新测试名必须出现在实际输出，零匹配、Skip、未安装fixture均不通过；保持私钥/真实正文/凭据不入Git和报告。
4. **全局否决**：重复生成/扣费、未知发送自动回退、凭据泄漏、默认绕过证书、绑定/step-up绕过、缺要求的真实DB或live证据都阻止对应步骤和最终done。测试/独立Judge互不替代；源§1–10映射、AC01–15、C01–C09、30切片、条件模块及迁移检查均须逐项记录，未验证不勾选。合成前置通过不等于可上线。

## 默认关闭、灰度与回滚

服务端开关默认 false，地址/profile/能力必须显式匹配。开启后侧车不可用则明确失败；不要自动把同一请求切回 Go TLS。HTTP 先灰度时必须分别声明 WS 能力；WS 不具备能力时明确拒绝该传输选择，不能宣称已覆盖。

回滚：停止新增侧车请求→关闭开关→依原业务规则排空或关闭活动 WS/长流并完成终结记账→确认新请求走原出口→停用侧车。回滚不回放发送状态未知的生成；恢复旧镜像/配置只影响后续请求。profile/凭据或连接语义变化使现存 WS 失效。

## Definition of Done 与未验证项

- [x] 研究/代码/业务/架构/分解/并行/验证的独立 Judge 结果有实际证据且达到阈值，方可按流程晋升；无需恢复已取消的模型和插件限制。
- [x] AC01–15、全部步骤测试和适用安全/数据库硬门通过；每条结论明确版本、平台、命令和限制。
- [x] 业务状态机复用、默认关闭、灰度与回滚已演练；未新增重复计费/WS 实现；未改保护身份信息。
- [x] 可审查代码和工具说明齐备，不新增 docs/ 或 plugins/ 文档；发布/合并另行执行。

当前实现验收已完成：查询10个模型后选择gpt-6-luna，完成一次HTTP/SSE及同一WS连接两次response.create，usage分别28/28/42、钱包/token/用户/渠道及三条日志精确结算98配额，全部临时资源清理经独立核验。S09三位独立评审和S10最终4.670评审通过，AC01–15及聚合实现DoD已勾选。首次404来自夹具重复路径，已修正并保留失败历史。远端CI尚未运行；提交前仍检查最终暂存文件，只向XueHua-s/new-api的main创建PR，不合并、不部署生产。

### S08 actual-main fixture correction

The target `main` does not contain `TestFixedPriceBillingDatabaseMatrix`; that name in the original planning analysis referred to the newer source worktree. Do not import unrelated later billing architecture to manufacture it. Reuse the actual-main full request fixture in `controller/responses_websocket_test.go` (`newResponsesWSBillingTest`, `TEST_RESPONSES_SQL_DSN` / `TEST_RESPONSES_LOG_SQL_DSN`), extending it to a real Rust process and trusted synthetic TLS upstream. Consolidate added full-chain cases there (or, only if necessary, one controller integration test file); adapt C05/C06 executable test names accordingly and retain the four required main/log DSN runner inputs. Direct Usage injection remains insufficient. The existing assertion that excludes zero-token charged calls from UsedQuota is a documented baseline defect, not the desired acceptance: S08 must assert exact charged wallet/token/user/channel counters and fix the narrow settlement bookkeeping inconsistency. No `fixed(...)` API import or schema change is needed.
