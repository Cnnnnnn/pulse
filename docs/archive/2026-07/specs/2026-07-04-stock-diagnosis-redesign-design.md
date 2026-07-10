# 个股诊断报告 · 重设计

> 日期: 2026-07-04
> 状态: 设计待审批
> 取代: 旧版 `StockDetailDrawer.jsx`（选 angle + 5 tab + 折叠 AI 的右侧抽屉）

## 1. 背景与目标

### 用户痛点（重设计动机）
1. **操作步骤太多** — 进抽屉要选 9 个 angle chip + 点「开始 AI 分析」
2. **信息太乱** — 5 tab + 9 chip + 折叠 AI，信息被动散落，看不出重点
3. **AI 质量不够** — AI 既要给数据解读又要给定性判断，输出不稳定
4. **选股↔分析割裂** — 从选股表格进分析、再回列表看别的股票不顺

### 目标形态
一键诊断报告：选股表格点「诊断」→ 全屏报告页，左列表右报告同屏，结论置顶 + 模块卡铺开，进页自动生成。评分用确定性规则算、AI 专注解读。

### 五个核心决策（已与用户确认）

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 报告形态 | **全屏诊断页**（路由跳转） | 视野宽，信息密度高 |
| 2 | 与选股表格关系 | **左列表 + 右报告（同屏）** | 彻底解决割裂，可连续诊断多只 |
| 3 | 报告内容结构 | **结论置顶 + 模块卡网格** | 评级+评分条一眼定强弱，模块卡固定顺序，一次出全报告 |
| 4 | 生成时机 | **进页自动生成，24h 缓存** | 一键体验，缓存兜底成本 |
| 5 | 评分来源 | **规则算分 + AI 解读** | 评分稳定可复现，AI 质量可控（直接解决"AI 质量不够"） |

## 2. 架构

### 新增路由层级
现有 nav 系统是 `activeNav` 信号（stocks/versions/...），stock-detail 不做独立 nav（navStore.js L22 注释）。本设计在 **stocks nav 内部新增子路由**：

```
activeNav = "stocks"
  └─ StockLayout
     ├─ StrategyBar / CriteriaPanel / ResultTable  （选股，不变）
     └─ 子路由信号: stockDiagnosisCode (signal, 默认 null)
        ├─ null  → 显示选股主界面（表格）
        └─ "300750"  → 显示 <StockDiagnosisPage code={code} />（全屏诊断页）
```

点表格「诊断」按钮 → `setStockDiagnosisCode(code)` → StockLayout 切到诊断页；诊断页「← 返回」→ `setStockDiagnosisCode(null)` → 回选股表格（筛选条件/结果还在 signal 里）。

### 组件树（新）
```
StockLayout.jsx（改造：加子路由分支）
  ├─ [code === null] 选股主界面（StrategyBar/CriteriaPanel/ResultTable，不变）
  └─ [code !== null] StockDiagnosisPage.jsx（新增，全屏）
       ├─ StockDiagnosisHeader.jsx（新增）— 返回 + 股票 hero（名/码/价/涨跌）+ 综合评级徽标
       ├─ div.stock-diagnosis-body（flex 行）
       │   ├─ StockMiniList.jsx（新增）— 左侧筛选结果迷你列表（可折叠收起）
       │   └─ div.stock-diagnosis-report
       │       ├─ VerdictCard.jsx（新增）— 综合评级大卡 + 一句话结论
       │       ├─ DimensionScores.jsx（新增）— 5 维评分条
       │       └─ ModuleGrid.jsx（新增）— 6 个模块卡网格
       │           ├─ FundamentalsCard（基本面）
       │           ├─ ValuationCard（估值）
       │           ├─ CapitalFlowCard（资金面）
       │           ├─ TechCard（技术面）
       │           ├─ NewsCard（舆情）
       │           └─ RiskCard（风险）
```

### 数据流

```
点「诊断」→ setStockDiagnosisCode(code)
  → StockDiagnosisPage mount
    1. api.stocksDetailAngles({code, angles: 全部 9 个})  ← 60s 内存缓存
       → perAngleData（结构化数据，喂模块卡）
    2. computeScores(perAngleData)  ← 纯函数，规则算分（见 §4）
       → { overall, dimensions:{fundamental, valuation, capital, tech, risk} }
    3. api.stocksDetailAnalyze({code, perAngleData, scores})  ← 24h 持久化缓存
       → AI 解读（summary + perAngle 解读 + risks）
       注: AI 收到 scores，但不让 AI 改分，只基于分写解读
  → 渲染报告
```

**模块卡**直接用 `perAngleData` 渲染数据（60s 缓存秒出）。
**评级 + 评分条 + AI 解读**用 `computeScores` + AI 结果（24h 缓存）。

## 3. 复用与删除

### 复用（不动）
- **9 个 angle fetcher + summarizeForAi**（`src/stocks/detail-fetchers/*` + `stock-detail-angles.js`）— 数据契约成熟，直接用
- **IPC handler**（`register-stock-detail.js`）— `stocks:detail-angles` / `stocks:detail-analyze` 不变
- **AI prompt + 合规链路**（`stock-detail-advisor.js`：买入卖出替换、PII 屏蔽、24h 缓存）— 改 prompt 输入（加 scores 上下文），不改合规逻辑
- **moat_score 的规则评分机制**（`detail-fetchers/moat-score.js`）— 作为 `computeScores` 的设计参照
- **左列表数据**：复用 `stockStore` 的筛选结果 signal（已持有筛选结果，诊断页只读它）

### 删除（确认：删旧版，只留新版）
- `src/renderer/stocks/StockDetailDrawer.jsx`（637 行，旧抽屉）
- `StockLayout.jsx` 里 `<StockDetailDrawer />` 调用 + 顶栏「AI 个股」按钮（被表格行内「诊断」取代）
- `stock-results-pad-drawer` 让位逻辑（抽屉已删，让位无意义）
- 41 条 `stock-*` 死 CSS（按 dead-candidate-report 核对后删，注意 `stock-advise-chip` 实际在用，保留）
- 旧 `stock-detail-overlay/drawer/header` 等抽屉外壳样式（被 AIDrawerShell 取代后的残留）

**保留**：`AiAdviseDrawer.jsx`（AI 推荐筛选条件，是另一个功能，不删）、`AIDrawerShell.jsx`（仍被 AiAdviseDrawer 用）。

## 4. 规则评分设计（核心：解决 AI 质量）

新增 `src/stocks/diagnosis-scorer.js`（纯函数，可单测）：

```js
// 输入: perAngleData（9 angle 的结构化数据，部分 angle 可能缺失/失败）
// 输出: {
//   overall: number|null,            // 0-10，全部维度缺失时为 null
//   dimensions: {                     // 每个值 0-10 或 null（数据缺失）
//     fundamental: number|null,
//     valuation: number|null,
//     capital: number|null,
//     tech: number|null,
//     risk: number|null,
//   },
//   rationale: string[]               // 规则自带的逐条依据，供 AI 解读引用
// }
computeScores(perAngleData) → scores
```

### 5 维评分规则（每个维度 0-10 或 null，参考 moat_score 的硬编码阈值机制）

| 维度 | 数据源 angle | 规则（初版阈值，实现时以代码常量为准，集中维护可调） |
|------|-------------|----------------------------------------------------|
| 基本面 fundamental | profitability (+ peer_compare) | ROE: ≥20→8, 15-20→6, 10-15→4, <10→2；缺 ROE→null |
| 估值 valuation | valuation | PE 历史分位: ≤20%→8, 20-40%→6, 40-60%→4, 60-80%→3, >80%→2；缺分位→null |
| 资金 capital | capital_flow | 5 日主力净流入: 正→6-8，负→2-4，绝对值大小微调；缺→null |
| 技术 tech | tech_indicators | MACD 金叉+站上 20 日线→8，满足其一→6，死叉→3；缺→null |
| 风险 risk | news_buzz + valuation + price_trend | 反向分（越高越好=越安全）：舆情偏负/估值过高/高波动各扣分；缺多源→null |

`overall` = 对**非 null 维度**按权重加权平均（权重：基本面0.25/估值0.2/资金0.15/技术0.15/风险0.25，权重在缺维度的剩余维度间按比例重分配）。全部维度 null → overall=null。

**关键约束**：
- 规则是**确定性的**：同 perAngleData → 同 scores（可缓存、可复现）
- 数据缺失的维度 → 该维度返回 `null`，评分条显示「数据不足」，不参与 overall 计算
- `rationale` 是规则自带的简短说明（如「PE 处 3 年 40% 分位，估值合理」），AI 解读可引用

## 5. AI 解读改造

`stock_detail_analyze` prompt 改造（`prompt-registry.js`）：

- **输入增加**：`scores`（overall + dimensions + rationale），让 AI 看到规则分
- **输出不变结构**：仍 `{summary, perAngle, risks, signal}`（兼容现有 parseAndValidate）
- **指令调整**：
  - 「综合评级 X/10 由规则给出，你的任务是写一段解读说明为什么是这个分」
  - 「summary 必须引用 scores.rationale 的 1-2 条具体依据」
  - 「不要重新打分，不要质疑评分」
- 保留：买入卖出关键词替换、PII 屏蔽、200 字限制、signal 三档白名单

**AI 的角色从"评判者"变成"解说员"**——这是质量提升的核心：AI 不再承担不稳定的主观打分，专注它擅长的自然语言解读。

## 6. 关键交互细节

- **诊断按钮**：ResultTable 每行操作列加「诊断」文字按钮（复用 `.btn-ghost` 样式），点 → `setStockDiagnosisCode(code)`
- **左列表**：默认展开（~280px），点「〈」折叠成图标条；点列表项 → `setStockDiagnosisCode(新code)` → 右侧报告切换（数据 60s 缓存秒出，AI 24h 缓存）
- **加载态**：模块卡骨架屏（数据秒出），评级/AI 解读区显示「生成中…」进度条（约 8-15s）
- **错误态**：单个 angle 失败 → 该模块卡显示「数据获取失败，[重试]」；AI 失败 → 评分条+模块卡正常显示（规则分），AI 区显示「解读生成失败，[重试]」
- **合规**：报告底部固定「AI 仅供参考，不构成投资建议」

## 7. 测试策略

- `diagnosis-scorer.test.js`（新增）：纯函数，覆盖各维度规则、数据缺失、权重计算
- `StockDiagnosisPage.test.jsx`（新增）：渲染、加载态、错误态、返回、列表切换
- 复用现有 `stock-detail-advisor.test.js`（AI 解读），加 scores 输入用例
- E2E 手测：CDP 自动化打开诊断页截图验证（已验证可行）

## 8. 实施顺序（写入 plan 时的参考，非本 spec 范围）

1. `diagnosis-scorer.js` + 测试（纯函数，无 UI 依赖，先行）
2. prompt 改造 + advisor 测试（AI 解读适配 scores）
3. `StockDiagnosisPage` + 子组件（先用现有数据 mock，不接路由）
4. StockLayout 子路由接入 + 诊断按钮
5. 删旧 StockDetailDrawer + 死 CSS 清理
6. 联调 + CDP 视觉验证

## 9. 不做的事（YAGNI）

- ❌ 不做对话式追问（本轮定"一键报告"形态）
- ❌ 不做报告导出/分享
- ❌ 不做历史诊断记录持久化（24h 缓存已够）
- ❌ 不做自定义评分权重 UI（权重代码常量，要改改代码）
- ❌ 不恢复已删的"自选股"功能（独立大功能，不在本轮）
