# Judge 5：并行执行规划独立评审

日期：2026-10-14。评审对象：`.specs/tasks/draft/codex-transport.feature.md` 的 Implementation Process、并行执行与文件所有权、验收命令及硬门。依据：`skills/plan-task/SKILL.md` Phase 5 / Judge 5、`CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md` §4、§7–10。未读取作者自评 scratchpad，未修改任务产物；本评审仅判断规划，不声称代码或验收已完成。

## 评分

| 标准 | 权重 | 分数 / 5 | 证据与判断 |
|---|---:|---:|---|
| 依赖准确 | .35 | 4.8 | 切片图明确 S01→S02→两端编码；S04a/b 可独立 mock，但 S04c 等 S03，整步不提前通过。S06 等 S03，S07 等 S04/S06，S08 等 S05/S07，S09c live 等 S08 及合成/安全门，最终 S10c 等完整协议/账务结果。与源计划先协议后接入、复用 WS 和计费、真实调用最后开展一致。没有发现循环或漏掉的关键完成前置。 |
| 并行优化 | .30 | 4.6 | A–G 批次与切片依赖图区分 Rust、Go、运维及合成协议验证；批次 C/D 可使用三个 worker，S08 与合成 S09 可并行，live 不提前。文件所有权避免为并行而复制实现。使用“可并行切片”表而非字面 Parallel with 标签，语义清楚。未给工作量时间估算，因此不能证明关键路径时间最优；这不影响安全实施。 |
| 角色/工具选择 | .20 | 4.8 | 只使用实际 collaboration 通用代理，明确继承模型、root 加最多三个 worker、Judge 也占槽位且与作者分离。研究、契约、Rust、Go、管理、安全/协议、账务与运维角色对应产物；不再依赖不可用 Opus 或专用代理类型。 |
| 执行指令 | .15 | 4.7 | 每次派工须给切片、通过前置、可写路径、只读契约、必读规则、验收命令及交接对象；共享文件先交接，契约变更暂停依赖任务并重跑门禁；命令/退出码/版本记录由 root 汇总。三库与 live 单 owner，隔离 socket/端口/容器/数据库，明确禁止将准备标记为整步完成。 |

加权总分：4.8×.35 + 4.6×.30 + 4.8×.20 + 4.7×.15 = **4.725 / 5**。

阈值：3.5 / 5。结论：**PASS**。

## 共享文件与执行容量复核

- `service/codex_transport.go`、`relay/channel/api_request.go`、相关测试从 S04 显式交接 S07；S04c 未通过不能开始 S07 写入。
- Rust `src/`、依赖与 lock、集中 transport 测试由同一角色按 S03→S06 顺序写；S09/S10 只能提出依赖修复请求，不能并写 lock。
- S05 控制器/OAuth 文件与 S07 会话文件分开，S07 对 S05 接口只读；会话测试从 S07 完成后交给 S08。
- S09 独占协议 sampler/fixtures，S10 独占 Docker/Compose/CI；README 在 S02 冻结后交接；root 独占汇总状态，各 Judge 独占自己的文件。
- 同批次至多三名 worker。若 S10a/b 在批次 D 开始时仍运行，必须根据已写明的三槽上限排队，不能把批次表理解为允许第四个 worker。评审同样排队。

## 非阻塞精度建议

执行时给所有权表中的 `scripts/compare-baseline.py`、`fixtures/protocol/`、`scripts/test-databases.sh` 写完整 `tools/codex-transport/` 前缀，避免派工歧义；实施步骤和验收命令已明确完整路径，当前无实际归属冲突。跨批次未结束任务继续占用槽位，root 应按已有容量规则调度。

未发现需阻止 Phase 6 的实质并行缺口。此 PASS 不代替 Phase 6 Judge、不授权绕过 OAuth/真实三库/live 硬门，也不表示全部实现 AC 已通过。
