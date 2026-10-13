# Codex transport research — Phase 2a

日期：2026-10-14。范围：计划核验；无业务代码修改，无真实账号请求，无凭据读取。研究角色独立于后续 Judge。完整读取 billing.md；使用 OpenAI Docs 官方安全页作为背景，版本实现以用户指定的官方 GitHub tag 为准（覆盖该技能的域名限制）。

## 来源与可复核依据

本轮通过 Python urllib.request 实际获取以下 9 份公开材料，缓存位于 `/tmp/codex-transport-research/`（临时缓存不作为交付依赖）：

1. https://developers.openai.com/codex/security/ — 官方安全背景；不能据此证明 TLS 指纹。
2. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/Cargo.toml
3. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/Cargo.lock
4. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/http-client/src/client_builder.rs
5. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/websocket-client/src/dialer.rs
6. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/http-client/Cargo.toml
7. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/websocket-client/Cargo.toml
8. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/http-client/src/custom_ca.rs
9. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/utils/rustls-provider/src/lib.rs

GitHub 文件实际下载使用同路径 raw.githubusercontent.com URL。读取本地 POC 的 Cargo.toml、src/main.rs、results/manifest.json；仅列出其余产物路径，没有读取真实流量、账号库或私钥内容。源计划全部章节已检查。

## 已核实依赖与配置

Cargo.lock 与源计划对应：reqwest **0.12.28**、native-tls **0.2.14**、openssl **0.10.75**、openssl-sys **0.9.111**、openssl-src **300.6.1+3.6.3**、rustls **0.23.45**、aws-lc-rs **1.18.1**、hyper **1.8.1**、hyper-util **0.1.20**、h2 **0.4.19**、tokio **1.52.3**。锁文件同时还有 reqwest 0.13.4，不能仅搜索名称便选错版本；HTTP crate workspace 约束为 0.12。

WS 必须锁定两个 fork，而非 crates.io 同版本：

- tokio-tungstenite 0.28.0，`https://github.com/openai-oss-forks/tokio-tungstenite`，rev `0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186`。
- tungstenite 0.27.0，`https://github.com/openai-oss-forks/tungstenite-rs`，rev `4fffad30fe373adbdcffab9545e9e9bf4f2fc19f`。
- 上游 Cargo.toml 同时 patch crates.io 和 `ssh://git@github.com/openai-oss-forks/tungstenite-rs.git` 源；独立包必须处理传递 git 源覆盖，验证无 SSH 凭据也可 fetch。
- tokio-tungstenite features：proxy、rustls-tls-native-roots；workspace tungstenite features：deflate、proxy。应验证最终 feature graph，不能只照抄顶层声明。

HTTP crate 启用 reqwest json、rustls-tls、rustls-tls-native-roots、stream；workspace 另加 cookies 并保留默认 features。HTTP builder 默认 TransportDefault；自定义 CA 路径切换 rustls；http2_prior_knowledge、client identity 也会选择 rustls。WS dialer 使用 rustls connector。crypto provider 明确安装 aws-lc-rs，并检验 P-521 签名支持。

**重要未决项**：workspace rustls 直接 features 只有 aws_lc_rs/std；POC 另启用 tls12/prefer-post-quantum。官方完整构建经依赖合并后的 feature graph 尚未运行解析，所以不能把 POC features 当成仅凭 Cargo.toml 已证实的官方配置。保留 POC 特性并用 Linux ARM64 官方二进制重新采样，以实测支撑。

WS dialer 对 HTTPS proxy 先 TLS-to-proxy，再 CONNECT，再目标 TLS；NO_PROXY 分支特殊处理 UnsupportedProxyScheme。直接套 connect_async 而不处理显式代理会遗漏 HTTPS proxy。HTTP 连接策略与 WS 控制帧/deflate 行为应独立验收。

## 本机现状与 POC 边界

实际命令 `docker context show` 返回 colima；`docker ps -a --format '{{.Names}} {{.Status}}'` 确认 `new-api-codex-tls-poc` 已停止（Exited 137）。不是活跃验证任务，不应声称仍在执行。宿主 rustc 1.91.1，cargo 1.91.1。Docker 守护进程可用；本轮未启动容器、未检查容器内二进制 hash、未启动数据库。

POC 代码仅 POST `/v1/responses`，固定 upstream、Bytes 全量请求缓冲、1 MiB 限额、90 秒总超时、15 秒连接超时、无 WS；响应侧才是 bytes_stream。它没有正式 UDS/认证、版本协商、私有元数据、错误阶段、池策略键或健康能力协议。不能直接复制上线。

manifest 声明 CLI Linux ARM64 binary SHA256 `071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`。**本轮未验证该二进制或重跑握手，因此这只是历史声明**。manifest 内历史真实调用摘要不是新集成验收。

只提升白名单：Cargo.toml/Cargo.lock、经过检查的最小 Rust 源码、合成采样器与 fixtures。目录存在 mock-key.pem、live-response.sse、synthetic-oauth-home 数据库及 target，禁止整目录复制。测试 CA/密钥应在临时目录运行时产生，清理后删除；外网隔离的合成 CLI 验证不使用开发者 HOME。

## 必須纳入落实计划的研究结论

1. 锁文件、fork revision、编译 target 与 feature graph 同时记录。Linux ARM64 为唯一首期一致性声明；其他平台需额外验证。
2. 私有协议必须区分上游 HTTP 错误与传输错误，并保守标记“可能已发送”。取消/中途断流不得触发透明重放。reqwest 默认底层重试行为也需实际核对和禁用可能导致生成重放的路径。
3. UDS 权限、目标/代理验证、禁止内部元数据泄漏、无共享 Cookie jar、WS 会话独占作为契约测试项；不要把公开 TCP 监听当成正式入口。
4. 流式请求体与背压、压缩长度一致性、重复头、Connection 动态 hop-by-hop token 清理必须具体实现；不是泛泛“HTTP 转发通过”。
5. 官方默认 Cookie/redirect 行为不是必须照抄：侧车按源计划禁跳转且无共享 Cookie jar，声明这是安全业务边界，而非完全应用行为一致。
6. 真实 TLS/HTTP2/WS、首次/恢复、代理各类、长流重启与进程资源验证必须是正式接口测试，历史 POC 不可替代。HTTP2 HEADERS/HPACK 以及 WS 官方 OAuth 基线目前仍未完成。
7. SQLite/MySQL/PostgreSQL 完整预扣→消费→结算/退款链路属于源计划验收，即使不改 schema 也不能省略；测试必须定义取消、缺 usage、重复终止的期望。
8. 真实账号验证目前未开展，且源计划说明本轮不要求启动真实调用。使用合成证据推进实现；若最终需真实验证但无授权/安全凭据，明确标为发布验收未完成，不能制造“全部完成”结论。

## 本轮验证结论

完成的是研究与来源核对，**没有 cargo build/test、Go 集成测试、数据库矩阵、指纹重采样或真实调用结果**。这些是后续落实阶段的执行要求，不阻止在具体步骤和门禁已明确后形成 todo。具体代码入口与验收细分交由独立分析阶段补齐。
