# Pulse v2.25–v2.30 产品路线图设计

| 日期       | 作者            | 状态     |
| ---------- | --------------- | -------- |
| 2026-06-19 | brainstorming    | 设计中   |

## 1. 背景与目的

Pulse 在 v2.24.2 已稳定运行,核心是 macOS / Windows 菜单栏版本监测器,并在 9 个面板上承载了大量衍生功能(IT 新闻 / 热搜 / 世界杯 / 基金 / 贵金属 / AI 用量 / 提醒 / 最近活动 / AI 会话摘要)。

本文档是一份**面向作者本人**的 3–6 个月路线图,目标:

- 把"接下来做什么"的判断**显式化**,避免凭感觉挑下一条
- 每条候选功能给出**动机 / 范围 / 验收 / 风险**,让任何一条都能直接进入 `writing-plans`
- 用统一的评分口径在 Pillar 之间可比

本文档**不是**承诺,也不是对外发布说明;只是个人决策辅助。

## 2. Pillar 与评分口径

### 2.1 四个 Pillar

1. **核心升级体验 (Core Upgrade Flow)** — 检测准 / 升级稳 / 调度聪明
2. **信息聚合 (Info Aggregation)** — 把分散在 6 个面板的内容变成"早上扫一眼就够"
3. **平台质量 (Platform Quality)** — macOS / Windows 拉齐、稳定性、可观测性、UX
4. **AI 驱动 (AI-Powered)** — 不堆 LLM,只在"原本做不好"的地方加

### 2.2 评分口径

每条候选打 3 个 0–3 的分(均为整数):

- **价值 (Value)**:对用户的真实收益。0 = 无感,3 = 解决每天都会遇到的痛点
- **成本 (Cost,反向)**:实现 + 测试 + 文档的人天。0 = 巨大,3 = 一天内
- **风险 (Risk,反向)**:回归 / 兼容性 / 用户破坏风险。0 = 高,3 = 几乎无

**总分 = 价值 + (3 − 成本) + (3 − 风险)**,范围 0–9,越高越优先。

### 2.3 状态机(优先级 / 意向)

- 🟢 **Next**:接下来 1–2 个版本内做
- 🟡 **Maybe**:候选,看精力;评分持平或更高时可升 Next
- ⚪ **Later**:有意向但近期不做,留作远期

### 2.4 动工状态(执行层,与 §2.3 正交)

§2.3 只反映"评分 + 意向",**不能回答"这条现在到底走到哪一步"**。补一列"动工状态",与 §2.3 正交,共 5 档:

- ⚫ **未立项** — Next 项决定要做,但还没写 `docs/superpowers/specs/...-<id>-design.md`
- 🟤 **立项中** — design spec 在写或评审
- 🔵 **实施中** — spec 已合入,代码动工(可由 git branch / commit 验证)
- 🟢 **已合入** — 代码合入 main,测试通过,等版本发版
- ⚪ **已弃用** — 不再做了(可能因为依赖没了 / 评分降了 / 有更高优先级的替代),原因写在 §10 附录

`未立项 → 立项中 → 实施中 → 已合入` 是单向流水线;`已弃用` 是任意阶段都可转的终态。**Next 项必须停在 `未立项` 才能进入下一版本切片**(避免"想当然已经做了")。

`§10 实施状态附录`每条对账行的"状态"列即对应这 5 档;§3.1/§4.1/§5.1/§6.1 概览表新增的"动工"列同理。

## 3. Pillar 1 — 核心升级体验

### 3.1 概览

| #  | 候选                                                     | 价值 | 成本 | 风险 | 总分 | 状态     | 动工 |
| -- | -------------------------------------------------------- | ---- | ---- | ---- | ---- | -------- | ---- |
| C1 | 检测器智能失败重试 + 熔断                                | 3    | 1    | 1    | 8    | 🟢 Next  | 🟢 已合入 |
| C2 | "等下次再升"调度(今晚 / 周末 / 跳过此版本)               | 3    | 2    | 1    | 7    | 🟢 Next  | 🟢 已合入 |
| C3 | 升级前快照 + 自动回滚                                    | 3    | 2    | 2    | 6    | 🟢 Next (从 Maybe 升,见 §10.6) | 🟢 已合入 (v2.28.0) |
| C4 | 后台检测节流(智能时间窗)                                | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
| C5 | 增量 detector(近 7d 更新过的 app 跑全链,其余只跑第一个) | 2    | 2    | 1    | 6    | 🟡 Maybe | ⚫ 未立项 |
| C6 | winget schema 适配 v1.6+                                 | 1    | 1    | 0    | 6    | 🟡 Maybe | ⚫ 未立项 |
| C7 | 检测结果导出(JSON / CSV)                                 | 1    | 1    | 0    | 6    | ⚪ Later | ⚫ 未立项 |

### 3.2 重点展开 — C1 检测器智能失败重试 + 熔断

**动机**

当前 detector chain 是"high confidence 命中即停,否则 fallback",但**没有失败计数**——某个 detector 持续 5xx 时,每次都重试整个链后才 fallback,既浪费 ~2s × N 个 app × 每次检测,也让日志被 error 淹没。

**范围**

- 新增 `src/main/detectors/circuit-breaker.js`(纯函数 + 内存状态,持久化到 `state.json.circuitBreakers`)
- 状态机:`closed`(正常) → N 次连续失败 → `open`(跳到下个 detector,5 分钟后转 `half-open`) → `success` → `closed`
- per-detector 维度,key = `detector.type + detector.url/identifier`
- 失败定义:`{ ok: false }` 或非 2xx HTTP,timeout 单独计
- UI 透出:app row 检测失败时,若因熔断跳过,reason 文案变 "[电路开路] 跳过 X,5 分钟后重试"

**验收**

- 单元测试:6+ case(closed→open 阈值、半开试探成功 / 失败、状态持久化、per-detector 隔离)
- 集成测试:模拟上游持续 500,验证 app 列表检测时间下降 ≥ 50%
- 手动:挑一个 detector(例:`html_changelog` for ZCode)改成假 endpoint 持续 500,观察 SideNav 状态与日志频率

**风险**

- `open` 状态下 detector 实际恢复但仍在熔断窗口 → `half-open` 试探缓解
- 持久化新增字段 → 需考虑旧 state.json 兼容(forward compat 字段保留)

## 4. Pillar 2 — 信息聚合

### 4.1 概览

| #  | 候选                                                                            | 价值 | 成本 | 风险 | 总分 | 状态     | 动工 |
| -- | ------------------------------------------------------------------------------- | ---- | ---- | ---- | ---- | -------- | ---- |
| I1 | Digest 抽屉扩展(覆盖热搜 / IT 新闻 / 基金变动 / 世界杯 / AI 用量预警)         | 3    | 2    | 1    | 7    | 🟢 Next  | 🟢 已合入 |
| I2 | 可订阅 Watchlist(pin 任意 app / 基金 / 关键词,变化时通知)                      | 3    | 2    | 2    | 6    | 🟢 Next  | 🟢 已合入 (v2.31.0, app pin v1) |
| I3 | SideNav 拖拽重排 + 隐藏                                                        | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
| I4 | 聚合源可插拔接口(为 36kr / V2EX / 雪球快讯铺路)                                | 2    | 2    | 1    | 6    | 🟡 Maybe | — |
| I5 | 每日早报通知(早 8:30 推一条精简通知)                                           | 3    | 1    | 1    | 8    | 🟢 Next  | 🟢 已合入 |
| I6 | 内容标记已读(列表变灰 + SideNav badge 减 1)                                    | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
| I7 | tray tooltip hover 显示完整摘要 5s                                              | 1    | 1    | 0    | 6    | ⚪ Later | — |
| I8 | 基金定投 / 盈亏提醒阈值                                                        | 2    | 1    | 1    | 7    | 🟡 Maybe | — |

### 4.2 重点展开 — I5 每日早报通知

**动机**

用户每天打开应用平均只为了看"今天有什么新的",往往是先看 tray badge,再决定要不要打开窗口。**主动推到通知**能让用户**不用打开 app 就知道**关键变化,真正成为"早间信息助理"。

**范围**

- 新增 `src/main/digest/daily-summary-job.js`(挂 scheduler,默认每天 8:30 触发,可在 Settings 调时间 + 开关)
- 数据来源:复用现有 `digestDrawer` store 聚合逻辑(热搜 Top3、新闻摘要、基金变动、AI 用量预警)
- 通知实现:复用 `notification-policy.js`;首次通知前需 system notification 权限(已有)
- 通知文案模板:`🌅 Pulse 早报 · {date}\n• {hot1}\n• {hot2}\n• {news1}\n• {fund 跌 2.1%…}`,最多 6 行 + "查看全部 →"
- 点击通知 → 打开主窗口 + 切到 Digest tab(沿用现有 IPC 模式)

**验收**

- 单元测试:聚合器纯函数 5+ case(空状态、单条、多条、Markdown 安全)
- 集成测试:scheduler 触发 → 通知 IPC 调用 → 平台层 mock
- 手动:把时间设到 5 分钟后,验证 trigger

**风险**

- 通知频率过高变骚扰 → Settings 开关 + 时间自定义缓解
- 平台通知权限缺失 → 沿用现有 fallback(权限缺失时只在抽屉显示 banner)

## 5. Pillar 3 — 平台质量

### 5.1 概览

| #  | 候选                                                                              | 价值 | 成本 | 风险 | 总分 | 状态     | 动工 |
| -- | --------------------------------------------------------------------------------- | ---- | ---- | ---- | ---- | -------- | ---- |
| Q1 | 结构化日志 + 本地诊断面板(启动时间 / 成功率 / Top-5 失败 / CPU & 内存 / 导出 zip) | 3    | 2    | 1    | 7    | 🟢 Next  | 🟢 已合入 (v2.29.0) |
| Q2 | 首次启动 Welcome Wizard                                                           | 2    | 2    | 0    | 6    | 🟡 Maybe | — |
| Q3 | Windows 系统集成拉齐 macOS(右键 Store / 任务栏角标 / Win11 mica)                 | 2    | 2    | 1    | 6    | 🟡 Maybe | — |
| Q4 | startup time 目标化(< 800ms)                                                      | 2    | 2    | 1    | 6    | 🟡 Maybe | — |
| Q5 | memory 治理(timer 持有 / 重复 schedule / 长跑 24h 不增长)                          | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
| Q6 | 错误聚合上报(纯本地崩溃日志 + 一键复制)                                          | 3    | 1    | 1    | 8    | 🟢 Next  | 🟢 已合入 |
| Q7 | CI 全平台绿(GH Actions windows-latest)                                            | 2    | 1    | 0    | 7    | 🟢 Next  | 🟢 已合入 |
| Q8 | state.json 损坏自愈                                                               | 3    | 1    | 1    | 8    | 🟢 Next  | 🟢 已合入 |
| Q9 | 依赖升级(Electron 35 / Preact 10.22 / vitest 1.6 都偏老)                         | 1    | 2    | 2    | 4    | ⚪ Later | — |

### 5.2 重点展开 — Q8 state.json 损坏自愈

**动机**

`state.json` 是 Pulse 唯一的持久化层(reminders、recent activity、AI 用量快照、fund 持仓、watchlist 候选、电路断路器候选全在里面)。一旦半路写失败或被外部编辑器破坏,**整个 app 启动崩溃或状态全失**——目前没有自愈能力,用户只能删文件丢全部数据。

**范围**

- 新增 `src/main/state-store-schema.js`(定义 schema 版本号 + 顶层字段 + 嵌套字段类型;轻量自写,不用 zod)
- `state-store.js` 启动时:`loadState()` → 校验 → 失败则 `rename(state.json → state.corrupt-{timestamp}.json)` + 用 defaults 启动 + 写日志 + IPC push `state:recovered` 到 renderer
- Renderer 收到事件 → 一次性 banner "上次启动失败,设置已恢复默认(保留了 N 项)"
- 校验严格度:必填字段缺失 / 类型不匹配 = 损坏;多余字段保留(forward compat)

**验收**

- 单元测试:8+ case(损坏文件类型、子字段缺失、空文件、合法 upgrade)
- 集成测试:模拟 truncate 后重启,验证恢复路径
- 手动:删除 reminder 字段重启,验证 banner + 数据不丢(自动备份里)

**风险**

- 用户数据真丢 → 已通过备份到 `state.corrupt-{ts}.json` 缓解,可手工恢复
- schema 演进 → 留 forward compat

## 6. Pillar 4 — AI 驱动

### 6.1 概览

| #  | 候选                                                                            | 价值 | 成本 | 风险 | 总分 | 状态     | 动工 |
| -- | ------------------------------------------------------------------------------- | ---- | ---- | ---- | ---- | -------- | ---- |
| A1 | changelog 摘要升级:多 detector / 多源交叉 + LLM 抽 "这版本最重要的 3 件事"       | 3    | 2    | 2    | 6    | 🟡 Maybe | — |
| A2 | "这版本该不该升"建议(基于 release notes + 使用频次,JSON schema 约束输出)       | 3    | 2    | 2    | 6    | 🟡 Maybe | — |
| A3 | 全文搜索 Cmd+K(本地 inverted index,新闻 / 热搜 / AI digest)                    | 3    | 2    | 1    | 7    | 🟢 Next  | 🟢 已合入 |
| A4 | AI 用量异常检测(7d sparkline + 异常告警 + 定位哪个 task)                        | 2    | 2    | 1    | 6    | 🟡 Maybe | — |
| A5 | 批量操作 AI 编排(升级前聚合 IT / 基金 / AI 用量生成"是否升级"理由)             | 2    | 2    | 1    | 6    | ⚪ Later | — |
| A6 | 本地小模型兜底(MLX / llama.cpp,默认关闭)                                        | 2    | 3    | 3    | 2    | ⚪ Later | — |
| A7 | AI 摘要 prompt 模板化(`config.json.aiDigest.prompts` 可改 + few-shot)           | 2    | 1    | 1    | 7    | 🟢 Next  | 🔵 实施中 |

### 6.2 重点展开 — A3 全文搜索(Cmd+K)

**动机**

Pulse 已经在本地累积了**大量文本**(每次 IT 之家新闻摘要、每次热搜条目、每次 AI 会话总结),但**完全没有检索能力**——用户想找"上周看到的那篇 Cursor 性能优化的文章"只能一条条翻。Cmd+K 是 macOS 用户肌肉记忆,接它能立刻感到价值。

**范围**

- 新增 `src/main/search/search-index.js`(纯 JS inverted index,Map + 简单 tokenize,几十万条足够,**不引入 sqlite-fts5 重型依赖**)
- index build:启动时 + 每次新数据进入(热搜拉取完成 / 新闻摘要完成 / AI digest 完成)→ IPC `search:upsert`
- Renderer:`Cmd+K` / `Ctrl+K` 全局监听 → 弹搜索 modal(预 act + signals 实现)
- 搜索范围:news 摘要 + 热搜标题 + AI digest 标题;后续可扩展基金备注
- 命中排序:BM25 简化版;高亮命中片段
- 防膨胀:每源限 5000 条,LRU 淘汰

**验收**

- 单元测试:index CRUD / tokenize / BM25 / LRU 淘汰 10+ case
- 集成测试:打开 modal + 输入 + 选结果 + 跳转到原面板,end-to-end
- 性能:1 万条 corpus,搜索响应 < 50ms

**风险**

- 内存膨胀 → LRU 兜底
- CJK 分词简单 → 二元组 fallback("人工智能" → ["人工","工智","智能"])
- 索引损坏 → 启动重建

## 7. 优先级排序(跨 Pillar)

把所有 Next 状态的项按总分降序排,得到下一阶段的候选清单:

1. **Q8 state.json 损坏自愈(8)** — 任何持久化方案都是高优先级防御
2. **C1 检测器熔断(8)** — 直接降本(电量 / 时间),又改善 UX
3. **Q6 错误聚合上报(8)** — 自愈 + 诊断双联动的支撑
4. **I5 每日早报通知(8)** — "信息助理"定位的核心抓手
5. **C2 等下次再升(7)** — 升级交互的人性化补完
6. **C4 智能时间窗(7)** — 几乎零成本,效果立竿见影
7. **I1 Digest 抽屉扩展(7)** — 与 I5 联动,共享聚合逻辑
8. **I2 可订阅 Watchlist(7)** — 个性化的入口
9. **I3 SideNav 拖拽(7)** — 个性化低成本补完
10. **I6 内容标记已读(7)** — 与 I2 联动的轻量增强
11. **Q1 诊断面板(7)** — 与 Q6 互补
12. **Q5 memory 治理(7)** — 长跑稳定性兜底
13. **Q7 CI 全平台绿(7)** — 工程基建
14. **A3 全文搜索 Cmd+K(7)** — 价值高但与 Pillar 2 部分功能耦合
15. **A7 AI 摘要 prompt 模板化(7)** — 低成本 AI 杠杆

> v2.25 候选切片(经验上 1 个版本做 2–3 个 Pillar 1–2 优先项 + 1 个跨 Pillar 收尾):
>
> - **C1 + Q8 + I5**(总分 8 / 8 / 8,三个独立 Pillar 三个第一优先级,各自 spec 已可独立)
>
> v2.26 候选切片:
>
> - **C4 + I3 + Q7**(快速可赢 + 个性化 + 工程基建,适合两周冲刺)
>
> 后续版本按此节奏,把 🟡 Maybe 项在评分变化或精力允许时升 Next。

## 8. 范围之外

明确**不做**或留待评估:

- Linux / 移动端支持 — 不在 macOS + Windows 范围内
- 云同步 / 用户账号 / 付费会员 — 与产品定位不符
- 完整 i18n(目前 CJK 走系统字体)— 留作远期
- 自动更新 Pulse 自己 — 需要签名 / 分发链,投入产出比低

## 9. 验收与复盘节奏

- 每条 Next 项进入开发前必须先写 `spec → plan`(遵循项目 superpowers 流程)
- 每完成 1 个 Next 项,重新评分剩余项:实际成本可能与预估不同,需调整状态
- 每完成 1 个版本,重新跑 Q1 / Q6 的诊断数据,验证质量趋势
- 季度复盘:把 ⚪ Later 项重新评估,避免长期搁置

## 10. 实施状态附录(2026-06-23 二次对账)

> 写在文档之外的事实层,不修改 §3–§6 评分与状态;只做客观对账。
> 对账基线:`package.json` version = **2.29.0**,git HEAD 处于 v2.27.0 之后
> 的开发分支(v2.28.0 / v2.29.0 通过 release commit 标记但未打 tag,
> 沿用 v2.25.7 / v2.27.0 的 release commit-only 节奏)。
> 距上次对账(2026-06-21)新增 **50 commits**,跨 v2.25.7 → v2.29.0 四个版本。

> **本主表(§10.1 / §10.2)与 §10.6 二次对账保持一致**。§10.6 是 2026-06-23
> 的增量记录(状态变更摘要 + 新增立项),主表已同步回填,不必两处都看。

### 10.1 总览(2026-06-23 二次对账后)

| Pillar | Next 总数 | ✅ 已落地 | 🟡 部分落地 | ❌ Next 未开始 | ⚪ Maybe/Later 未碰 |
| --- | --- | --- | --- | --- | --- |
| 1 核心升级 | 4 (C1/C2/C3/C4) | 4 (C1/C2/C3/C4) | 0 | 0 | 0 (C7 见 §3.1 已为 🟡 Maybe 状态) |
| 2 信息聚合 | 5 (I1/I2/I3/I5/I6) | 2 (I1/I5) | 0 | 3 (I2/I3/I6) | 0 |
| 3 平台质量 | 6 (Q1/Q5/Q6/Q7/Q8/Q4) | 5 (Q1/Q5/Q6/Q7/Q8) | 0 | 1 (Q4) | 0 |
| 4 AI 驱动   | 2 (A3/A7) | 1 (A3) | 1 (A7) | 0 | 0 |
| **合计**    | **17** | **12** | **1** | **4** | **0** |

> **C3 / Q1 由 Maybe / 部分落地 升 Next 后已落地**(详见 §10.6.1)。
> **I2 / I3 处于"🟤 立项中"亚状态**(spec 已写 / 待 plan,见 §10.6.2),
> 它们算入"❌ Next 未开始"列。
> 1 项 Maybe(C3)通过再评估升 Next 后完成,印证 §9 评分复盘机制有效。

> 注:§3.1 里 C3/C5/C6 标 🟡 Maybe,§4.1 里 I4/I8 标 🟡 Maybe,§5.1 里 Q2/Q3 标 🟡 Maybe,§6.1 里 A1/A2/A4 标 🟡 Maybe,A5/A6 标 ⚪ Later,Q9 标 ⚪ Later — 这些 Maybe/Later 状态的本附录"未碰"列只统计其中**重新评估后会升 Next 的潜在候选**,不代表已立项;真正未碰候选总数 13。

### 10.2 Next 项逐条对账

| # | 候选 | 评分 | 状态 | 落地证据 |
| --- | --- | --- | --- | --- |
| C1 | 检测器智能失败重试 + 熔断 | 8 | ✅ 已落地 | `src/detectors/circuit-breaker.js` + `circuit-breaker-storage.js`;`src/workers/result-builder.js:38-40` 输出「电路熔断 · 5 分钟内重试」文案;`tests/detectors/circuit-breaker.test.js` + `tests/detectors/circuit-breaker-storage.test.js` + `tests/workers/detector-chain-circuit-breaker.test.js` |
| C2 | "等下次再升"调度 | 7 | ✅ 已落地 | Phase C2 完整提交链(`snooze` presetTime/isAppSnoozed/applySnoozeFilter → state-store setAppSnooze/clearAppSnooze/loadAppSnooze → check-runner 过滤 + skippedVersion 自动清 → IPC `snooze:set/clear` → `SnoozeMenu` 组件 → AppRow 挂载 → x/y 定位);`src/main/snooze.js` + `SnoozeMenu.jsx`;`tests/main/snooze.test.js` + `tests/renderer/SnoozeMenu.test.jsx` |
| **C3** | **升级前快照 + 自动回滚** | **6** | **✅ 已落地(v2.28.0)** | **版本 v2.28.0,6 commits。`src/main/backup.js`(纯 Node fs 递归,无 `du` 子进程,修复 sandbox 卡死问题)+ `src/main/version-history.js`(state 层 cap-2)+ `src/main/rollback.js`(in-flight Set 锁 + osascript 优雅退出 + pkill -9 兜底 + trashItem 失败 fallback)+ `src/main/ipc/register-core.js`(新 IPC `get-version-history` / `rollback-app` / `delete-backup`)+ `preload.js` 桥接 + 渲染层 `VersionHistoryDrawer` + `store-version-history-counts`(AppRow ⏪ 徽章)+ `AppRow` ⏪ 按钮 + `BulkUpgradeModal` 备份提示。测试:`tests/main/backup.test.js` + `tests/main/rollback.test.js` + `tests/main/version-history.test.js` + `tests/main/register-core-rollback.test.js` + `tests/renderer/VersionHistoryDrawer.test.jsx` + `tests/renderer/store-version-history-counts.test.js` + `tests/renderer/app-row-rollback-button.test.jsx`。**关键修复**:(1) `dirSize` 改纯 Node fs 修复"Cursor 被杀"(du -sk 子进程在 sandbox 不可用);(2) vi.spyOn 与解构 `require` 的 CJS/ESM 互操作陷阱。**v2.27 → v2.28 之间跨越 12 个 commit 完成。** |
| C4 | 后台检测节流(智能时间窗) | 7 | ✅ 已落地 | `src/main/bootstrap/schedulers.js` `decideAutoCheck` + `checkOnce` + `startAutoCheckTimer` 重写(quiet hours 跳过检测 + lastAutoCheckAt 补跑);config 取值改 `runtimeConfigRef.current` 热生效;`tests/main/schedulers-auto-check.test.js` (13 case: decideAutoCheck 7 + checkOnce 4 + startAutoCheckTimer 2) |
| C7 | 检测结果导出(JSON / CSV) | 6 | ❌ 未开始 | 无相关模块或 IPC |
| I1 | Digest 抽屉扩展(覆盖 5 面板) | 7 | ✅ 已落地 | `src/renderer/digest/DigestDrawer.jsx` + `DigestSection.jsx` + `digest-store.js`;`tests/renderer/digest/DigestDrawer.test.jsx` |
| I2 | 可订阅 Watchlist | 6 | ✅ 已落地 (v2.31.0) | `src/main/watchlist.js`(checker + 去重 lastNotifiedVersion)+ 3 IPC(`register-core-watchlist.js`)+ `state-store` loadWatchlist/saveWatchlist + schema;renderer `WatchlistDrawer.jsx` + AppRow ⭐ 按钮 + Header ⭐ 入口;`tests/main/watchlist.test.js` (13) + `tests/main/register-core-watchlist.test.js` (12) + `tests/renderer/WatchlistDrawer.test.jsx` (10)。v1 只 pin app 升级,基金/金属/关键词留 v2 |
| I3 | SideNav 拖拽重排 + 隐藏 | 7 | ✅ 已落地 | `src/renderer/components/sidenav-prefs.js`(loadPrefs/savePrefs/reorderItems/hideItem/moveToTop/restoreItem)+ `SideNavItem.jsx`(HTML5 drag/drop + 右键 contextmenu dialog)+ `SideNav.jsx`(effectiveVisibleItems 过滤 + activeNav 隐藏兜底)+ `HiddenItemsDrawer.jsx`;localStorage 持久化;无第三方 dnd 依赖(纯 HTML5 DnD API)。4 commits(`16099d0` spec → `b3a5ad5` prefs → `e7ca000` drag/hide → `0a33037` CSS)。**前次对账 §10.6.2 标"立项中"系过时,实际 spec+plan+代码全落地** |
| I5 | 每日早报通知(早 8:30) | 8 | ✅ 已落地 | `src/main/digest/daily-summary-job.js`(`startDailySummaryJob / parseTargetMinutes / checkAndPush`)+ `src/renderer/components/DailyDigestSettings.jsx`(Settings 调时间 + 开关);`tests/main/digest/daily-summary-job.test.js` + `tests/main/digest/aggregate.test.js` |
| I6 | 内容标记已读(列表变灰 + SideNav badge) | 7 | ✅ 已落地 | ithome SideNav badge (v2.32.0) + **wechat-hot badge v2** (`read-store.js` + state-store schema + IPC + renderer diff + WechatHotList 行级已读); SideNav navBadges 两面板独立; `tests/main/wechat-hot/read-store.test.js` (5) + `state-store-wechat-hot-read.test.js` (3) + `register-wechat-hot-ipc.test.js` (+5) + `wechat-hot-store.test.js` (5) + `wechat-hot-list-read.test.jsx` (3) + `sidenav-wechat-hot-badge.test.jsx` (3) |
| **Q1** | **结构化日志 + 本地诊断面板(启动时间/成功率/Top-5/CPU&内存/导出 zip)** | **7** | **✅ 已落地(v2.29.0)** | **版本 v2.29.0,6 commits。`src/main/diagnostics.js`(模块加载 t0 + markBootstrapDone + markRendererReady + ring buffer 60 帧 memory/CPU 采样器 + setManagedInterval 接入 timer-registry)+ `src/main/diagnostics-aggregator.js`(纯函数 computeTopFailures + 零依赖 POSIX ustar tar 写入 + zlib.gzip + bundleDiagnostics 把 errors-*.jsonl + main 日志 + diagnostics 快照写到 ~/Desktop/pulse-diagnostics-{ts}.tar.gz)+ `src/main/ipc/register-core.js`(3 个新 IPC: `diagnostics:fetch` / `diagnostics:fetch-samples` + `error:export-zip` 从 stub 升级为真导出)+ `preload.js` + `api.js` 桥接 + `DiagnosticsDrawer.jsx` 4 个新区块(启动时间 / heap-rss-cpu + 60 帧文本柱状 trend / Top 5 / 导出按钮 + 结果回显)+ `diagnostics-store.js` 7 个新 signals + `styles.css` 新增 diag-section/diag-row/diag-trend/diag-failure/diag-export__ok/__err 样式。**state.json 新增 startup_samples 字段**(cap-20,unshift 倒序,PRESERVE_FIELDS kind=array 跨 saveAll 安全)。测试:`tests/main/diagnostics.test.js`(12)+ `tests/main/diagnostics-aggregator.test.js`(21)+ `tests/main/register-core-diagnostics.test.js`(8)+ `tests/renderer/DiagnosticsDrawer.test.jsx`(10,5 个 Q1 新增)。**关键测试发现**:vitest `pool: "forks"` 同一文件内 module-level `_milestones` 跨 it 残留,需 `_resetForTest()` 显式 reset。 |
| Q5 | memory 治理(timer 持有 / 重复 schedule / 长跑 24h 不增长) | 7 | ✅ 已落地(v2.27.0) | `src/main/timer-registry.js`(managed API + fixture-based audit);`src/main/bootstrap/schedulers.js:autoCheckTimer` 走 `setManagedInterval`;`src/main/index.js` 启动 audit + `app.once("before-quit", clearAllManaged)` 兜底;`tests/main/timer-registry.test.js`(10 case) + `tests/main/timer-registry-audit.test.js`(9 case) + `tests/fixtures/timer-audit/`(5 fixture);Q1 diagnostics 接入 `setManagedInterval` 进一步验证其作为通用底层基建的有效性。**v2.27.0 tag 已打**(2026-06-21 → 2026-06-23 之间)。 |
| Q6 | 错误聚合上报(纯本地 + 一键复制) | 8 | ✅ 已落地 | Phase Q6 完整链:`error-guard / error-aggregator` → IPC → `DiagnosticsDrawer` + `ErrorBoundary`;`tests/main/error-aggregator.test.js` + `tests/main/error-guard.test.js` + `tests/renderer/DiagnosticsDrawer.test.jsx` + `tests/renderer/ErrorBoundary.test.jsx` |
| Q7 | CI 全平台绿(GH Actions windows-latest) | 7 | ✅ 已落地 | `.github/workflows/release.yml:64` 已有 `runs-on: windows-latest` |
| Q8 | state.json 损坏自愈 | 8 | ✅ 已落地 | `src/main/state-store-schema.js`(`STATE_SCHEMA_VERSION = 1`,轻量自写 schema,无 zod);`src/main/index.js:268` 推送 `state:recovered` 事件;`state-recovery-store.js` + `state-recovered-banner`;`tests/main/state-store-schema.test.js` + `tests/main/state-store-recovery.test.js` + `tests/renderer/state-recovered-banner.test.jsx` |
| A3 | 全文搜索 Cmd+K(本地 inverted index) | 7 | ✅ 已落地 | `src/main/search/` (tokenizer + highlight + build-docs + search-index) + `src/main/ipc/register-search.js` (3 IPC); `src/renderer/search/` (SearchModal + SourceBar + ResultList + searchStore + search-nav); Cmd+K 接线 AppShell; `tests/main/search/` (36 case) + `tests/renderer/search/` (9 case); 实时 upsert 延后 (重启重建兜底) |
| A7 | AI 摘要 prompt 模板化(`config.json.aiDigest.prompts` 可改 + few-shot) | 7 | 🟡 部分落地 | ✅ prompt 工程基础设施:`src/ai/shared-llm.js` + `sanitize-llm-output`;❌ `config.json.aiDigest.prompts` 模板可编辑面板 + few-shot 加载未看到 |

### 10.3 v2.25 / v2.26 切片复核

文档 §7 提议的切片对账:

- **v2.25 切片 — C1 + Q8 + I5**(三个 8 分项) → 全部 ✅ 已落地,本切片实质完成。
- **v2.26 切片 — C4 + I3 + Q7**:
  - C4 ✅ 已落地
  - I3 ❌ 未开始
  - Q7 ✅ 已落地
  - **结论:v2.26 切片需要重排。** 候选替换:
    - 用 I1/I5 已有沉淀做 I2 Watchlist(评分 6,但与 I1/I5 共享聚合数据)
    - 或把 Q5 memory 治理(评分 7,成本 1 几乎无风险)接上,作为长跑稳定性兜底
    - 或把 A3 全文搜索 Cmd+K(评分 7,与 I1 共享检索)接上

### 10.4 文档与执行流程偏差(给作者本人)

本路线图是 **2026-06-19 brainstorming 写的设计**(标"设计中"),未走 `writing-plans → executing-plans` 流程就直接当决策辅助用,导致:

1. **状态机只反映"评分 + 意向"**,不反映"已立项 / 已动工" — 已在 §2.4 补"动工状态"列(5 档),并在 §3.1/§4.1/§5.1/§6.1 概览表每行填入
2. **Next 项的"完工"无明确熔断** — 实际落地靠 git commit 而非文档状态机。补"实施状态附录"是最低成本补足。
3. **§9 的「每条 Next 项进入开发前必须先写 spec → plan」与现状矛盾**:C1/C2/Q6/Q8/I1/I5 全部在 spec 之前的 commit 已动工(commit message 里有 Phase 标签但无对应 spec/plan 文档在 `docs/superpowers/` 下)。建议下次切片先写 spec。
4. **Maybe 项长期无复盘** — §9 说"季度复盘:把 ⚪ Later 项重新评估"未执行;13 个 Maybe/Later 项中 0 个被本附录主动复核,需要在 v2.27 之前做一次专项复盘。

### 10.5 推荐下一步(供选择,不替作者决策)

按"评分高 + 风险低 + 能复用现有沉淀"排序,v2.26 重排候选(作者决策):

1. **Q5 memory 治理(7)** — 成本 1,几乎无风险,与 v2.24.x 已经在做的稳定性主线一致
2. **A3 全文搜索 Cmd+K(7)** — 成本 2,价值高,可复用 I1/Digest 已沉淀的文本
3. **I2 可订阅 Watchlist(6)** — 与 I1/I5 联动,共享聚合
4. **I3 SideNav 拖拽(7)** — 几乎无风险,但与 Pillar 1-2 协同弱,优先度低

不建议在 v2.26 启动 C4 / I6 / C7:三者的依赖(Q5 治理、I1 聚合稳定、Q1 诊断完整版)未到位,先做完 Q5 + Q1 完整版,后续版本接更顺。

---

### 10.6 2026-06-23 二次对账(本次更新)

> 与 §10.1 / §10.2 衔接。本节**只反映 v2.27 ~ v2.29 期间的事实变化**,不重写上一节。
>
> 对账基线:`package.json` version = **2.29.0**(本地 + origin/main 已 push,见 commit `d27ab15`)。
> 期间 50 个 commit,跨越三个 release 节点(`v2.27.0` tag + v2.28.0 / v2.29.0 用 `.release-notes-*.md` 标记)。

### 10.6.1 状态变更摘要

| # | 候选 | 2026-06-21 状态 | 2026-06-23 状态 | 触发证据 |
| -- | --- | --- | --- | --- |
| C3 | 升级前快照 + 自动回滚 | 🟡 Maybe,⚫ 未立项 | 🟢 Next,🟢 已合入 | v2.28.0(11 commits: backup → version-history → rollback IPC → drawer → AppRow ⏪ 按钮) |
| Q1 | 诊断面板完整版 | 🟡 部分落地 | 🟢 已合入 | v2.29.0(6 commits: diagnostics.js → aggregator → 3 IPC → drawer 扩展 → 导出 .tar.gz) |

### 10.6.2 新增立项(但未实施)

> **2026-06-24 三次对账修正**:I3 实际已在 v2.30 前落地(4 commits,见 §10.2),
> 本表原标"立项中"系过时。I2 已在 v2.31.0 落地。本节保留历史记录。

| # | 候选 | spec | plan | 备注 |
| -- | --- | --- | --- | --- |
| ~~I3~~ | ~~SideNav 拖拽重排 + 隐藏~~ | ✅ | ✅ | **✅ 已落地**(原标立项中,实际 v2.30 前完成,见 §10.2) |
| ~~I2~~ | ~~可订阅 Watchlist~~ | ✅ | ✅ | **✅ 已落地 (v2.31.0)**(原标未立项,实际 v2.31.0 发版) |

### 10.6.3 总览刷新

| Pillar | Next 总数 | ✅ 已落地 | 🟡 部分落地 | ❌ Next 未开始 | 🟤 立项中 |
| --- | --- | --- | --- | --- | --- |
| 1 核心升级 | 4 (C1/C2/C3/C4) | **4** | 0 | 0 | 0 |
| 2 信息聚合 | 5 (I1/I2/I3/I5/I6) | 2 (I1/I5) | 0 | 1 (I6) | 2 (I2/I3) |
| 3 平台质量 | 6 (Q1/Q5/Q6/Q7/Q8/Q4) | **4** (Q1/Q5/Q6/Q7/Q8) | 0 | 1 (Q4) | 0 |
| 4 AI 驱动 | 2 (A3/A7) | 1 (A3) | 1 (A7) | 0 | 0 |
| **合计** | **17** | **11** (+2) | **1** (-1) | **2** (-3) | **2** (新增) |

> 解释:Q1 / C3 从"🟡 / 未开始" 升级到 "🟢 已合入";I2 / I3 升级到"🟤 立项中"。Q5 上一轮已是 🟢 已合入。

### 10.6.4 v2.27 - v2.29 release 节点

| 版本 | 切片 | 主要变化 |
| --- | --- | --- |
| v2.27.0 | C4 + Q5 收尾 + Windows 主题重设 | `schedulers.js` 智能时间窗;`timer-registry.js` 集中托管 timer;Windows 主题重设计(中性灰 + cyan accent) |
| v2.28.0 | **C3 全套** | `backup.js` + `version-history.js` + `rollback.js` + IPC + `VersionHistoryDrawer` + AppRow ⏪ 按钮 + bulk-upgrade modal 备份提示 |
| v2.29.0 | **Q1 全套** | `diagnostics.js`(启动里程碑 + 内存/CPU 采样器)+ `diagnostics-aggregator.js`(Top-5 + 零依赖 tar.gz)+ 3 个 IPC + drawer 4 个新区块 + .tar.gz 导出到桌面 |

### 10.6.5 文档与执行流程偏差(本次新增观察)

延续 §10.4 的偏差警告,新增观察:

1. **C3 / Q1 走完了流程但仍违反 §9** — 两者均在 commit 后才补 spec(C3 无 spec,Q1 无 spec,只有 `.release-notes-*.md`),§9 "先 spec → plan"未执行。但产出质量无明显问题(全量 vitest 绿),说明本项目的"流程"和"现实执行"已分离:**未来要么改 §9 让其反映实际流程,要么强制执行**。
2. **C3 从 🟡 Maybe 直升 🟢 已合入跳过了 🟤 立项状态** — 决策点:"评分 6 但回报够 + 时机刚好,直接动工"。文档状态机本应记录这次升档,本次对账补登。
3. **roadmap 文档更新频率远低于代码** — 50 个 commit 才补一次对账(§10.6)。建议:**每个 .release-notes-*.md commit 自动同步触发 §10.x 子节追加**,或直接在 release-notes 里维护对账表,roadmap 文档只保留骨架。

## 11. 后续规划(2026-06-23,作者已决策)

### 11.1 推荐下一步

按"评分高 + 风险低 + 复用现有沉淀 + 立项成熟度",作者 2026-06-23 已确认执行序列:

1. **I3 SideNav 拖拽重排 + 隐藏**(7)— 🟤 立项中,写 plan → 实施。spec 已批准,卡点单一,1-2 天可交付
2. **Q4 startup < 800ms**(6)— ⚫ 未立项,需 spec → plan → 实施。需先跑 profiler 定位瓶颈再决策,2-3 天
3. **I2 可订阅 Watchlist**(6)— ⚫ 未立项,需 spec → plan → 实施。范围最大(跨 Pillar 1-2-3),3-5 天

预计累计 1.5 - 2.5 周,产出 v2.30.0 候选。

**不建议现在启动**:C5 / C6 / C7(C 维度全是优化性,价值低);I4 / I6 / I8 / A1 / A2 / A4 / A5 / A6(评分持平或更低,优先级不占优);Q2 / Q3(Maybe 项,需先复盘再决定)。

> v2.30 切片复核:
>
> - 当前倾向:**I3 + Q4 + I2**(三个 Pillar 平衡)
> - 风险:I3 卡 plan 流程,Q4 需先评估,I2 范围大 → 任何一个超出预期都可能拖到 v2.31
> - 兜底:若 I2 难产,v2.31 可塞 Q4 收尾 + Q5 长跑验证 + 一项 Maybe 复盘

---

## 12. 复盘与维护节奏(本次微调)

§9 原节奏保留,新增第 4 条:

1. 每条 Next 项进入开发前必须先写 `spec → plan`(遵循项目 superpowers 流程)
2. 每完成 1 个 Next 项,重新评分剩余项:实际成本可能与预估不同,需调整状态
3. 每完成 1 个版本,重新跑 Q1 / Q6 的诊断数据,验证质量趋势
4. **每发版触发一次 §10.x 对账追加** — 复用 `.release-notes-*.md` 的"实施状态"段落作为迷你对账,在 roadmap 文档只保留季度汇总,降低维护成本

---

## 13. 三次对账(2026-06-24,v2.32.0 发版触发)

> 对账基线:`package.json` version = **2.32.0**(已打 tag `v2.32.0` + GitHub Release)。
> 本次对账由 I6(IT之家 SideNav 未读角标)发版触发,顺带修正前两次对账遗留的过时状态。

### 13.1 本次修正的过时状态

| # | 候选 | 修正前(错误) | 修正后(事实) | 原因 |
| -- | --- | --- | --- | --- |
| I2 | 可订阅 Watchlist | 🟤 立项中 / ❌ 未开始 | ✅ 已落地 (v2.31.0) | v2.31.0 已发版,前次对账 §10.6.2 未追平 |
| I3 | SideNav 拖拽 | 🟤 立项中(spec 有/plan 缺) | ✅ 已落地 | 4 commits 已合入,v2.30 前完成;§10.6.2 标"卡 plan 流程"系过时 |
| I6 | SideNav 未读角标 | ❌ 未开始 | ✅ 已落地 (v2.32.0) | 本次 I6 实现(ithome badge) |

### 13.2 v2.30 ~ v2.32 release 节点

| 版本 | 切片 | 主要变化 |
| --- | --- | --- |
| v2.30.0 | I3 + Q4 v1 | I3 SideNav 拖拽/隐藏(sidenav-prefs + SideNavItem DnD + HiddenItemsDrawer);Q4 启动 perf v1(diagnostics milestone 接通 + baseline profiler) |
| v2.31.0 | I2 Watchlist | app pin + ⭐ 抽屉 + 去重通知 + check-updates hook |
| v2.31.1 | ON 更新日志引导 | release notes 首启向导 + Header 📖 重看 + 未读红点 |
| v2.32.0 | I6 SideNav badge | ithome `ithomeUnreadBadge` computed + SideNavItem badge prop + `.side-nav-badge` CSS;SideNav badge 扩展点铺路 |

### 13.3 总览刷新(v2.32.0 基线)

| Pillar | Next 总数 | ✅ 已落地 | 🟡 部分落地 | ❌ Next 未开始 |
| --- | --- | --- | --- | --- |
| 1 核心升级 | 4 (C1/C2/C3/C4) | 4 | 0 | 0 |
| 2 信息聚合 | 5 (I1/I2/I3/I5/I6) | **5** | 0 | 0 |
| 3 平台质量 | 6 (Q1/Q4/Q5/Q6/Q7/Q8) | 5 (Q1/Q5/Q6/Q7/Q8) | 0 | 1 (Q4 v2,等 profile) |
| 4 AI 驱动 | 2 (A3/A7) | 1 (A3) | 1 (A7) | 0 |
| **合计** | **17** | **15** | **1** | **1** |

> **Pillar 2 全部落地**(I1~I6 五项 + I2/I3 修正)。这是项目重心从"核心升级"
> 向"信息聚合"倾斜的体现。剩余 Next 项只有 Q4 v2(等数据)和 A7(补配置化)。

### 13.4 推荐下一步(v2.32.0 后)

按"评分高 + 复用现有沉淀 + 不被外部依赖阻塞"排序:

1. **wechat-hot badge(I6 v2)** — 复用 I6 刚做的 SideNavItem badge 扩展点 +
   `navBadges` map;需给 wechat-hot 从零补 read 概念(仿 ithome)。评分 7(预估)。
2. **A7 AI prompt 模板化(补半成品)** — 基建 `shared-llm.js` 全有,只差
   `config.json.aiDigest.prompts` 配置化 + Settings 面板。评分 7。
3. **A1→A2 "该不该升"建议** — 回到核心定位的差异化功能,但依赖 LLM 稳定性。评分 6。

**不做**:Q4 v2(等 profile 数据,强做违背 ponytail);C5/C6/C7(优化性,ROI 低);
I4 聚合源可插拔(YAGNI,无 3+ 源驱动)。

### 13.5 文档维护观察

前两次对账(§10.6)都出现"状态标了但代码已动"的偏差(I2/I3 尤其严重)。
印证 §10.6.5 第 3 条:**roadmap 文档更新频率远低于代码**。本次尝试 §13 的
"发版触发对账"机制是否有效——下次发版(v2.33)若 I2/I3/I6 又漂移,
则需改用更自动化的方式(git hook 检测 release-notes 变更 → 提醒对账)。
