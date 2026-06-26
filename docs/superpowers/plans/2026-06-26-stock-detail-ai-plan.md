# Stock Detail AI (阶段四) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户输入股票代码 + 多选分析角度 → lazy 拉真实数据 → LLM 综合解读，输出结构化 `{summary, perAngle, risks, signal}`.

**Architecture:** 7 个独立 fetcher（每个 < 100 行 pure function）通过 `ANGLE_DEFS` 注册表统一管理；main 端按需并行调 fetcher，失败隔离；AI advisor 走 shared-llm + prompt-registry，24h 持久化缓存（state.json.stockDetailCache）。Renderer 端 560px 右侧抽屉，fade-only，表格立即让位 padding。

**Tech Stack:** Electron + Preact + @preact/signals, esbuild, vitest, 东财 clist/F10 + sina/腾讯 fallback, shared-llm (P71 预算), prompt-registry, state-store.

## Global Constraints

- 版本管理: 沿用 2.47.x patch，bump 到 2.48.0
- 命名: 模块用 `stock-detail-` 前缀（不是 `stockDetail-`），renderer signals store 用 `stockDetailStore.js`（保持 cspell 一致）
- Conventional commits: `feat(stocks):` / `fix(stocks):` / `chore(release):` / `docs(spec):` / `test(stocks):`
- 架构一致性: 所有数据走 main 拉 + IPC + preload + renderer signals（与阶段一/二完全一致）
- 测试: TDD，先写失败测试，跑确认 fail，再写最小实现
- 频率: 每个 task 完成后立即 commit（per checklist 第 5 步）
- ponytail 原则: 删除多于添加，boring 多于巧妙；最少文件最简代码
- 抽取规则: node-only 模块（用 crypto 等）必须不引入 renderer；本阶段无需 node-only 模块（advisor 跟 stage 2 一样走 shared-llm）
- 合规: 复用 `FORBIDDEN_SUMMARY_REGEX`（禁"买入/卖出/加仓/减仓/看多/看空/必涨/必跌/强烈推荐"），命中整句替换为 `SUMMARY_SAFE_REPLACEMENT`
- prompt 注册: `stock_detail_analyze` 必须走 `resolvePrompt`，用户可在 Settings 改

## File Structure

新文件（14 个）:
- `src/stocks/stock-detail-angles.js` — 7 角度注册表 + `getAngle`
- `src/stocks/stock-detail-fetcher.js` — `fetchStockDetailAngles(httpClient, code, angles)` 调度
- `src/stocks/stock-detail-cache.js` — `computeStockCacheKey(code, angles)`
- `src/stocks/detail-fetchers/price-trend.js` — 近 30 日价格
- `src/stocks/detail-fetchers/volume-turnover.js` — 近 30 日成交/换手
- `src/stocks/detail-fetchers/valuation.js` — PE/PB 分位
- `src/stocks/detail-fetchers/profitability.js` — ROE/毛利率
- `src/stocks/detail-fetchers/capital-flow.js` — 主力净流入
- `src/stocks/detail-fetchers/tech-indicators.js` — MA/MACD
- `src/stocks/detail-fetchers/news-buzz.js` — 新闻
- `src/ai/stock-detail-advisor.js` — `aiStockDetailAnalyze` + parse + 缓存
- `src/main/ipc/register-stock-detail.js` — 2 个 IPC handler
- `src/renderer/stocks/StockDetailDrawer.jsx` — 抽屉 UI
- `src/renderer/stocks/stockDetailStore.js` — signals

修改文件:
- `src/main/state-store.js` — `PRESERVE_FIELDS` 加 `stockDetailCache`
- `src/main/ipc/index.js` — 注册新 handlers
- `src/renderer/api.js` — 暴露 `stocksDetailAngles` / `stocksDetailAnalyze` / `onStockDetailDrawerOpen` (可省)
- `preload.js` — 暴露同名 bridge
- `src/renderer/components/SideNav.jsx` — 加 "🔍 个股分析" tab
- `src/renderer/components/LazyNavPanel.jsx` — 懒加载新 tab
- `src/ai/prompt-registry.js` — 加 `stock_detail_analyze` prompt 默认
- `styles.css` — `.stock-detail-*` 样式段

测试文件: 13 个（与新文件一一对应）

---

## Task 1: Angle Registry

**Files:**
- Create: `src/stocks/stock-detail-angles.js`
- Test: `tests/stocks/stock-detail-angles.test.js`

**Interfaces:**
- Consumes: 7 fetcher 模块 (Task 4-10)
- Produces: `ANGLE_DEFS` 数组 + `getAngle(key)` 函数

- [ ] **Step 1: 写失败测试**

`tests/stocks/stock-detail-angles.test.js`:

```js
import { describe, it, expect } from "vitest";
import { ANGLE_DEFS, getAngle } from "../../src/stocks/stock-detail-angles";

describe("stock-detail-angles", () => {
  it("ANGLE_DEFS has exactly 7 angles", () => {
    expect(ANGLE_DEFS).toHaveLength(7);
  });

  it("each angle has required fields", () => {
    for (const a of ANGLE_DEFS) {
      expect(a.key).toMatch(/^[a-z_]+$/);
      expect(a.label).toBeTruthy();
      expect(a.group).toBeTruthy();
      expect(a.promptHint).toBeTruthy();
      expect(a.dataShape).toBeTruthy();
      expect(typeof a.fetcher).toBe("function");
    }
  });

  it("keys are unique", () => {
    const keys = ANGLE_DEFS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("groups cover 行情/财务/资金/技术/舆情", () => {
    const groups = new Set(ANGLE_DEFS.map((a) => a.group));
    expect(groups.has("行情")).toBe(true);
    expect(groups.has("财务")).toBe(true);
    expect(groups.has("资金")).toBe(true);
    expect(groups.has("技术")).toBe(true);
    expect(groups.has("舆情")).toBe(true);
  });

  it("getAngle returns matching entry", () => {
    const a = getAngle("price_trend");
    expect(a).not.toBeNull();
    expect(a.key).toBe("price_trend");
  });

  it("getAngle returns null for unknown key", () => {
    expect(getAngle("not_a_key")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/stock-detail-angles.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现 — 7 stub fetcher + ANGLE_DEFS 完整版**

**为啥 stub**: 避免 broken 中间态. 7 个 stub 是真模块, 后续 Task 4-10 替换 stub 为真实实现.

创建 `src/stocks/detail-fetchers/price-trend.js` (一个典型 stub, 其余 6 个同形):

```js
/**
 * src/stocks/detail-fetchers/price-trend.js
 *
 * 阶段四 stub. Task 4 替换为真实实现 (东财 kline + sina fallback).
 */
async function fetchPriceTrend(_httpClient, { code: _code }) {
  return { ok: false, reason: "not_implemented", error: "stub" };
}
module.exports = { fetchPriceTrend };
```

剩下 6 个 stub 同形: `volume-turnover.js` / `valuation.js` / `profitability.js` / `capital-flow.js` / `tech-indicators.js` / `news-buzz.js`. 每个导出对应 `fetchX(_httpClient, { code })` 函数, 函数体一字不差, 仅函数名随 key 变 (`fetchVolumeTurnover` / `fetchValuation` / `fetchProfitability` / `fetchCapitalFlow` / `fetchTechIndicators` / `fetchNewsBuzz`).

写 `src/stocks/stock-detail-angles.js`:

```js
/**
 * src/stocks/stock-detail-angles.js
 *
 * 7 个分析角度的注册表. UI / prompt / fetcher / 校验都消费同一份.
 * 新增角度: 1 个 fetcher 文件 + 下方 1 行注册.
 */
const ANGLE_DEFS = [
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "近 30 日收盘价序列、振幅、近 5/20 日涨跌幅",
    dataShape: "PriceTrendData",
    fetcher: require("./detail-fetchers/price-trend").fetchPriceTrend,
  },
  {
    key: "volume_turnover",
    label: "交易热度",
    group: "行情",
    promptHint: "近 30 日成交额、换手率均值与最新值",
    dataShape: "VolumeTurnoverData",
    fetcher: require("./detail-fetchers/volume-turnover").fetchVolumeTurnover,
  },
  {
    key: "valuation",
    label: "估值水位",
    group: "财务",
    promptHint: "动态 PE、PB、近 3 年分位 (若有)",
    dataShape: "ValuationData",
    fetcher: require("./detail-fetchers/valuation").fetchValuation,
  },
  {
    key: "profitability",
    label: "盈利能力",
    group: "财务",
    promptHint: "ROE、毛利率、净利率 (最新报告期)",
    dataShape: "ProfitabilityData",
    fetcher: require("./detail-fetchers/profitability").fetchProfitability,
  },
  {
    key: "capital_flow",
    label: "资金流向",
    group: "资金",
    promptHint: "近 5/10 日主力净流入额",
    dataShape: "CapitalFlowData",
    fetcher: require("./detail-fetchers/capital-flow").fetchCapitalFlow,
  },
  {
    key: "tech_indicators",
    label: "技术指标",
    group: "技术",
    promptHint: "MA5/MA10/MA20 位置与 MACD 柱状",
    dataShape: "TechIndicatorData",
    fetcher: require("./detail-fetchers/tech-indicators").fetchTechIndicators,
  },
  {
    key: "news_buzz",
    label: "新闻舆情",
    group: "舆情",
    promptHint: "近 7 日新闻标题与情感倾向",
    dataShape: "NewsBuzzData",
    fetcher: require("./detail-fetchers/news-buzz").fetchNewsBuzz,
  },
];

function getAngle(key) {
  return ANGLE_DEFS.find((a) => a.key === key) || null;
}

module.exports = { ANGLE_DEFS, getAngle };
```

**fetcher 字段契约 (后续 Task 4-10 替换 stub 时必须保持)**:

```js
fetcher: async (httpClient, { code }) => Promise<
  | { ok: true, data: { ...angle-specific fields... } }
  | { ok: false, reason: "fetch_failed" | "parse_failed", error: "string" }
>
```

**7 个 fetcher 数据契约**:

| angle | data 必含字段 |
|---|---|
| `price_trend` | `closes: number[30]`, `change5d: number`, `change20d: number`, `amplitude: number` |
| `volume_turnover` | `avgAmount30d: number`, `latestAmount: number`, `avgTurnover30d: number`, `latestTurnover: number` |
| `valuation` | `pe: number\|null`, `pb: number\|null`, `pePercentile3y: number\|null` (若可算) |
| `profitability` | `roe: number\|null`, `grossMargin: number\|null`, `netMargin: number\|null`, `reportDate: string` |
| `capital_flow` | `mainNetInflow5d: number`, `mainNetInflow10d: number` |
| `tech_indicators` | `ma5: number`, `ma10: number`, `ma20: number`, `macdHist: number` |
| `news_buzz` | `items: Array<{title: string, date: string, sentiment: "positive"\|"neutral"\|"negative"}>` |

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/stock-detail-angles.test.js`
Expected: PASS (7 个 angle, key 唯一, group 全覆盖, fetcher 字段为 stub 函数)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-detail-angles.js src/stocks/detail-fetchers/ tests/stocks/stock-detail-angles.test.js
git commit -m "feat(stocks): add stock-detail-angles registry + 7 stub fetchers"
```

---

## Task 2: Cache Key

**Files:**
- Create: `src/stocks/stock-detail-cache.js`
- Test: `tests/stocks/stock-detail-cache.test.js`

**Interfaces:**
- Consumes: 任何调用方
- Produces: `computeStockCacheKey(code, angles)` → 字符串

- [ ] **Step 1: 写失败测试**

`tests/stocks/stock-detail-cache.test.js`:

```js
import { describe, it, expect } from "vitest";
import { computeStockCacheKey } from "../../src/stocks/stock-detail-cache";

describe("computeStockCacheKey", () => {
  it("returns stable key for same input", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    const k2 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    expect(k1).toBe(k2);
  });

  it("differs when code changes", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend"]);
    const k2 = computeStockCacheKey("000001", ["price_trend"]);
    expect(k1).not.toBe(k2);
  });

  it("differs when angle set changes (order independent)", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend", "valuation"]);
    const k2 = computeStockCacheKey("600519", ["valuation", "price_trend"]);
    expect(k1).toBe(k2);  // 顺序无关
  });

  it("differs when angle content changes", () => {
    const k1 = computeStockCacheKey("600519", ["price_trend"]);
    const k2 = computeStockCacheKey("600519", ["valuation"]);
    expect(k1).not.toBe(k2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/stock-detail-cache.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现**

`src/stocks/stock-detail-cache.js`:

```js
/**
 * src/stocks/stock-detail-cache.js
 *
 * 数据缓存 key 计算. 角度顺序无关 — 同一组合任意顺序都返同一 key.
 */

/**
 * @param {string} code  股票代码 (e.g. "600519")
 * @param {string[]} angles  角度 key 数组
 * @returns {string} 缓存 key
 */
function computeStockCacheKey(code, angles) {
  if (!code || !Array.isArray(angles) || angles.length === 0) {
    return null;
  }
  const sortedAngles = [...angles].sort();
  return `detail|${code}|${sortedAngles.join(",")}`;
}

module.exports = { computeStockCacheKey };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/stock-detail-cache.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-detail-cache.js tests/stocks/stock-detail-cache.test.js
git commit -m "feat(stocks): add stock-detail-cache key (order independent)"
```

---

## Task 3: Detail Fetcher 调度器

**Files:**
- Create: `src/stocks/stock-detail-fetcher.js`
- Test: `tests/stocks/stock-detail-fetcher.test.js`

**Interfaces:**
- Consumes: `ANGLE_DEFS` (Task 1), 7 fetcher (Task 4-10), `httpClient`
- Produces: `fetchStockDetailAngles(httpClient, code, angles)` → `{ perAngle: {...}, fulfilledCount, totalCount }`

- [ ] **Step 1: 写失败测试**

`tests/stocks/stock-detail-fetcher.test.js`:

```js
import { describe, it, expect, vi } from "vitest";

const mockFetch = vi.fn();
const httpClient = { get: mockFetch };

vi.mock("../../src/stocks/stock-detail-angles", () => {
  return {
    ANGLE_DEFS: [
      {
        key: "price_trend",
        label: "价格趋势",
        group: "行情",
        promptHint: "test",
        dataShape: "PriceTrendData",
        fetcher: vi.fn(async (_http, { code }) => ({ ok: true, data: { code, close: 100 } })),
      },
      {
        key: "valuation",
        label: "估值",
        group: "财务",
        promptHint: "test",
        dataShape: "ValuationData",
        fetcher: vi.fn(async () => ({ ok: false, reason: "fetch_failed", error: "network" })),
      },
    ],
    getAngle: (k) => {
      if (k === "price_trend") return { key: "price_trend" };
      if (k === "valuation") return { key: "valuation" };
      return null;
    },
  };
});

const { fetchStockDetailAngles } = await import("../../src/stocks/stock-detail-fetcher");

describe("fetchStockDetailAngles", () => {
  it("returns perAngle with status for each angle", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend", "valuation"]);
    expect(out.totalCount).toBe(2);
    expect(out.fulfilledCount).toBe(1);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(out.perAngle.price_trend.data.code).toBe("600519");
    expect(out.perAngle.valuation.status).toBe("failed");
    expect(out.perAngle.valuation.reason).toBe("fetch_failed");
  });

  it("fulfilledCount=0 when all fail", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["valuation"]);
    expect(out.fulfilledCount).toBe(0);
    expect(out.totalCount).toBe(1);
  });

  it("skips unknown angle keys", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", ["price_trend", "unknown_key"]);
    expect(out.totalCount).toBe(1);
    expect(out.perAngle.price_trend.status).toBe("ok");
    expect(out.perAngle.unknown_key).toBeUndefined();
  });

  it("returns empty result for empty angles array", async () => {
    const out = await fetchStockDetailAngles(httpClient, "600519", []);
    expect(out.totalCount).toBe(0);
    expect(out.fulfilledCount).toBe(0);
    expect(Object.keys(out.perAngle)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/stock-detail-fetcher.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现**

`src/stocks/stock-detail-fetcher.js`:

```js
/**
 * src/stocks/stock-detail-fetcher.js
 *
 * 调度器: 多个 angle 并行调对应 fetcher, 失败隔离, 返回 perAngle 状态.
 * ponytail: 用 Promise.allSettled 而非 Promise.all — 一个失败不影响其他.
 */
const { getAngle } = require("./stock-detail-angles");

/**
 * @param {object} httpClient  createStockHttpClient(...) 返回
 * @param {string} code        股票代码
 * @param {string[]} angles    角度 key 数组
 * @returns {Promise<{
 *   perAngle: { [angleKey: string]: { status: "ok"|"failed", data?: any, reason?: string, error?: string, fetchedAt: number } },
 *   fulfilledCount: number,
 *   totalCount: number
 * }>}
 */
async function fetchStockDetailAngles(httpClient, code, angles) {
  const perAngle = {};
  const now = Date.now();

  if (!Array.isArray(angles) || angles.length === 0) {
    return { perAngle, fulfilledCount: 0, totalCount: 0 };
  }

  const valid = angles.filter((k) => getAngle(k) !== null);
  const results = await Promise.allSettled(
    valid.map((angleKey) => {
      const { fetcher } = getAngle(angleKey);
      return fetcher(httpClient, { code }).then(
        (res) => ({ angleKey, res }),
        (err) => ({
          angleKey,
          res: { ok: false, reason: "exception", error: err && err.message ? err.message : String(err) },
        }),
      );
    }),
  );

  let fulfilledCount = 0;
  for (const r of results) {
    const { angleKey, res } = r.value;
    if (res && res.ok) {
      perAngle[angleKey] = { status: "ok", data: res.data, fetchedAt: now };
      fulfilledCount += 1;
    } else {
      perAngle[angleKey] = {
        status: "failed",
        reason: (res && res.reason) || "unknown",
        error: (res && res.error) || null,
        fetchedAt: now,
      };
    }
  }

  return { perAngle, fulfilledCount, totalCount: valid.length };
}

module.exports = { fetchStockDetailAngles };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/stock-detail-fetcher.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-detail-fetcher.js tests/stocks/stock-detail-fetcher.test.js
git commit -m "feat(stocks): add stock-detail-fetcher (parallel + failure isolation)"
```

---

## Task 4-10: 7 个独立 Fetcher (TDD 完整循环, 7 个独立 task)

**每个 fetcher 是 pure function, 单文件 < 100 行, 走 TDD 完整循环.** 模式统一:

```js
async function fetchPriceTrend(httpClient, { code }) {
  const primary = await fetchEastmoneyKline(httpClient, code, 30);
  if (primary.ok) {
    const parsed = parse(primary.body);
    if (parsed) return { ok: true, data: summarize(parsed) };
  }
  const fallback = await fetchSinaKline(httpClient, code, 30);
  if (fallback.ok) {
    const parsed = parse(fallback.body);
    if (parsed) return { ok: true, data: summarize(parsed) };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}
module.exports = { fetchPriceTrend };
```

**每个 fetcher 配 4 个测试 case (per spec §5 Testing):**
- 解析主源返回 (mock 200 响应)
- 解析失败 (mock 非预期 body → 返 `{ok:false, reason:"parse_failed"}`)
- 备源命中 (mock 主源 500/超时 + 备源 200 → 返 `{ok:true, data}`)
- 两端都失败 (mock 双 500 → 返 `{ok:false, reason:"fetch_failed"}`)

**HttpClient 约定**: 阶段二用 `createStockHttpClient({ timeout, maxRetries })` (`src/main/chromium-http-client.js`). 7 fetcher 都注入这个 client. 主源一律东财, 备一律新浪/腾讯. mac/win 都不需要新平台代码.

**为啥 7 个独立 task**: fetcher 7 个, 数据源/解析逻辑各不同, 一个 task 写 7 个会变巨型 plan 文件 + review 不友好. 7 个小 task 颗粒度更利于 subagent 并行 + 1 个 failed fetcher 不阻塞其他.

**Fetcher 公共契约 (每个 fetcher 必返)**:
```js
{ ok: true, data: { ...angle-specific fields... } }
| { ok: false, reason: "fetch_failed" | "parse_failed", error: "string" }
```

**Task 1 已经在 ANGLE_DEFS 完整 wire 了 fetcher 字段 (走 stub 实现). 本节 7 个 task 把 stub 替换为真实实现.**

---

### Task 4: price_trend fetcher

**Files:**
- Modify: `src/stocks/detail-fetchers/price-trend.js` (替换 stub)
- Create: `src/stocks/detail-fetchers/_shared-em-kline.js` (东财 K 线公共)
- Create: `src/stocks/detail-fetchers/_shared-sina-kline.js` (新浪 K 线公共)
- Create: `tests/stocks/detail-fetchers/price-trend.test.js`

- [ ] **Step 1: 写失败测试 (4 case)**

`tests/stocks/detail-fetchers/price-trend.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPriceTrend } from "../../../src/stocks/detail-fetchers/price-trend.js";

const emResponse = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const fail = (status = 500) => ({ ok: false, status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, c) => `${date},${c + 1},${c},${c - 1},${c + 2},1000,10000,0.5`;  // open, close, high, low — close = c 跟测试期望 closes[i] = c 对齐

beforeEach(() => vi.restoreAllMocks());

describe("fetchPriceTrend", () => {
  it("parses eastmoney kline response", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 10 + i);
    const klines = closes.map((c, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, c));
    const http = makeClient([emResponse(klines)]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.closes).toEqual(closes);
    expect(typeof r.data.change5d).toBe("number");
    expect(typeof r.data.change20d).toBe("number");
    expect(typeof r.data.amplitude).toBe("number");
  });

  it("returns parse_failed when eastmoney body shape wrong", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina when eastmoney fails", async () => {
    const http = makeClient([
      fail(500),
      { ok: true, status: 200, body: [
        // sina 真实 shape: 顶层 array of objects (不是 eastmoney 的 {data:{klines:[...]}})
        { day: "2026-05-01", open: 10, close: 11, high: 12, low: 9, amount: 10000, turnover: 0.5 },
        { day: "2026-05-02", open: 11, close: 12, high: 13, low: 10, amount: 11000, turnover: 0.5 },
      ] },
    ]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("returns fetch_failed when both sources fail", async () => {
    const http = makeClient([fail(500), fail(503)]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/price-trend.test.js`
Expected: FAIL (stub 返 `{ok:false, reason:"not_implemented"}`)

- [ ] **Step 3: 写实现 — 公共模块 + fetcher**

`src/stocks/detail-fetchers/_shared-em-kline.js`:

```js
const EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

async function fetchEastmoneyKline(httpClient, code, limit) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const url = `${EASTMONEY_KLINE_URL}?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=0&end=20500101&lmt=${limit}`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseEastmoneyKlines(body) {
  if (!body || !body.data || !Array.isArray(body.data.klines)) return null;
  const out = [];
  for (const line of body.data.klines) {
    const parts = String(line).split(",");
    if (parts.length < 6) return null;
    const [date, open, close, high, low, volume, amount, turnover] = parts;
    const o = Number(open), c = Number(close), h = Number(high), l = Number(low);
    if (!o || !c || !h || !l) return null;
    out.push({
      date, open: o, close: c, high: h, low: l,
      amount: Number(amount) || 0,
      turnover: Number(turnover) || 0,
      amplitude: ((h - l) / c) * 100,
    });
  }
  return out;
}

module.exports = { fetchEastmoneyKline, parseEastmoneyKlines };
```

`src/stocks/detail-fetchers/_shared-sina-kline.js`:

```js
const SINA_KLINE_URL = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

async function fetchSinaKline(httpClient, code, limit) {
  const url = `${SINA_KLINE_URL}?symbol=${code}&scale=240&datalen=${limit}&ma=no`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseSinaKlines(body) {
  if (!Array.isArray(body)) return null;
  const out = [];
  for (const item of body) {
    if (!item || typeof item !== "object") return null;
    const o = Number(item.open), c = Number(item.close), h = Number(item.high), l = Number(item.low);
    if (!o || !c || !h || !l) return null;
    out.push({
      date: item.day || item.d,
      open: o, close: c, high: h, low: l,
      amount: Number(item.amount) || 0,
      turnover: Number(item.turnover) || 0,
      amplitude: ((h - l) / c) * 100,
    });
  }
  return out;
}

module.exports = { fetchSinaKline, parseSinaKlines };
```

`src/stocks/detail-fetchers/price-trend.js` (替换 stub):

```js
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchPriceTrend(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary.ok) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback.ok) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function summarize(klines) {
  const closes = klines.map((k) => k.close);
  return {
    closes,
    change5d: pctChange(closes, 5),
    change20d: pctChange(closes, 20),
    amplitude: avg(klines.map((k) => k.amplitude)),
  };
}

function pctChange(closes, n) {
  if (closes.length < n + 1) return 0;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - n];
  if (!past) return 0;
  return ((last - past) / past) * 100;
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

module.exports = { fetchPriceTrend };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/price-trend.test.js`
Expected: PASS (4 case)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/price-trend.js src/stocks/detail-fetchers/_shared-em-kline.js src/stocks/detail-fetchers/_shared-sina-kline.js tests/stocks/detail-fetchers/price-trend.test.js
git commit -m "feat(stocks): price_trend fetcher (eastmoney + sina fallback)"
```

---

### Task 5: volume_turnover fetcher

**Files:**
- Modify: `src/stocks/detail-fetchers/volume-turnover.js`
- Create: `tests/stocks/detail-fetchers/volume-turnover.test.js`

**数据契约**: `{ avgAmount30d, latestAmount, avgTurnover30d, latestTurnover }` — 复用 Task 4 的 `_shared-em-kline.js` / `_shared-sina-kline.js`, 它们已返 `amount` / `turnover`.

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/volume-turnover.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchVolumeTurnover } from "../../../src/stocks/detail-fetchers/volume-turnover.js";

const emOK = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const sinaOK = (items) => ({ ok: true, status: 200, body: items });
const fail = (status = 500) => ({ ok: false, status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, c) => `${date},${c + 1},${c},${c - 1},${c + 2},1000,${c * 100000},${c * 0.1}`;  // open, close, high, low — close = c 跟测试期望对齐

beforeEach(() => vi.restoreAllMocks());

describe("fetchVolumeTurnover", () => {
  it("computes avg/latest amount + turnover from eastmoney", async () => {
    const klines = Array.from({ length: 30 }, (_, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, 10 + i));
    const http = makeClient([emOK(klines)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.latestAmount).toBe(39 * 100000);
    expect(r.data.avgAmount30d).toBeGreaterThan(0);
    expect(typeof r.data.latestTurnover).toBe("number");
    expect(typeof r.data.avgTurnover30d).toBe("number");
  });

  it("parse_failed when klines missing", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const klines = Array.from({ length: 30 }, (_, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, 10 + i));
    // sina fallback 用 sina 真实 shape (顶层 array of objects), 不是 eastmoney 的 {data:{klines}}
    const sinaBody = klines.map((csv, i) => {
      const parts = csv.split(",");
      return { day: parts[0], open: +parts[1], close: +parts[2], high: +parts[3], low: +parts[4], amount: +parts[6], turnover: +parts[7] };
    });
    const http = makeClient([fail(500), sinaOK(sinaBody)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(500), fail(503)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/volume-turnover.test.js`
Expected: FAIL (stub 返 not_implemented)

- [ ] **Step 3: 写实现**

替换 `src/stocks/detail-fetchers/volume-turnover.js`:

```js
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchVolumeTurnover(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary.ok) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length > 0) return { ok: true, data: summarize(parsed) };
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback.ok) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length > 0) return { ok: true, data: summarize(parsed) };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function summarize(klines) {
  const amounts = klines.map((k) => k.amount || 0);
  const turnovers = klines.map((k) => k.turnover || 0);
  return {
    avgAmount30d: avg(amounts),
    latestAmount: amounts[amounts.length - 1] || 0,
    avgTurnover30d: avg(turnovers),
    latestTurnover: turnovers[turnovers.length - 1] || 0,
  };
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

module.exports = { fetchVolumeTurnover };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/volume-turnover.test.js`
Expected: PASS (4 case)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/volume-turnover.js tests/stocks/detail-fetchers/volume-turnover.test.js
git commit -m "feat(stocks): volume_turnover fetcher"
```

---

### Task 6: valuation fetcher (PE/PB/分位)

**Files:**
- Modify: `src/stocks/detail-fetchers/valuation.js`
- Create: `src/stocks/detail-fetchers/_shared-f10.js` (东财 F10 公共)
- Create: `tests/stocks/detail-fetchers/valuation.test.js`

**数据契约**: `{ pe: number|null, pb: number|null, pePercentile3y: number|null }` — `pePercentile3y` F10 不给序列, 降级 null.

**数据源**: 东财 F10 + 腾讯 qt.gtimg.cn 备源.

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/valuation.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchValuation } from "../../../src/stocks/detail-fetchers/valuation.js";

const emOK = (data) => ({ ok: true, status: 200, body: { data } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchValuation", () => {
  it("computes PE/PB from eastmoney F10", async () => {
    const http = makeClient([emOK({ f57: 30, f59: 50, f60: 1e9, f116: 1.5e11 })]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeCloseTo(50, 0);
    expect(r.data.pb).toBeCloseTo(3, 0);
    expect(r.data.pePercentile3y).toBeNull();
  });

  it("parse_failed when essential fields missing", async () => {
    const http = makeClient([emOK({})]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to tencent on eastmoney failure", async () => {
    const tencentBody = `v_sh600519="1,贵州茅台,600519,2000,1950,200,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,28.5,2026-06-25,1500,1500,30,50,1500,1500,1500"`;
    const http = makeClient([fail(), { ok: true, status: 200, body: tencentBody }]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/valuation.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/stocks/detail-fetchers/_shared-f10.js`:

```js
const F10_URL = "https://push2his.eastmoney.com/api/qt/stock/get";

async function fetchEastmoneyF10(httpClient, code) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const url = `${F10_URL}?secid=${secid}&fields=f57,f58,f59,f60,f116,f117,f37,f22,f24`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

module.exports = { fetchEastmoneyF10 };
```

`src/stocks/detail-fetchers/valuation.js` (替换 stub):

```js
const f10 = require("./_shared-f10");

const TENCENT_URL = "http://qt.gtimg.cn/q=";

async function fetchValuation(httpClient, { code }) {
  const primary = await f10.fetchEastmoneyF10(httpClient, code);
  if (primary.ok) {
    const out = parseF10(primary.body);
    if (out) return { ok: true, data: out };
  }
  const fallback = await fetchTencentQuote(httpClient, code);
  if (fallback.ok) {
    const out = parseTencent(fallback.body);
    if (out) return { ok: true, data: out };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function parseF10(body) {
  if (!body || !body.data) return null;
  const d = body.data;
  const eps = Number(d.f57);
  const bvps = Number(d.f59);
  const totalShare = Number(d.f60);
  const totalCap = Number(d.f116);
  if (!eps || !bvps || !totalShare) return null;
  const price = totalCap / totalShare;
  return { pe: price / eps, pb: price / bvps, pePercentile3y: null };
}

async function fetchTencentQuote(httpClient, code) {
  const market = code.startsWith("6") ? "sh" : "sz";
  const url = `${TENCENT_URL}${market}${code}`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseTencent(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].split(",");
  if (parts.length < 50) return null;
  const pe = Number(parts[39]);
  const eps = Number(parts[44]);
  const bvps = Number(parts[45]);
  if (!pe || !eps || !bvps) return null;
  return { pe, pb: (pe * eps) / bvps, pePercentile3y: null };
}

module.exports = { fetchValuation };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/valuation.test.js`
Expected: PASS (4 case)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/valuation.js src/stocks/detail-fetchers/_shared-f10.js tests/stocks/detail-fetchers/valuation.test.js
git commit -m "feat(stocks): valuation fetcher (F10 + tencent fallback)"
```

---

### Task 7: profitability fetcher (ROE/毛利率/净利率)

**Files:**
- Modify: `src/stocks/detail-fetchers/profitability.js`
- Create: `tests/stocks/detail-fetchers/profitability.test.js`

**数据契约**: `{ roe: number|null, grossMargin: number|null, netMargin: number|null, reportDate: string }`

**数据源**: 复用 Task 6 的 `_shared-f10.js` (F10 主要指标).

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/profitability.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProfitability } from "../../../src/stocks/detail-fetchers/profitability.js";

const emOK = (data) => ({ ok: true, status: 200, body: { data } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchProfitability", () => {
  it("parses ROE/gross/net margin from F10", async () => {
    const http = makeClient([emOK({ f37: "22.5", f22: "90.1", f24: "55.2", reportDate: "2025-12-31" })]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
    expect(r.data.grossMargin).toBeCloseTo(90.1, 1);
    expect(r.data.netMargin).toBeCloseTo(55.2, 1);
    expect(r.data.reportDate).toBe("2025-12-31");
  });

  it("parse_failed when roe missing", async () => {
    const http = makeClient([emOK({})]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const http = makeClient([fail(), { ok: true, status: 200, body: "<html>ROE=22.5;GP=90.1;NM=55.2</html>" }]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/profitability.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/stocks/detail-fetchers/profitability.js` (替换 stub):

```js
const f10 = require("./_shared-f10");
const fb = require("./_shared-profitability-fallback");

async function fetchProfitability(httpClient, { code }) {
  const primary = await f10.fetchEastmoneyF10(httpClient, code);
  if (primary.ok) {
    const out = parseF10(primary.body);
    if (out) return { ok: true, data: out };
  }
  const fallback = await fb.fetchSinaProfitability(httpClient, code);
  if (fallback.ok) {
    const out = fb.parseSinaProfitability(fallback.body);
    if (out) return { ok: true, data: out };
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function parseF10(body) {
  if (!body || !body.data) return null;
  const d = body.data;
  const roe = Number(d.f37);
  if (!roe) return null;
  return {
    roe,
    grossMargin: Number(d.f22) || null,
    netMargin: Number(d.f24) || null,
    reportDate: d.reportDate || "unknown",
  };
}

module.exports = { fetchProfitability };
```

`src/stocks/detail-fetchers/_shared-profitability-fallback.js`:

```js
const SINA_URL = "https://money.finance.sina.com.cn/corp/go.php/vFD_FinancialGuideLine/stockid/";

async function fetchSinaProfitability(httpClient, code) {
  const url = `${SINA_URL}${code}/ctrl/part/displaytype/4.phtml`;
  try {
    return await httpClient.get(url);
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function parseSinaProfitability(text) {
  if (!text || typeof text !== "string") return null;
  const roeMatch = text.match(/ROE\s*=\s*([\d.]+)/i);
  if (!roeMatch) return null;
  const grossMatch = text.match(/GP\s*=\s*([\d.]+)/i);
  const netMatch = text.match(/NM\s*=\s*([\d.]+)/i);
  return {
    roe: Number(roeMatch[1]),
    grossMargin: grossMatch ? Number(grossMatch[1]) : null,
    netMargin: netMatch ? Number(netMatch[1]) : null,
    reportDate: "unknown",
  };
}

module.exports = { fetchSinaProfitability, parseSinaProfitability };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/profitability.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/profitability.js src/stocks/detail-fetchers/_shared-profitability-fallback.js tests/stocks/detail-fetchers/profitability.test.js
git commit -m "feat(stocks): profitability fetcher"
```

---

### Task 8: capital_flow fetcher (主力净流入)

**Files:**
- Modify: `src/stocks/detail-fetchers/capital-flow.js`
- Create: `tests/stocks/detail-fetchers/capital-flow.test.js`

**数据契约**: `{ mainNetInflow5d, mainNetInflow10d }`

**数据源**: 东财 push2his.eastmoney.com qtfqflow kline 接口. 备源 stub (parseSinaFlow 返 null, 主源失败 → fetch_failed).

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/capital-flow.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCapitalFlow } from "../../../src/stocks/detail-fetchers/capital-flow.js";

const emOK = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, main) => `${date},${main},0,0,0,0,0`;

beforeEach(() => vi.restoreAllMocks());

describe("fetchCapitalFlow", () => {
  it("sums 5d/10d main net inflow", async () => {
    const klines = Array.from({ length: 15 }, (_, i) => kline(`2026-06-${(i + 1).toString().padStart(2, "0")}`, (i + 1) * 1e6));
    const http = makeClient([emOK(klines)]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.mainNetInflow5d).toBe(15e6);
    expect(r.data.mainNetInflow10d).toBe(55e6);
  });

  it("parse_failed when klines missing", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("fetch_failed when both fail (fallback not implemented)", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/capital-flow.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/stocks/detail-fetchers/capital-flow.js` (替换 stub):

```js
const FLOW_URL = "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get";

async function fetchCapitalFlow(httpClient, { code }) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const url = `${FLOW_URL}?secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63&klt=1&lmt=15`;
  try {
    const primary = await httpClient.get(url);
    if (primary.ok) {
      const out = parseFlow(primary.body);
      if (out) return { ok: true, data: out };
    }
  } catch (e) { /* fall through */ }
  return { ok: false, reason: "fetch_failed", error: "fetch error" };
}

function parseFlow(body) {
  if (!body || !body.data || !Array.isArray(body.data.klines)) return null;
  const klines = body.data.klines.map((line) => String(line).split(","));
  if (klines.length === 0) return null;
  const main = klines.map((p) => Number(p[1]) || 0);
  const last5 = main.slice(-5).reduce((s, x) => s + x, 0);
  const last10 = main.slice(-10).reduce((s, x) => s + x, 0);
  return { mainNetInflow5d: last5, mainNetInflow10d: last10 };
}

module.exports = { fetchCapitalFlow };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/capital-flow.test.js`
Expected: PASS (3 case)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/capital-flow.js tests/stocks/detail-fetchers/capital-flow.test.js
git commit -m "feat(stocks): capital_flow fetcher"
```

---

### Task 9: tech_indicators fetcher (MA + MACD)

**Files:**
- Modify: `src/stocks/detail-fetchers/tech-indicators.js`
- Create: `tests/stocks/detail-fetchers/tech-indicators.test.js`

**数据契约**: `{ ma5, ma10, ma20, macdHist }` — 复用 Task 4 的 `_shared-em-kline.js` / `_shared-sina-kline.js`, 纯客户端算指标.

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/tech-indicators.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTechIndicators } from "../../../src/stocks/detail-fetchers/tech-indicators.js";

const emOK = (closes) => ({ ok: true, status: 200, body: { data: { klines: closes.map((c, i) => `2026-05-${(i+1).toString().padStart(2,"0")},${c},${c},${c},${c},1000,10000,0.5`) } } });  // 模板: open, close, high, low — close=c 让 parsed closes == closes
const sinaOK = (closes) => ({ ok: true, status: 200, body: closes.map((c, i) => ({ day: `2026-05-${(i+1).toString().padStart(2,"0")}`, open: c, close: c, high: c, low: c, amount: 10000, turnover: 0.5 })) });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchTechIndicators", () => {
  it("computes MA5/10/20 from eastmoney klines", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const http = makeClient([emOK(closes)]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.ma5).toBeCloseTo(127, 0);   // mean(125..129)
    expect(r.data.ma10).toBeCloseTo(124.5, 0); // mean(120..129)
    expect(r.data.ma20).toBeCloseTo(119.5, 0); // mean(110..129)
    expect(typeof r.data.macdHist).toBe("number");
  });

  it("parse_failed when insufficient data", async () => {
    const http = makeClient([emOK([100, 101, 102])]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const sinaBody = closes.map((c, i) => ({ day: `2026-05-${i + 1}`, open: c, close: c, high: c, low: c }));
    const http = makeClient([fail(), { ok: true, status: 200, body: sinaBody }]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.ma5).toBeCloseTo(127, 0);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/tech-indicators.test.js`
Expected: FAIL (stub 返 not_implemented)

- [ ] **Step 3: 写实现**

`src/stocks/detail-fetchers/tech-indicators.js` (替换 stub):

```js
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchTechIndicators(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary.ok) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length >= 20) {
      return { ok: true, data: indicators(parsed.map((k) => k.close)) };
    }
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback.ok) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length >= 20) {
      return { ok: true, data: indicators(parsed.map((k) => k.close)) };
    }
  }
  return { ok: false, reason: primary.ok ? "parse_failed" : "fetch_failed", error: "fetch error" };
}

function ma(arr, n) {
  if (arr.length < n) return 0;
  const slice = arr.slice(-n);
  return slice.reduce((s, x) => s + x, 0) / n;
}

function ema(arr, n) {
  if (arr.length < n) return 0;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < arr.length; i += 1) e = arr[i] * k + e * (1 - k);
  return e;
}

function macdHist(closes) {
  if (closes.length < 26) return 0;
  const recent = [];
  for (let i = 25; i < closes.length; i += 1) {
    const sub = closes.slice(0, i + 1);
    recent.push(ema(sub, 12) - ema(sub, 26));
  }
  const macdLine = ema(closes, 12) - ema(closes, 26);
  const signal = ema(recent, 9);
  return macdLine - signal;
}

function indicators(closes) {
  return {
    ma5: ma(closes, 5),
    ma10: ma(closes, 10),
    ma20: ma(closes, 20),
    macdHist: macdHist(closes),
  };
}

module.exports = { fetchTechIndicators };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/tech-indicators.test.js`
Expected: PASS (4 case)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/detail-fetchers/tech-indicators.js tests/stocks/detail-fetchers/tech-indicators.test.js
git commit -m "feat(stocks): tech_indicators fetcher (MA + MACD client-side)"
```

---

### Task 10: news_buzz fetcher (近 7 日新闻 + 简单情感分析)

**Files:**
- Modify: `src/stocks/detail-fetchers/news-buzz.js`
- Create: `tests/stocks/detail-fetchers/news-buzz.test.js`

**数据契约**: `{ items: Array<{title: string, date: string, sentiment: "positive"|"neutral"|"negative"}> }` — 客户端简单词典分析.

**数据源**: 东财 np-listapi + 新浪 feed.mix 备源.

- [ ] **Step 1: 写失败测试**

`tests/stocks/detail-fetchers/news-buzz.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchNewsBuzz } from "../../../src/stocks/detail-fetchers/news-buzz.js";

const emOK = (list) => ({ ok: true, status: 200, body: { data: { list } } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchNewsBuzz", () => {
  it("parses eastmoney news list with sentiment", async () => {
    const items = [
      { title: "股价突破新高", date: "2026-06-25" },
      { title: "公司公告", date: "2026-06-24" },
      { title: "利空消息引发下跌", date: "2026-06-23" },
    ];
    const http = makeClient([emOK(items)]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items).toHaveLength(3);
    expect(r.data.items[0].sentiment).toBe("positive");
    expect(r.data.items[1].sentiment).toBe("neutral");
    expect(r.data.items[2].sentiment).toBe("negative");
  });

  it("parse_failed when list missing", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const http = makeClient([
      fail(),
      { ok: true, status: 200, body: { result: { data: [{ title: "利好公告", ctime: "2026-06-25" }] } } },
    ]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items[0].sentiment).toBe("positive");
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stocks/detail-fetchers/news-buzz.test.js`
Expected: FAIL

- [ ] **Step 3: 写实现**

`src/stocks/detail-fetchers/news-buzz.js` (替换 stub):

```js
const NEWS_URL = "https://np-listapi.eastmoney.com/comm/web/getListInfo";
const SINA_FEED_URL = "https://feed.mix.sina.com.cn/api/roll/get";

const POSITIVE_KW = ["涨", "利好", "突破", "新高", "上行", "增长", "盈利", "改善"];
const NEGATIVE_KW = ["跌", "利空", "破位", "新低", "下行", "亏损", "下降", "下滑"];

async function fetchNewsBuzz(httpClient, { code }) {
  const emUrl = `${NEWS_URL}?client=wap&type=1&pageSize=20&pageIndex=1&code=${code}&_=${Date.now()}`;
  try {
    const primary = await httpClient.get(emUrl);
    if (primary.ok) {
      const out = parseEmNews(primary.body);
      if (out) return { ok: true, data: out };
    }
  } catch (e) { /* fall through */ }

  const sinaUrl = `${SINA_FEED_URL}?pageid=153&lid=1686&k=${code}&num=10&page=1`;
  try {
    const fallback = await httpClient.get(sinaUrl);
    if (fallback.ok) {
      const out = parseSinaNews(fallback.body);
      if (out) return { ok: true, data: out };
    }
  } catch (e) { /* fall through */ }

  return { ok: false, reason: "fetch_failed", error: "fetch error" };
}

function parseEmNews(body) {
  if (!body || !body.data || !Array.isArray(body.data.list)) return null;
  const items = body.data.list.slice(0, 7).map((it) => ({
    title: it.title || it.Art_Title || "",
    date: it.date || it.showTime || "",
    sentiment: classifySentiment(it.title || ""),
  })).filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function parseSinaNews(body) {
  if (!body || !body.result || !Array.isArray(body.result.data)) return null;
  const items = body.result.data.slice(0, 7).map((it) => ({
    title: it.title || "",
    date: it.ctime || "",
    sentiment: classifySentiment(it.title || ""),
  })).filter((it) => it.title);
  if (items.length === 0) return null;
  return { items };
}

function classifySentiment(title) {
  for (const k of POSITIVE_KW) if (title.includes(k)) return "positive";
  for (const k of NEGATIVE_KW) if (title.includes(k)) return "negative";
  return "neutral";
}

module.exports = { fetchNewsBuzz };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stocks/detail-fetchers/news-buzz.test.js`
Expected: PASS (4 case)

- [ ] **Step 5: 跑全量 fetcher + 全量测试确认无回归**

Run: `npx vitest run`
Expected: 7 fetcher PASS + ANGLE_DEFS 全部 PASS + 全量无回归

- [ ] **Step 6: Commit**

```bash
git add src/stocks/detail-fetchers/news-buzz.js tests/stocks/detail-fetchers/news-buzz.test.js
git commit -m "feat(stocks): news_buzz fetcher (sentiment classifier)"
```

**7 个 fetcher 数据契约**:

| angle | data 字段 (必含) |
|---|---|
| `price_trend` | `closes: number[30]`, `change5d: number`, `change20d: number`, `amplitude: number` |
| `volume_turnover` | `avgAmount30d: number`, `latestAmount: number`, `avgTurnover30d: number`, `latestTurnover: number` |
| `valuation` | `pe: number|null`, `pb: number|null`, `pePercentile3y: number\|null` (若可算) |
| `profitability` | `roe: number\|null`, `grossMargin: number\|null`, `netMargin: number\|null`, `reportDate: string` |
| `capital_flow` | `mainNetInflow5d: number`, `mainNetInflow10d: number` |
| `tech_indicators` | `ma5: number`, `ma10: number`, `ma20: number`, `macdHist: number` |
| `news_buzz` | `items: Array<{title: string, date: string, sentiment: "positive"\|"neutral"\|"negative"}>` |

- [ ] **Step 1-4 (7 轮)**: 每个 fetcher 走 TDD
  - 写失败测试 (东财 200 / 解析失败 / sina 200 / 双失败)
  - 跑测试 fail
  - 写实现 (pure function, 含 fallback)
  - 跑测试 pass
- [ ] **Step 5: 7 个 fetcher 全部完成后, 恢复 Task 1 中 fetcher 字段为 require(...)**

---

## Task 11: AI Advisor (拼 prompt + 解析)

**Files:**
- Create: `src/ai/stock-detail-advisor.js`
- Test: `tests/ai/stock-detail-advisor.test.js`

**Interfaces:**
- Consumes: `shared-llm.chatCompletion`, `prompt-registry.resolvePrompt`, `state-store` (24h 持久化)
- Produces: `aiStockDetailAnalyze({ code, angles, perAngleData, freeText })` → `{ ok, result?, fromCache?, reason? }`

- [ ] **Step 1: 写失败测试**

`tests/ai/stock-detail-advisor.test.js` (参照 `tests/ai/stock-screener-advisor.test.js` 的 require.cache 注入模式):

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const stateStorePath = require.resolve("../../src/main/state-store.js");
const promptRegistryPath = require.resolve("../../src/ai/prompt-registry.js");
const sharedLlmPath = require.resolve("../../src/ai/shared-llm.js");
const advisorPath = require.resolve("../../src/ai/stock-detail-advisor.js");

const mockChat = vi.fn();
const _mockState = { stockDetailCache: {}, apps: {} };

function reloadAdvisor() {
  delete require.cache[advisorPath];
  require.cache[sharedLlmPath] = {
    id: sharedLlmPath, filename: sharedLlmPath, loaded: true,
    exports: { chatCompletion: (...args) => mockChat(...args) },
  };
  require.cache[promptRegistryPath] = {
    id: promptRegistryPath, filename: promptRegistryPath, loaded: true,
    exports: { resolvePrompt: (key) => ({ system: `MOCK-SYS-${key}`, rules: `MOCK-RULES-${key}`, fewShot: "" }) },
  };
  require.cache[stateStorePath] = {
    id: stateStorePath, filename: stateStorePath, loaded: true,
    exports: { load: () => _mockState, patchState: (fn) => fn(_mockState) },
  };
  return require(advisorPath);
}

let advisor = reloadAdvisor();

beforeEach(() => {
  mockChat.mockReset();
  _mockState.stockDetailCache = {};
  _mockState.apps = {};
});

const mkPerAngleData = (over = {}) => ({
  price_trend: { status: "ok", data: { closes: [100, 101, 102, 103, 105], change5d: 2.5, change20d: 8.0, amplitude: 5.2 } },
  valuation: { status: "ok", data: { pe: 28.5, pb: 8.2, pePercentile3y: 70 } },
  ...over,
});

describe("aiStockDetailAnalyze", () => {
  it("returns invalid_args when code missing", async () => {
    const r = await advisor.aiStockDetailAnalyze({ angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("cache hit: does not call chatCompletion", async () => {
    const key = advisor.adviseCacheKey({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    _mockState.stockDetailCache = { [key]: { result: { summary: "cached", perAngle: {}, risks: [], signal: "neutral" }, fetchedAt: Date.now() } };
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(true);
    expect(r.result.summary).toBe("cached");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("cache miss + LLM success → calls chatCompletion, writes cache", async () => {
    mockChat.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        summary: "测试总结",
        perAngle: { price_trend: "近 30 日上行" },
        risks: ["估值偏高"],
        signal: "neutral",
      }),
    });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(true);
    expect(r.fromCache).toBe(false);
    expect(r.result.summary).toBe("测试总结");
    expect(r.result.signal).toBe("neutral");
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(1);
  });

  it("LLM failure: returns reason from chatCompletion", async () => {
    mockChat.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("budget_exceeded");
  });

  it("LLM returns broken JSON: returns parse_failed, does NOT write cache", async () => {
    mockChat.mockResolvedValue({ ok: true, text: "not json" });
    const r = await advisor.aiStockDetailAnalyze({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
    expect(Object.keys(_mockState.stockDetailCache)).toHaveLength(0);
  });
});

describe("parseAndValidateAnalyze", () => {
  it("returns null on empty input", () => {
    expect(advisor.parseAndValidateAnalyze("")).toBe(null);
  });

  it("uses fallback summary when missing", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ perAngle: {}, risks: [], signal: "neutral" }));
    expect(typeof out.summary).toBe("string");
    expect(out.summary.length).toBeGreaterThan(0);
  });

  it("normalizes signal to whitelist", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: "BUY" }));
    expect(out.signal).toBe("neutral");
  });

  it("accepts valid signal values", () => {
    for (const s of ["positive", "neutral", "cautious"]) {
      const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "x", perAngle: {}, risks: [], signal: s }));
      expect(out.signal).toBe(s);
    }
  });

  it("truncates summary > 200 chars", () => {
    const long = "x".repeat(300);
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: long, perAngle: {}, risks: [], signal: "neutral" }));
    expect(out.summary.length).toBeLessThanOrEqual(200);
  });

  it("rewrites forbidden summary keywords (买入/卖出/加仓/减仓)", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({ summary: "强烈推荐买入", perAngle: {}, risks: [], signal: "positive" }));
    expect(out.summary).not.toMatch(/强烈推荐|买入/);
    expect(out.summary).toContain("当前市场呈现");
  });

  it("does NOT leak userId / watchlist / search history (PII safety)", () => {
    const out = advisor.parseAndValidateAnalyze(JSON.stringify({
      summary: "userId 123 看多 watchlist 查询",
      perAngle: {}, risks: [], signal: "neutral",
    }));
    expect(out.summary).not.toMatch(/userId|watchlist|searchHistory|search_history/);
  });
});

describe("buildAnalyzeMessages", () => {
  it("throws on missing code", () => {
    expect(() => advisor.buildAnalyzeMessages({ angles: ["price_trend"], perAngleData: mkPerAngleData() })).toThrow();
  });

  it("returns system + user messages", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend"], perAngleData: mkPerAngleData() });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[0].content).toContain("MOCK-SYS-stock_detail_analyze");
  });

  it("user message includes code + angle labels", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend", "valuation"], perAngleData: mkPerAngleData() });
    expect(msgs[1].content).toContain("600519");
    expect(msgs[1].content).toContain("价格趋势");
    expect(msgs[1].content).toContain("估值水位");
  });

  it("user message includes perAngleData values", () => {
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["valuation"], perAngleData: mkPerAngleData() });
    expect(msgs[1].content).toContain("28.5");
  });

  it("user message marks failed angles (no leakage of raw error)", () => {
    const pad = mkPerAngleData({ capital_flow: { status: "failed", reason: "fetch_failed" } });
    const msgs = advisor.buildAnalyzeMessages({ code: "600519", angles: ["price_trend", "capital_flow"], perAngleData: pad });
    expect(msgs[1].content).toMatch(/capital_flow.*数据缺失/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现**

`src/ai/stock-detail-advisor.js`:

```js
/**
 * src/ai/stock-detail-advisor.js
 *
 * 阶段四: 个股 AI 分析 — 调 LLM 解读用户选中的角度数据.
 * 复用品类 advisor 的: prompt-registry + shared-llm + P71 预算 + 24h 持久化缓存.
 *
 * ponytail: 不重写 LLM, 不自接 key, 不绕预算. 只做拼 prompt + 校验 + 缓存.
 */
const crypto = require("crypto");
const stateStore = require("../main/state-store");
const { chatCompletion } = require("./shared-llm");
const { resolvePrompt } = require("./prompt-registry");
const { getAngle } = require("../stocks/stock-detail-angles");

const PROMPT_KEY = "stock_detail_analyze";
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_SIGNALS = new Set(["positive", "neutral", "cautious"]);
const FORBIDDEN_SUMMARY_REGEX = /买入|卖出|加仓|减仓|看多|看空|必涨|必跌|强烈推荐/g;
const SUMMARY_SAFE_REPLACEMENT = "当前市场呈现";
const SUMMARY_MAX_LEN = 200;

function dataHash(perAngleData) {
  return crypto.createHash("sha1")
    .update(JSON.stringify(perAngleData || {}))
    .digest("hex")
    .slice(0, 12);
}

function adviseCacheKey(opts) {
  if (!opts || !opts.code) return null;
  const angles = (opts.angles || []).slice().sort();
  const hash = dataHash(opts.perAngleData);
  return crypto.createHash("sha1")
    .update([CACHE_VERSION, opts.code, angles.join(","), opts.freeText || "", hash].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function buildAnalyzeMessages(opts) {
  const { code, angles, perAngleData, freeText } = opts || {};
  if (!code) throw new Error("buildAnalyzeMessages: code 必填");
  const def = resolvePrompt(PROMPT_KEY);
  const system = [def.system, def.rules].filter(Boolean).join("\n\n");
  const lines = [];
  lines.push(`股票: ${code}`);
  if (Array.isArray(angles) && angles.length > 0) {
    lines.push("选中的分析角度:");
    for (const k of angles) {
      const ang = getAngle(k);
      const label = ang ? ang.label : k;
      const entry = (perAngleData || {})[k];
      if (entry && entry.status === "ok" && entry.data) {
        lines.push(`- ${label} (${k}): ${JSON.stringify(entry.data)}`);
      } else {
        lines.push(`- ${label} (${k}): 数据缺失`);
      }
    }
  }
  if (freeText && String(freeText).trim()) {
    lines.push("");
    lines.push(`补充说明: ${String(freeText).trim()}`);
  }
  const user = lines.join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseAndValidateAnalyze(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) return null;
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try { parsed = JSON.parse(rawText.slice(start, end + 1)); }
  catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  let summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) summary = "暂无总结";
  summary = summary.replace(FORBIDDEN_SUMMARY_REGEX, SUMMARY_SAFE_REPLACEMENT);
  if (summary.length > SUMMARY_MAX_LEN) summary = summary.slice(0, SUMMARY_MAX_LEN - 1) + "…";
  const perAngle = (parsed.perAngle && typeof parsed.perAngle === "object") ? parsed.perAngle : {};
  const risks = Array.isArray(parsed.risks) ? parsed.risks.filter((s) => typeof s === "string") : [];
  const signal = VALID_SIGNALS.has(parsed.signal) ? parsed.signal : "neutral";
  return { summary, perAngle, risks, signal };
}

async function aiStockDetailAnalyze(opts) {
  const safeOpts = opts || {};
  const { code, angles, perAngleData, freeText } = safeOpts;
  if (!code) return { ok: false, reason: "invalid_args" };

  const cacheKey = adviseCacheKey({ code, angles, perAngleData, freeText });
  if (!cacheKey) return { ok: false, reason: "invalid_cache_key" };

  const state = stateStore.load();
  const cacheMap = (state && state.stockDetailCache) || {};
  const entry = cacheMap[cacheKey];
  if (entry && entry.result && typeof entry.fetchedAt === "number" &&
      Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, result: entry.result, fromCache: true };
  }

  let messages;
  try {
    messages = buildAnalyzeMessages({ code, angles, perAngleData, freeText });
  } catch (e) {
    return { ok: false, reason: "build_prompt_failed", error: e && e.message };
  }
  const llm = await chatCompletion(messages);
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }

  const parsed = parseAndValidateAnalyze(llm.text);
  if (!parsed) return { ok: false, reason: "parse_failed" };

  const nextCache = { ...cacheMap };
  nextCache[cacheKey] = { result: parsed, fetchedAt: Date.now() };
  stateStore.patchState((st) => { st.stockDetailCache = nextCache; });

  return { ok: true, result: parsed, fromCache: false };
}

module.exports = {
  aiStockDetailAnalyze,
  adviseCacheKey,
  buildAnalyzeMessages,
  parseAndValidateAnalyze,
  CACHE_TTL_MS,
  CACHE_VERSION,
  PROMPT_KEY,
  VALID_SIGNALS,
  SUMMARY_MAX_LEN,
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js`
Expected: PASS (15+ case)

- [ ] **Step 5: Commit**

```bash
git add src/ai/stock-detail-advisor.js tests/ai/stock-detail-advisor.test.js
git commit -m "feat(ai): add stock-detail-advisor (parse + 24h cache + compliance)"
```

---

## Task 12: 注册 prompt 模板

**Files:**
- Modify: `src/ai/prompt-registry.js`

**Interfaces:**
- 在 registry 里加 `stock_detail_analyze` 默认 prompt (system + rules)

- [ ] **Step 1: 读 prompt-registry.js 看现有 prompt 注册模式**

```bash
cat src/ai/prompt-registry.js
```

按现有模式 (找 `stock_screener_advise` 那块) 加 `stock_detail_analyze` 默认值.

- [ ] **Step 2: 添加默认 prompt**

修改 `src/ai/prompt-registry.js`, 在 `DEFAULT_PROMPTS` 对象里加:

```js
stock_detail_analyze: {
  system: `你是一名严谨的 A 股研究助理. 基于用户选中的分析角度 + 实际数据, 输出客观、中性的解读.
绝不出具"买入/卖出/加仓/减仓/看多/看空/必涨/必跌/强烈推荐"等投资建议.
严格按 JSON 格式输出 (含 summary / perAngle / risks / signal 4 个 key), 不输出其它任何文字.`,
  rules: `信号白名单: signal 必须是 "positive" | "neutral" | "cautious" 之一, 其它值降级为 "neutral".
summary 长度不超过 200 字.
perAngle 的每个 key 对应用户选中的角度, 给出基于数据的客观观察 (不要预测涨跌).
risks 列出 1-3 条值得关注的风险点 (基于数据, 不要泛泛而谈).`,
  fewShot: "",
},
```

- [ ] **Step 3: 跑全量测试确认 advisor 测试还过**

Run: `npx vitest run tests/ai/stock-detail-advisor.test.js`
Expected: PASS (resolvePrompt mock 在 test 里, 不依赖 default)

- [ ] **Step 4: Commit**

```bash
git add src/ai/prompt-registry.js
git commit -m "feat(ai): add stock_detail_analyze prompt default"
```

---

## Task 13: state-store 加 stockDetailCache 字段

**Files:**
- Modify: `src/main/state-store.js`

- [ ] **Step 1: 找 PRESERVE_FIELDS 位置**

```bash
grep -n "PRESERVE_FIELDS\|aiStockAdviseCache" src/main/state-store.js
```

- [ ] **Step 2: 在 PRESERVE_FIELDS 数组里加 stockDetailCache**

修改后:

```js
const PRESERVE_FIELDS = [
  // ... 现有字段
  "aiStockAdviseCache",
  "stockDetailCache",  // ← 新加
];
```

- [ ] **Step 3: 跑全量测试确认无回归**

Run: `npx vitest run`
Expected: 3156+ PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/state-store.js
git commit -m "chore(state-store): preserve stockDetailCache field"
```

---

## Task 14: IPC Handler 注册

**Files:**
- Create: `src/main/ipc/register-stock-detail.js`
- Modify: `src/main/ipc/index.js`

- [ ] **Step 1: 写 register-stock-detail.js**

`src/main/ipc/register-stock-detail.js`:

```js
/**
 * src/main/ipc/register-stock-detail.js
 *
 * 阶段四: 个股 AI 分析 IPC handler.
 * 60s 内存缓存 (数据) + 走 aiStockDetailAnalyze (24h 持久化).
 *
 * ponytail: 与 register-stocks.js 风格一致 — safeHandle + threwResponse 模式.
 */
const { createStockHttpClient } = require("../chromium-http-client");
const { fetchStockDetailAngles } = require("../../stocks/stock-detail-fetcher");
const { computeStockCacheKey } = require("../../stocks/stock-detail-cache");
const { aiStockDetailAnalyze } = require("../../ai/stock-detail-advisor");

const CACHE_TTL_MS = 60_000;
const _detailCache = new Map();

function registerStockDetailHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;

  safeHandle(
    "stocks:detail-angles",
    async (_event, { code, angles } = {}) => {
      if (!code || !Array.isArray(angles) || angles.length === 0) {
        return { ok: false, reason: "invalid_args" };
      }
      const key = computeStockCacheKey(code, angles);
      if (!key) return { ok: false, reason: "invalid_cache_key" };
      const cached = _detailCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return { ok: true, data: cached.data, fromCache: true };
      }
      const httpClient = createStockHttpClient({ timeout: 8000, maxRetries: 1 });
      const data = await fetchStockDetailAngles(httpClient, code, angles);
      if (!data || data.fulfilledCount === 0) {
        return {
          ok: false,
          reason: "all_fetch_failed",
          perAngle: data && data.perAngle,
        };
      }
      _detailCache.set(key, { data, fetchedAt: Date.now() });
      return { ok: true, data, fromCache: false };
    },
    { onError: (err) => threwResponse(err, { perAngle: {} }) },
  );

  safeHandle(
    "stocks:detail-analyze",
    async (_event, { code, angles, perAngleData, freeText } = {}) => {
      return await aiStockDetailAnalyze({ code, angles, perAngleData, freeText });
    },
    {
      onError: (err) => ({
        ok: false,
        reason: "internal_error",
        error: err && err.message,
      }),
    },
  );
}

module.exports = { registerStockDetailHandlers };
```

- [ ] **Step 2: 在 ipc/index.js 里注册新 handler**

读 `src/main/ipc/index.js`, 找 `registerStocksHandlers` 那一行, 在它后面加:

```js
const { registerStockDetailHandlers } = require("./register-stock-detail");
// ... existing registerStocksHandlers(ctx);
registerStockDetailHandlers(ctx);
```

- [ ] **Step 3: 跑全量测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-stock-detail.js src/main/ipc/index.js
git commit -m "feat(stocks): register stocks:detail-angles + detail-analyze IPC"
```

---

## Task 15: preload + api.js 暴露新 bridge

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

- [ ] **Step 1: 读 preload.js 找 stocksAiAdvise 暴露位置**

```bash
grep -n "stocksAiAdvise\|stocksScreen" preload.js
```

- [ ] **Step 2: 在 preload.js 加 stocksDetailAngles + stocksDetailAnalyze**

按 `stocksAiAdvise` 同样的 `ipcRenderer.invoke` 模式加:

```js
stocksDetailAngles: (payload) => ipcRenderer.invoke("stocks:detail-angles", payload),
stocksDetailAnalyze: (payload) => ipcRenderer.invoke("stocks:detail-analyze", payload),
```

- [ ] **Step 3: 在 src/renderer/api.js 加对应 pick**

在 `stocksAiAdvise` 那行附近加:

```js
stocksDetailAngles: pick(overrides, "stocksDetailAngles"),
stocksDetailAnalyze: pick(overrides, "stocksDetailAnalyze"),
```

- [ ] **Step 4: 跑全量测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(stocks): expose stocksDetailAngles + stocksDetailAnalyze bridge"
```

---

## Task 16: Renderer Signals Store

**Files:**
- Create: `src/renderer/stocks/stockDetailStore.js`
- Test: `tests/renderer/stocks/stockDetailStore.test.js`

**Interfaces:**
- Consumes: `api` (Task 15)
- Produces: 7 signals + 3 actions (`toggleAngle`, `loadAngleData`, `requestAiDetail`)

- [ ] **Step 1: 写失败测试**

`tests/renderer/stocks/stockDetailStore.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApi = {
  stocksSearch: vi.fn(),
  stocksDetailAngles: vi.fn(),
  stocksDetailAnalyze: vi.fn(),
};

const { codeInput, selectedStock, selectedAngles, perAngleData, aiResult, detailOpen,
  toggleAngle, selectStock, requestAiDetail, resetDetail } = await import(
  "../../../src/renderer/stocks/stockDetailStore.js"
);

beforeEach(() => {
  mockApi.stocksSearch.mockReset();
  mockApi.stocksDetailAngles.mockReset();
  mockApi.stocksDetailAnalyze.mockReset();
  codeInput.value = "";
  selectedStock.value = null;
  selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
  perAngleData.value = {};
  aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
  detailOpen.value = false;
});

describe("toggleAngle", () => {
  it("adds angle key to set", () => {
    selectedAngles.value = new Set(["price_trend"]);
    toggleAngle("valuation");
    expect(selectedAngles.value.has("valuation")).toBe(true);
    expect(selectedAngles.value.has("price_trend")).toBe(true);
  });

  it("removes angle key if already present", () => {
    selectedAngles.value = new Set(["price_trend", "valuation"]);
    toggleAngle("valuation");
    expect(selectedAngles.value.has("valuation")).toBe(false);
    expect(selectedAngles.value.has("price_trend")).toBe(true);
  });
});

describe("selectStock", () => {
  it("sets selectedStock + clears perAngleData + aiResult", () => {
    perAngleData.value = { price_trend: { status: "ok", data: {} } };
    aiResult.value = { status: "ready", result: {} };
    selectStock({ code: "600519", name: "贵州茅台", industry: "白酒" });
    expect(selectedStock.value).toEqual({ code: "600519", name: "贵州茅台", industry: "白酒" });
    expect(perAngleData.value).toEqual({});
    expect(aiResult.value.status).toBe("idle");
  });
});

describe("requestAiDetail", () => {
  it("returns error signal when api missing", async () => {
    const r = await requestAiDetail(null, { code: "600519", angles: [], perAngleData: {} });
    expect(aiResult.value.status).toBe("error");
    expect(aiResult.value.reason).toBe("no_api");
  });

  it("success: writes aiResult + fromCache", async () => {
    mockApi.stocksDetailAnalyze.mockResolvedValue({
      ok: true,
      fromCache: true,
      result: { summary: "x", perAngle: {}, risks: [], signal: "neutral" },
    });
    await requestAiDetail(mockApi, { code: "600519", angles: ["price_trend"], perAngleData: {} });
    expect(aiResult.value.status).toBe("ready");
    expect(aiResult.value.fromCache).toBe(true);
    expect(mockApi.stocksDetailAnalyze).toHaveBeenCalledTimes(1);
  });

  it("failure: writes error state", async () => {
    mockApi.stocksDetailAnalyze.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    await requestAiDetail(mockApi, { code: "600519", angles: ["price_trend"], perAngleData: {} });
    expect(aiResult.value.status).toBe("error");
    expect(aiResult.value.reason).toBe("budget_exceeded");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/stocks/stockDetailStore.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现**

`src/renderer/stocks/stockDetailStore.js`:

```js
/**
 * src/renderer/stocks/stockDetailStore.js
 *
 * 阶段四: 个股 AI 分析 renderer signals. 对照 stockStore.js.
 */
import { signal } from "@preact/signals";

export const codeInput = signal("");
export const selectedStock = signal(null);
export const selectedAngles = signal(new Set(["price_trend", "volume_turnover"]));
export const perAngleData = signal({});
export const aiResult = signal({
  status: "idle",
  result: null,
  fromCache: false,
  reason: null,
  error: null,
});
export const detailOpen = signal(false);

export function toggleAngle(key) {
  const next = new Set(selectedAngles.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedAngles.value = next;
}

export function selectStock(stock) {
  selectedStock.value = stock;
  perAngleData.value = {};
  aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
}

export async function loadAngleData(api, code, angle) {
  if (!api || !api.stocksDetailAngles) return;
  perAngleData.value = { ...perAngleData.value, [angle]: { status: "loading", data: null } };
  try {
    const r = await api.stocksDetailAngles({ code, angles: [angle] });
    if (r && r.ok) {
      perAngleData.value = { ...perAngleData.value, [angle]: r.data.perAngle[angle] };
    } else {
      perAngleData.value = {
        ...perAngleData.value,
        [angle]: { status: "failed", reason: (r && r.reason) || "unknown", error: (r && r.error) || null },
      };
    }
  } catch (e) {
    perAngleData.value = {
      ...perAngleData.value,
      [angle]: { status: "failed", reason: "exception", error: e && e.message ? e.message : String(e) },
    };
  }
}

export async function requestAiDetail(api, payload) {
  if (!api || !api.stocksDetailAnalyze) {
    aiResult.value = { status: "error", result: null, fromCache: false, reason: "no_api", error: "api 不可用" };
    return;
  }
  aiResult.value = { ...aiResult.value, status: "loading", reason: null, error: null };
  try {
    const r = await api.stocksDetailAnalyze(payload);
    if (r && r.ok) {
      aiResult.value = { status: "ready", result: r.result, fromCache: !!r.fromCache, reason: null, error: null };
    } else {
      aiResult.value = { status: "error", result: null, fromCache: false, reason: (r && r.reason) || "unknown", error: (r && r.error) || null };
    }
  } catch (e) {
    aiResult.value = { status: "error", result: null, fromCache: false, reason: "exception", error: e && e.message ? e.message : String(e) };
  }
}

export function resetDetail() {
  codeInput.value = "";
  selectedStock.value = null;
  selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
  perAngleData.value = {};
  aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/stocks/stockDetailStore.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stocks/stockDetailStore.js tests/renderer/stocks/stockDetailStore.test.js
git commit -m "feat(stocks): add stockDetailStore signals + actions"
```

---

## Task 17: StockDetailDrawer 组件

**Files:**
- Create: `src/renderer/stocks/StockDetailDrawer.jsx`
- Test: `tests/renderer/stocks/StockDetailDrawer.test.jsx`

**Interfaces:**
- Consumes: `stockDetailStore` (Task 16), `api`, `BareModalShell` (复用)
- Produces: 抽屉 UI (560px 右侧, fade-only)

- [ ] **Step 1: 写失败测试 (skeleton 渲染)**

`tests/renderer/stocks/StockDetailDrawer.test.jsx`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { StockDetailDrawer } from "../../../src/renderer/stocks/StockDetailDrawer.jsx";
import { detailOpen, selectedStock, selectedAngles, perAngleData, aiResult, resetDetail } from "../../../src/renderer/stocks/stockDetailStore.js";

afterEach(() => cleanup());

describe("StockDetailDrawer", () => {
  it("renders nothing when closed", () => {
    detailOpen.value = false;
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders header + input + 7 angle chips when open", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    selectedAngles.value = new Set(["price_trend"]);
    const { getByText, getAllByRole } = render(<StockDetailDrawer api={{}} />);
    expect(getByText(/AI 分析/)).toBeTruthy();
    expect(getByText("价格趋势")).toBeTruthy();
    const chips = getAllByRole("button");
    expect(chips.length).toBeGreaterThan(5);  // 7 angle + generate + close
  });

  it("AI button calls api.stocksDetailAnalyze", async () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = {
      price_trend: { status: "ok", data: { change5d: 2.5 } },
    };
    aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
    const mockApi = { stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: true, result: { summary: "x", perAngle: {}, risks: [], signal: "neutral" } }) };
    const { getByText } = render(<StockDetailDrawer api={mockApi} />);
    fireEvent.click(getByText(/开始 AI 分析/));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockApi.stocksDetailAnalyze).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx`
Expected: FAIL (module not found)

- [ ] **Step 3: 写最小实现 (skeleton 优先, 后续 task 加功能)**

`src/renderer/stocks/StockDetailDrawer.jsx`:

```jsx
/**
 * src/renderer/stocks/StockDetailDrawer.jsx
 *
 * 阶段四: 个股 AI 分析抽屉. 560px 右侧, fade-only, 表格立即让位 padding.
 * 复用 BareModalShell + 阶段二 AiAdviseDrawer 的层级修复模式.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { BareModalShell } from "../components/ModalShell.jsx";
import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js";  // ESM import of CJS
import {
  codeInput, selectedStock, selectedAngles, perAngleData, aiResult,
  detailOpen, selectStock, toggleAngle, loadAngleData, requestAiDetail, resetDetail,
} from "./stockDetailStore.js";
import { taggedLog } from "../log.js";

const log = taggedLog("[stock-detail]");

const ERROR_REASON_TEXT = {
  config_missing: "AI 未配置, 请去 AI 设置配置 Provider 和 Key",
  api_key_missing: "AI Key 缺失, 请去 AI 设置补充",
  budget_exceeded: "今日 token 预算已用完, 明天重试或去设置加预算",
  parse_failed: "AI 返回格式异常, 请重试",
  llm_failed: "AI 调用失败, 请稍后重试",
  no_api: "AI 通道未就绪",
};

function StockSearchInput({ api, onSelect }) {
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!codeInput.value || codeInput.value.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      if (!api || !api.stocksSearch) return;
      const r = await api.stocksSearch(codeInput.value);
      if (r && r.ok) {
        setResults((r.results || []).slice(0, 8));
        setShowDropdown(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [codeInput.value]);

  return (
    <div class="stock-detail-search">
      <input
        class="stock-detail-input"
        type="text"
        value={codeInput.value}
        onInput={(e) => { codeInput.value = e.currentTarget.value; }}
        placeholder="输入 6 位股票代码或名称"
        maxLength={20}
        autoComplete="off"
      />
      {showDropdown && results.length > 0 && (
        <ul class="stock-detail-dropdown">
          {results.map((r) => (
            <li
              key={r.code}
              class="stock-detail-dropdown-item"
              onClick={() => {
                onSelect(r);
                setShowDropdown(false);
                codeInput.value = r.code;
              }}
            >
              <span class="stock-detail-dropdown-code">{r.code}</span>
              <span class="stock-detail-dropdown-name">{r.name}</span>
              <span class="stock-detail-dropdown-industry">{r.industry || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AngleChip({ angle, selected, onToggle }) {
  const entry = perAngleData.value[angle.key];
  const failed = entry && entry.status === "failed";
  return (
    <button
      type="button"
      class={`stock-detail-chip${selected ? " active" : ""}${failed ? " failed" : ""}`}
      onClick={onToggle}
      title={failed ? `拉取失败: ${entry.reason}` : angle.promptHint}
    >
      {angle.label}{failed ? " ⚠" : ""}
    </button>
  );
}

function PerAnglePreview() {
  const angles = Array.from(selectedAngles.value);
  if (angles.length === 0) return null;
  return (
    <div class="stock-detail-preview">
      <div class="stock-detail-preview-title">已选 {angles.length} 个角度</div>
      {angles.map((k) => {
        const ang = getAngle(k);
        const entry = perAngleData.value[k];
        return (
          <div key={k} class="stock-detail-preview-row">
            <span class="stock-detail-preview-label">{ang ? ang.label : k}</span>
            <span class="stock-detail-preview-status">
              {entry ? (entry.status === "ok" ? "已加载" : entry.status === "loading" ? "加载中…" : "失败") : "未拉取"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AiResultBlock() {
  const state = aiResult.value;
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div class="stock-detail-ai-loading">
        {state.status === "loading" ? "⏳ AI 解读中…" : ""}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div class="stock-detail-ai-error">
        <div class="stock-detail-ai-error-title">⚠️ 出错了</div>
        <div class="stock-detail-ai-error-sub">
          {ERROR_REASON_TEXT[state.reason] || state.error || state.reason || "未知错误"}
        </div>
      </div>
    );
  }
  if (state.status === "ready" && state.result) {
    const r = state.result;
    return (
      <div class="stock-detail-ai-result">
        {state.fromCache && <div class="stock-detail-cache-tag">缓存命中</div>}
        <div class="stock-detail-section-title">💡 总结</div>
        <div class="stock-detail-summary">{r.summary}</div>
        {r.perAngle && Object.keys(r.perAngle).length > 0 && (
          <>
            <div class="stock-detail-section-title">📊 各角度解读</div>
            <ul class="stock-detail-per-angle">
              {Object.entries(r.perAngle).map(([k, v]) => {
                const ang = getAngle(k);
                return <li key={k}><b>{ang ? ang.label : k}:</b> {v}</li>;
              })}
            </ul>
          </>
        )}
        {r.risks && r.risks.length > 0 && (
          <>
            <div class="stock-detail-section-title">⚠️ 关注点</div>
            <ul class="stock-detail-risks">
              {r.risks.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </>
        )}
        <div class="stock-detail-signal">
          信号: <b class={`signal-${r.signal}`}>{r.signal}</b>
        </div>
      </div>
    );
  }
  return null;
}

export function StockDetailDrawer({ api }) {
  const open = detailOpen.value;
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(e) {
      const card = cardRef.current;
      if (card && card.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest(".stock-detail-open")) return;
      closeDrawer();
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function closeDrawer() {
    detailOpen.value = false;
  }

  function handleAngleToggle(key) {
    const wasSelected = selectedAngles.value.has(key);
    toggleAngle(key);
    // 若新勾选, 触发 lazy 拉取
    if (!wasSelected && selectedStock.value) {
      void loadAngleData(api, selectedStock.value.code, key);
    }
  }

  function handleGenerate() {
    if (!selectedStock.value) return;
    void requestAiDetail(api, {
      code: selectedStock.value.code,
      angles: Array.from(selectedAngles.value),
      perAngleData: perAngleData.value,
      freeText: "",
    });
  }

  return (
    <BareModalShell
      open={open}
      onClose={closeDrawer}
      usePortal
      ariaLabel="个股 AI 分析"
      overlayClass="stock-detail-overlay"
      cardClass="stock-detail-drawer"
      cardRef={cardRef}
    >
      <div class="stock-detail-header">
        <span class="stock-detail-title">🔍 个股 AI 分析</span>
        <button type="button" class="stock-modal-close" onClick={closeDrawer} aria-label="关闭">×</button>
      </div>
      <div class="stock-detail-subtitle">
        选 1+ 个分析角度, AI 按真实数据客观解读.
        <br />
        <span class="stock-detail-hint">AI 不出具买入/卖出等投资建议, 仅基于数据描述现状。</span>
      </div>
      <div class="stock-detail-body">
        <div class="stock-detail-section">
          <div class="stock-detail-section-title">股票代码</div>
          <StockSearchInput api={api} onSelect={(r) => selectStock(r)} />
          {selectedStock.value && (
            <div class="stock-detail-selected">
              {selectedStock.value.name} · {selectedStock.value.industry}
            </div>
          )}
        </div>
        <div class="stock-detail-section">
          <div class="stock-detail-section-title">选个分析角度 (可多选)</div>
          <div class="stock-detail-chips">
            {ANGLE_DEFS.map((angle) => (
              <AngleChip
                key={angle.key}
                angle={angle}
                selected={selectedAngles.value.has(angle.key)}
                onToggle={() => handleAngleToggle(angle.key)}
              />
            ))}
          </div>
        </div>
        <PerAnglePreview />
        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-generate"
          disabled={aiResult.value.status === "loading" || selectedAngles.value.size === 0 || !selectedStock.value}
          onClick={handleGenerate}
        >
          {aiResult.value.status === "loading" ? "⏳ 生成中…" : "🚀 开始 AI 分析"}
        </button>
        <AiResultBlock />
      </div>
    </BareModalShell>
  );
}

export default StockDetailDrawer;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx`
Expected: PASS (3 case)

**注**: 上面 JSX 用了 `import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js"` —— esbuild 必须支持 CJS 互操作, 跟阶段二的 `DEFAULT_SCREENER_CRITERIA` import 模式一样, 验证 OK.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stocks/StockDetailDrawer.jsx tests/renderer/stocks/StockDetailDrawer.test.jsx
git commit -m "feat(stocks): add StockDetailDrawer (560px, fade-only, lazy angles)"
```

---

## Task 18: CSS 样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 找 styles.css 现有 .stock-* 段位置**

```bash
grep -n "stock-advise-overlay\|stock-results-pad-drawer" styles.css
```

- [ ] **Step 2: 在 stage 2 .stock-advise-* 段后面加 .stock-detail-* 段**

```css
/* ponytail: 层级模式跟 .stock-advise 一致 (drawer 是 fixed 浮层,
   overlay 透明 + 不接事件, 表格让位避免物理覆盖任何结果列). */
.stock-detail-overlay {
  z-index: var(--z-index-modal, 5000);
  background: transparent;
  pointer-events: none;
  animation: none;
  align-items: stretch;
  justify-content: flex-end;
}
.stock-detail-overlay > .stock-detail-drawer { pointer-events: auto; }
.stock-detail-drawer {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: min(560px, 90vw);
  background: var(--bg-card, #ffffff);
  border-left: 1px solid var(--border, rgba(0,0,0,0.08));
  box-shadow: -4px 0 24px rgba(0,0,0,0.08);
  display: flex; flex-direction: column;
  animation: stock-detail-fade 0.15s ease-out;
}
@keyframes stock-detail-fade { from { opacity: 0; } to { opacity: 1; } }
/* ponytail: 抽屉打开时 StockDetailLayout 加 .stock-detail-pad-drawer 让出右侧. */
.stock-detail-pad-drawer { padding-right: calc(min(560px, 90vw) + 16px); }

.stock-detail-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08)); }
.stock-detail-title { font-size: 15px; font-weight: 600; color: var(--text-primary, #1d1d1f); }
.stock-detail-subtitle { padding: 10px 16px 0; font-size: 12px; color: var(--text-secondary, #6e6e73); line-height: 1.5; }
.stock-detail-hint { color: var(--text-tertiary, #8e8e93); }
.stock-detail-body { padding: 14px 16px; overflow-y: auto; flex: 1; }
.stock-detail-section { margin-bottom: 14px; }
.stock-detail-section-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #1d1d1f); margin: 8px 0 6px; }
.stock-detail-search { position: relative; }
.stock-detail-input {
  width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 13px;
  background: var(--bg-card, #ffffff); color: var(--text-primary, #1d1d1f);
  border: 1px solid var(--border, rgba(0,0,0,0.08));
}
.stock-detail-dropdown {
  list-style: none; margin: 4px 0 0; padding: 4px;
  background: var(--bg-card, #ffffff); border: 1px solid var(--border, rgba(0,0,0,0.08));
  border-radius: 6px; position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
  max-height: 240px; overflow-y: auto;
}
.stock-detail-dropdown-item {
  display: flex; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer;
  font-size: 12px;
}
.stock-detail-dropdown-item:hover { background: var(--bg-elevated, #f5f5f7); }
.stock-detail-dropdown-code { font-weight: 600; color: var(--accent-primary, #007aff); min-width: 56px; }
.stock-detail-dropdown-name { flex: 1; }
.stock-detail-dropdown-industry { color: var(--text-tertiary, #8e8e93); font-size: 11px; }
.stock-detail-selected { margin-top: 6px; font-size: 12px; color: var(--text-secondary, #6e6e73); }
.stock-detail-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.stock-detail-chip {
  padding: 6px 12px; border-radius: 14px; font-size: 12px;
  background: var(--bg-elevated, #f5f5f7); color: var(--text-primary, #1d1d1f);
  border: 1px solid var(--border, rgba(0,0,0,0.08)); cursor: pointer;
  transition: all 0.15s ease;
}
.stock-detail-chip:hover { border-color: var(--accent-primary, #007aff); }
.stock-detail-chip.active {
  background: var(--accent-primary, #007aff); color: #fff; border-color: var(--accent-primary, #007aff);
}
.stock-detail-chip.failed {
  border-color: #ff3b30; color: #ff3b30;
}
.stock-detail-preview {
  margin: 10px 0; padding: 8px 10px;
  background: var(--bg-elevated, #f5f5f7); border-radius: 6px;
  font-size: 12px;
}
.stock-detail-preview-title { font-weight: 600; margin-bottom: 4px; color: var(--text-secondary, #6e6e73); }
.stock-detail-preview-row { display: flex; justify-content: space-between; padding: 2px 0; }
.stock-detail-preview-label { color: var(--text-primary, #1d1d1f); }
.stock-detail-preview-status { color: var(--text-tertiary, #8e8e93); font-size: 11px; }
.stock-detail-generate { width: 100%; margin-top: 10px; }
.stock-detail-ai-loading { padding: 16px; text-align: center; color: var(--text-secondary, #6e6e73); font-size: 13px; }
.stock-detail-ai-error {
  margin-top: 14px; padding: 12px;
  background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.3); border-radius: 8px;
}
.stock-detail-ai-error-title { font-size: 13px; font-weight: 600; color: #ff3b30; margin-bottom: 4px; }
.stock-detail-ai-error-sub { font-size: 12px; color: var(--text-secondary, #6e6e73); line-height: 1.5; }
.stock-detail-ai-result { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border, rgba(0,0,0,0.08)); }
.stock-detail-cache-tag {
  display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 8px;
  background: var(--bg-elevated, #f5f5f7); color: var(--text-tertiary, #8e8e93);
  margin-bottom: 6px;
}
.stock-detail-summary {
  font-size: 13px; color: var(--text-primary, #1d1d1f);
  padding: 10px 12px; background: var(--bg-elevated, #f5f5f7); border-radius: 8px;
  line-height: 1.6; margin-bottom: 10px;
}
.stock-detail-per-angle, .stock-detail-risks {
  list-style: none; margin: 0 0 10px; padding: 10px 12px;
  background: var(--bg-elevated, #f5f5f7); border-radius: 8px;
  font-size: 12px; line-height: 1.6;
}
.stock-detail-per-angle li, .stock-detail-risks li { padding: 3px 0; }
.stock-detail-signal { font-size: 12px; color: var(--text-secondary, #6e6e73); margin-top: 8px; }
.signal-positive { color: #34c759; }
.signal-neutral { color: var(--text-primary, #1d1d1f); }
.signal-cautious { color: #ff9500; }
```

- [ ] **Step 3: 跑 build 验证 esbuild 不报**

Run: `npm run build:renderer`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat(stocks): add stock-detail-drawer CSS (560px, fade, lazy)"
```

---

## Task 19: sidenav 加新 tab + 懒加载

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `src/renderer/components/LazyNavPanel.jsx`

- [ ] **Step 1: 读 SideNav.jsx 找现有 NAV_KEYS / 选股 tab 那块**

```bash
grep -n "选股\|NAV_KEYS\|self-select" src/renderer/components/SideNav.jsx src/renderer/components/LazyNavPanel.jsx
```

- [ ] **Step 2: 加新 nav item**

在 SideNav.jsx 里"📈 选股"那行附近加:

```jsx
{ id: "stock-detail", label: "个股分析", icon: "🔍" },
```

- [ ] **Step 3: 在 LazyNavPanel.jsx 注册懒加载**

参照现有 stocks 懒加载, 加:

```jsx
const StockDetail = lazy(() => import("../stocks/StockDetailLayout.jsx"));
// ...
case "stock-detail": return <StockDetail api={api} />;
```

- [ ] **Step 4: 创建 StockDetailLayout 容器组件**

`src/renderer/stocks/StockDetailLayout.jsx`:

```jsx
/**
 * src/renderer/stocks/StockDetailLayout.jsx
 *
 * 个股 AI 分析 tab 容器. 提供一个"打开抽屉"按钮 (抽屉内是核心 UI).
 */
import { detailOpen } from "./stockDetailStore.js";
import { StockDetailDrawer } from "./StockDetailDrawer.jsx";

export function StockDetailLayout({ api }) {
  return (
    <div class="stock-detail-layout">
      <div class="stock-detail-empty">
        <div class="stock-detail-empty-icon">🔍</div>
        <div class="stock-detail-empty-title">个股 AI 分析</div>
        <div class="stock-detail-empty-sub">
          选 1+ 个分析角度 (价格/估值/盈利/资金/技术/新闻),
          AI 按真实数据客观解读该股票.
        </div>
        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-open"
          onClick={() => { detailOpen.value = true; }}
        >
          🚀 打开分析抽屉
        </button>
      </div>
      <StockDetailDrawer api={api} />
    </div>
  );
}

export default StockDetailLayout;
```

- [ ] **Step 5: 跑 build 验证**

Run: `npm run build:renderer`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SideNav.jsx src/renderer/components/LazyNavPanel.jsx src/renderer/stocks/StockDetailLayout.jsx
git commit -m "feat(stocks): add 个股分析 sidenav tab + lazy panel"
```

---

## Task 20: 集成验证 + release

**Files:**
- Modify: `package.json` (version bump)
- Modify: `package-lock.json` (auto)
- Create: `.release-notes-2.48.0.md`

- [ ] **Step 1: 跑全量测试**

Run: `npx vitest run`
Expected: 3156+ PASS / 0 FAIL

- [ ] **Step 2: 跑 lint**

Run: `npx eslint src/stocks/stock-detail-* src/stocks/detail-fetchers/ src/ai/stock-detail-advisor.js src/main/ipc/register-stock-detail.js src/renderer/stocks/stockDetailStore.js src/renderer/stocks/StockDetailDrawer.jsx src/renderer/stocks/StockDetailLayout.jsx 2>&1 | head -20`
Expected: 无错误 (项目无 ESLint, 用 ReadLints 工具)

- [ ] **Step 3: 跑 build:renderer**

Run: `npm run build:renderer`
Expected: OK

- [ ] **Step 4: 手动 smoke test**

`npm start`, 验证:
- 侧边栏出现 "🔍 个股分析" tab
- 点开 → 看到"🚀 打开分析抽屉"按钮
- 点按钮 → 抽屉从右侧 560px 滑出 (fade in)
- 输入 "600519" → 自动补全出现 → 选中贵州茅台
- 看到 7 个 angle chip, 默认勾选 2 个
- 切到"估值"chip → 状态从"未拉取"变"加载中"再"已加载"
- 点"🚀 开始 AI 分析" → AI 解读加载 → 显示总结/各角度/关注点/信号

- [ ] **Step 5: 失败场景 smoke test**

- 断网: 切角度 → chip 标红 + ⓘ
- 输错代码: 自动补全为空 → 没数据
- 预算用完: AI 返回 budget_exceeded → 友好文案

- [ ] **Step 6: bump version**

修改 `package.json`: `"version": "2.47.1"` → `"version": "2.48.0"`
修改 `package-lock.json`: 同步版本

- [ ] **Step 7: 写 release notes**

参考 `.release-notes-2.47.1.md` 格式, 创建 `.release-notes-2.48.0.md`:

- [ ] **Step 8: commit + push**

```bash
git add -A
git commit -m "chore(release): bump 2.47.1 → 2.48.0 (个股 AI 分析阶段四)"
git push origin main
```

- [ ] **Step 9: build 双包**

```bash
npm run build:mac
npm run build:win
```

- [ ] **Step 10: gh release create**

参考之前 v2.47.1 的 release 命令, 用 `gh release create v2.48.0` 上传 artifacts.

---

## 总结

**总任务数**: 20
**新文件**: 14
**修改文件**: 9
**预估单测**: 35-45 case
**预估总工时**: 1-2 天集中实施 (per user 接受 7 fetcher 一次性做)

**关键依赖**:
- Task 1 (ANGLE_DEFS) → Task 3 (调度器) → Task 4-10 (7 fetcher) → Task 11 (advisor)
- Task 16 (signals) → Task 17 (drawer) → Task 19 (sidenav)
- Task 14 (IPC) 在 Task 11 + Task 16 之后
- Task 20 (集成验证) 在最后

**风险点**:
- 7 个 fetcher 各自数据源探活 (可能要试几个接口才能稳定)
- LLM prompt 调优 (默认 prompt 可能不达预期, 需 1-2 轮迭代)
- 性能: 7 fetcher 并行拉不超 5s (需实际验证)
