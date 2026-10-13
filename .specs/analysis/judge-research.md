# Judge 2a — Research / Skill

日期：2026-10-14。独立评审；未读取作者 scratchpad 或自评分。阈值 3.5/5；评审对象 `.claude/skills/codex-transport-research/SKILL.md` 及其引用的 `.specs/analysis/codex-transport-research.md`。需求依据 `CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md`，已完整阅读 billing 规则。仅评审研究阶段，不代表实现或实测验收通过。

| 维度 | 权重 | 分数 | 证据与判断 |
| --- | --- | --- | --- |
| 资源覆盖 | 0.30 | 4.3 | 研究“来源与可复核依据”“已核实依赖与配置”给出官方版本源码、HTTP/WS构建入口、精确 fork revision 和依赖列表。独立抽查临时缓存 Cargo.toml 的 reqwest、WS fork patch 及 HTTP/WS crate features，与报告一致。未运行完整 feature graph，报告如实列为未决，因此不评满分。 |
| 模式适用性 | 0.25 | 4.5 | 技能区分 HTTP native、显式 CA rustls、WS rustls；研究要求保留 Go 业务/用量职责，明确私有协议、流式背压、错误阶段与禁止重放，直接对应源计划第 3、4、5 节。HTTPS proxy 特殊路径亦通过 dialer.rs 抽查。 |
| 问题预判 | 0.20 | 4.5 | 研究明确重复 reqwest 版本、SSH git 源、feature 合并、历史证据不能代替验收、真实流量/私钥不得提升、POC 缺少 WS 和正式协议等风险，给出锁定/白名单/正式契约验证措施。尚需落实阶段补全具体测试实现。 |
| 可复用性 | 0.15 | 3.5 | 技能给出版本升级取证、证据分层、合成凭据、初次/恢复握手和协议分层的持久规则，可用于后续升级审查；但绑定本任务基线且大量细节依赖研究报告，通用性有限。 |
| 任务集成 | 0.10 | 1.0 | 当前 `.specs/tasks/draft/codex-transport.feature.md` 搜索未发现 `codex-transport-research` 引用；研究及技能虽相互关联，任务尚未明确要求实施者阅读该技能。 |

加权总分：4.3×0.30 + 4.5×0.25 + 4.5×0.20 + 3.5×0.15 + 1.0×0.10 = **3.94/5**。

**结论：PASS（3.94 ≥ 3.5）**。

晋升前需补的小缺口：在任务文件显式链接研究技能与报告，并要求阶段 0 和版本升级执行其证据维护规则。此为明确缺失，不能用本 PASS 声称任务已无遗漏。

后续执行门禁：完整 feature graph、官方 Linux ARM64 二进制校验与重采样、HTTP2 HEADERS/HPACK、官方 OAuth WS 基线及三数据库完整结算链路均仍未执行；研究已明确列出，不能继承 POC 历史结果作为完成证据。
