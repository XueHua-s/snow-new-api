# S01 独立实现基线评审

日期：2026-10-14。角色：独立依赖与基线审计员；非 S01 作者。按 todo 的 S01 Single/Per-Item rubric，阈值 4.0/5。没有读取或使用真实凭据，没有执行真实账号请求。

## 结论

**官方传输基线产物 PASS（4.65/5）；整体 S01 门禁 HOLD。** 版本、平台、二进制 hash、固定工具链、双 fork 来源和纯合成 fixture 已独立复核。完整 feature graph 按 rubric 明确留给 S03，并非已验证；实际 main 实施分支的能力前置尚未提供完成证据，因此本报告不单独授权正式 S03/S04 开工。还需 S02 契约独立门禁及 main 前置核验。

## 分项评分

| criterion | 权重 | 分数 | 加权 | 证据及限制 |
|---|---:|---:|---:|---|
| 官方版本/平台/hash 可追溯 | .35 | 5.0 | 1.75 | 本审计重新计算 SHA256、重新在无网络 Linux ARM64 容器执行官方二进制；与 baseline.json 完全一致 |
| 双 fork 与传递 features 可重建 | .30 | 4.0 | 1.20 | 从已 fetch 的精确 git 对象读取 Cargo.toml，核对双版本、MSRV、HTTPS 传递 revision；官方 tag Cargo.lock 的 11 个固定版本重新在线核验。仅冻结 features 预期，未完成有效合并图和构建 |
| fixture 无秘密且可离线重跑 | .20 | 4.75 | .95 | 全文阅读唯一 synthetic-response.sse，并离线解析两事件、合成 ID/model、17/3/20 usage；没有证书、私钥或真实响应。它不是完整协议验证套件 |
| 历史/当前证据分层 | .15 | 5.0 | .75 | baseline.json 与作者报告明确区分 POC、源码事实、本轮执行和 S03/S09 待验证项，没有将历史 JA3/200 当成新验收 |
| 总分 | 1.00 | | **4.65** | 达到产物阈值，不覆盖独立硬门 |

## 本审计实际执行

- `shasum -a 256 /tmp/new-api-codex-guidance/codex-linux-arm64`：`071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`，exit 0。
- `git -C /tmp/codex-baseline-s01/{tokio-tungstenite,tungstenite-rs} rev-parse FETCH_HEAD`：分别得到 `0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186`、`4fffad30fe373adbdcffab9545e9e9bf4f2fc19f`；再用 `git show <revision>:Cargo.toml` 解析实际对象，确认版本 0.28.0/0.27.0、Rust floor 1.63/1.75、传递 tungstenite URL 为 HTTPS 且 revision 一致。
- Python `urllib.request` 重新取得官方 `rust-v0.162.1/codex-rs/Cargo.lock`，`tomllib` 核对 baseline 中全部 11 个 `(name, version)` 存在，exit 0。此检查不证明 sidecar 的最终选择或 features。
- `docker image inspect <baseline.build.container> --format '{{.Architecture}} {{.Os}}'`：`arm64 linux`。
- Python 顺序调用 `docker create --network none --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp -e HOME=/tmp -e CODEX_HOME=/tmp/empty <固定镜像摘要> /usr/local/bin/codex --version`、`docker cp <二进制> <容器>:/usr/local/bin/codex`、`docker start -a <容器>`：`codex-cli 0.162.1`；inspect 为 `0 none`。未挂载宿主目录，容器随后成功删除。
- `docker run --rm --network none <固定镜像摘要> rustc --version`：`rustc 1.91.1 (ed61e7d7e 2025-11-07)`。镜像固定 `sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`。
- Python 解析 baseline.json、rust-toolchain.toml 及合成 SSE，检查 toolchain 一致、事件类型顺序与 total_tokens=20：PASS，exit 0。
- `git rev-parse HEAD origin/main`：规划树 `b3531b3df2bfd49c107f5eee4e881b5cd22d207b`，目标 main `517075d5658ad59372859407df9e27de8f914542`。`git worktree list` 显示隔离集成工作树存在于 `/private/tmp/new-api-codex-plan-pr`；存在本身不证明前置集成通过。

## 硬门与后续核验

| 门禁 | 结果 |
|---|---|
| C01 官方版本/平台/hash、工具链、fork 来源 | 已验证；官方二进制实际运行，不仅源码推断 |
| 完整 sidecar feature graph、Linux 锁定依赖构建、所有传递依赖 MSRV | **待 S03**；需 Cargo.lock、`cargo tree --locked -e features`、Linux ARM64 构建；rustls prefer-post-quantum 仍只是待核验预期 |
| main 实施前置与实际分支入口/依赖/fixture 核验 | **未通过**；main-prerequisites 报告为静态核查，WS/路由/usage/安全等能力移植及编译回归不能被本次基线评分替代 |
| S02 冻结契约及独立评审 | 本次不评；没有其通过证据不能解锁 S03/S04 |
| TLS/H2/WS 对照、认证及计费三库、部署/live | 非 S01 本次已验内容；仍按 S05–S10 实际运行，无通过声明 |

main 前置完成后应针对最终实施树复核相关能力及测试证据并追加门禁结果；不需要为了重复评分再次执行已固定同 hash 的官方版本命令，除非基线产物变化。
