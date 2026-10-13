# Codex 出站传输安全前置控制表

状态：2026-10-14 静态准备完成；不是实现安全验收。未执行下列测试、未读取真实凭据，不代表全站 ASVS 合规。范围仅为 Codex OAuth 交换/刷新、侧车 HTTP/WS 出口及其凭据边界。

## 依据

- [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release)，[V10](https://github.com/OWASP/ASVS/blob/v5.0.0_release/5.0/en/0x19-V10-OAuth-and-OIDC.md)、[V12](https://github.com/OWASP/ASVS/blob/v5.0.0_release/5.0/en/0x21-V12-Secure-Communication.md)。下列编号均使用 5.0.0，不套用 4.x 编号。
- [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)：敏感操作、错误及审计；[Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：服务器端有效性、失效、日志不记录可用会话凭据。
- [OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)：PKCE、事务绑定、重放及 token 目的地；[CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：基于实际认证方式选择服务器端保护。

## 控制与可观察验收

| 控制 | 本次要求 | 必须补充的确定性用例 |
| --- | --- | --- |
| ASVS 10.1.1，凭据最少传播 | Go 持有及轮换凭据；侧车只在请求存活期间接触必要的 Authorization/交换表单，不储存凭据，不独立刷新；入站用户 token、内部控制头不得被错误转发 | 假 token 哨兵覆盖请求/响应/错误/日志，确认只到指定上游；跨渠道与 Claude 请求不误选侧车；恶意内部头不能覆盖目标/代理 |
| ASVS 12.1.1、12.1.2、12.3.1、12.3.2 | OAuth token 端点仅 HTTPS，WS 上游 WSS；校验 CA、有效期、主机名；TLS 指纹目标不能要求关闭验证或退回明文 | 可信测试 CA 成功；未知 CA、过期、错误主机名失败；HTTP token 目标和 HTTPS→HTTP 重定向不产生第二跳；无 insecure 开关绕过 |
| ASVS 10.1.1、12.3.2；OAuth2 redirect 指引 | OAuth 交换/刷新禁止跟随重定向；侧车不自动 retry，也不在超时/断连时重放表单；Go 端 CheckRedirect 与 Rust 策略需一致 | 301/302/303/307/308 指向第二监听器，第二监听器收到零请求；断连、503、超时后上游计数恰为一次；请求取消释放连接 |
| ASVS 10.1.2、10.2.1、10.2.2 | 维持 S256 PKCE、state/provider/channel/事务及发起身份绑定；不得用侧车绕过 Go 的管理授权和 OAuth 状态校验 | 错 state/provider/channel、过期、跨用户/浏览器会话、已消费与并发 complete 均不得交换；code_verifier 原样送唯一固定 token 端点；防御性校验未来创建时间（不据此推断可伪造签名 token） |
| ASVS 10.1.1；Session Management 生命周期 | WS 属于账号、凭据版本及逻辑会话；HTTP 连接池复用不意味着可复用 WS 业务状态；凭据禁用/轮换后旧连接不能继续新请求 | 两个账号、相同账号不同凭据/会话各自独立；轮换、禁用及变更代理/目标后拒绝旧 WS；旧事件不能进入新请求；侧车重启必须重连，不能重放 response.create |
| ASVS V12 服务间通信，受限本地 IPC 边界 | UDS 为同机进程边界：父目录、socket 所有者和权限仅授权 Go/侧车可用；不暴露 TCP；检查非 socket/软链替换；不能声称 UDS 等同于 V12.3.3 加密或 V12.3.5 mTLS | 目录/socket 权限、非法所有者/路径拒绝、未授权本地身份无法连接；启动失败不静默开 TCP；容器不发布侧车端口；进程退出清理仅自己的 socket |
| 认证/会话 Cheat Sheets 的日志要求 | 只记录请求关联号、目标类别、状态、耗时等非秘密上下文；不得打印 token、code、verifier、Cookie、带密码代理 URL、请求/响应体或原始 URL 查询 | 合成秘密置于上述每处，触发 TLS、代理、URL 解析、HTTP、WS 握手及取消错误后检查 stderr/日志/返回错误均无秘密；审核计数器 label 不含这些值 |

UDS 不防同 UID 恶意进程和 root；部署必须把其定义为受信任计算边界。远程侧车不在此次默认 UDS 部署范围，不能简单开放监听地址；若加入，必须重新设计经过认证的加密通道。任意目标/代理能力不能由公开请求控制，Go 仍需执行现有 SSRF/目标策略；侧车只接受可信本地控制方。

## 当前路径证据及已有测试

- `service/codex_oauth.go`：固定 `https://auth.openai.com/oauth/token`，S256 PKCE；`getCodexOAuthHTTPClient` 复制通用 client。`service/http_client.go` 的通用重定向策略及全局 TLS 跳过选项不能直接成为新 OAuth 出口安全策略。需明确 Codex 专用入口，避免改变 Claude 调用者。
- `service/codex_credential_refresh.go`：Go 更新 access/refresh token 与过期时间并写渠道；侧车不得增加并发刷新或重试。授权服务器负责刷新 token 撤销/重放检测（ASVS 10.4.5 是 AS 职责），不能宣称本地测试证明上游履行该义务。
- `relay/responses_websocket.go:restoreConnectionContext` 已检查渠道状态、锁定 key、代理、base URL、headers、路由及模型组权限；须让新拨号路径继续受其约束。已有 `TestRestoreConnectionContextRejectsChangedAdvancedCustomRoute`、`TestSelectResponsesWSChannelHonorsStrictSessionBinding`、`TestCheckResponsesWSModelAccessMatchesHTTPTokenLimits`、`TestResponsesWSStreamIdentity`，尚不能证明侧车跨账号隔离。
- `controller/oauth_flow_test.go` 仅覆盖解析、签名 token round trip、错误渠道；不证明身份绑定、单次消费、过期及并发保护。优先扩展这个文件，而非为每层散建测试。
- `router/channel-router.go`：Codex start/complete/refresh 使用 `AdminAuth` 加 `ChannelSensitiveWrite`，actual main 的 PAT 沿用户角色执行 `authz.Can` 权限检查，并无独立 PAT scope 门禁；PAT 缺少 SessionID，不能替代 session-bound step-up。`middleware/auth.go:classifyDashboardCredential` 要求显式 Authorization bearer，无 cookie 认证兜底，因此不能仅因路由没有 OriginGuard 就断言 cookie CSRF 漏洞。回归须验证 cookie-only 请求拒绝，未授权/错误 scope 不进入交换。
- 该组仅 `/:id/key` 附 `SecureVerificationRequired`，Codex OAuth 完成不含再认证门禁。对受影响的 Codex 渠道凭据替换，项目 AGENTS 的敏感账户变更再认证要求适用，目前未满足/未验证：实施须复用既有服务器端再认证能力，并覆盖过期再认证及 PAT 替代路径不得绕过的用例；不能仅加前端检查。修复范围限定 Codex 凭据变更入口，不据此扩展全站审计或重写其他 provider。
- `middleware/audit.go:finishAdminAudit` 记录 route params/状态而非原始 body，response buffer 用于成功判定。`controller/oauth_flow.go` 会把交换错误写 SysError，新 transport 的 error 必须在这里仍然安全；审计路径需哨兵测试确认，不凭 grep 声称所有日志安全。

## 必须解决或明确保留为未验收的现状差距

`controller/oauth_flow.go` 的 HMAC payload 只有 provider/channel/state/verifier/created_at，complete 校验后直接 `buildKey`；没有发起 user/session 字段，也没有事务单次消费。已检查路由与鉴权链：它们保证当前调用者有权限，却不绑定发起会话，也不消费 flow token。现有签名防篡改不能代替 ASVS 10.1.2 的事务/浏览器会话绑定。`CreatedAt` 只拒绝过去超时，不拒绝未来时间；因 payload 有 HMAC 完整性保护，未发现攻击者可任意伪造未来时间的证据，此项仅列为防御性验证，不作为已确认可利用漏洞。

最小方向：Codex flow 使用现有服务器端 auth-flow 生命周期，绑定已验证发起身份及 provider/channel，短期有效并原子消费；复用 `model/auth_flow.go` 的 `AuthFlowMatch`/`ConsumeAuthFlow` 能力，先确认 PAT 与浏览器身份语义。消费发生在发出交换之前，失败需要重新开始，避免不确定上游结果后的重放。保持 Claude 路径显式分离，不能无意更改其流程。若触及数据库行为，按项目规定必须真实 SQLite/MySQL/PostgreSQL 矩阵验证；本表未执行也未豁免。

这项差距属于受影响 OAuth 流的验收阻塞条件，不能通过“仅改传输”或标为遗留来宣称认证完成。若实施尚未覆盖，交付必须保留未完成状态。上游授权码单次使用是额外防线，不能代替本地事务绑定。

## 验证记录要求

实施后记录实际执行命令、测试名、结果和使用的测试 CA/模拟上游性质。只使用合成凭据；不写真实秘密到 Git、命令行、容器层、pcap 或日志。若修改 DB 路径，另列三个数据库的确切版本与命令。外部 provider 的实际行为和完整合规不由本表或 mock 测试推断。
