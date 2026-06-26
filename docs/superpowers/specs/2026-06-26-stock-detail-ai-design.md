# 选股阶段四: AI 定制诊股 (个股 AI 分析) — 设计

> **阶段四 = 个股 AI 分析**: 用户输入股票代码 + 选 1+ 个分析角度 (7 个内置) → 走 LLM
> 综合解读. 区别于阶段二"AI 推荐筛选条件"——本阶段是"分析已选中的单只票", 阶段二是"AI 帮你找票".
> 与现有架构一致: main 拉数据 + IPC + 缓存 + shared-llm + prompt-registry.

## 0. 背景与目的

阶段一/二已交付「条件筛选器」+「AI 推荐筛选条件」. 用户反馈新的核心痛点:
**"我从筛选结果/自选中看到一只票, 想更深入了解它 — 但不想在多个网站间切来切去"**.

现有方案:
- 选股结果表 (阶段一): 看到 PE/ROE 等基础字段, 但没有"为什么高 PE"、"近期资金流如何"等深度
- 自选股 tab: 看到实时行情, 但没解读
- AI 推荐 (阶段二): 帮生成筛选条件, 不针对单只票

本阶段新增「个股 AI 分析」:
- 用户在抽屉内输入 6 位股票代码 (带自动补全, 复用 `stocks:search`)
- 从 7 个内置分析角度**多选**
- 每个角度 lazy 拉真实数据 (东财主 + sina/腾讯 fallback)
- 走 LLM 解读, 输出结构化 `{summary, perAngle, risks, signal}`

### 0.1 与 v2 路线图的关系

v2 路线图 (见 `2026-06-25-product-roadmap-v2-design.md`) Pillar 4 (AI 驱动) 列出的 A 系列
(A1-A9) 全部已完成/收口. 本阶段是新方向「选股分析」的下沉, 不在 v2 主路线图内,
作为 v2 阶段的"选股垂直深化"补完项.

## 1. 范围 (MVP)

### 1.1 必须做 (MVP)

- **入口**: 新加侧边栏 nav tab 「🔍 个股分析」, 与「📈 选股」「⭐ 自选股」平级
- **UI 形态**: 560px 右侧抽屉, fade-only 出现 (无 slide 动画, 表格立即让位 padding)
- **输入**: 6 位股票代码 + 自动补全 (复用现有 `stocks:search`)
- **分析角度 (MVP 7 个, 用户多选)**:
  | key | label | 分组 | 数据源 |
  |---|---|---|---|
  | `price_trend` | 价格趋势 | 行情 | 东财历史 K 线 |
  | `volume_turnover` | 交易热度 | 行情 | 东财历史 K 线 |
  | `valuation` | 估值水位 | 财务 | 东财 F10 |
  | `profitability` | 盈利能力 | 财务 | 东财 F10 |
  | `capital_flow` | 资金流向 | 资金 | 东财主力资金 |
  | `tech_indicators` | 技术指标 | 技术 | 东财历史 K 线 (服务端算) |
  | `news_buzz` | 新闻舆情 | 舆情 | 东财财经新闻聚合 |
- **数据策略**: lazy 拉取 (选中哪个角度才拉哪个), 失败隔离
- **AI 输出**: 结构化 JSON `{summary, perAngle, risks, signal}` — 复用品类 advisor 的
  `parseAndValidate` 模式
- **缓存**:
  - 60s 内存 (数据, 避免重复点同一组合重打接口)
  - 24h 持久化 (AI 输出, 走 `state.json.stockDetailCache`, 与 advisor 一致)
- **合规**: 复用 `FORBIDDEN_SUMMARY_REGEX` (禁"买入/卖出/加仓/减仓/看多/看空/必涨/必跌/
  强烈推荐"等投资建议关键词), 命中整句替换为 `SUMMARY_SAFE_REPLACEMENT`
- **数据源 fallback**: 每个 fetcher 内部「东财主 → sina/腾讯备 → 全失败」

### 1.2 不在范围 (留后续)

- ❌ K 线图 (重; `price-trend` fetcher 可输 30 日数据, 未来可叠加)
- ❌ 多轮对话追问
- ❌ 自选股 tab 联动入口
- ❌ 历史分析记录 (24h cache 之外)
- ❌ 国际化 i18n
- ❌ 用户自定义 prompt 编辑 (用 `prompt-registry` 默认即可)
- ❌ 行业对比 / 同业排行
- ❌ 财报原文展示 (LLM 只解读数据点)

## 2. 架构

### 2.1 模块分布

```
src/
  stocks/
    stock-detail-angles.js       # 7 角度注册表 (ANGLE_DEFS), lazy 调度
    stock-detail-fetcher.js      # fetchStockDetailAngles(httpClient, code, angles)
    detail-fetchers/             # 7 个独立 fetcher, 每个 < 100 行
      price-trend.js
      volume-turnover.js
      valuation.js
      profitability.js
      capital-flow.js
      tech-indicators.js
      news-buzz.js
  ai/
    stock-detail-advisor.js      # 拼 prompt + 解析 LLM 输出 (对照 stock-screener-advisor)
  main/
    ipc/
      register-stock-detail.js   # 2 个 IPC: detail-angles, detail-analyze
    state-store.js               # 加 stockDetailCache 字段 (24h 持久化)
  renderer/
    stocks/
      StockDetailDrawer.jsx      # 抽屉 UI (560px 右侧, fade-only)
      stockDetailStore.js        # signals (对照 stockStore.js)
```

### 2.2 架构原则

- **每个 fetcher 是 pure function**: `fetch(httpClient, { code })` → `{ ok, data } | { ok: false, reason, error }`
  无 IO 副作用, 单文件 < 100 行
- **调度器按需并行**: `fetchStockDetailAngles` 内部 `Promise.allSettled`, 失败的 angle 不阻塞其他
- **新角度零侵入**: 添 1 个 fetcher 文件 + 在 `ANGLE_DEFS` 注册 1 行
- **数据契约由 `ANGLE_DEFS` 统一**: 每条 `{ key, label, group, promptHint, dataShape, fetcher }`,
  UI / prompt / fetcher / 校验都消费同一份
- **复用现有**:
  - `chromium-http-client` (东财主 + sina fallback 已验证)
  - `state-store` (24h 持久化)
  - `shared-llm.chatCompletion` (P71 预算硬限)
  - `prompt-registry.resolvePrompt` (用户在 Settings 改 prompt)
  - `stocks:search` (自动补全)

## 3. 组件

### 3.1 Angle Registry (`stock-detail-angles.js`)

单一事实源: 所有角度的元数据集中注册. UI 渲染 chip、prompt 拼装、fetcher 调度、LLM
输出校验都从同一份数据出发.

```js
// src/stocks/stock-detail-angles.js
const ANGLE_DEFS = [
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "近 30 日收盘价序列、振幅、近 5/20 日涨跌幅",
    dataShape: "PriceTrendData",
    fetcher: require("./detail-fetchers/price-trend"),
  },
  // ... 共 7 项
];

function getAngle(key) {
  return ANGLE_DEFS.find((a) => a.key === key) || null;
}

module.exports = { ANGLE_DEFS, getAngle };
```

未来新增角度 = 1 个 fetcher + 1 行注册. 任何字段漂移都被 `ANGLE_DEFS` 集中管控.

### 3.2 IPC 入口 (`register-stock-detail.js`)

```js
// src/main/ipc/register-stock-detail.js
const { createStockHttpClient } = require("../chromium-http-client");
const { fetchStockDetailAngles } = require("../../stocks/stock-detail-fetcher");
const { aiStockDetailAnalyze } = require("../../ai/stock-detail-advisor");
const { computeStockCacheKey } = require("../../stocks/stock-detail-cache");

const CACHE_TTL_MS = 60_000;        // 数据内存缓存
const _detailCache = new Map();     // key: code|sortedAngles

function registerStockDetailHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;

  // 1) 拉数据 (按需并行)
  safeHandle("stocks:detail-angles", async (_event, { code, angles } = {}) => {
    if (!code || !Array.isArray(angles) || angles.length === 0) {
      return { ok: false, reason: "invalid_args" };
    }
    const key = computeStockCacheKey(code, angles);
    const cached = _detailCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ok: true, data: cached.data, fromCache: true };
    }
    const httpClient = createStockHttpClient({ timeout: 8000, maxRetries: 1 });
    const data = await fetchStockDetailAngles(httpClient, code, angles);
    if (!data || data.fulfilledCount === 0) {
      return { ok: false, reason: "all_fetch_failed", perAngle: data && data.perAngle };
    }
    _detailCache.set(key, { data, fetchedAt: Date.now() });
    return { ok: true, data, fromCache: false };
  });

  // 2) AI 分析 (走 LLM + 24h 持久化缓存)
  safeHandle("stocks:detail-analyze", async (_event, { code, angles, perAngleData, freeText } = {}) => {
    return await aiStockDetailAnalyze({ code, angles, perAngleData, freeText });
  });
}

module.exports = { registerStockDetailHandlers };
```

### 3.3 抽屉 (`StockDetailDrawer.jsx`)

布局 (560px 右侧抽屉, fade-only):

```
┌─────────────────────────────────────┐
│ 🔍 个股 AI 分析                  × │  header (跟 AIAdvise 同款)
├─────────────────────────────────────┤
│ 股票代码  [ 600519     搜索] 📋     │  输入 + 自动补全 dropdown
│ 名称: 贵州茅台  行业: 白酒           │  选中后显示
├─────────────────────────────────────┤
│ 选个分析角度 (可多选):                │
│  [✓价格趋势] [✓交易热度] [ 估值]    │  chip 多选
│  [ 盈利 ] [ 资金 ] [ 技术 ] [ 新闻 ] │
├─────────────────────────────────────┤
│ 已选 2 个角度 · 数据更新于 14:32     │  状态条 (lazy 拉取后显示)
│  · 价格趋势: 近 30 日 +5.2%, 振幅 8% │  已拉数据的迷你预览
│  · 交易热度: 日均成交 12.3 亿, 换手 0.4%
├─────────────────────────────────────┤
│ [ 🚀 开始 AI 分析 ]                  │  触发 LLM 调用
├─────────────────────────────────────┤
│ 💡 AI 综合解读                       │  结构化输出
│  · 总结: (LLM 生成的 1-2 句)         │
│  · 关注点: (LLM 生成的风险列表)      │
│  · 信号: 中性 / 偏多 / 谨慎          │
└─────────────────────────────────────┘
```

**抽屉开启/关闭**: 复用阶段二 `AiAdviseDrawer` 的 overlay 透明 + 表格让位模式
(`.stock-detail-pad-drawer` 加 `padding-right: calc(min(560px, 90vw) + 16px)`).

### 3.4 Signals Store (`stockDetailStore.js`)

```js
// src/renderer/stocks/stockDetailStore.js
import { signal } from "@preact/signals";

export const codeInput = signal("");
export const selectedStock = signal(null);  // { code, name, industry }
export const selectedAngles = signal(new Set(["price_trend", "volume_turnover"]));  // 默认勾 2 个
export const perAngleData = signal({});     // { [angleKey]: { data, fetchedAt, status } }
export const aiResult = signal({
  status: "idle",                           // idle | loading | ready | error
  result: null,                             // { summary, perAngle, risks, signal }
  fromCache: false,
  reason: null,
  error: null,
});
export const detailOpen = signal(false);

export function toggleAngle(key) { /* Set add/delete */ }
export async function loadAngleData(api, code, angle) { /* IPC: stocks:detail-angles */ }
export async function requestAiDetail(api) { /* IPC: stocks:detail-analyze */ }
```

## 4. 数据流

### 4.1 输入股票代码

```
用户输入 "600519"
  ↓ debounce 250ms
调用 api.stocksSearch("600519")
  ↓ 复用现有 IPC (5min 缓存)
渲染端 dropdown 显示 {code, name, industry}
  ↓ 用户点击 / Enter
selectedStock.value = {code: "600519", name: "贵州茅台", industry: "白酒"}
```

### 4.2 切换分析角度 (lazy 拉取)

```
用户勾选 [估值]
  ↓
toggleAngle("valuation") → selectedAngles.add("valuation")
  ↓
loadAngleData(api, "600519", "valuation")
  ↓ IPC: stocks:detail-angles { code, angles: ["valuation"] }
main: fetchStockDetailAngles(httpClient, code, ["valuation"])
  ↓ 并行调对应 fetcher
  valuation fetcher 拉东财 F10 → 失败 → fallback sina → 成功
  ↓
返回 { data: { valuation: { data, fetchedAt, status: "ok" } } }
  ↓
perAngleData.value = { ...prev, valuation: {...} }
```

**关键点**:
- 每个 angle 独立状态 `{ data, fetchedAt, status: "ok" | "failed" | "loading" }`
- 失败的 angle 不阻塞其他
- 已成功的**不重复拉** (60s 内存缓存)

### 4.3 AI 分析调用

```
用户点 [🚀 开始 AI 分析]
  ↓
requestAiDetail(api)
  ↓ 构造 inputs:
  - code: "600519"
  - angles: [...selectedAngles]              // 用户当前勾选
  - perAngleData: { ...已拉到的数据 }         // 只传已成功的
  - freeText: ""                              // 可选补充
  ↓ IPC: stocks:detail-analyze
main: aiStockDetailAnalyze({...})
  ↓
  1. computeCacheKey(code, sortedAngles, perAngleDataHash, freeText, marketHash)
  2. state.json.stockDetailCache 查 24h 命中
  3. miss → buildAnalyzeMessages({ code, perAngleData, freeText })
  4. resolvePrompt("stock_detail_analyze") → system + rules
  5. user message 拼: "股票 600519 贵州茅台\n选中的角度 + 数据点\n..."
  6. chatCompletion(messages) — 走 P71 预算
  7. parseAndValidateAnalyze(text) → { summary, perAngle, risks, signal }
  8. 命中"投资建议关键词" → 整句替换为中性描述 (复用 advisor 的 FORBIDDEN_SUMMARY_REGEX)
  9. 写回 cache
  ↓
aiResult.value = { status: "ready", result, fromCache }
```

### 4.4 LLM 输出契约

```json
{
  "summary": "基于近 30 日数据, 贵州茅台日均成交 12.3 亿, 换手率维持在 0.4% 水平, 估值分位处于近 3 年 70% 位置, 整体呈现防御特征。",
  "perAngle": {
    "price_trend": "近 30 日 +5.2%, 高位震荡",
    "volume_turnover": "成交活跃度平稳, 无明显异动",
    "valuation": "PE 28x, 处于近 3 年 70% 分位, 偏贵"
  },
  "risks": [
    "估值分位偏高, 需警惕业绩不达预期带来的回调",
    "近期无明显资金流入信号"
  ],
  "signal": "neutral"
}
```

`signal` 枚举: `positive | neutral | cautious` (与 `valid` 白名单, 不允许"必涨"等强信号词).

## 5. 错误处理

### 5.1 错误分类

| 层级 | 错误类型 | reason | 用户文案 | 可重试 |
|---|---|---|---|---|
| 输入 | 代码无效 | `invalid_code` | "代码格式不对，请输入 6 位数字" | 否（修输入） |
| 输入 | 角度未选 | `no_angles` | "至少选 1 个分析角度" | 否（勾选） |
| 网络 | 全失败 | `all_fetch_failed` | "拉数据失败，请检查网络后重试" | 是 |
| 网络 | 部分失败 | `partial` (warning 字段) | "部分角度拉取失败，已用 [成功列表]" | 是（重试失败项） |
| 限流 | LLM 预算 | `budget_exceeded` | "今日 token 预算已用完" | 否（明天） |
| LLM | 解析失败 | `parse_failed` | "AI 返回格式异常，请重试" | 是 |
| LLM | 调用失败 | `llm_failed` | "AI 调用失败，请稍后重试" | 是 |
| 配置 | AI 未配置 | `config_missing` | "AI 未配置，请去 AI 设置" | 否（去配置） |

### 5.2 失败隔离原则

**每个 angle 独立状态**:

```js
perAngleData.value = {
  price_trend: { status: "ok", data: {...}, fetchedAt: 123 },
  volume_turnover: { status: "ok", data: {...}, fetchedAt: 123 },
  valuation: { status: "failed", reason: "fetch_failed", error: "网络超时", fetchedAt: 123 },
  profitability: { status: "loading", data: null },
}
```

**关键不变量**:
- 1 个 angle 失败 → 不影响其他 angle 展示
- 1 个 angle 失败 → 不影响 AI 分析调用 (AI 用已成功的 angle 数据 + 在 user message 里标注"某角度数据缺失")
- 1 个 angle 失败 → UI 显示该 chip 红色边框 + ⓘ 错误提示 (hover 展开原因)

### 5.3 数据源 fallback

每个 fetcher 内部实现"主源失败 → 备源":

```js
// detail-fetchers/valuation.js (示例)
async function fetchValuation(httpClient, { code }) {
  // 1) 东财 F10
  const primary = await fetchEastmoneyF10(httpClient, code);
  if (primary.ok) return primary;
  // 2) sina 备选
  const fallback = await fetchSinaFinance(httpClient, code);
  if (fallback.ok) return fallback;
  // 3) 全部失败
  return { ok: false, reason: "fetch_failed", error: primary.error || fallback.error };
}
```

**fallback 失败也要 ok:false**, 让上层 (调度器) 能区分"未尝试 fallback" vs "fallback 也失败".

### 5.4 LLM 输出校验失败的处理

参照阶段二 `stock-screener-advisor` 的 `parseAndValidateAdvise` 模式:

- 缺 `summary` → 用兜底字符串 "暂无总结"
- 缺 `perAngle` → 空对象
- 缺 `risks` → 空数组
- `signal` 不在白名单 → 降级为 `neutral`
- `summary` 命中投资建议关键词 → 整句替换为 `SUMMARY_SAFE_REPLACEMENT` ("当前市场呈现")
- `summary` 超过 200 字 → 截断到 199 字 + "…"

**绝不抛错给 UI** — 所有降级在 main 端完成, UI 永远拿到符合契约的对象.

### 5.5 缓存相关

- **24h 持久化缓存 (AI)**: key 包含 code + sortedAngles + perAngleData 哈希 + freeText + 当日
  market hash. **任何输入变化都重新计算 key**
- **60s 内存缓存 (数据)**: key 是 `code|sortedAngles`, 重复点同一组合不重打接口
- **缓存上限保护**: 复用 stage 2 的 LRU 简化 (> 200 条清一半)
- **缓存命中 UI 提示**: `aiResult.fromCache = true` 时显示 "缓存命中" 标签

## 6. 测试

### 6.1 单测覆盖

按 TDD 原则, 每个 fetcher 至少 3-4 case:

| 模块 | 测试文件 | 关键 case |
|---|---|---|
| `stock-detail-angles.js` | `stock-detail-angles.test.js` | `getAngle(key)` 命中/未命中; `ANGLE_DEFS` 7 项不重复 |
| `stock-detail-fetcher.js` | `stock-detail-fetcher.test.js` | `Promise.allSettled` 并行; 部分失败不抛; 全部失败返 fulfilledCount=0 |
| `detail-fetchers/price-trend.js` | `price-trend.test.js` | 解析东财返回; 解析失败; sina fallback 命中; 两端都失败 |
| `detail-fetchers/volume-turnover.js` | 同上 | 同上模式 |
| `detail-fetchers/valuation.js` | 同上 | PE/PB 字段映射; 分位计算 (用 mock 数据) |
| `detail-fetchers/profitability.js` | 同上 | ROE 字段; 最新报告期选取 |
| `detail-fetchers/capital-flow.js` | 同上 | 主力净流入字段; 多日聚合 |
| `detail-fetchers/tech-indicators.js` | 同上 | MA5/10/20 计算; MACD 简化 |
| `detail-fetchers/news-buzz.js` | 同上 | 新闻列表解析; 情感分类 (如果做) |
| `stock-detail-advisor.js` | `stock-detail-advisor.test.js` | `buildAnalyzeMessages` 拼装; `parseAndValidateAnalyze` 各种 JSON; 缓存命中/过期; PII 防护; 合规改写; budget_exceeded |
| `stockDetailStore.js` | `stockDetailStore.test.js` | `toggleAngle` 增删; `loadAngleData` 成功/失败; `requestAiDetail` 状态机 |
| `StockDetailDrawer.jsx` | `StockDetailDrawer.test.jsx` | 渲染骨架; chip 切换; 自动补全 dropdown; AI 结果区 |

**预估 35-45 单测** (含 happy path + edge case + 合规 + 缓存)

### 6.2 集成验证

- `npm run build:renderer` ✅
- `npx vitest run` → 全量 PASS / 0 FAIL
- 手动验证: 开抽屉 → 输 "600519" → 选 3 角度 → 看到数据点 → 点 AI → 看到结构化解读
- 手动验证: 失败场景 (断网 / 输错代码 / 预算用完)

### 6.3 性能预算

- 抽屉打开 → 0ms (无数据, 立即可用)
- 输入代码 → 250ms debounce → 搜索 ~300ms → 渲染选中
- 切角度 → 拉单接口 1-3s (端到端)
- 全部 7 角度并行拉 → 不超过 5s (含 fallback)
- AI 分析 → 取决于 LLM 响应, 2-8s (无前端阻塞, 可取消)

## 7. 设计要点

- **AI 是一等公民**: 区别于"通用财务面板", 本阶段核心价值是"AI 按用户选的角度解读"
- **失败隔离**: 1 个 angle 失败不影响其他 / AI; per-angle status 字段
- **数据契约集中**: `ANGLE_DEFS` 是唯一事实源, UI / prompt / fetcher / 校验都消费
- **复用 stage 2 模式**: 24h 缓存 / prompt-registry / FORBIDDEN_SUMMARY_REGEX / `parseAndValidate` 模式
- **新角度零侵入**: 添 1 个 fetcher 文件 + 1 行注册, 不动其他

## 8. 不在本次范围 (留后续阶段)

- ❌ K 线图
- ❌ 多轮对话追问
- ❌ 自选股 tab 联动入口
- ❌ 历史分析记录 (24h cache 之外)
- ❌ 国际化 i18n
- ❌ 用户自定义 prompt 编辑
- ❌ 行业对比 / 同业排行
- ❌ 财报原文展示

## 9. 实施 note

- 实施计划见 `docs/superpowers/plans/2026-06-26-stock-detail-ai-plan.md` (后续)
- 阶段一/二已建立稳定的"main 拉 + IPC + 缓存 + shared-llm + prompt-registry"模式, 本阶段沿用
- 7 个 fetcher 是横向扩展, 建议实施时 1 个 PR 全部完成 (避免部分完成状态下的"未完成角度"歧义)
