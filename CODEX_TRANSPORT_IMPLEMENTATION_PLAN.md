# Codex OAuth 出站传输实施计划与 Agent 交接

更新：2026-10-14。交接时仓库 HEAD：`b3531b3df`。

**本文是已确认方案的实施计划，不是已完成的生产实现。** 先前工作仅在 `.local-tests/codex-transport-poc/` 完成实验，未修改业务代码。接手 agent 应重新读取当前代码和 AGENTS.md；仓库期间已有其他变更，不能依据旧行号覆盖实现。

## 1. 用户已确认的目标与决策

目标：让 new-api 的 Codex ChatGPT OAuth 渠道使用尽量贴近官方 Codex CLI 的出站网络栈，同时保留现有鉴权、渠道选择、请求转换、token 用量统计、预扣费、结算和退款。

已确认采用：

1. Go new-api 保留业务和计费，增加独立 Rust 出站服务负责上游 TLS、HTTP/SSE、WebSocket。
2. 不采用原始加密 TLS 隧道作为 new-api 的转发方式。侧车是上游 TLS 客户端，可以解密并把响应/事件传回 Go，因此 Go 仍能读取 `usage`。
3. 普通 HTTP/SSE 暂不强制按账号拆分物理连接池；同一传输策略下允许复用。Authorization、账号头、Cookie 和会话状态必须正确隔离。
4. WebSocket 按账号、凭据和会话绑定，禁止跨账号或无关会话复用连接。
5. 不承诺“上游无法区分”或“不会触发风控”。TLS ClientHello、HTTP/2、WebSocket、HTTP 请求头和应用行为是不同验证层次。
6. 首次实现固定已验证的 **Codex CLI 0.162.1 / Linux ARM64** 基线。以后验证新版后再升级；不要运行时自动追随 latest。

**对旧报告的修正：HTTP 连接池跨账号共享不是已发现的凭据泄漏，也不是本期必须修复的缺陷。不要因旧报告“缺少账号级连接池隔离”的措辞强制拆池。** 更强的 HTTP 账号隔离留作未来可选策略。

用户要求其他 agent 按本文执行代码变更。本轮只交付计划书，不要求继续启动真实调用、部署或发布。

## 2. 已验证的证据及其边界

| 项目 | 证据 | 不能据此推导的结论 |
| --- | --- | --- |
| native TLS 首次握手 | 官方 Linux ARM64 二进制与侧车各三次采样，JA3、去除随机内容后的 ClientHello 字段及顺序一致 | 其他平台、所有目标站点和恢复握手都一致 |
| rustls 首次握手 | 扩展字段、密码套件、签名算法、支持组、ALPN、key share 组与长度一致；扩展排序本身随机 | 每次 JA3 固定、随机排序分布已证明相同 |
| OAuth 代码路径 | 官方 CLI 使用合成 ChatGPT auth.json 和 requires_openai_auth=true，捕获实际 POST /responses 的连接并确认账号头，字段匹配 | 真实登录/刷新/云端路由/风控全流程已验证 |
| HTTP/2 | 实际推理连接的初始 SETTINGS、连接 WINDOW_UPDATE 一致，侧车可获取完整 SSE | 所有 HEADERS、HPACK、流窗口及后续帧完全一致 |
| 真实订阅调用 | 侧车请求 gpt-6-luna 得到 HTTP 200、response.completed，输入 23、输出 5、合计 28 tokens；Go 原有解析函数结果相同 | 数据库结算已集成；gpt-5.4 仍可用于真实验证 |
| SSE | 首个事件在完成事件前到达；mock SSE 字节和 usage 完整保留 | 所有负载、取消竞态、长流均已覆盖 |
| 异常行为 | 本地 503 保留且只尝试一次；截断报 IncompleteRead；HTTP/1.1 下游取消传递至上游 | 所有重试、HTTP/2、WS 失败路径已覆盖 |
| 并发/连接 | 两路确定账号并发头部未串号；HTTP 连接可复用 | 高并发容量或 Cookie/会话状态隔离已验证 |
| 代理 | 本地 HTTP CONNECT 隧道下侧车握手与直连相同、SSE 保真 | SOCKS、HTTPS 代理、MITM 均已验证 |
| 恢复握手 | 侧车 native 两次均未恢复；rustls 第二次恢复成功 | 官方多轮会话恢复策略已对齐 |
| 计费基线 | 9 项已有内存 SQLite 回归通过，含预扣费边界、余额预留、退款、正负差额、CAS | 侧车接入后的完整扣费闭环、MySQL/PostgreSQL 已验收 |

WebSocket 的 405 来源：**实验侧车**只注册了 `POST /v1/responses`，不接受 WS Upgrade 的 GET。不是凭据失效，也不是 OpenAI 返回 405。

### 当前仓库已经有 WebSocket 业务实现

交接时确认存在：

- `router/relay-router.go` 的 `GET /v1/responses`。
- `controller/responses_websocket.go`：每次 response.create 的鉴权、限流及请求上下文。
- `relay/responses_websocket.go`：会话、上游连接、终止/取消、渠道与凭据绑定。
- `relay/channel/api_request.go` 的 `DoWssRequest`：当前用 gorilla/websocket 直接拨上游。
- `service/responses_usage.go`：HTTP 与 WS 可复用的 Responses 用量聚合。

**不得因为 POC 返回 405，重新实现一套并行的 WS 业务/计费状态机。优先替换已有上游拨号出口。**

## 3. 架构和职责

```text
客户端
  ↓ HTTP / WebSocket
Go new-api
  鉴权 → 渠道选择 → 参数/请求转换 → 预扣费
  ↓ 私有本机协议：HTTP 请求或 WS 连接
Rust Codex 出站服务
  官方基线对应的 HTTP / WSS 网络栈 → 上游 TLS
  ↓
OpenAI
  ↓ 响应 / SSE / WS 事件
Rust：解密并增量返回
  ↓
Go：原有事件处理 → usage → 结算/退款 → 返回客户端
```

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Go | 权限、渠道、OAuth 凭据生命周期、请求转换、模型、计费、日志脱敏、业务重试决策 | 复制官方 TLS 细节 |
| Rust | 外部 TLS、协议协商、HTTP/SSE/WS 传输、代理、传输连接资源 | 用户数据库、配额、独立刷新 token、应用层自动重放生成 |
| 私有适配层 | 传递目标、请求、传输策略及响应错误，传播取消 | 对业务 JSON 再次改写或独立计费 |

默认只对 Codex 渠道启用此出口；其他渠道继续现有客户端。功能默认关闭，开启后可以独立灰度。

## 4. 传输契约：先明确再实现

### 4.1 本机连接

- Linux 首选 Unix domain socket；Docker Compose 通过共享 socket 目录连接。确需 TCP 时仅使用受限内部网络及服务间认证，不公开为无鉴权转发代理。
- 建议在 Go 增加 Codex 专用 `http.RoundTripper` 和 WS 拨号适配。HTTP 返回标准 `*http.Response`，WS 尽量保持当前 `*websocket.Conn` 使用接口，降低业务层改动。
- **不能只设置 Go `http.Transport.Proxy` 指向侧车**：HTTPS CONNECT 后仍由 Go 建立上游 TLS，无法达到目标。Go 应通过私有明文应用协议把请求交给侧车，由 Rust 发起上游 TLS。
- WS 同理：Go 到侧车是本地 WS，侧车另外建立外部 WSS；不能只字节透传 Go 已生成的 TLS 握手。
- 内部协议有版本号及健康/能力检查。精确 wire schema 在阶段 1 固化，写契约测试；不要公开几十个 TLS 参数给业务调用方。

### 4.2 HTTP 请求/响应

内部协议必须表达：原始方法、完整目标 URL、重复请求头、流式 body、代理与协议策略、超时/取消、profile 版本、用于路由追踪的非敏感标识。

- 可使用私有路径与内部元数据头/小型 envelope；业务 body 本身保持流，不把完整 body 编码到 JSON 再传输。
- 内部元数据由 Go 服务端构造。先剥离客户端伪造的同名元数据；Rust 消费后不得发送给上游，内部错误头也不得泄漏给外部客户端。
- 上游目标来自已验证的渠道配置/内置 OAuth 端点；保留项目已有的目标和代理限制。新服务不能变成可任意访问地址的公开代理。
- Host/SNI 使用真实上游目标。本地服务地址不能覆盖上游 Host；正确处理 hop-by-hop 头及 Connection 指定的头，避免重复 Content-Length/Transfer-Encoding。
- 保留方法、查询参数、状态码和必要端到端响应头。压缩/解压与 Content-Encoding、长度必须一致。
- 响应/SSE 增量返回；限制内存、请求大小并遵循现有请求约束。不要沿用 POC 固定 1 MiB 限制到正式多模态流量。
- 透传上游 3xx 给 Go 的既有策略，不自行追随重定向或把 Authorization 转发到新域名。
- 区分侧车连接失败、TLS/超时、已获得上游 HTTP 状态、响应中途失败；不能把上游真实 4xx/5xx 全部改为本地 502。
- 失败发生在是否可能已发送生成请求的哪个阶段，必须能被 Go 判断。不确定是否执行的失败不得触发透明重放或自动切换出口；接入现有 skip-retry/错误分类。

### 4.3 WS 请求/事件

- 补充内部 Upgrade 入口及 Rust WSS 客户端，复用 Go 现有 Responses WS 生命周期。
- 转发文本/二进制消息、合理的控制帧语义、关闭码/关闭原因；测试分片、背压、消息限额、ping/pong、取消与双向关闭。
- 握手失败的上游状态和必要错误内容交给 Go，不能在上游未连接时先向业务层伪报成功。
- 保留 `response.create`、完成/失败/取消事件及其关联 ID；侧车不重写 usage、不重编号业务事件、不自行重试已发送的 create。
- 每个下游业务会话绑定独立上游 WS；锁定渠道、账号、凭据代次、模型/路由约束，保留现有变更后重连规则。
- 发生 token 轮换、渠道关闭、身份或物理传输配置变化时，按现有业务规则关闭/重建连接；不得在已认证连接上悄悄切换账号。
- 一条 WS 上多次生成仍由 Go 按每次调用预扣/结算。侧车不创建第二套计费或重试状态机。

### 4.4 HTTP 连接池和状态

- HTTP 连接池键至少区分目标 origin、代理、TLS/profile、HTTP 策略以及改变连接语义的信任配置；兼容现有渠道 timeout、HTTP1/auto、连接分片等配置。
- 默认不把 access token 或账号作为无状态 HTTP 连接池键。凭据逐请求设置，禁止写入共享可变默认请求头。
- 默认不引入全局共享 Cookie jar；如官方兼容需要 Cookie/session 状态，必须设计按账号隔离的存储，不能直接共享 reqwest 全局 jar。
- 并发响应和取消上下文按请求独立；禁止“当前账号”全局变量。
- HTTP 按账号拆池/TLS 会话缓存拆分不是当前必做项。未来如引入有身份绑定的状态，再评估是否需要扩大隔离范围。

### 4.5 TLS 策略

- 不把所有请求统一强制 rustls。HTTP 默认后端、显式 CA 的 rustls、WS rustls 等应按目标官方路径核对。
- native/rustls 的验证证书行为必须保留。当前仓库已有全局/渠道 `TLSInsecureSkipVerify` 语义，接手时明确兼容或显式拒绝策略；不能悄悄全局开启或因配置读不到而静默忽略。
- 默认保持证书验证；指纹对齐不得依赖 `InsecureSkipVerify`。
- 通常 HTTP1/auto、分片、CA 等人工覆盖会改变官方默认行为。日志中标明实际策略，不宣称覆盖后的配置仍完全符合默认基线。

## 5. 版本基线与依赖

POC 已匹配的版本：

| 依赖 | 版本 |
| --- | --- |
| reqwest | 0.12.28 |
| native-tls | 0.2.14 |
| openssl / openssl-sys | 0.10.75 / 0.9.111 |
| openssl-src | 300.6.1+3.6.3 |
| rustls | 0.23.45 |
| aws-lc-rs | 1.18.1 |
| hyper / hyper-util / h2 | 1.8.1 / 0.1.20 / 0.4.19 |
| tokio | 1.52.3 |

关键经验：

- 同版本不等于同指纹，必须锁定 Cargo features、crypto provider、目标平台及配置。
- POC rustls 启用了 `aws_lc_rs`、`std`、`tls12`、`prefer-post-quantum`。后者修正了默认 key share/支持组顺序差异。不要拿掉后还沿用旧结论。
- HTTP POC 使用 `native-tls-vendored` 固定 OpenSSL 构建；正式构建仍需复测 glibc/musl、架构及 feature 合并差异。
- WS 应核对官方 0.162.1 的 `tokio-tungstenite` / `tungstenite` fork、提交和 features，不以系统仓库最新版替代。官方锁定信息可从下面源码链接或 POC 原始资料恢复。
- `Cargo.lock` 和 profile 基线应进入正式版本控制。不要只固定顶层 crate 却让底层协议库浮动。

官方来源：

- https://github.com/openai/codex/releases/tag/rust-v0.162.1
- https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/Cargo.toml
- https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/Cargo.lock
- https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/http-client/src/client_builder.rs
- https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/websocket-client/src/dialer.rs

## 6. 建议修改位置与审查重点

新增 Rust 包建议放 `tools/codex-transport/`，测试/fixture 随包提交；名称可按仓库约定调整，不创建不必要的通用代理框架。

| 位置 | 建议工作 |
| --- | --- |
| `service/` 新 Codex transport 适配文件 | 私有 HTTP/WS 客户端、配置、profile/能力检查、错误和取消传播 |
| `relay/channel/api_request.go` | 在 `doRequest`、`DoWssRequest` 的传输选择处对 Codex 且开关启用时切换出口，保留其他 adaptor 与头覆盖规则 |
| `service/http_client.go`、`http_transport_policy.go` | 复用策略规范化；避免把其他渠道的全局 HTTP 客户端替换成 Codex 侧车 |
| `relay/channel/codex/adaptor.go` | 核对端点、OAuth headers 与请求转换；优先无需修改业务语义 |
| `controller/responses_websocket.go`、`relay/responses_websocket.go` | 复用现有会话和计费；只在传输变化必须传播时调整，核查现有锁定/重连规则 |
| `service/responses_usage.go`、`relay/responses_handler.go` | 复用聚合与 `ConsumeResponsesQuota`；新增传输不能绕过或重复结算 |
| `service/codex_oauth.go`、`codex_credential_refresh*.go` | token 交换/刷新也需明确出口；仍由 Go 管理刷新和轮换，不让侧车独立刷新 |
| `service/codex_models.go`、`codex_channel_models.go`、`codex_wham_usage.go` 及其调用方 | 模型列表、用量查询等管理请求纳入 Codex 传输选择；区分 API 与 Auth 官方 profile |
| `common/init.go` / 配置入口 | 默认关闭的开关、socket 地址、profile 版本；一期优先服务端配置，避免不必要前端改动 |
| Docker/Compose/构建 CI | Rust 独立构建、受限运行、共享 socket、健康检查、版本固定、升级/回滚方法 |

注意：`getCodexOAuthHTTPClient` 在先前代码中也被 Claude OAuth 调用。必须重新搜索调用方，不能因为函数名含 Codex 就全局改道；必要时增加明确的 provider 参数/专用入口。

不要在 URL 上做脆弱的字符串猜测来识别所有请求；渠道请求按渠道类型选择，管理/OAuth 请求由明确的 Codex 服务入口选择。

## 7. 分阶段执行与交付

### 阶段 0：核对现状与可复现证据

- 阅读当前 AGENTS.md、相关现有代码和本计划；检查其他人的变更。
- 确认 POC 文件是否存在。`.local-tests/` 被 Git 忽略，其他 checkout/主机不会自动获得这些文件。
- 把需要的最小源码、固定依赖、合成 fixture 和采样器提升到正式目录；不要复制 target、下载包、测试 CA 私钥、真实凭据或整份真实账户流量。
- 固定 0.162.1 基线、平台和二进制校验，复跑现有关键样本。缺少 POC 时根据本文及官方源码重建，不把缺失报告当成已测试。

交付：独立可构建包、可复现的基线测试、内部协议草案。

### 阶段 1：正式化 HTTP/SSE 出站服务

- 固化内部协议与健康/能力接口，实现真实目标、方法、headers、streaming body、代理与超时策略。
- 完善状态码、错误、取消、重定向、压缩、hop-by-hop headers、资源限额。
- 不把 POC 的固定上游、固定 90 秒总超时、单个 POST 路由直接作为正式实现。
- 用契约测试验证首事件及时转发、响应保真及失败阶段；不增加应用层自动重试。

交付：能独立跑 HTTP/SSE 的服务及测试；尚未改默认生产出口。

### 阶段 2：Go HTTP 集成和 Codex 辅助请求

- 接入 Codex 专用 RoundTripper，开关默认关闭。
- 接入推理及 Codex 模型/用量/OAuth 管理请求；测试不会误改 Claude 或其他渠道。
- 建立侧车失败的明确错误策略。开启后故障默认显式报错，不静默用原 Go TLS 重发，尤其不能在发送状态不明时回退。
- 健康检查失败可让管理员关闭开关处理后续请求；现有请求不透明重放。

交付：HTTP/SSE 和管理接口可灰度，实际 usage 仍经 Go 原链路。

### 阶段 3：WebSocket 传输集成

- 核对官方 WS fork 和 TLS/profile，实现本地 WS → 外部 WSS 双向转发。
- 接入 `DoWssRequest`，复用当前业务连接与调用生命周期。
- 完成账号/会话绑定、取消/关闭、凭据变更重连、错误状态保留等测试。
- 必须测试多个 response.create 的逐次用量/结算，不能只验证一次 101 Upgrade。
- HTTP 阶段可先灰度；若 WS 尚未接入，应明确能力边界，不能对 WS 开启同一“已对齐”承诺后又静默直连。

交付：WS 端到端工作，原有会话和计费回归通过。

### 阶段 4：完整验证、文档与灰度

- 执行下节验收矩阵；把实测结果和未覆盖条件分开记录。
- 查询账号当时支持的模型后，再做少量真实验证；真实调用需要可用凭据，禁止把本会话粘贴的 token 写进代码/文档。
- 完成 Docker/Compose 部署说明、开关和回滚步骤；记录依赖更新与重新采样流程。

交付：可审查的代码变更、测试证据、操作说明。发布/合并按用户后续安排执行。

## 8. 验收矩阵

| 验收项 | 最低要求 |
| --- | --- |
| 默认回归 | 开关关闭时行为不变；非 Codex 渠道和 Claude OAuth 不受影响 |
| HTTP 完整性 | GET/POST、查询参数、重复头、状态码、SSE、压缩、错误体和限制的契约测试 |
| TLS | 固定同版本/平台/目标/代理/CA 条件，比较首次及恢复握手；只剔除随机数、临时密钥等不应相同的数据 |
| rustls 随机性 | 保留原始扩展顺序供审查；只有官方实际随机的顺序可做无序比较，不能任意排序支持组或密码套件来掩盖差异 |
| HTTP/2 | 对同一种实际请求比较 SETTINGS、窗口、伪头、HEADERS/HPACK 策略、复用及关闭行为；不要拿 GET /models 对比 POST /responses |
| WS | 官方 OAuth WS 基线、101/失败握手、多轮、取消、ping/pong、关闭、断连；目标端事件和 usage 保留 |
| 隔离 | HTTP 请求头/Cookie/状态并发不串号；WS 跨账号、会话或凭据代次不得复用 |
| 重试 | 503、连接失败、已发送后断连、首事件后断流均不产生未经业务允许的重复生成 |
| 代理 | 已支持的 HTTP CONNECT、HTTPS、SOCKS 等按实际配置覆盖；不支持时明确拒绝，不能静默直连 |
| 计费闭环 | 预扣费 → 上游 usage → 结算/退款完整集成；成功、失败、取消、缺 usage、重复终止事件都需确定的期望值 |
| 数据库 | SQLite、MySQL、PostgreSQL；不能以 9 项 SQLite 基线代替正式链路验证 |
| 容器/进程 | 长流、取消、重启、健康检查、清理空闲连接；诊断日志不含 token/Cookie/请求正文 |
| 版本声明 | 每份报告明确 profile、CLI 版本、平台、路径和限制，不用单个 JA3/JA4 值宣称完整一致 |

计费不变式：缺少最终 usage 不得伪造准确用量，沿用项目现有失败/估算规则并记录；一次调用只结算或退款一次；取消不等于未发生上游消耗；遵循现有配额饱和与审计规则。

建议运行当前相关测试包，并添加有明确业务契约的针对性用例。测试命令以最终改动范围为准：

```sh
go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model
```

若触及 `relaykit/` 或其公开 API，必须单独：

```sh
cd relaykit
GOWORK=off go build ./...
```

Rust 包执行 `cargo test --locked` 及目标平台构建；已有本地探针不能代替新生产接口测试。
若涉及动态计费表达式，先完整读取 `pkg/billingexpr/expr.md`。Go 测试遵循 require/assert 规范；新增 UI 时先读前端、shadcn 和 i18n 技能。

## 9. 本机交接资源

这些路径可能只存在本工作区。它们是证据/原型，不应整目录提交：

- `.local-tests/codex-transport-poc/README.md`：初轮及真实调用结果。
- `.local-tests/codex-transport-poc/EXTENDED.md`：补测结果。涉及 HTTP 按账号拆池的旧措辞，以本文第 1、4.4 节为准。
- `.local-tests/codex-transport-poc/src/main.rs`、`Cargo.toml`、`Cargo.lock`：HTTP/SSE 原型。
- `probe.py`、`extended_probe.py`、`live_probe.py`、`usagecheck/usage_test.go`：同目录下的探针和解析测试。
- `results/report.json`、`extended-report.json`、`live-report.json`、`manifest.json`：采样、依赖和结果。
- Docker 容器 `new-api-codex-tls-poc`：已停止，保留构建缓存和 `/tmp/codex` 官方二进制；不应作为正式部署依赖。
- 本机 Docker context 是 Colima，宿主 `/tmp` 不自动共享，之前用 `docker cp` 放入二进制。

复跑补测时必须隔离容器外部网络，避免官方 CLI 的辅助功能拿合成凭据访问外部接口。
mock CA 只装进专用容器，完成后删除 `/usr/local/share/ca-certificates/new-api-poc.crt` 并执行 `update-ca-certificates --fresh`；否则原“不可信证书拒绝”测试前提会被破坏。本轮已清理。

本计划不包含任何 access token、refresh token 或真实账号标识。凭据应由执行时的安全输入提供，不写入 Git、镜像层、命令行参数或日志。

## 10. 接手 Agent 的完成定义

- 实现位置与当前仓库相符，复用已有 Responses WS/usage/计费实现，没有新增重复状态机。
- Codex HTTP/SSE 与 WS 启用侧车后都能工作，其他渠道行为保持兼容。
- 普通 HTTP 允许按策略复用，身份状态不串号；WS 身份及会话绑定经过验证。
- 指纹/协议对照和完整计费集成有可复现实测记录，未知项明确列出。
- 独立 Rust 构建、相关 Go 检查、涉及的模块独立构建和数据库验证完成。
- 默认关闭、灰度、错误行为、回滚和版本升级流程有文档。
- 没有以“HTTP 200”“JA3 相同”或本地 mock 结果替代全部上线验收。

设计检查：本方案阶段暂评 7.5/10（8 项复杂度诊断中 6 项有方案级依据）。尚待实现验证的是“替换底层实现无需改变业务调用方”和“维护者仅凭接口契约即可理解边界”；通过阶段 1 的私有协议/错误契约、阶段 2/3 的既有调用方回归补齐，不以评分代替功能验收。
