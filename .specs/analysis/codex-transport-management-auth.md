# S05 管理出口与 OAuth 安全实施证据

2026-10-14：后端实现/针对性测试已完成，等待独立 HIGH panel 与前端 owner 的 proof 交互结果；不是全站 ASVS 合规声明，也不代替 S07/S08/S09 的 WS、账务和 live 门禁。

## 实现范围

- `service/codex_oauth.go` 显式选择 Auth client；交换、刷新固定 token endpoint，禁止重定向。`getCodexOAuthHTTPClient` 保持旧 helper，Claude 不改道、不递归。关闭 sidecar 的 Codex Auth client 仍单独禁止重定向。
- OAuth 成功必须完整读取至 EOF，验证 sidecar 成功 trailer，响应上限 1 MiB；完整 JSON 但缺 trailer 不能当成功凭据。错误剥离含 URL 的 `url.Error`，保留 `CodexTransportError` 类型及不重放语义；JSON 错误不反射响应字段。
- 模型发现走 API client，固定 CLI `0.162.1`；不再动态获取最新版本。普通 GitHub helper 留在原客户端，Claude 原有 helper 未改。
- `fetchCodexChannelWhamData` 与聚合 `fetchCodexChannelUsage` 都用 API client/渠道设置；usage、reset credits GET 和 consume POST 均覆盖。已收到 401/403 才允许一次业务刷新；consume 的 `redeem_request_id` 在本次操作内固定，未知发送失败不刷新/重发。
- Codex OAuth 使用现有 `model.AuthFlow`：服务器保存 verifier；opaque token 只存 HMAC；provider、channel、state、user、session、过期/未来时间先验证，随后独立原子消费提交，再发交换。交换失败不回滚消费。Claude 保留旧独立签名流程。未新增 schema，未修改通用 AuthFlow 模型。
- 现存 Codex OAuth start/complete、手工 refresh、通用 UpdateChannel 的 key/key_mode/type 变更及 multi-key 删除要求现有服务端 proof，scope=`channel.codex.credentials.write`，由既有 2FA/passkey 签发 allowlist 接入。proof 必须来自有效 dashboard session，PAT 不能代替；原主分支 PAT 只有 role/user 权限检查，不声称存在 PAT scope 系统。新渠道 OAuth 绑定 session；Add/Copy 创建保持原有权限策略，不无差别加 step-up。
- OAuth 完成及后台/业务 refresh 按旧 key 和 Codex 类型条件更新，防止上游等待期间人工替换的凭据被覆盖。业务 refresh 不要求浏览器 proof。

## 安全依据

已完整阅读缓存的 OWASP Authentication、Session Management、OAuth2、CSRF Cheat Sheets，ASVS **5.0.0 release** V10/V12。适用控制：10.1.1/10.1.2（凭据/发起事务绑定）、10.2.1/10.2.2（CSRF/混淆）、12.1.1/12.1.2/12.3.1/12.3.2（TLS 与目的地）。上游 AS 的 refresh rotation/revocation 并非本地可证明责任。UDS 受信任本机边界不宣称等价 TLS/mTLS。

## 实际验证

1. `go test ./service ./controller ./middleware ./router -count=1 -timeout=180s`：PASS，service 3.048s、controller 4.697s、middleware 0.374s、router 0.467s。
2. `go test -race ./service ./controller -run 'TestCodexTransportManagement|TestCodexTransportOAuthRejects|TestCodexOAuthSecurityDatabaseMatrix' -count=1 -timeout=150s`：PASS，service 1.859s、controller 3.099s。首次 race 找到测试 teardown 与真实异步管理审计竞争；测试通过 GORM 审计写完成 barrier 等待，不关闭/绕过真实审计。读取实际审计记录断言无合成 code/verifier/PAT/proof/access/refresh。
3. `TestCodexTransportManagementClients`：Go→合成 UDS，交换/刷新 Auth 目的地、form verifier、模型固定版本/API、usage/reset credits、consume 方法及固定 ID。
4. `TestCodexTransportManagementErrorsAreSafe`：生产选择的关闭 sidecar Auth client 对 301/302/303/307/308/503 仅一次请求；第二跳未发生；URL secret 不进入错误。
5. `TestCodexTransportOAuthRejectsIncompleteResponse`：有效 token JSON 但无完成 trailer 的交换与刷新都失败，无重试。
6. `TestCodexTransportManagementController`：独立进程隔离 startup snapshot，生产两个 WHAM controller GET/聚合函数、401→Auth refresh→consume 同 ID、未知发送不重试、refresh 期间人工 replacement 保留。上游边界为合成 UDS fixture；不冒充 Rust/live。
7. `git diff --check` PASS。

## C09 真实三数据库

执行：

```sh
CODEX_AUTH_MYSQL_IMAGE=docker.m.daocloud.io/library/mysql:8.0 \
CODEX_AUTH_POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine \
tools/codex-transport/scripts/test-auth-databases.sh
```

runner 实际运行 `TEST_CODEX_AUTH_SQL_DSN=... GOWORK=off go test ./controller -run '^TestCodexOAuthSecurityDatabaseMatrix$' -v -count=1 -timeout=120s`，三个真实数据库无 SKIP/无零匹配。DSN 只由临时容器生成，不接受用户外部数据库。测试后删除容器。未改 schema，既有 AuthFlow 表/索引由 AutoMigrate 建立；此处不声称做了版本升级迁移测试。

| 引擎 | 实际版本 | 结果 |
|---|---|---|
| SQLite | 3.50.4 | PASS |
| MySQL | 8.0.46 | PASS |
| PostgreSQL | 16.15，aarch64 Alpine | PASS |

镜像 digest：MySQL `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`；PostgreSQL `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`。

每库 16 个命名子例：cookie-only、PAT、缺 proof、错 scope、过期 proof、凭据更新/手工 refresh/multi-key 删除旁路、错 state/provider/channel、过期 flow、未来创建时间、跨用户/会话、交换失败后的重放、并发 complete 仅一次交换、交换期间人工替换 CAS 保留。实际 AdminAuth/RequirePermission、DB/session、AuthFlow 运行；仅外部交换为计数 fixture，所有无效 flow 都是零交换。

## 待独立审阅

前端 owner 已完成现有 hook 的最小 proof 交互，10 个新集成测试通过，见 codex-transport-auth-frontend.md；HIGH panel 审阅/评分尚未完成。真实 Rust HTTP 13 子例及 TLS 测试证据见 S04 报告；S05 不将它们重新包装为本次 live OAuth 交换。真实用户凭据未由本 agent 使用或写入任何文件。

## First independent security review: fixes and latest verification

The first independent security panel did NOT pass S05: F1 identified insecure TLS inherited by disabled Auth; F2 identified new credentials being refreshed after an old request's 401 and retried against that old destination. Both are now fixed, with the latest observed evidence below. The earlier 16-case verification above is superseded by this 27-case run. Only the independent reviewer can close the panel findings.

F1: the Codex-only disabled Auth selector rejects the global insecure flag, effective transport InsecureSkipVerify, and unknown transports. This is an explicit security correction to default-off behavior. The shared legacy helper remains unchanged for Claude. TestCodexTransportDisabledAuthRejectsInsecure verifies both global and effective-transport cases: exchange and refresh perform zero dials; the shared legacy helper still returns its original transport.

F2: both WHAM entries and model discovery pass the initial channel snapshot as ExpectedChannel. Before Auth, refresh checks exact key/type/status/physical URL/transport settings. Credential saves, including OAuth complete, use model.ReplaceChannelCredentialIfUnchanged: a database row-lock transaction compares the snapshot in Go before updating. This also prevents case-insensitive MySQL collation from accepting a changed credential. No schema was added. model/channel.go gained the shared binding comparison and locked update.

TestCodexTransportManagementController now contains a deterministic first-response barrier: WHAM, consume, aggregated usage and model discovery each change only key, URL or proxy after the initial request, before releasing 401. All 12 cases observe exactly the initial request, zero Auth exchanges and no retry to either destination.

Latest actual commands and results:

- `go test ./model ./service ./controller ./middleware ./router -count=1 -timeout=180s`: PASS; model 7.135s, service 2.896s, controller 4.923s, middleware 0.472s, router 0.566s.
- `go test -race ./service ./controller -run 'TestCodexTransportDisabledAuth|TestCodexTransportManagement|TestCodexTransportOAuthRejects|TestCodexOAuthSecurityDatabaseMatrix' -count=1 -timeout=150s`: PASS; service 1.791s, controller 3.224s.
- C09 runner rerun with the same images/command above: SQLite 3.50.4, MySQL 8.0.46, PostgreSQL 16.15, all **27 named cases per database** PASS, no skips. Added actual route cases: wrong_proof_method, wrong_proof_user, wrong_proof_session, wrong_proof_auth_version, wrong_proof_session_version, revoked_session, insufficient_admin_permission. Both start and complete reject with zero exchanges. Added locked-save cases: case-only credential replacement, URL change, proxy change, and successful unchanged-snapshot replacement.
- `git diff --check`: PASS.

The new transactional helper was exercised on all three real databases; this is not a mock or SQL-only claim. Independent re-review remains pending. The S07 owner may add connection invalidation after a successful credential save, without changing the comparison/transaction semantics above.
