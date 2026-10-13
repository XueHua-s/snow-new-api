# S05 OAuth 安全独立预审

状态：2026-10-14 控制准备，作者实施中；未执行实现验证，未评分，未判 PASS。审阅 actual-main 工作树 `/tmp/new-api-codex-plan-pr`，仅合成测试规划，未访问真实认证材料。

## 依据与复用边界

已阅读 OWASP Authentication、Session Management、OAuth2、CSRF 与 ASVS 5.0.0 V10/V12 缓存、项目 AGENTS、安全控制表和任务 S05/C09。适用重点为 10.1.1（最少凭据传播）、10.1.2（事务及发起会话绑定）、10.2.1/10.2.2（state/PKCE/provider隔离）、12.3.1/12.3.2（TLS与证书验证），以及敏感凭据操作的服务端再认证。上游 AS 的刷新撤销/重放检测不是本地客户端可证明的控制。

- `middleware/auth.go` 验证显式 Authorization，内部 access token 经 `ValidateLoginSession`；cookie-only 不构成管理认证。PAT 仅有 UserID/AuthVersion，没有 SessionID。**actual main 的 RequirePermission 仅 authz.Can，不存在独立 PAT scope 检查**；既有安全报告相关措辞须校正。
- `GetSessionAuthIdentity` 适合绑定浏览器流程，必须拒绝缺 user/session/version；不能把 `GetAuthIdentity` 成功等同浏览器会话。
- `RequireSecurityProof` 与 `VerifySecurityProof` 已支持签名、use/issuer/audience、五分钟期限（解析有五秒时钟容差）、user/session/auth-version/session-version、method/scope。新写入 scope 须在 2FA/passkey 签发 allowlist 和前端全局 proof 交互贯通；不能复用 key.read 名字却赋予新写权限而未明确策略。
- `AuthFlowMatch` 的零 UserId、空 SessionId 是“不匹配此字段”，不是拒绝；入口应严格取得有效身份。使用已有表，不加 schema。校验 provider/channel/state/user/session、created/expiry 后，原子消费并提交在交换前。不要把外部交换放进 `ConsumeAuthFlowWithAction`：网络失败回滚消费会重新允许未知结果的交换。
- Codex 新流程显式分支，Claude 维持原路径。旧共享 HTTP helper 不可递归委托或意外重定向 Claude/GitHub。

## 入口与遗漏检查

| 入口 | 必须核实的策略与证据 |
| --- | --- |
| Codex generic start/complete | 发起 session 绑定、一次消费；无渠道时返回新凭据，明确创建授权与缓存禁存，不泄露 verifier/flow payload |
| channel start/complete | channel id/type 必须有效，start 与 complete 都不能成为再认证旁路；跨 channel/provider/user/session、撤销会话、过期 proof 均拒绝且交换零次 |
| manual refresh | 有效 session + 写入 proof，PAT 即便有管理员权限也不得替代 proof；调用前拒绝失败主体 |
| UpdateChannel | 原渠道为 Codex 或有效新 type 为 Codex 时，key 替换、key_mode append、type 转换、未提供 type 必须按真实最终状态判断；不能仅在 OAuth complete 设置门禁 |
| AddChannel / CopyChannel | 创建/导入与复制需明确策略；不能借客户端 Id 覆盖已有行或借复制绕开定义的凭据操作权限 |
| ManageMultiKeys | 删除/启用/禁用不引入任意新凭据，但改变有效凭据集合；明确其是否在本次再认证范围，并验证不能通过该接口写入新 key |
| usage 两条刷新路径 / models / 后台刷新 | 保留正常已授权业务刷新，不强加浏览器 proof；固定 Auth 出口，无未知发送重放；检查旧 key 读后无条件按 id 写入可覆盖人工新凭据的竞态 |

目前 `service/codex_credential_refresh.go` 与 `controller/codex_usage.go` 两处按 id 无条件更新 key，另 OAuth complete 亦按 id 写入。应在冻结前明确并验证跨刷新/人工替换并发策略（条件更新或受控串行化），避免旧账号凭据重新成为有效凭据；不能把只清缓存当成 S07 轮换失效证明。

## 冻结后的硬门证据

1. C09 在真实 SQLite/MySQL/PostgreSQL 执行完整路由授权→flow→原子消费，记录版本/命令，无缺 DSN/Skip。错误 state/provider/channel/user/session、过期/未来创建时间、已消费、并发 complete 均交换零次，合法事务恰一次；网络失败后同 flow 不能再交换。
2. proof 缺失、过期（超容差）、错误 scope/method/user/session/version、撤销 session、PAT、cookie-only、权限不足，覆盖所有可替换入口；拒绝时无上游调用且数据库 key 不变。合法再认证从现有签发交互到真实请求贯通。
3. Codex Auth 固定 token endpoint、S256 PKCE、HTTPS/证书校验；301/302/303/307/308 第二跳零请求；断连/超时/503 无自动传输重试，Claude/GitHub 出口隔离。
4. 合成 code/verifier/token/proxy-secret 哨兵触发失败，检查返回错误与服务端/审计日志不含秘密；flow/start/新 key 响应缓存策略。审计只保留主体/动作/结果等非秘密。
5. 两 WHAM 入口与 credits POST 分别覆盖；未知发送不得重建 redeem_request_id 进行重试。此项与管理兼容 panel 共同核对，不替代其验证。

本预审未运行测试，不对三库事务、完成代码或全站 ASVS 合规作结论。作者确认覆盖后释放审阅槽，等待冻结提交及验证证据再独立评分。

## 作者覆盖确认（预审后）

作者已确认采用独立 `channel.codex.credentials.write` scope，贯通现有 2FA/passkey allowlist 与前端全局 proof 映射；严格 session identity 后绑定 flow，独立 Consume 提交后交换。计划覆盖 start/complete/manual refresh、Codex Add/Copy/Update（key/append/type 转换）、多 key 删除旁路；后台刷新不套 proof，改条件写避免覆盖新 key。负例覆盖错误/过期 proof、PAT/cookie-only、flow 绑定及并发/失败后重放。此为作者承诺清单，不代表实现或测试已完成。

## 冻结后第一轮独立安全审阅

结论：**暂不通过**，等待下述两项修复及回归；不是最终 PASS。已独立检查 frozen OAuth/凭据更新/刷新/管理出口与 proof 代码及两份作者报告。

- **F1 高：关闭 sidecar 的 Codex Auth 仍继承 insecure transport。** `GetCodexHTTPClient` disabled Auth 分支只覆盖 CheckRedirect，`getCodexOAuthHTTPClient` 继承 `service/http_client.go` 的全局/实际 Transport InsecureSkipVerify。与 S05 Auth 拒绝 insecure 的硬门不符。应在 Codex 专用选择点拒绝有效不安全 TLS，不改共享 Claude helper，并明示这是默认关闭路径的安全修正。
- **F2 高：刷新前切换凭据/目的地可将新 token 发往旧目的地。** 两 WHAM 函数及 `service/codex_channel_models.go` 首次 401 后调用按 ID 重读渠道的 Refresh；如果人工替换发生在首次请求与 Refresh 读取之间，refresh 对新 key 的 CAS 可成功，之后旧 client/baseURL/accountID 仍用于新 access token。现有 CAS 仅保护刷新网络等待期间的替换。须将原渠道凭据及物理目的地快照绑定到业务刷新，过期快照 fail closed，补明确 barrier 回归。

独立实际命令：`go test ./controller ./service ./middleware -run 'TestCodexOAuthSecurityDatabaseMatrix|TestCodexTransportManagement|TestCodexTransportOAuthRejects|TestSecurityProof|TestRequireSecurityProof' -count=1 -timeout=150s`。controller PASS 0.704s（本地真实 SQLite），service PASS 0.614s；middleware 显示 no tests to run，不计验证。未并发运行 MySQL/PostgreSQL；作者三库证据仍需交易 panel 独立核查。

现有复用代码明确验证 proof identity/method/scope；要求作者补清楚 revoked session、proof user/session/version 和权限不足的受影响路由证据，不把 16 子例数量当覆盖充分性。新渠道创建与现存凭据替换的区别可接受：Add 使用 INSERT、Copy 清零 Id，不覆盖原渠道；generic OAuth 仍必须有有效绑定 session。

本轮临时 rubric（满分 5）：身份/消费 4.6；step-up/PAT 4.5；出口隔离 3.5（F2）；Auth TLS/redirect/log 3.5（F1）。加权 4.10，且 F1/F2 硬门未满足；修复冻结后重新评分。

## 修复冻结后最终安全复审

结论：**本 S05 OAuth 安全审阅 PASS，4.68 / 5**。替代上一轮 4.10 暂不通过结论；不替代管理兼容/数据库事务其他独立 panel，不表示 S07–S10 或全项目验收完成。

| Rubric | 权重 | 得分 | 核验依据 |
| --- | --- | --- | --- |
| OAuth 身份/会话绑定及原子消费 | .30 | 4.75 | opaque AuthFlow、严格有效 session、provider/channel/state/user/session/expiry/future 校验；交换之前独立提交消费，失败不恢复；并发仅一次交换 |
| 服务端 step-up/PAT 防旁路 | .25 | 4.70 | 独立写入 scope，服务端 proof method/user/session/auth/session version/期限核验；PAT/cookie-only/撤销 session/权限不足拒绝；Update 原 type/新 type/key/append 与 multi-key 删除守卫 |
| 管理出口及 Claude/GitHub 隔离 | .25 | 4.65 | 两 WHAM、consume、models 使用原快照刷新；独立 12 barrier 负例；固定模型版本，Claude 原 helper/GitHub 普通 client 不改道 |
| Auth profile/redirect/日志安全 | .20 | 4.60 | F1 关闭：Codex disabled Auth 拒绝 global/effective insecure、未知 transport；enabled 固定 HTTPS/Auth endpoint；五类 redirect 不跟随、EOF trailer 验证、错误去秘密、审计哨兵 |

加权值 `.30*4.75 + .25*4.70 + .25*4.65 + .20*4.60 = 4.6825`。

### F1/F2 关闭证据

- F1：专用 `GetCodexHTTPClient` 检查全局 TLS insecure 与实际 `*http.Transport.TLSClientConfig.InsecureSkipVerify`，nil 使用 DefaultTransport 检查，未知实现 fail closed。exchange/refresh 两入口在不安全设置下零 dial；Claude 共享 helper 原 transport 保持。默认关闭行为的这项安全修正已在作者报告明确披露。
- F2：两 WHAM 入口与 models 都传 `ExpectedChannel`，Auth 之前用 Go 精确比较 Id/type/status/key/baseURL/settings；旧请求与新凭据不能混用。保存经 `ReplaceChannelCredentialIfUnchanged` 行锁内重新比较，避免 MySQL 不区分大小写的 key 比较误判。401 barrier 用例对 WHAM/consume/aggregate/models × key/baseURL/proxy 12 组合，断言只有初始一次 API 请求、零 Auth、零第二次发送。网络等待中替换及大小写替换另由 C09 锁内保存用例覆盖。

### 独立观察的验证

`go test -race ./service ./controller -run 'TestCodexTransportDisabledAuth|TestCodexTransportManagement|TestCodexTransportOAuthRejects|TestCodexOAuthSecurityDatabaseMatrix|TestSecurityProofBindsIdentityMethodAndScope' -count=1 -timeout=150s`：**PASS**，service 1.796s，controller 3.215s。本次 C09 独立重跑为真实 SQLite；MySQL/PostgreSQL 未并发重跑，已审查作者同一套 27 命名用例三库证据（SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 16.15），交易 panel 仍负责独立外部数据库复核。`git diff --check` PASS。

逐项审查而非以数量代替覆盖：proof 错方法/用户/会话/两个版本、撤销会话、缺权限均通过真实 AdminAuth/RequirePermission 到实际 controller 拒绝；wrong state/provider/channel、过期/future/跨 user/session、失败后重放与并发消费均检查交换计数；合法有效 proof 保存成功，CAS 失败不覆盖变化后的 key。鉴权 fixture 的外部交换为合成计数边界，未冒称 live OAuth。

### 硬门与边界

S05 安全硬门未发现剩余否决项。新建 Add/Copy 与现存替换的策略区分保留：Add INSERT、Copy 清零 Id，generic Codex OAuth 必须有效 session 绑定；没有以创建语义覆盖原渠道的写路径。TLS/协议底层沿用 S03/S04 独立证据；本 panel 不宣称重复完成全部 Rust TLS 矩阵。日志检查范围是已覆盖的合成错误/管理审计，不宣称全站任意日志系统合规。安全 proof 是短期可复用的既有 scope proof，**一次消费对象是 AuthFlow**，不把 proof 错称一次性 token。

S07 owner 已确认其 model helper 改动仅在成功事务后通知 WS 失效，不改锁内比较/update；该通知与活动 WS 验证归 S07。最终数据库 panel、S07 会话、S08 账务、S09 live 与 S10 部署仍各有独立门禁。未接触真实 token 或进行外网认证。
