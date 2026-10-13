# Judge 2b — Codebase analysis

日期：2026-10-14。独立评审对象：`.specs/analysis/codex-transport.md`，重点为 Phase 2b 全面复查。依据：源实施计划、`skills/plan-task/SKILL.md` 的 Independent judge method / Judge 2b rubric、项目规则（完整读取 billing 规则）。没有读取作者 scratchpad 或采用作者自评分。

| 标准 | 权重 | 分数 / 5 | 证据 |
|---|---:|---:|---|
| 文件识别准确性 | 0.35 | 4.6 | HTTP/WS 共用出口、Codex OAuth 与 Claude 共用 helper、两条独立 WHAM client 创建、模型查询与 GitHub release client 均识别。独立核对 `api_request.go:379,523`、`controller/codex_usage.go:103,184`、`service/codex_channel_models.go:28,37`；新增与修改及不涉及模块分别列明。 |
| 接口文档 | 0.25 | 4.1 | HTTP 返回 `*http.Response`、WS 返回 `*websocket.Conn`、注入 client 的三个 WHAM API、NormalizeHTTPTransportPolicy、restoreConnectionContext 有变更要求。部分辅助函数未给完整参数签名，尚未冻结新适配 API，不能评满分。 |
| 集成映射 | 0.25 | 4.7 | 覆盖请求头 override 之后元数据注入、url.Error 分类至 SkipRetry、401 业务刷新与发送不明重放区别、全局有效策略、环境代理及 WS 物理配置失效。实读现行 doRequest 的普通错误包装与 DialContext 的丢弃错误体确认风险成立。 |
| 风险评估 | 0.15 | 4.6 | 明确 HIGH，提出有界缓冲、隔离凭据、禁止透明重放、三库实际链路等缓解。独立阅读 `restoreConnectionContext` 确认当前只比较 proxy 而无 TLS/profile；读取 `TestFixedPriceBillingDatabaseMatrix` 确认缺主库 DSN 会 Skip、日志 DSN 可省略而复用主库，因此必须四 DSN 与完整 sidecar fixture。 |

加权总分：4.6×0.35 + 4.1×0.25 + 4.7×0.25 + 4.6×0.15 = **4.50 / 5.00**。阈值：3.50。结论：**PASS**（代码分析阶段，不是实现验收或 todo 晋升的单独授权）。

## 缺口和后续门禁

- 必须把分析最后的遗漏摘要回填任务；仅分析文档提到不等于最终实施计划已覆盖。尤其聚合 WHAM、Go OAuth/管理 redirect、全局有效策略、环境代理、内部 transport 重试、WS 配置代次、四 DSN。
- 新接口精确签名、私有协议和资源数值待架构/分解产物冻结，属于下一阶段；不能在实现时默许默认值。
- 分析前半段保留旧“尚未查明三库 harness/独立 Judge 尚未执行”历史描述，后半段已明确替代；最终计划应只陈述当前结论。
- 本评审无运行测试、真实上游验证或官方 TLS 采样；环境版本陈述未重复探测，不用于证明生产能力。三库测试当前内容只能验证账务基础，不能证明 Rust 接入后链路。
