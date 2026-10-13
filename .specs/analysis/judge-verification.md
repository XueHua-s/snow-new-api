# Judge 6 — Verification 与最终遗漏审计

日期：2026-10-14。独立 Judge，依据 `skills/plan-task/SKILL.md` Independent judge method / Judge 6，阈值 3.5/5。读取当前 draft、源计划全部十节、研究/代码/安全报告、六份已完成 Judge 报告及完整 billing 规则；未读作者 scratchpad、未修改作者产物。本报告判断规划标准是否完整，不证明任何未来实现测试通过。

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Verification Level Appropriateness | .30 | 4.7 | Verification 表为 S02–S09 的协议、安全、重试、WS、账务高风险步骤安排三名独立 Panel；S01/S10 使用 Single/Per-Item，仍要求读取此前 Panel 原证据，不能豁免安全。作者与 Judge 分离，明确并发槽位和逐人通过。 |
| Rubric Quality | .30 | 4.6 | 十行分别量化保真、上游精确次数、同步屏障、边界、凭据隔离、数据库原链路、官方多层采样和运维条件；每行四项权重合计 1.00。缺证据/零匹配/Skip/秘密泄漏及重放均有硬门。OAuth 早期正文仍有过时 C06 引用，应按下方文字修正，避免与新增 C09 独立 runner 相冲突。 |
| Threshold Appropriateness | .20 | 4.8 | 实施高风险步骤 4.5、中风险 4.0；规划阈值独立为 3.5。Panel 各人均须过阈值且全部硬门通过，不允许平均分掩盖失败，三轮耗尽不能豁免。 |
| Coverage Completeness | .20 | 4.8 | Summary 正确统计 10 步、8 Panel + 2 Single、26 次评价；S01–S10 全有定制标准、证据和阈值。AC01–15、源§1–10、C01–C09、30 切片、条件模块/迁移/前端检查均有执行归属。没有把 todo 或已有 Go 基线等同侧车生产验收。 |

总分：4.7×.30 + 4.6×.30 + 4.8×.20 + 4.8×.20 = **4.710/5.000**，权重合计 1.00。**PASS**（≥3.5）。

## 最终覆盖审计

- 源§1–3、§10：S02–S08 明确 Rust 终止 TLS、Go 业务/usage/账务保留、无重复 WS 状态机、固定版本与默认关闭；S10 审计最终证据。
- 源§4：S02–S07 覆盖 UDS 与健康/wire、HTTP 头/body/错误/三层 retry/双层 redirect、WS 先握手/帧/控制/关闭、多轮账务与凭据代次、无共享 Cookie 和按有效策略分池。具体数值由 S02 冻结且阻止两端提前编码，并非遗漏后留给实现者随意决定。
- 源§5–6：S01/S03 锁定全部依赖、两 fork 和 features；S04/S05/S07 覆盖推理、OAuth 交换/后台刷新、模型、两 WHAM 入口及 consume ID，保留 Claude/GitHub 出口。
- 源§7–9：十步及命令覆盖 ARM64 独立 Rust 构建、全部原建议 Go 包、条件 relaykit/tokenkit 独立构建、实际三库/独立日志库、合成官方首次/恢复 TLS 与实际 Responses H2/WS、真实账号最少调用、CA 清理、Docker 灰度/回滚与版本升级说明。
- AC01–06→S02–S05；AC07/08→S06/S07；AC09/12→S08；AC10/11→S03/S06/S09；AC13→S01/S04/S10；AC14→S05/S07；AC15→S09c。每项至少一处实际验收责任，未来全部 pending。
- C09 已由 S05 独占 `test-auth-databases.sh`，自行创建隔离 SQLite/MySQL/PostgreSQL，S08 后续复跑；因此无需等待 S08。S07 可并行准备但安全门通过前不能完成，S08 等 S05/S07。新增机制本身没有依赖循环。
- 实施基线节公开 `b3531b3df` 与目标 `origin/main=517075d56` 的 310 提交/1646 文件差异，要求规划 PR 在 fork `XueHua-s/new-api` main 隔离分支提交。S01 必须重验实际实施基线的 WS/auth-flow/harness 前置；规划 PR 不应夹带历史代码，也不能使旧 main 被误认为已有这些能力。
- 已完成 Judge 报告提到的研究技能引用、两 WHAM、有效全局策略、环境代理、错误穿透、活动/空闲 WS、四 DSN、启动快照、OAuth 控制归属均已进入当前 draft。未发现未分配的源计划实质要求。

## 晋升前必须完成的文字与状态修正

1. OAuth 安全前置正文末句仍写“复用数据库操作仍需 C06 真实三库验证”。改为“S05 完成前由 C09 独立认证三库验证；S08 的 C06 后续复跑并完成账务矩阵”。以免旧文字重新制造 S05→S08→S05 循环。
2. 同节“此轮未声称已做认证审计”改为“已完成静态安全准备，未完成实现安全验收”，并沿用现有控制表而不是说实施时从零建立。与已经存在的 security 报告区分一致。
3. 源§8追踪表把 C01–C08 更新为 C01–C09；所有权表的 scripts/fixtures 路径补齐 `tools/codex-transport/`，消除派工歧义。
4. 晋升时同步 frontmatter/status、开头流程状态、Judge 6 链接及规划 DoD 勾选；实现 AC、测试和所有步骤仍未完成，不能一并勾选。转移文件后检查全部相对链接，PR 说明明确这是规划交付。

以上为明确的小型文字/状态修正，不是新实施范围；PASS 不授权保留相互矛盾的引用。root 完成修正及逐项复核后可晋升 todo。后续仍必须执行全部实现硬门；缺三库、live、安全或基线证据时禁止声明实现 done。

## 晋升后修正实查（2026-10-14）

重新读取 `.specs/tasks/done/codex-transport.feature.md`：上述四项已落实。OAuth 前置已明确 S05/C09 与后续 S08/C06；安全状态改为静态准备而非实现验收；源§8索引及所有权路径已补齐；frontmatter 为 todo，Judge 6 分数/链接和规划 DoD 已同步。逐个解析 Markdown 相对链接，全部目标存在；AC01–15 均未勾选，未将任何实现验收改成通过。评分不变。

用户最新要求已明确覆盖此前“规划文档 PR”的假设：必须完成全部实现、有意义的充分回归、真实三库、Docker 模拟部署及真实账号全链路后，才向当前仓库 `XueHua-s/new-api` 的 main 提交 PR。todo 开头及基线前置已同步此范围。本文前述规划 PR 描述仅记录初次评审时假设，现不再适用；保留隔离目标分支、审查必要前置、禁止直接夹带310项历史变更的要求。此次实查不判断基线前置已具备，也不证明任何业务功能或部署验收完成。
