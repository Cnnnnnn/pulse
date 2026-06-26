# 选股 AI 推荐策略 (Stock Screener AI Advisor) 设计 — 阶段二

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-26 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 是选股筛选器 **阶段二** 设计 — 阶段一 (`2026-06-26-stock-screener-design.md`) 已完成条件筛选器 / 4 个预设策略 / 自选股 / 后台调度,本 spec 在其基础上叠加 **AI 推荐筛选条件** 能力。
>
> **明确不做的** (YAGNI):
> - ❌ AI 直接荐股 (LLM 只生成 criteria,最终股票由筛选器按规则产出,人掌控)
> - ❌ 自动点筛选 (AI 输出预览后由用户手动应用)
> - ❌ 对话式多轮追问 (单轮意图 → 一份预览)
> - ❌ 策略保存 / 策略市场 (留阶段三)
> - ❌ ETF / 港股 / 美股 / K 线 (留 v2)
> - ❌ 单只票 AI 诊股 (per-row analyze 不在本阶段,原 spec 阶段二虽提及,但本次范围只做策略推荐;诊股可作 v3 独立 spec)

## 1. 背景与目的

阶段一已交付「条件筛选器」,用户反馈两类痛点:

1. **不会设条件** — 不知道 PE 多少算「低估值」, ROE 多少算「好公司」
2. **想跟市场对齐** — 想知道「当前市场主流策略应该用哪些阈值」

阶段二解决: 用户表达**意图** (例:「低估值修复」+「我想偏大盘」) → AI 基于**当日市场快照**生成具体 `criteria` + `sortConfig` + 一句市场总结 → **预览 → 用户应用**。

## 2. 用户故事

> 用户点「🔍 筛选」旁新按钮 **「🧠 AI 推荐」** → 右侧抽屉滑出 → 看到 6 个预设 chip + 一个可选自由文本框 → 选「高分红防御」+ 补一句「偏向银行地产」 → 点「生成」 → 2-5 秒后抽屉内显示:

```
📊 推荐条件
  PE 0 - 15
  股息率 ≥ 4%
  ROE ≥ 10%
  市值 大盘
  排序 ROE 降序

💡 当前市场总结
  近期 A 股银行板块平均股息率 5.2%, 显著高于沪深 300 整体 2.1%,
  配合 PE 12 处于历史 30% 分位, 防御属性突出.

[取消]  [应用这套条件]
```

> 用户点「应用」→ 条件区自动填好 + 排序自动切换 → 用户**手动**点「🔍 筛选」确认.

## 3. 架构方案对比 (已选 A)

| 方案 | 描述 | 结论 |
| --- | --- | --- |
| **A. 复用 shared-llm + state-store 缓存** | 走 `chatCompletion` + `token-budget` 硬限 + safeStorage 缓存,前端预览 + 用户应用 | **✅ 采用** |
| B. 每次实时拉市场数据 + LLM | 不缓存, 每次都打 LLM | ❌ 烧 token, P71 预算硬限会快速耗尽 |
| C. 直接调 OpenAI SDK 自己接 | 跳过 shared-llm 统一预算 | ❌ 绕过项目级 token 硬限, 不可控 |

选 A 的理由: 项目已有 `src/ai/shared-llm.js` (openai/anthropic/deepseek/minimax 4 厂商 + budget + sanitize 全打通), 自建接入是 YAGNI 反例.

## 4. 文件结构 (新增 / 修改)

```
src/ai/stock-screener-advisor.js          ← 新: prompt 构造 + LLM 输出解析 + 缓存 (纯函数, 主进程 require)
src/ai/prompts/stock-screener-advisor.md   ← 新: prompt 模板 (走 resolvePrompt 注入)
src/main/state-store.js                   ← 改: 新增 aiStockAdviseCache 字段
src/main/state-store-schema.js            ← 改: schema 默认值
src/main/ipc/register-stocks.js           ← 改: 新增 stocks:ai-advise handler
src/stocks/stock-constants.js             ← 改: 新增 computeMarketOverview(rows)
src/renderer/stocks/StockLayout.jsx       ← 改: 「🔍 筛选」旁加「🧠 AI 推荐」按钮 + 抽屉容器
src/renderer/stocks/AiAdviseDrawer.jsx    ← 新: 抽屉组件 (复用 BareModalShell)
src/renderer/stocks/stockStore.js         ← 改: aiAdviseOpen / aiAdviseState signals + openAdvise/closeAdvise
src/renderer/api.js                       ← 改: 新增 stocksAiAdvise
preload.js                                ← 改: 新增 stocksAiAdvise invoke
styles.css                                ← 改: 抽屉样式 (复用现有 ModalShell 主题变量)

tests/ai/stock-screener-advisor.test.js   ← 新: prompt 构造 / JSON 解析 / 缓存 / 校验
tests/main/register-stocks.test.js        ← 改: 加 stocks:ai-advise handler 测试
tests/stocks/stock-constants.test.js      ← 改: 加 computeMarketOverview 测试
```

## 5. 数据模型

### 5.1 state.json 新字段 `aiStockAdviseCache`

```jsonc
"aiStockAdviseCache": {
  "v1::<sha1-key>": {
    "result": {                  // 缓存的 LLM 输出 (已校验过的)
      "criteria": {...},
      "sortConfig": {...},
      "summary": "..."
    },
    "fetchedAt": 1719456000000   // Date.now(), 24h TTL
  }
}
```

### 5.2 LLM 输出 schema (JSON 强约束)

```ts
{
  criteria: {                   // 跟 DEFAULT_SCREENER_CRITERIA 同形, 但每字段都可空
    peMin: number | null,
    peMax: number | null,
    pbMin: number | null,
    pbMax: number | null,
    roeMin: number | null,
    dividendYieldMin: number | null,
    turnoverMin: number | null,
    turnoverMax: number | null,
    change5dMin: number | null,
    marketCapTier: "all" | "large" | "mid" | "small" | null,
    industries: string[]         // [] 或 null = 全行业
  },
  sortConfig: {                 // 可空 = 用户保持当前 sort
    key: "roe" | "pe" | "pb" | "changePct" | "marketCap" | "turnover" | "price" | "name" | "industry" | null,
    dir: "asc" | "desc"          // 默认 "desc"
  } | null,
  summary: string                // 1-2 句市场总结, ≤ 120 字, 不含投资建议
}
```

### 5.3 prompt 输入 (发给 LLM)

```
SYSTEM: 你是 A 股策略助手. 根据用户意图和今日市场快照,
        输出 JSON {criteria, sortConfig, summary}.
        - criteria 字段值必须合理 (例: peMin < peMax, roeMin 0-30)
        - summary 客观描述市场, 不给买卖建议, 不预测涨跌
        - 输出必须是合法 JSON, 不要 markdown 包裹

USER:
  意图: <intentChip.id> — <intentChip.label>  <可选: 补充说明: ${freeText}>
  今日市场快照 (2026-06-26):
    总股票数: 5527
    PE 中位数: 28.5
    PE 30 分位: 12.3
    PE 70 分位: 45.8
    ROE 中位数: 8.2%
    涨幅中位数: +0.6%
    换手率中位数: 1.8%
  当前筛选条件 (供参考, 用户可能基于此微调): {...}
```

### 5.4 缓存 key

```
sha1(`stock-advise|${intentChip.id}|${freeText || ""}|${marketOverviewHash}`)
```

`marketOverviewHash = sha1(pe中位数 + roe中位数 + 总股票数 + 日期字符串)`.
**市场快照每天变 → overviewHash 变 → key 变 → 自动失效** (Ponytail: 不写主动失效, 让数据自己驱动失效).

## 6. 数据流

### 6.1 打开抽屉

```
用户点「🧠 AI 推荐」
  → openAdvise()
  → drawer 渲染 (无内容, 只显示预设 chip + 文本框)
  → 前端检测 resolveSharedAiConfig (走新 IPC ai-config:resolve 或复用 ai-tasks:list 等)
  → 配置缺失: 显示「去 AI 设置」按钮 (跳 AISettingsModal)
```

### 6.2 生成预览

```
用户选 chip + 文本 → 点「生成」
  → loading.value = true (aiAdviseState 子状态)
  → api.stocksAiAdvise({ intentChip, freeText, marketOverview })
  → main 走 aiStockAdvise() 函数:
      1. resolveSharedAiConfig → 不通返 {ok:false, reason:"config_missing"}
      2. isOverBudget("ai_stock_advise") → 超限返 {ok:false, reason:"over_budget"}
      3. cache key 命中 → 返 {ok:true, fromCache:true, result}
      4. cache miss → chatCompletion(messages, {purpose:"stock-advise"})
      5. sanitize + JSON.parse + schema validate
      6. addSpend + 写入 cache (24h TTL)
      7. 返 {ok:true, fromCache:false, result}
  → renderer 收到 result → 抽屉显示预览 (criteria + summary)
  → 用户可点「应用」/「取消」/「重新生成」
```

### 6.3 应用

```
用户点「应用」
  → setCriteria(result.criteria)        // 走 stockStore.setCriteria (未知字段自动丢弃)
  → setSortConfig(result.sortConfig)    // 新增 (写到 sortKey + sortDir signals)
  → activeStrategy = "custom"
  → closeAdvise()
  → 用户手动点「🔍 筛选」 (Ponytail: 不自动点, 避免 token 烧光后跑 40s)
```

## 7. 复用清单 (Ponytail: 不重写)

| 已有 | 直接复用 |
|---|---|
| `src/ai/shared-llm.js` `chatCompletion` | LLM 调用 (已支持 4 厂商 + budget) |
| `src/ai/shared-llm.js` `resolveSharedAiConfig` | 读 AI 配置 |
| `src/main/token-budget.js` `isOverBudget / addSpend` | 预算硬限 (P71) |
| `src/ai/sanitize-llm-output.js` | 输出清洗 |
| `src/ai/prompt-registry.js` `resolvePrompt` | prompt 模板 |
| `src/main/state-store.js` | `aiStockAdviseCache` 字段 |
| `src/renderer/components/ModalShell.jsx` `BareModalShell` | 抽屉容器 |
| 选股 `criteria / sortConfig / applyStrategy / setCriteria / setSort` | 输出应用 |
| `src/main/chromium-http-client.js` | 主进程 fetch (经 chatCompletion) |
| `safeHandle` 模式 | IPC handler |

## 8. 安全 / 成本约束

| 约束 | 实现 |
|---|---|
| **不发用户自选 / 搜索历史** | prompt 仅含 `intentChip.id + label + freeText + marketOverview`, 无 userId / watchlist / search history |
| **缓存** | 24h TTL, key = sha1(intent + freeText + overviewHash); 同意图 + 同份市场数据 24h 内不再打 LLM |
| **预算硬限** | `isOverBudget("ai_stock_advise")` 超限 → 返 `{ok:false, reason:"over_budget"}`, UI 显示「今日 token 用完」 |
| **API key** | 沿用 safeStorage (AISettingsModal 已实现), 用户零额外配置 |
| **schema 校验** | LLM 输出先过 `sanitizeLlmOutput` 再 JSON.parse 再白名单字段, 未知字段丢弃 + log warn |
| **summary 长度** | 强制 ≤ 120 字, 截断 + "…" |
| **summary 合规** | prompt 强约束: "不给买卖建议, 不预测涨跌"; 客户端再 regex 过滤 `/买入|卖出|加仓|减仓|看多|看空|必涨|必跌|强烈推荐/` 命中时整句替换为「当前市场呈现…」 |

## 9. 失败 / 边界

| 场景 | 行为 |
|---|---|
| AI 未配置 | 抽屉打开时检测, 显示「去 AI 设置」按钮 |
| 超预算 | 显示「今日 token 用完,明天重试」+ 跳 AISettingsModal 按钮 |
| LLM 输出非 JSON | sanitize 仍失败 → 「AI 返回异常,重试」 |
| criteria 含未知字段 | 丢弃 + log warn, 不抛错 |
| sortConfig.key 非法 | 丢弃 sortConfig (sortKey / sortDir 不变) |
| 网络失败 | chatCompletion 内置重试 1 次, 仍失败 → 「AI 暂时不可用」 |
| 用户连点「生成」 | 防抖 1s + aiAdviseState.loading 时按钮 disabled |

## 10. 测试清单

### 10.1 `tests/ai/stock-screener-advisor.test.js` (新)

- `buildPrompt({intentChip, freeText, marketOverview, currentCriteria})`:
  - 含 intentChip id/label
  - 含 freeText (有 / 无两种)
  - 不含 userId / watchlist / search history
  - marketOverview 数据完整
  - currentCriteria 默认空对象时也不报错
- `parseAndValidate(rawText)`:
  - 合法 JSON → 解析成功
  - 含未知字段 → 丢弃, 返回对象
  - criteria 字段类型错 (例: peMin 是字符串) → 丢弃该字段 + log warn
  - 完全坏 JSON → 返 `null`
  - summary 长度 > 120 → 截断
  - summary 含投资建议关键词 → 改写
- `aiStockAdvise({intentChip, freeText, marketOverview, ...})`:
  - 缓存 hit → 不调 chatCompletion, 返 cached result
  - 缓存 miss → 调 chatCompletion + 写缓存
  - 缓存过期 (>24h) → 走 miss
  - resolveSharedAiConfig 失败 → 返 `{ok:false, reason:"config_missing"}` 不调 chatCompletion
  - isOverBudget 超限 → 返 `{ok:false, reason:"over_budget"}` 不调 chatCompletion
  - chatCompletion 失败 → 返 `{ok:false, reason:"llm_error", error: msg}`

### 10.2 `tests/main/register-stocks.test.js` (扩展)

- `stocks:ai-advise` 缓存命中 → 不调 chatCompletion
- `stocks:ai-advise` 缓存未命中 → 调 chatCompletion + 写缓存
- `stocks:ai-advise` 配置缺失 → `{ok:false, reason:"config_missing"}`
- `stocks:ai-advise` 超预算 → `{ok:false, reason:"over_budget"}`

### 10.3 `tests/stocks/stock-constants.test.js` (扩展)

- `computeMarketOverview(rows)`:
  - 空 rows → 全 null/0
  - 正常 rows → PE 中位数 / ROE 中位数 / 总数正确
  - PE 为 null 的 row 不影响中位数
  - 单只 row → 中位数 = 该 row 的值

### 10.4 (可选) `tests/renderer/stocks/AiAdviseDrawer.test.jsx` (新)

- 选 chip + 文本 → 点「生成」 → 调 api.stocksAiAdvise with 正确参数
- 收到 `{ok:false, reason:"config_missing"}` → 显示「去 AI 设置」
- 收到 `{ok:false, reason:"over_budget"}` → 显示「token 用完」
- 收到 `{ok:true, result}` → 显示预览 + 「应用」按钮
- 点「应用」 → 调 setCriteria + setSortConfig + closeAdvise (不调 runScreen)

## 11. 风险与权衡

| 风险 | 缓解 |
|---|---|
| LLM 输出不稳定 (criteria 字段缺失或值不合理) | schema 强校验 + 白名单 + 未知字段丢弃 + 类型错误字段丢弃 |
| token 预算快速耗尽 | 24h TTL 缓存 + by-intent+overview 复用 + budget 硬限前置 |
| 用户期待「AI 荐股」 | UI 文案明确: 「AI 推荐筛选条件」, 不说「AI 选股」; 抽屉副标题「AI 帮你定条件, 最终股票仍由筛选规则产出」 |
| marketOverview 拉数据耗时 | marketOverview 计算走主进程, 复用现有全市场 rows 缓存 (主进程 60s TTL), 不额外打接口 |
| 抽屉打开时市场数据尚未加载 | 主进程内存已有 rows (来自上一次筛选), 直接复用; 首次 (rows 为空) → 计算空 overview, 降级为「无市场数据, 仅基于通用知识推荐」 |

## 12. 不在范围 (留后续阶段)

- ❌ 单只票 AI 诊股 (per-row analyze) — 留 v3
- ❌ 对话式追问 / 多轮 — 留 v3
- ❌ AI 解释某个 criteria 的理由 — 留 v3 (本阶段仅在 summary 给宏观总结)
- ❌ 用户保存 AI 推荐的历史记录 — 留 v3
- ❌ 阶段三策略 skill (用户自定义保存 / 策略市场)

## 13. 关键决策记录

| # | 决策 | 理由 |
|---|---|---|
| 1 | 不做自动点筛选 | 用户掌控, 避免 token 烧光后跑 40s 等不到结果 |
| 2 | 不做 AI 直接荐股 | 法规风险 + 让筛选规则继续做事实层 |
| 3 | 缓存 key 含 marketOverviewHash | 市场每日变化, hash 自动驱动缓存失效 |
| 4 | 复用 shared-llm 不自建 | 避免绕过项目级 token 预算硬限 |
| 5 | 抽屉用 BareModalShell 复用 | 不引入新 modal 容器, 主题一致 |
| 6 | preset chip 6 个 (低估值修复 / 高分红防御 / 超跌反弹 / 成长动量 / 行业龙头 / 平衡型) | 覆盖主流 A 股策略风格, 不堆砌 |
| 7 | marketOverview 24h 内不变就不重算 | 缓存复用 + 预算友好 |