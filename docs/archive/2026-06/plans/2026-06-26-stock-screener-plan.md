# 股票筛选器(选股分析)阶段一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Pulse 加 A 股条件选股筛选器——设条件(估值/行情/行业/市值)或点内置策略 → 调东财接口筛全市场 → 表格排序展示 → 存自选股 + 后台行情刷新。

**Architecture:** 主进程新增 `src/stocks/`(纯函数 filter/strategies + fetcher 打东财 clist 接口)+ `src/main/stock-store.js`(state.json 读写)+ `src/main/ipc/register-stocks.js`(6 个 IPC)。渲染端新增 `src/renderer/stocks/`(signals store + 7 个组件),复用现有 SideNav/LazyNavPanel/safeHandle/HttpClient/patchState 基建。完全对照现有基金模块(`funds/` + `fund-store.js` + `register-funds.js`)的模式。

**Tech Stack:** Electron main + Preact renderer + @preact/signals + vitest。无新依赖(复用 `HttpClient`)。

**上游 spec:** [`docs/superpowers/specs/2026-06-26-stock-screener-design.md`](../specs/2026-06-26-stock-screener-design.md)

---

## 文件结构

**新建(主进程 / 纯逻辑):**
- `src/stocks/stock-constants.js` — 市场代码、字段映射、市值分档阈值、东财 URL
- `src/stocks/stock-filter.js` — **纯函数** filter + sort(可单测,无 IO)
- `src/stocks/strategies.js` — 4 个内置策略 `buildCriteria()`
- `src/stocks/stock-fetcher.js` — `HttpClient` 调东财 clist 接口拉全市场 + mapRow
- `src/main/stock-store.js` — state.json 读写 stockWatchlist + stockScreener(对照 fund-store.js)
- `src/main/ipc/register-stocks.js` — 6 个 IPC handler(对照 register-funds.js)

**新建(渲染端):**
- `src/renderer/stocks/stockStore.js` — signals store(对照 fundStore.js)
- `src/renderer/stocks/StockLayout.jsx` — 选股 tab 容器
- `src/renderer/stocks/StrategyBar.jsx` — 策略 chip 横条
- `src/renderer/stocks/CriteriaPanel.jsx` — 精简条件区 + 高级折叠
- `src/renderer/stocks/ResultTable.jsx` — 结果表格(排序 + ⭐存自选)
- `src/renderer/stocks/WatchlistPanel.jsx` — 自选股 tab
- `src/renderer/stocks/AddStockModal.jsx` — 加自选(搜索)

**新建测试:**
- `tests/stocks/stock-filter.test.js`
- `tests/stocks/strategies.test.js`
- `tests/stocks/stock-fetcher.test.js`(fixture mock)
- `tests/main/stock-store.test.js`
- `tests/main/register-stocks.test.js`

**修改(接线):**
- `src/main/state-store.js` — `PRESERVE_FIELDS` 加两项 + 暴露 load/save helpers
- `src/main/ipc/index.js` — 注册 registerStocksHandlers
- `src/main/index.js`(或 bootstrap)— stockQuoteScheduler 注入 ctx(见 Task 10)
- `preload.js` — window.api 加 6 个 stock 方法 + 1 个推送监听
- `src/renderer/api.js` — createApi 加 6 个 stock 方法
- `src/renderer/components/SideNav.jsx` — NAV_ITEMS 加 2 项
- `src/renderer/components/LazyNavPanel.jsx` — LOADERS 加 2 项
- `styles.css` — `.stock-*` 样式段

---

## Task 1: stock-constants(字段映射 + 市值分档)

**Files:**
- Create: `src/stocks/stock-constants.js`
- Test: `tests/stocks/stock-constants.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/stocks/stock-constants.test.js
import { describe, it, expect } from "vitest";
import {
  MARKET_PARAM,
  FIELD_MAP,
  MARKET_CAP_TIERS,
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
} from "../../src/stocks/stock-constants";

describe("stock-constants", () => {
  it("MARKET_PARAM covers sh + sz main board", () => {
    // 沪深全部 A 股 (沪深主板 + 中小板 + 创业板)
    expect(MARKET_PARAM).toBe(
      "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
    );
  });

  it("FIELD_MAP maps east-money fields to stock keys", () => {
    expect(FIELD_MAP.code).toBe("f12");
    expect(FIELD_MAP.name).toBe("f14");
    expect(FIELD_MAP.price).toBe("f2");
    expect(FIELD_MAP.changePct).toBe("f3");
    expect(FIELD_MAP.turnover).toBe("f8");
    expect(FIELD_MAP.pe).toBe("f9");
    expect(FIELD_MAP.pb).toBe("f23");
    expect(FIELD_MAP.roe).toBe("f21");
    expect(FIELD_MAP.industry).toBe("f100");
    expect(FIELD_MAP.marketCap).toBe("f20");
  });

  it("tierForMarketCap classifies by 亿元 thresholds", () => {
    // f20 单位是元, 阈值用元表示: 500亿=5e11, 100亿=1e11
    expect(tierForMarketCap(5e11 + 1)).toBe("large");
    expect(tierForMarketCap(5e11)).toBe("large");
    expect(tierForMarketCap(1e11 + 1)).toBe("mid");
    expect(tierForMarketCap(1e11)).toBe("mid");
    expect(tierForMarketCap(1e11 - 1)).toBe("small");
    expect(tierForMarketCap(null)).toBe(null);
    expect(tierForMarketCap(undefined)).toBe(null);
  });

  it("MARKET_CAP_TIERS lists all|large|mid|small", () => {
    expect(MARKET_CAP_TIERS).toEqual(["all", "large", "mid", "small"]);
  });

  it("DEFAULT_SCREENER_CRITERIA has null for unset filters", () => {
    expect(DEFAULT_SCREENER_CRITERIA.marketCapTier).toBe("all");
    expect(DEFAULT_SCREENER_CRITERIA.industries).toEqual([]);
    expect(DEFAULT_SCREENER_CRITERIA.peMin).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stocks/stock-constants.test.js`
Expected: FAIL — "Cannot find module '../../src/stocks/stock-constants'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/stocks/stock-constants.js
/**
 * src/stocks/stock-constants.js
 *
 * A 股筛选器常量: 东财接口参数 / 字段映射 / 市值分档阈值.
 * 对照 spec §5.2.
 */

// 东财 clist 接口的 fs 参数: 沪深全部 A 股 (沪深主板 m:1+t:2, 中小板 m:1+t:23,
// 深主板 m:0+t:6, 创业板 m:0+t:80)
const MARKET_PARAM = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";

// 东财 clist 字段 → 我们的 key. 见 spec §5.2 映射表.
const FIELD_MAP = {
  code: "f12",
  name: "f14",
  price: "f2",
  changePct: "f3",
  turnover: "f8", // 换手率 %
  pe: "f9", // PE 动态
  pb: "f23",
  roe: "f21", // ROE 摊薄
  industry: "f100",
  marketCap: "f20", // 总市值 (元)
};

// 请求 fields 参数 (逗号拼接所有东财字段)
const FIELDS_PARAM = Object.values(FIELD_MAP).join(",");

const MARKET_CAP_TIERS = ["all", "large", "mid", "small"];

// 市值阈值 (元). large>500亿, mid 100-500亿, small<100亿.
const MARKET_CAP_LARGE = 5e11; // 500亿
const MARKET_CAP_MID = 1e11; // 100亿

/**
 * 按总市值(元)分档. null/非数 → null (无法分档).
 * @param {number|null|undefined} marketCapYuan
 * @returns {"large"|"mid"|"small"|null}
 */
function tierForMarketCap(marketCapYuan) {
  if (typeof marketCapYuan !== "number" || !Number.isFinite(marketCapYuan)) {
    return null;
  }
  if (marketCapYuan >= MARKET_CAP_LARGE) return "large";
  if (marketCapYuan >= MARKET_CAP_MID) return "mid";
  return "small";
}

// 默认筛选条件: 所有数值过滤项 null = 不限.
const DEFAULT_SCREENER_CRITERIA = {
  peMin: null,
  peMax: null,
  pbMin: null,
  pbMax: null,
  roeMin: null,
  dividendYieldMin: null,
  turnoverMin: null,
  turnoverMax: null,
  change5dMin: null,
  marketCapTier: "all",
  industries: [],
};

module.exports = {
  MARKET_PARAM,
  FIELD_MAP,
  FIELDS_PARAM,
  MARKET_CAP_TIERS,
  MARKET_CAP_LARGE,
  MARKET_CAP_MID,
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stocks/stock-constants.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-constants.js tests/stocks/stock-constants.test.js
git commit -m "feat(stocks): add stock-constants (东财字段映射 + 市值分档)"
```

---

## Task 2: stock-filter(纯函数 filter + sort)

**Files:**
- Create: `src/stocks/stock-filter.js`
- Test: `tests/stocks/stock-filter.test.js`

这是筛选器的质量核心——纯函数,最重要的测试。

- [ ] **Step 1: Write the failing test**

```javascript
// tests/stocks/stock-filter.test.js
import { describe, it, expect } from "vitest";
import { filterStocks, sortStocks, applyScreen } from "../../src/stocks/stock-filter";
import { tierForMarketCap } from "../../src/stocks/stock-constants";

const mk = (over) => ({
  code: "000001", name: "测试", price: 10, changePct: 1,
  turnover: 2, pe: 15, pb: 1.5, roe: 18, industry: "银行",
  marketCap: 6e11, ...over,
});

describe("filterStocks", () => {
  it("returns all when criteria is empty/null fields", () => {
    const rows = [mk({}), mk({ code: "000002" })];
    const out = filterStocks(rows, { marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(2);
  });

  it("filters PE range (peMin <= pe <= peMax)", () => {
    const rows = [mk({ pe: 10 }), mk({ pe: 25 }), mk({ pe: 50 })];
    const out = filterStocks(rows, { peMin: 0, peMax: 20, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].pe).toBe(10);
  });

  it("filters ROE minimum (roe >= roeMin)", () => {
    const rows = [mk({ roe: 5 }), mk({ roe: 20 })];
    const out = filterStocks(rows, { roeMin: 15, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].roe).toBe(20);
  });

  it("skips a criterion when the row's field is null (not excluded)", () => {
    // pe=null 的票不应因 peMax=20 被排除 (数据缺失跳过该条件)
    const rows = [mk({ pe: null }), mk({ pe: 50 })];
    const out = filterStocks(rows, { peMax: 20, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("000001"); // pe=null 那只保留
  });

  it("filters marketCapTier via tierForMarketCap", () => {
    const rows = [mk({ marketCap: 6e11 }), mk({ marketCap: 3e10 })];
    const out = filterStocks(rows, { marketCapTier: "large", industries: [] });
    expect(out).toHaveLength(1);
    expect(out[0].marketCap).toBe(6e11);
  });

  it("filters industries (row industry in list)", () => {
    const rows = [mk({ industry: "银行" }), mk({ industry: "食品饮料" })];
    const out = filterStocks(rows, { industries: ["银行"], marketCapTier: "all" });
    expect(out).toHaveLength(1);
    expect(out[0].industry).toBe("银行");
  });

  it("combines multiple criteria (AND)", () => {
    const rows = [
      mk({ pe: 10, roe: 20, marketCap: 6e11, industry: "银行" }),
      mk({ pe: 10, roe: 5, marketCap: 6e11, industry: "银行" }),
      mk({ pe: 30, roe: 20, marketCap: 6e11, industry: "银行" }),
    ];
    const out = filterStocks(rows, {
      peMax: 20, roeMin: 15, marketCapTier: "large", industries: ["银行"],
    });
    expect(out).toHaveLength(1);
  });

  it("ignores non-finite peMin boundary", () => {
    const rows = [mk({ pe: 10 })];
    const out = filterStocks(rows, { peMin: NaN, marketCapTier: "all", industries: [] });
    expect(out).toHaveLength(1);
  });
});

describe("sortStocks", () => {
  it("sorts descending by numeric key", () => {
    const rows = [mk({ roe: 5 }), mk({ roe: 30 }), mk({ roe: 18 })];
    const out = sortStocks(rows, { key: "roe", dir: "desc" });
    expect(out.map((r) => r.roe)).toEqual([30, 18, 5]);
  });

  it("sorts ascending by numeric key", () => {
    const rows = [mk({ pe: 30 }), mk({ pe: 5 })];
    const out = sortStocks(rows, { key: "pe", dir: "asc" });
    expect(out.map((r) => r.pe)).toEqual([5, 30]);
  });

  it("places null values last regardless of direction", () => {
    const rows = [mk({ roe: null }), mk({ roe: 30 }), mk({ roe: 5 })];
    const desc = sortStocks(rows, { key: "roe", dir: "desc" });
    expect(desc[desc.length - 1].roe).toBe(null);
    expect(desc[0].roe).toBe(30);
    const asc = sortStocks(rows, { key: "roe", dir: "asc" });
    expect(asc[asc.length - 1].roe).toBe(null);
    expect(asc[0].roe).toBe(5);
  });

  it("no sort config returns copy unchanged", () => {
    const rows = [mk({ code: "a" }), mk({ code: "b" })];
    const out = sortStocks(rows, null);
    expect(out.map((r) => r.code)).toEqual(["a", "b"]);
    expect(out).not.toBe(rows); // 新数组
  });
});

describe("applyScreen", () => {
  it("filters then sorts", () => {
    const rows = [
      mk({ code: "a", pe: 10, roe: 30 }),
      mk({ code: "b", pe: 50, roe: 5 }),
      mk({ code: "c", pe: 12, roe: 20 }),
    ];
    const out = applyScreen(rows, { peMax: 20, marketCapTier: "all", industries: [] }, { key: "roe", dir: "desc" });
    expect(out.map((r) => r.code)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stocks/stock-filter.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/stocks/stock-filter.js
/**
 * src/stocks/stock-filter.js
 *
 * 纯函数: 按条件 filter + 按列 sort. 无 IO, 可单测.
 * 对照 spec §5 — filter 对 null 字段"跳过该条件"而非"判为不满足".
 */
const { tierForMarketCap, DEFAULT_SCREENER_CRITERIA } = require("./stock-constants");

// 区间过滤项: [rowKey, minCriteriaKey, maxCriteriaKey]
const RANGE_FILTERS = [
  ["pe", "peMin", "peMax"],
  ["pb", "pbMin", "pbMax"],
  ["turnover", "turnoverMin", "turnoverMax"],
];
// 下限过滤项: [rowKey, minCriteriaKey]
const MIN_FILTERS = [
  ["roe", "roeMin"],
  ["dividendYield", "dividendYieldMin"],
  ["change5d", "change5dMin"],
];

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * @param {Array} rows  StockRow[]
 * @param {object} criteria  跟 DEFAULT_SCREENER_CRITERIA 同形
 * @returns {Array} 过滤后的新数组
 */
function filterStocks(rows, criteria) {
  if (!Array.isArray(rows)) return [];
  const c = Object.assign({}, DEFAULT_SCREENER_CRITERIA, criteria || {});
  return rows.filter((r) => matchCriteria(r, c));
}

function matchCriteria(r, c) {
  if (!r || typeof r !== "object") return false;

  // 区间过滤
  for (const [rowKey, minKey, maxKey] of RANGE_FILTERS) {
    const val = r[rowKey];
    if (!isNum(val)) continue; // 数据缺失 → 跳过该条件
    const lo = c[minKey];
    const hi = c[maxKey];
    if (isNum(lo) && val < lo) return false;
    if (isNum(hi) && val > hi) return false;
  }
  // 下限过滤
  for (const [rowKey, minKey] of MIN_FILTERS) {
    const val = r[rowKey];
    if (!isNum(val)) continue;
    const lo = c[minKey];
    if (isNum(lo) && val < lo) return false;
  }
  // 市值分档
  if (c.marketCapTier && c.marketCapTier !== "all") {
    const tier = tierForMarketCap(r.marketCap);
    if (tier !== c.marketCapTier) return false;
  }
  // 行业 (空数组 = 全行业)
  if (Array.isArray(c.industries) && c.industries.length > 0) {
    if (!c.industries.includes(r.industry)) return false;
  }
  return true;
}

/**
 * @param {Array} rows
 * @param {{key:string, dir:"asc"|"desc"}|null} sort
 * @returns {Array} 排序后的新数组 (null 值排尾)
 */
function sortStocks(rows, sort) {
  if (!Array.isArray(rows)) return [];
  if (!sort || !sort.key) return [...rows];
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a && a[sort.key];
    const bv = b && b[sort.key];
    // null/非数 排尾
    const aBad = !isNum(av);
    const bBad = !isNum(bv);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    if (av === bv) return 0;
    return av < bv ? -dir : dir;
  });
}

/** filter + sort 复合 (stocks:screen 用) */
function applyScreen(rows, criteria, sort) {
  return sortStocks(filterStocks(rows, criteria), sort);
}

module.exports = { filterStocks, sortStocks, applyScreen, matchCriteria };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stocks/stock-filter.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-filter.js tests/stocks/stock-filter.test.js
git commit -m "feat(stocks): add stock-filter pure functions (filter+sort, null 跳过)"
```

---

## Task 3: strategies(4 个内置策略)

**Files:**
- Create: `src/stocks/strategies.js`
- Test: `tests/stocks/strategies.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/stocks/strategies.test.js
import { describe, it, expect } from "vitest";
import { STRATEGIES, getStrategy, buildCriteria } from "../../src/stocks/strategies";

describe("strategies", () => {
  it("has 4 strategies with id+label", () => {
    expect(STRATEGIES).toHaveLength(4);
    expect(STRATEGIES.map((s) => s.id)).toEqual([
      "value_roe", "blue_chip", "high_div", "momentum",
    ]);
    for (const s of STRATEGIES) {
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("value_roe builds PE 0-20, ROE>=15, large", () => {
    const c = buildCriteria("value_roe");
    expect(c.peMin).toBe(0);
    expect(c.peMax).toBe(20);
    expect(c.roeMin).toBe(15);
    expect(c.marketCapTier).toBe("large");
  });

  it("blue_chip builds large, ROE>=15, PE 0-30", () => {
    const c = buildCriteria("blue_chip");
    expect(c.marketCapTier).toBe("large");
    expect(c.roeMin).toBe(15);
    expect(c.peMax).toBe(30);
  });

  it("high_div builds dividendYieldMin>=4, large", () => {
    const c = buildCriteria("high_div");
    expect(c.dividendYieldMin).toBe(4);
    expect(c.marketCapTier).toBe("large");
  });

  it("momentum builds change5dMin>=3, ROE>=10", () => {
    const c = buildCriteria("momentum");
    expect(c.change5dMin).toBe(3);
    expect(c.roeMin).toBe(10);
  });

  it("buildCriteria unknown id returns null", () => {
    expect(buildCriteria("nope")).toBe(null);
  });

  it("getStrategy returns the strategy object", () => {
    expect(getStrategy("value_roe").id).toBe("value_roe");
    expect(getStrategy("missing")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stocks/strategies.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/stocks/strategies.js
/**
 * src/stocks/strategies.js
 *
 * 4 个内置选股策略. 对照 spec §3.2.
 * 策略硬编码, 不持久化. 点 chip 调 buildCriteria(id) 填充条件区.
 */
const { DEFAULT_SCREENER_CRITERIA } = require("./stock-constants");

const STRATEGIES = [
  {
    id: "value_roe",
    label: "低估值高ROE",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      peMin: 0, peMax: 20, roeMin: 15, marketCapTier: "large",
    }),
  },
  {
    id: "blue_chip",
    label: "蓝筹白马",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      marketCapTier: "large", roeMin: 15, peMin: 0, peMax: 30,
    }),
  },
  {
    id: "high_div",
    label: "高股息",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      dividendYieldMin: 4, marketCapTier: "large",
    }),
  },
  {
    id: "momentum",
    label: "成长动量",
    buildCriteria: () => ({
      ...DEFAULT_SCREENER_CRITERIA,
      change5dMin: 3, roeMin: 10, marketCapTier: "all",
    }),
  },
];

function getStrategy(id) {
  return STRATEGIES.find((s) => s.id === id) || null;
}

/** @returns {object|null} criteria, or null if id unknown */
function buildCriteria(id) {
  const s = getStrategy(id);
  if (!s) return null;
  return s.buildCriteria();
}

module.exports = { STRATEGIES, getStrategy, buildCriteria };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stocks/strategies.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/strategies.js tests/stocks/strategies.test.js
git commit -m "feat(stocks): add 4 built-in screener strategies"
```

---

## Task 4: stock-fetcher(东财 clist 接口拉取 + mapRow)

**Files:**
- Create: `src/stocks/stock-fetcher.js`
- Test: `tests/stocks/stock-fetcher.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/stocks/stock-fetcher.test.js
import { describe, it, expect } from "vitest";
import { fetchStocks, parseClist, mapRow } from "../../src/stocks/stock-fetcher";

// 假 httpClient: 返回固定 clist 响应
function mockClient(body) {
  return {
    get: async () => ({ status: 200, body, headers: {}, error: null }),
  };
}

const SAMPLE_BODY = JSON.stringify({
  data: {
    total: 2,
    diff: [
      { f12: "600519", f14: "贵州茅台", f2: 1685.2, f3: 1.23, f8: 0.5,
        f9: 18.5, f23: 6.8, f21: 28.4, f100: "食品饮料", f20: 2100000000000 },
      { f12: "600036", f14: "招商银行", f2: 35.4, f3: -0.45, f8: 1.2,
        f9: 5.6, f23: 0.9, f21: 17.2, f100: "银行", f20: 800000000000 },
    ],
  },
});

describe("parseClist", () => {
  it("extracts data.diff array", () => {
    const out = parseClist(SAMPLE_BODY);
    expect(out.total).toBe(2);
    expect(out.diff).toHaveLength(2);
  });

  it("returns empty on invalid JSON / missing data", () => {
    expect(parseClist("not json")).toEqual({ total: 0, diff: [] });
    expect(parseClist(JSON.stringify({ foo: 1 }))).toEqual({ total: 0, diff: [] });
    expect(parseClist(null)).toEqual({ total: 0, diff: [] });
  });
});

describe("mapRow", () => {
  it("maps east-money raw fields to stock keys", () => {
    const raw = { f12: "600519", f14: "贵州茅台", f2: 1685.2, f3: 1.23,
      f8: 0.5, f9: 18.5, f23: 6.8, f21: 28.4, f100: "食品饮料", f20: 2100000000000 };
    const row = mapRow(raw);
    expect(row).toEqual({
      code: "600519", name: "贵州茅台", price: 1685.2, changePct: 1.23,
      turnover: 0.5, pe: 18.5, pb: 6.8, roe: 28.4, industry: "食品饮料",
      marketCap: 2100000000000,
    });
  });

  it("handles null/missing fields gracefully", () => {
    const row = mapRow({ f12: "000001", f14: "X", f2: "-" });
    expect(row.code).toBe("000001");
    expect(row.name).toBe("X");
    expect(row.price).toBe(null); // "-" 非数 → null
    expect(row.pe).toBe(null);
  });
});

describe("fetchStocks", () => {
  it("returns mapped rows + total + fetchedAt", async () => {
    const out = await fetchStocks(mockClient(SAMPLE_BODY));
    expect(out.total).toBe(2);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].code).toBe("600519");
    expect(typeof out.fetchedAt).toBe("number");
  });

  it("returns empty on HTTP error", async () => {
    const client = { get: async () => ({ status: 500, body: "", error: null }) };
    const out = await fetchStocks(client);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.error).toBeTruthy();
  });

  it("returns empty on network error", async () => {
    const client = { get: async () => ({ status: 0, body: "", error: "timeout" }) };
    const out = await fetchStocks(client);
    expect(out.rows).toEqual([]);
    expect(out.error).toBe("timeout");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stocks/stock-fetcher.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/stocks/stock-fetcher.js
/**
 * src/stocks/stock-fetcher.js
 *
 * 拉全市场 A 股行情 + 基本面 (东财 clist 接口). 对照 spec §5.2.
 * 跟 fund-fetcher.js 同套路: 纯包装 HttpClient, 无业务副作用.
 *
 * 数据源: https://push2.eastmoney.com/api/qt/clist/get
 *   一个请求返回全市场 (~5000 只) 全字段.
 */
const { MARKET_PARAM, FIELD_MAP, FIELDS_PARAM } = require("./stock-constants");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function buildUrl() {
  const q = new URLSearchParams({
    pn: "1", pz: "5000", po: "1", np: "1",
    fltt: "2", invt: "2",
    fields: FIELDS_PARAM,
    fs: MARKET_PARAM,
  });
  return `https://push2.eastmoney.com/api/qt/clist/get?${q.toString()}`;
}

/**
 * @param {string} body
 * @returns {{total:number, diff:object[]}}
 */
function parseClist(body) {
  if (typeof body !== "string" || body.length === 0) {
    return { total: 0, diff: [] };
  }
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return { total: 0, diff: [] };
  }
  const data = j && j.data;
  if (!data || typeof data !== "object") return { total: 0, diff: [] };
  const diff = Array.isArray(data.diff) ? data.diff : [];
  const total = typeof data.total === "number" ? data.total : diff.length;
  return { total, diff };
}

/** 东财 "-" 表示无数据 → null. 其它 number 字段 NaN → null. */
function toNum(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "-" || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * 把东财一条 diff 映射成 StockRow.
 * @returns {{code,name,price,changePct,turnover,pe,pb,roe,industry,marketCap}}
 */
function mapRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const g = (f) => raw[f];
  return {
    code: toStr(g(FIELD_MAP.code)),
    name: toStr(g(FIELD_MAP.name)),
    price: toNum(g(FIELD_MAP.price)),
    changePct: toNum(g(FIELD_MAP.changePct)),
    turnover: toNum(g(FIELD_MAP.turnover)),
    pe: toNum(g(FIELD_MAP.pe)),
    pb: toNum(g(FIELD_MAP.pb)),
    roe: toNum(g(FIELD_MAP.roe)),
    industry: toStr(g(FIELD_MAP.industry)),
    marketCap: toNum(g(FIELD_MAP.marketCap)),
  };
}

/**
 * 拉全市场.
 * @param {{get:(url,opts)=>Promise<{status,body,error}>}} httpClient
 * @param {{timeoutMs?:number}} [opts]
 * @returns {Promise<{rows:object[], total:number, fetchedAt:number, error?:string}>}
 */
async function fetchStocks(httpClient, opts = {}) {
  try {
    const r = await httpClient.get(buildUrl(), {
      headers: { "User-Agent": UA },
      timeout: opts.timeoutMs ?? 8000,
    });
    if (r.error) return { rows: [], total: 0, fetchedAt: Date.now(), error: r.error };
    if (r.status !== 200) return { rows: [], total: 0, fetchedAt: Date.now(), error: `HTTP ${r.status}` };
    const { total, diff } = parseClist(r.body);
    const rows = diff.map(mapRow).filter((x) => x && x.code);
    return { rows, total, fetchedAt: Date.now() };
  } catch (e) {
    return { rows: [], total: 0, fetchedAt: Date.now(), error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { fetchStocks, parseClist, mapRow, buildUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stocks/stock-fetcher.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/stocks/stock-fetcher.js tests/stocks/stock-fetcher.test.js
git commit -m "feat(stocks): add stock-fetcher (东财 clist 接口拉全市场 + mapRow)"
```

---

## Task 5: stock-store(state.json 读写)

**Files:**
- Create: `src/main/stock-store.js`
- Modify: `src/main/state-store.js` — PRESERVE_FIELDS 加两项 + 暴露 helpers
- Test: `tests/main/stock-store.test.js`

- [ ] **Step 1: Modify state-store.js PRESERVE_FIELDS**

在 `PRESERVE_FIELDS` 数组末尾(`tokenBudgetConfig` 那行之后)加:

```javascript
  { key: "stockWatchlist", kind: "array" }, // 股票筛选器: 自选股 [{code,name,industry,addedAt}]
  { key: "stockScreener", kind: "object", notArray: true }, // 股票筛选器: 上次条件 + 策略 + 排序
```

在 `module.exports` 里不需要新增导出(stock-store 直接用 `patchState` / `load` / `writeAtomic`)。

- [ ] **Step 2: Write the failing test**

```javascript
// tests/main/stock-store.test.js
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { loadStockWatchlist, addStock, removeStock, loadStockScreener, saveStockScreener } from "../../src/main/stock-store";
import { _setStatePathForTest } from "../../src/main/state-store";

function tmpState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stock-test-"));
  const p = path.join(dir, "state.json");
  _setStatePathForTest(p);
  return p;
}

describe("stock-store", () => {
  beforeEach(() => {
    tmpState(); // 每个用例一个干净 state
  });

  it("loadStockWatchlist returns [] when missing", () => {
    expect(loadStockWatchlist()).toEqual([]);
  });

  it("addStock appends with dedupe + returns new list", () => {
    const a = addStock({ code: "600519", name: "贵州茅台", industry: "食品饮料" });
    expect(a).toHaveLength(1);
    expect(a[0].code).toBe("600519");
    expect(typeof a[0].addedAt).toBe("number");
    // 重复 code 忽略
    const b = addStock({ code: "600519", name: "贵州茅台" });
    expect(b).toHaveLength(1);
    // 第二只
    const c = addStock({ code: "000001", name: "平安银行" });
    expect(c).toHaveLength(2);
  });

  it("addStock rejects invalid code", () => {
    expect(() => addStock({ code: "123" })).toThrow();
    expect(() => addStock({})).toThrow();
  });

  it("removeStock by code, idempotent", () => {
    addStock({ code: "600519", name: "贵州茅台" });
    const after = removeStock("600519");
    expect(after).toHaveLength(0);
    const again = removeStock("600519"); // 不存在不报错
    expect(again).toHaveLength(0);
  });

  it("persist across reload (state.json round-trip)", () => {
    addStock({ code: "600519", name: "贵州茅台", industry: "食品饮料" });
    const reloaded = loadStockWatchlist();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].code).toBe("600519");
  });

  it("loadStockScreener returns defaults when missing", () => {
    const s = loadStockScreener();
    expect(s.activeStrategy).toBe("value_roe");
    expect(s.lastSort).toEqual({ key: "roe", dir: "desc" });
    expect(s.lastCriteria).toBe(null);
  });

  it("saveStockScreener persists + merges", () => {
    saveStockScreener({ lastCriteria: { peMax: 20, marketCapTier: "all", industries: [] } });
    const s = loadStockScreener();
    expect(s.lastCriteria.peMax).toBe(20);
    expect(s.activeStrategy).toBe("value_roe"); // 默认仍在
    saveStockScreener({ activeStrategy: "custom" });
    expect(loadStockScreener().activeStrategy).toBe("custom");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/main/stock-store.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Write minimal implementation**

```javascript
// src/main/stock-store.js
/**
 * src/main/stock-store.js
 *
 * 股票筛选器持久化 — state.json.stockWatchlist + state.json.stockScreener.
 * 对照 fund-store.js: 复用 stateStore.patchState, 自动 preserve 其它字段.
 *
 * Schema:
 *   stockWatchlist: [{ code, name, industry, addedAt }]
 *   stockScreener:  { lastCriteria, activeStrategy, lastSort }
 */
const stateStore = require("./state-store");

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const code = String(raw.code || "").trim();
  if (!/^\d{6}$/.test(code)) return null;
  return {
    code,
    name: typeof raw.name === "string" && raw.name ? raw.name : null,
    industry: typeof raw.industry === "string" && raw.industry ? raw.industry : null,
    addedAt: typeof raw.addedAt === "number" ? raw.addedAt : Date.now(),
  };
}

function loadStockWatchlist(statePath) {
  const s = stateStore.load(statePath);
  if (!s || !Array.isArray(s.stockWatchlist)) return [];
  return s.stockWatchlist.map(normalizeItem).filter(Boolean);
}

function saveStockWatchlist(list, statePath) {
  const safe = (Array.isArray(list) ? list : []).map(normalizeItem).filter(Boolean);
  stateStore.patchState((next) => {
    next.stockWatchlist = safe;
  }, statePath);
  return safe;
}

class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = "ValidationError"; }
}

function addStock(input, statePath) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("stock input must be object");
  }
  const item = normalizeItem(input);
  if (!item) throw new ValidationError(`invalid stock code: ${input.code}`);
  const cur = loadStockWatchlist(statePath);
  if (cur.some((x) => x.code === item.code)) return cur; // dedupe
  const next = [...cur, item];
  return saveStockWatchlist(next, statePath);
}

function removeStock(code, statePath) {
  const c = String(code || "").trim();
  const cur = loadStockWatchlist(statePath);
  const next = cur.filter((x) => x.code !== c);
  if (next.length === cur.length) return cur; // 不存在, 幂等
  return saveStockWatchlist(next, statePath);
}

// ── screener prefs ──

const DEFAULT_SCREENER = {
  lastCriteria: null,
  activeStrategy: "value_roe",
  lastSort: { key: "roe", dir: "desc" },
};

function loadStockScreener(statePath) {
  const s = stateStore.load(statePath);
  if (!s || !s.stockScreener || typeof s.stockScreener !== "object") {
    return { ...DEFAULT_SCREENER };
  }
  const c = s.stockScreener;
  return {
    lastCriteria: c.lastCriteria || null,
    activeStrategy: typeof c.activeStrategy === "string" ? c.activeStrategy : DEFAULT_SCREENER.activeStrategy,
    lastSort: c.lastSort && c.lastSort.key ? c.lastSort : DEFAULT_SCREENER.lastSort,
  };
}

function saveStockScreener(patch, statePath) {
  const cur = loadStockScreener(statePath);
  const next = { ...cur, ...(patch || {}) };
  stateStore.patchState((st) => {
    st.stockScreener = next;
  }, statePath);
  return next;
}

module.exports = {
  loadStockWatchlist,
  saveStockWatchlist,
  addStock,
  removeStock,
  loadStockScreener,
  saveStockScreener,
  normalizeItem,
  ValidationError,
  DEFAULT_SCREENER,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/stock-store.test.js`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add src/main/stock-store.js src/main/state-store.js tests/main/stock-store.test.js
git commit -m "feat(stocks): add stock-store (state.json 读写 stockWatchlist + stockScreener)"
```

---

## Task 6: register-stocks IPC(6 个 handler)

**Files:**
- Create: `src/main/ipc/register-stocks.js`
- Test: `tests/main/register-stocks.test.js`

> 注: 内存缓存(60s TTL)放 register-stocks 模块内,避免新建文件。

- [ ] **Step 1: Write the failing test**

```javascript
// tests/main/register-stocks.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ipcMain, ipcRenderer } from "./__mocks__/electron";
// 见 Step 4 说明: 用 happy-dom 跑渲染端, main IPC 用 in-process ipcMain mock.
// 这里测 register-stocks 注册的 handler 直接调用.

// 注册 handler 到一个内存 map, 测试直接 invoke
const handlers = {};
vi.mock("electron", () => ({
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
}));

import { registerStocksHandlers } from "../../src/main/ipc/register-stocks";
import { _setStatePathForTest } from "../../src/main/state-store";
import fs from "fs"; import path from "path"; import os from "os";

function freshState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-"));
  _setStatePathForTest(path.join(dir, "state.json"));
}

// mock httpClient + fetcher
vi.mock("../../src/stocks/stock-fetcher", () => ({
  fetchStocks: vi.fn(async () => ({
    rows: [
      { code: "600519", name: "贵州茅台", price: 1685, changePct: 1.2,
        turnover: 0.5, pe: 18, pb: 6.8, roe: 28, industry: "食品饮料", marketCap: 2e12 },
      { code: "600036", name: "招商银行", price: 35, changePct: -0.4,
        turnover: 1.2, pe: 5, pb: 0.9, roe: 17, industry: "银行", marketCap: 8e11 },
    ],
    total: 2, fetchedAt: 1700000000000,
  })),
}));
vi.mock("../../src/stocks/stock-search", () => ({
  searchStocks: vi.fn(async (q) => [
    { code: "600519", name: "贵州茅台", industry: "食品饮料" },
  ].filter((x) => x.code.includes(q) || x.name.includes(q))),
}));

describe("register-stocks IPC", () => {
  beforeEach(() => {
    freshState();
    for (const k of Object.keys(handlers)) delete handlers[k];
    registerStocksHandlers({ safeHandle: (ch, fn, o) => {
      // wrap like safeHandle but capture raw fn for test (errors propagate as threw)
      handlers[ch] = async (...args) => {
        try { return await fn(...args); }
        catch (e) { return { ok: false, reason: "threw", error: e.message }; }
      };
    }, threwResponse: (e) => ({ ok: false, error: e && e.message }) });
  });

  it("stocks:screen filters + sorts via applyScreen", async () => {
    const r = await handlers["stocks:screen"]({}, {
      criteria: { peMax: 20, marketCapTier: "all", industries: [] },
      sort: { key: "roe", dir: "desc" },
    });
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(2);
    expect(r.results[0].code).toBe("600519"); // roe 28 > 17
    expect(r.total).toBe(2);
    expect(r.fromCache).toBe(false);
  });

  it("stocks:screen 60s cache: second call hits cache", async () => {
    await handlers["stocks:screen"]({}, { criteria: { marketCapTier: "all", industries: [] }, sort: null });
    const r2 = await handlers["stocks:screen"]({}, { criteria: { marketCapTier: "all", industries: [] }, sort: null });
    expect(r2.fromCache).toBe(true);
  });

  it("stocks:search returns results", async () => {
    const r = await handlers["stocks:search"]({}, "600519");
    expect(r.ok).toBe(true);
    expect(r.results[0].code).toBe("600519");
  });

  it("stocks:watchlist:add then :list round-trip", async () => {
    const added = await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    expect(added.ok).toBe(true);
    expect(added.items).toHaveLength(1);
    const list = await handlers["stocks:watchlist:list"]();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].name).toBe("贵州茅台"); // 反查 name
  });

  it("stocks:watchlist:remove", async () => {
    await handlers["stocks:watchlist:add"]({}, { code: "600519" });
    const after = await handlers["stocks:watchlist:remove"]({}, { code: "600519" });
    expect(after.ok).toBe(true);
    expect(after.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-stocks.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/stocks/stock-search.js (stocks:search 用)**

```javascript
// src/stocks/stock-search.js
/**
 * src/stocks/stock-search.js
 *
 * 模糊搜个股 (加自选用). 走东财搜索建议接口.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function searchStocks(query, httpClient) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=15`;
  const r = await httpClient.get(url, { headers: { "User-Agent": UA }, timeout: 6000 });
  if (r.error || r.status !== 200 || !r.body) return [];
  try {
    const j = JSON.parse(r.body);
    const list = (j && j.QuotationCodeTable && j.QuotationCodeTable.Data) || [];
    return list
      .filter((x) => x && /^\d{6}$/.test(String(x.Code)))
      .map((x) => ({ code: String(x.Code), name: x.Name, industry: "" }));
  } catch {
    return [];
  }
}

module.exports = { searchStocks };
```

- [ ] **Step 4: Write minimal implementation of register-stocks.js**

```javascript
// src/main/ipc/register-stocks.js
/**
 * src/main/ipc/register-stocks.js
 *
 * 6 个股票筛选器 IPC handler. 对照 register-funds.js.
 * 内置 60s TTL 内存缓存 (避免短时连点重复打接口).
 */
const { HttpClient } = require("../http-client");
const { fetchStocks } = require("../../stocks/stock-fetcher");
const { searchStocks } = require("../../stocks/stock-search");
const { applyScreen } = require("../../stocks/stock-filter");
const stockStore = require("../stock-store");

const CACHE_TTL_MS = 60_000;
let _cache = null; // { key, rows, total, fetchedAt }

function criteriaKey(criteria, sort) {
  return JSON.stringify({ c: criteria || {}, s: sort || null });
}

function registerStocksHandlers(ctx) {
  const { safeHandle, threwResponse } = ctx;

  safeHandle(
    "stocks:screen",
    async (_event, { criteria, sort } = {}) => {
      const key = criteriaKey(criteria, sort);
      const now = Date.now();
      if (_cache && _cache.key === key && now - _cache.fetchedAt < CACHE_TTL_MS) {
        return {
          ok: true,
          results: applyScreen(_cache.rows, criteria, sort),
          total: _cache.total,
          fetchedAt: _cache.fetchedAt,
          fromCache: true,
        };
      }
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) return { ok: false, reason: "fetch_failed", error: out.error };
      _cache = { key, rows: out.rows, total: out.total, fetchedAt: out.fetchedAt };
      return {
        ok: true,
        results: applyScreen(out.rows, criteria, sort),
        total: out.total,
        fetchedAt: out.fetchedAt,
        fromCache: false,
      };
    },
    { onError: (err) => threwResponse(err, { results: [], total: 0 }) },
  );

  safeHandle(
    "stocks:search",
    async (_event, query) => {
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const results = await searchStocks(query, httpClient);
      return { ok: true, results };
    },
    { onError: (err) => threwResponse(err, { results: [] }) },
  );

  safeHandle("stocks:watchlist:list", () => {
    return { ok: true, items: stockStore.loadStockWatchlist() };
  });

  safeHandle(
    "stocks:watchlist:add",
    async (_event, { code } = {}) => {
      // 反查 name/industry
      const httpClient = new HttpClient({ timeout: 6000, maxRetries: 0 });
      const found = await searchStocks(String(code || ""), httpClient);
      const meta = found.find((x) => x.code === String(code).trim()) || {};
      const items = stockStore.addStock({
        code: String(code || "").trim(),
        name: meta.name || null,
        industry: meta.industry || null,
      });
      return { ok: true, items };
    },
    {
      logIf: (err) => !(err && err.name === "ValidationError"),
      onError: (err) => {
        if (err && err.name === "ValidationError") {
          return { ok: false, reason: "validation", error: err.message };
        }
        return threwResponse(err);
      },
    },
  );

  safeHandle("stocks:watchlist:remove", (_event, { code } = {}) => {
    const items = stockStore.removeStock(String(code || ""));
    return { ok: true, items };
  });

  // stocks:watchlist:quotes — 刷新自选股实时行情 (走同一 clist, filter 出自选 code)
  safeHandle(
    "stocks:watchlist:quotes",
    async () => {
      const items = stockStore.loadStockWatchlist();
      if (items.length === 0) return { ok: true, quotes: {}, fetchedAt: Date.now() };
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) return { ok: false, reason: "fetch_failed", error: out.error };
      const want = new Set(items.map((i) => i.code));
      const quotes = {};
      for (const row of out.rows) {
        if (want.has(row.code)) {
          quotes[row.code] = {
            price: row.price, changePct: row.changePct, pe: row.pe, roe: row.roe,
          };
        }
      }
      return { ok: true, quotes, fetchedAt: out.fetchedAt };
    },
    { onError: (err) => threwResponse(err, { quotes: {} }) },
  );
}

module.exports = { registerStocksHandlers };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/register-stocks.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/stocks/stock-search.js src/main/ipc/register-stocks.js tests/main/register-stocks.test.js
git commit -m "feat(stocks): add 6 IPC handlers (screen/search/watchlist) + 60s cache"
```

---

## Task 7: IPC + preload + api.js 接线

**Files:**
- Modify: `src/main/ipc/index.js`
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

- [ ] **Step 1: Register handler in ipc/index.js**

在 `registerConfigPortabilityHandlers` 之后(import 区 + 调用处)加。import 区加:

```javascript
const { registerStocksHandlers } = require("./register-stocks");
```

在 `registerConfigPortabilityHandlers({...});` 之后加:

```javascript
  registerStocksHandlers(ctx); // 股票筛选器 (选股分析阶段一)
```

- [ ] **Step 2: Add to preload.js**

在 `window.api` 对象末尾(最后一个属性后,`selfUpdateInstall` 之后)加:

```javascript
  // 选股分析 (阶段一): 筛选 + 搜索 + 自选股 + 行情推送
  stocksScreen: (payload) => ipcRenderer.invoke("stocks:screen", payload),
  stocksSearch: (query) => ipcRenderer.invoke("stocks:search", query),
  stocksWatchlistList: () => ipcRenderer.invoke("stocks:watchlist:list"),
  stocksWatchlistAdd: (payload) =>
    ipcRenderer.invoke("stocks:watchlist:add", payload),
  stocksWatchlistRemove: (payload) =>
    ipcRenderer.invoke("stocks:watchlist:remove", payload),
  stocksWatchlistQuotes: () => ipcRenderer.invoke("stocks:watchlist:quotes"),
  onStocksWatchlistQuotes: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("stocks:watchlist:quotes", handler);
    return () => ipcRenderer.removeListener("stocks:watchlist:quotes", handler);
  },
```

- [ ] **Step 3: Add to api.js createApi**

在 `createApi` 返回对象末尾加:

```javascript
    // 选股分析 (阶段一)
    stocksScreen: pick(overrides, "stocksScreen"),
    stocksSearch: pick(overrides, "stocksSearch"),
    stocksWatchlistList: pick(overrides, "stocksWatchlistList"),
    stocksWatchlistAdd: pick(overrides, "stocksWatchlistAdd"),
    stocksWatchlistRemove: pick(overrides, "stocksWatchlistRemove"),
    stocksWatchlistQuotes: pick(overrides, "stocksWatchlistQuotes"),
    onStocksWatchlistQuotes: pick(overrides, "onStocksWatchlistQuotes"),
```

- [ ] **Step 4: Verify build + no regressions**

Run: `npm run build:renderer`
Expected: builds without error

Run: `npm test -- --run`
Expected: all existing tests still pass (新模块的测试也绿)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/index.js preload.js src/renderer/api.js
git commit -m "feat(stocks): wire IPC registration + preload + renderer api bridge"
```

---

## Task 8: 渲染端 store(对照 fundStore)

**Files:**
- Create: `src/renderer/stocks/stockStore.js`

- [ ] **Step 1: Write the store**

```javascript
// src/renderer/stocks/stockStore.js
/**
 * 选股分析 renderer store — signals. 对照 fundStore.js.
 *
 * State:
 *   criteria: object            // 当前筛选条件
 *   activeStrategy: string      // 策略 id, "custom" = 自定义
 *   results: StockRow[]         // 筛选结果
 *   fetchedAt/loading/error     // 状态
 *   sortKey/sortDir             // 排序
 *   watchlist: StockWatchItem[] // 自选股
 *   watchlistQuotes: object     // 自选股行情 {code:{...}}
 *   advancedOpen: boolean       // 高级条件折叠
 */
import { signal, computed } from "@preact/signals";
import { taggedLog } from "../log.js";
import { STRATEGIES, buildCriteria, getStrategy } from "../../stocks/strategies";
import { DEFAULT_SCREENER_CRITERIA } from "../../stocks/stock-constants";

const log = taggedLog("[stocks]");

export const criteria = signal({ ...DEFAULT_SCREENER_CRITERIA });
export const activeStrategy = signal("value_roe");
export const results = signal([]);
export const fetchedAt = signal(null);
export const loading = signal(false);
export const error = signal(null);
export const sortKey = signal("roe");
export const sortDir = signal("desc");
export const watchlist = signal([]);
export const watchlistQuotes = signal({});
export const advancedOpen = signal(false);
export const addModalOpen = signal(false);

export const sortConfig = computed(() => ({ key: sortKey.value, dir: sortDir.value }));

/** 选中预设策略: 用 buildCriteria 填充条件区 */
export function applyStrategy(id) {
  const c = buildCriteria(id);
  if (!c) return;
  criteria.value = c;
  activeStrategy.value = id;
}

/** 手动改条件 → 切 custom (所有 chip 取消高亮) */
export function setCriteria(patch) {
  criteria.value = { ...criteria.value, ...patch };
  activeStrategy.value = "custom";
}

export function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}

export function toggleAdvanced() {
  advancedOpen.value = !advancedOpen.value;
}

export function openAddModal() { addModalOpen.value = true; }
export function closeAddModal() { addModalOpen.value = false; }

// ── async actions ──

export async function runScreen(api) {
  loading.value = true;
  error.value = null;
  try {
    const r = await api.stocksScreen({
      criteria: criteria.value,
      sort: sortConfig.value,
    });
    if (r && r.ok) {
      results.value = r.results || [];
      fetchedAt.value = r.fetchedAt;
    } else {
      error.value = (r && r.error) || "筛选失败";
      results.value = [];
    }
  } catch (e) {
    log.warn("runScreen failed:", e && e.message);
    error.value = e && e.message ? e.message : String(e);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

export async function loadWatchlist(api) {
  try {
    const r = await api.stocksWatchlistList();
    if (r && r.ok) watchlist.value = r.items || [];
  } catch (e) { log.warn("loadWatchlist failed:", e && e.message); }
}

export async function addWatchlist(api, code) {
  const r = await api.stocksWatchlistAdd({ code });
  if (r && r.ok) {
    watchlist.value = r.items || [];
    return { ok: true };
  }
  return { ok: false, error: r && r.error };
}

export async function removeWatchlist(api, code) {
  const r = await api.stocksWatchlistRemove({ code });
  if (r && r.ok) {
    watchlist.value = r.items || [];
  }
  return r;
}

export async function refreshWatchlistQuotes(api) {
  const r = await api.stocksWatchlistQuotes();
  if (r && r.ok) watchlistQuotes.value = r.quotes || {};
  return r;
}

/** 是否在自选 (表格 ⭐ 用) */
export function isInWatchlist(code) {
  return (watchlist.value || []).some((w) => w.code === code);
}

/** 订阅主进程自选股行情推送 (stockQuoteScheduler) */
export function subscribeWatchlistQuotes(api) {
  const off = api.onStocksWatchlistQuotes((payload) => {
    if (payload && payload.quotes) watchlistQuotes.value = payload.quotes;
  });
  return () => { try { off && off(); } catch { /* noop */ } };
}

export { STRATEGIES, getStrategy };
```

- [ ] **Step 2: Quick smoke (build only — UI 在 Task 9-10 接)**

Run: `npm run build:renderer`
Expected: builds without error (store 无 UI 依赖, 可编译)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stocks/stockStore.js
git commit -m "feat(stocks): add renderer signals store (对照 fundStore)"
```

---

## Task 9: 渲染端 UI 组件(StockLayout + StrategyBar + CriteriaPanel + ResultTable)

**Files:**
- Create: `src/renderer/stocks/StockLayout.jsx`
- Create: `src/renderer/stocks/StrategyBar.jsx`
- Create: `src/renderer/stocks/CriteriaPanel.jsx`
- Create: `src/renderer/stocks/ResultTable.jsx`

- [ ] **Step 1: Write StrategyBar.jsx**

```jsx
// src/renderer/stocks/StrategyBar.jsx
import { STRATEGIES, activeStrategy, applyStrategy } from "./stockStore.js";

export function StrategyBar() {
  const cur = activeStrategy.value;
  return (
    <div class="stock-strategy-bar">
      <span class="stock-strategy-label">策略</span>
      {STRATEGIES.map((s) => (
        <button
          key={s.id}
          type="button"
          class={`stock-strategy-chip${cur === s.id ? " active" : ""}`}
          onClick={() => applyStrategy(s.id)}
        >
          {s.label}
        </button>
      ))}
      <span class={`stock-strategy-chip stock-strategy-custom${cur === "custom" ? " active" : ""}`}>
        自定义
      </span>
    </div>
  );
}
export default StrategyBar;
```

- [ ] **Step 2: Write CriteriaPanel.jsx**

```jsx
// src/renderer/stocks/CriteriaPanel.jsx
import { criteria, setCriteria, advancedOpen, toggleAdvanced } from "./stockStore.js";
import { MARKET_CAP_TIERS } from "../../stocks/stock-constants";

function RangeInput({ label, minKey, maxKey, placeholder }) {
  const c = criteria.value;
  return (
    <div class="stock-criteria-field">
      <span class="stock-criteria-name">{label}</span>
      <input class="stock-criteria-input" type="number" inputMode="numeric"
        value={c[minKey] == null ? "" : c[minKey]}
        onInput={(e) => setCriteria({ [minKey]: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
        placeholder={placeholder || "—"} />
      <span class="stock-criteria-sep">~</span>
      <input class="stock-criteria-input" type="number" inputMode="numeric"
        value={c[maxKey] == null ? "" : c[maxKey]}
        onInput={(e) => setCriteria({ [maxKey]: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
        placeholder={placeholder || "—"} />
    </div>
  );
}

function MinInput({ label, minKey, suffix }) {
  const c = criteria.value;
  return (
    <div class="stock-criteria-field">
      <span class="stock-criteria-name">{label}</span>
      <span class="stock-criteria-sep">≥</span>
      <input class="stock-criteria-input" type="number" inputMode="numeric"
        value={c[minKey] == null ? "" : c[minKey]}
        onInput={(e) => setCriteria({ [minKey]: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
        placeholder="—" />
      {suffix && <span class="stock-criteria-suffix">{suffix}</span>}
    </div>
  );
}

export function CriteriaPanel() {
  const c = criteria.value;
  const adv = advancedOpen.value;
  return (
    <div class="stock-criteria-panel">
      <div class="stock-criteria-row">
        <RangeInput label="PE" minKey="peMin" maxKey="peMax" />
        <MinInput label="ROE" minKey="roeMin" suffix="%" />
        <div class="stock-criteria-field">
          <span class="stock-criteria-name">市值</span>
          <select class="stock-criteria-select"
            value={c.marketCapTier}
            onChange={(e) => setCriteria({ marketCapTier: e.currentTarget.value })}>
            {MARKET_CAP_TIERS.map((t) => <option key={t} value={t}>
              {t === "all" ? "全部" : t === "large" ? "大盘" : t === "mid" ? "中盘" : "小盘"}
            </option>)}
          </select>
        </div>
        <button type="button" class="stock-criteria-advanced-toggle" onClick={toggleAdvanced}>
          {adv ? "⚙ 收起" : "⚙ 高级"}
        </button>
      </div>
      {adv && (
        <div class="stock-criteria-row">
          <RangeInput label="PB" minKey="pbMin" maxKey="pbMax" />
          <MinInput label="股息率" minKey="dividendYieldMin" suffix="%" />
          <RangeInput label="换手率" minKey="turnoverMin" maxKey="turnoverMax" suffix="%" />
          <MinInput label="近5日" minKey="change5dMin" suffix="%" />
        </div>
      )}
    </div>
  );
}
export default CriteriaPanel;
```

- [ ] **Step 3: Write ResultTable.jsx**

```jsx
// src/renderer/stocks/ResultTable.jsx
import { results, loading, error, sortKey, sortDir, setSort, addWatchlist, removeWatchlist, isInWatchlist } from "./stockStore.js";
import { PanelEmpty } from "../components/EmptyState.jsx";

const COLUMNS = [
  { key: "name", label: "名称/代码", align: "left" },
  { key: "price", label: "现价", align: "right" },
  { key: "changePct", label: "涨跌%", align: "right", color: true },
  { key: "pe", label: "PE", align: "right" },
  { key: "roe", label: "ROE%", align: "right" },
  { key: "industry", label: "行业", align: "left" },
];

export function ResultTable({ api }) {
  const rows = results.value || [];
  const sk = sortKey.value;
  const sd = sortDir.value;
  const isLoading = loading.value;
  const err = error.value;

  function toggleStar(code) {
    if (isInWatchlist(code)) removeWatchlist(api, code);
    else addWatchlist(api, code);
  }

  if (err) {
    return <div class="stock-table-error">行情接口暂时不可用: {err}</div>;
  }
  if (!isLoading && rows.length === 0) {
    return (
      <PanelEmpty className="stock-empty-state">
        <div class="stock-empty-title">还没有结果</div>
        <div class="stock-empty-sub">选个策略或填条件, 点筛选</div>
      </PanelEmpty>
    );
  }

  return (
    <div class="stock-table">
      <div class="stock-table-head">
        {COLUMNS.map((col) => (
          <span
            key={col.key}
            class={`stock-th stock-th-${col.align}${sk === col.key ? " sorted" : ""}`}
            onClick={() => setSort(col.key)}
          >
            {col.label}{sk === col.key ? (sd === "desc" ? " ▼" : " ▲") : ""}
          </span>
        ))}
        <span class="stock-th stock-th-center">⭐</span>
      </div>
      {rows.map((r) => (
        <div key={r.code} class="stock-table-row">
          <span class="stock-td stock-td-name">
            <div class="stock-name">{r.name || r.code}</div>
            <div class="stock-code">{r.code}</div>
          </span>
          <span class="stock-td stock-td-right">{r.price != null ? r.price : "—"}</span>
          <span class={`stock-td stock-td-right ${r.changePct >= 0 ? "up" : "down"}`}>
            {r.changePct != null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct}%` : "—"}
          </span>
          <span class="stock-td stock-td-right">{r.pe != null ? r.pe : "—"}</span>
          <span class="stock-td stock-td-right">{r.roe != null ? r.roe : "—"}</span>
          <span class="stock-td stock-td-industry">{r.industry || "—"}</span>
          <span class="stock-td stock-td-center">
            <button type="button" class={`stock-star${isInWatchlist(r.code) ? " active" : ""}`}
              onClick={() => toggleStar(r.code)} aria-label="存自选">
              {isInWatchlist(r.code) ? "★" : "☆"}
            </button>
          </span>
        </div>
      ))}
      <div class="stock-table-foot">显示 {rows.length} 只{isLoading ? " · 加载中…" : ""}</div>
    </div>
  );
}
export default ResultTable;
```

- [ ] **Step 4: Write StockLayout.jsx**

```jsx
// src/renderer/stocks/StockLayout.jsx
/**
 * 选股 tab 容器 (对照 FundLayout).
 * mount: loadWatchlist + restore lastCriteria + subscribe quotes
 */
import { useEffect } from "preact/hooks";
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import {
  criteria, activeStrategy, sortKey, sortDir, runScreen, loadWatchlist,
  subscribeWatchlistQuotes, refreshWatchlistQuotes,
} from "./stockStore.js";
import { api } from "../api.js";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StockLayout() {
  useEffect(() => {
    void loadWatchlist(api);
    const unsub = subscribeWatchlistQuotes(api);
    void refreshWatchlistQuotes(api);
    return () => { try { unsub && unsub(); } catch { /* noop */ } };
  }, []);

  // fetchedAt 来自 store, 但这里用 runScreen 写; 为显示用 subscribe
  // 简化: 直接读 signal
  let fetchedAt = 0;
  return (
    <div class="stock-layout">
      <div class="stock-header">
        <div class="stock-header-left">
          <span class="stock-title">📈 选股</span>
          <span class="stock-market-tag">A股 · 沪深</span>
        </div>
        <div class="stock-header-right">
          <span class="stock-updated">更新于 {fmtTime(fetchedAt)}</span>
          <button type="button" class="stock-btn stock-btn-primary" onClick={() => runScreen(api)}>
            🔍 筛选
          </button>
        </div>
      </div>
      <StrategyBar />
      <CriteriaPanel />
      <ResultTable api={api} />
    </div>
  );
}
export default StockLayout;
```

> 修正: `fetchedAt` 应从 store 读 signal。把上面 `let fetchedAt = 0` 改为从 import 拿:
> `import { ..., fetchedAt as fetchedAtSig } from "./stockStore.js";` 然后在函数体里 `const fetchedAt = fetchedAtSig.value;`
> 并在 import 列表加 `fetchedAt`。实现时按此修正。

- [ ] **Step 5: Build to verify compilation**

Run: `npm run build:renderer`
Expected: builds without error

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stocks/StockLayout.jsx src/renderer/stocks/StrategyBar.jsx src/renderer/stocks/CriteriaPanel.jsx src/renderer/stocks/ResultTable.jsx
git commit -m "feat(stocks): add screener UI (StrategyBar + CriteriaPanel + ResultTable + Layout)"
```

---

## Task 10: 自选股 tab + 加自选 Modal

**Files:**
- Create: `src/renderer/stocks/WatchlistPanel.jsx`
- Create: `src/renderer/stocks/AddStockModal.jsx`

- [ ] **Step 1: Write AddStockModal.jsx**

```jsx
// src/renderer/stocks/AddStockModal.jsx
import { useState, useEffect, useRef } from "preact/hooks";
import { closeAddModal, addWatchlist, openAddModal } from "./stockStore.js";
import { api } from "../api.js";
import { BareModalShell } from "../components/ModalShell.jsx";

export function AddStockModal() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);
  const lastRef = useRef("");

  useEffect(() => {
    const code = query.trim();
    if (code.length < 2) { setResults([]); setError(null); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastRef.current = code;
      setSearching(true); setError(null);
      try {
        const r = await api.stocksSearch(code);
        if (lastRef.current !== code) return;
        setResults(r && r.ok ? r.results : []);
      } catch (e) {
        setError(e && e.message ? e.message : String(e));
        setResults([]);
      } finally {
        if (lastRef.current === code) setSearching(false);
      }
    }, 250);
  }, [query]);

  async function handlePick(code, name) {
    setSubmitting(true);
    const r = await addWatchlist(api, code);
    setSubmitting(false);
    if (r && r.ok) closeAddModal();
  }

  return (
    <BareModalShell open onClose={closeAddModal} usePortal ariaLabel="添加自选股"
      overlayClass="stock-modal-overlay" cardClass="stock-modal">
      <div class="stock-modal-header">
        <span class="stock-modal-title">添加自选股</span>
        <button type="button" class="stock-modal-close" onClick={closeAddModal}>×</button>
      </div>
      <div class="stock-modal-body">
        <input class="stock-modal-input" type="text"
          value={query} onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="输入代码或名称 (如 600519 / 茅台)" autoComplete="off" autoFocus />
        {searching && <div class="stock-modal-hint">搜索中…</div>}
        {error && <div class="stock-modal-error">{error}</div>}
        {!searching && !error && results.length === 0 && query.trim().length >= 2 && (
          <div class="stock-modal-hint">没找到匹配股票</div>
        )}
        {results.length > 0 && (
          <ul class="stock-search-list">
            {results.map((r) => (
              <li key={r.code} class="stock-search-item" onClick={() => handlePick(r.code, r.name)}>
                <span class="stock-search-code">{r.code}</span>
                <span class="stock-search-name">{r.name}</span>
                {r.industry && <span class="stock-search-industry">{r.industry}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BareModalShell>
  );
}
export default AddStockModal;
```

- [ ] **Step 2: Write WatchlistPanel.jsx**

```jsx
// src/renderer/stocks/WatchlistPanel.jsx
import { useEffect } from "preact/hooks";
import { watchlist, watchlistQuotes, removeWatchlist, openAddModal, refreshWatchlistQuotes, addModalOpen } from "./stockStore.js";
import { AddStockModal } from "./AddStockModal.jsx";
import { PanelEmpty } from "../components/EmptyState.jsx";
import { api } from "../api.js";

export function WatchlistPanel() {
  const items = watchlist.value || [];
  const quotes = watchlistQuotes.value || {};

  useEffect(() => {
    void refreshWatchlistQuotes(api);
  }, []);

  if (items.length === 0) {
    return (
      <div class="stock-layout">
        <PanelEmpty className="stock-empty-state">
          <div class="stock-empty-title">还没有自选股</div>
          <div class="stock-empty-sub">搜索代码或名称, 添加关注</div>
          <button type="button" class="stock-btn stock-btn-primary stock-btn-lg" onClick={() => openAddModal()}>
            + 添加第一只
          </button>
        </PanelEmpty>
        {addModalOpen.value && <AddStockModal />}
      </div>
    );
  }

  return (
    <div class="stock-layout">
      <div class="stock-header">
        <div class="stock-header-left">
          <span class="stock-title">⭐ 自选股</span>
          <span class="stock-market-tag">{items.length} 只</span>
        </div>
        <div class="stock-header-right">
          <button type="button" class="stock-btn" onClick={() => refreshWatchlistQuotes(api)}>🔄 刷新</button>
          <button type="button" class="stock-btn stock-btn-primary" onClick={() => openAddModal()}>+ 添加</button>
        </div>
      </div>
      <div class="stock-watchlist">
        {items.map((w) => {
          const q = quotes[w.code] || {};
          return (
            <div key={w.code} class="stock-wl-row">
              <div class="stock-wl-info">
                <div class="stock-name">{w.name || w.code}</div>
                <div class="stock-code">{w.code}{w.industry ? ` · ${w.industry}` : ""}</div>
              </div>
              <div class="stock-wl-quote">
                <span class="stock-wl-price">{q.price != null ? q.price : "—"}</span>
                {q.changePct != null && (
                  <span class={`stock-wl-chg ${q.changePct >= 0 ? "up" : "down"}`}>
                    {q.changePct >= 0 ? "+" : ""}{q.changePct}%
                  </span>
                )}
              </div>
              <button type="button" class="stock-wl-remove" onClick={() => removeWatchlist(api, w.code)}>✕</button>
            </div>
          );
        })}
      </div>
      {addModalOpen.value && <AddStockModal />}
    </div>
  );
}
export default WatchlistPanel;
```

- [ ] **Step 3: Build to verify**

Run: `npm run build:renderer`
Expected: builds without error

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stocks/WatchlistPanel.jsx src/renderer/stocks/AddStockModal.jsx
git commit -m "feat(stocks): add watchlist panel + add-stock modal"
```

---

## Task 11: SideNav + LazyNavPanel 接线 + CSS

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `src/renderer/components/LazyNavPanel.jsx`
- Modify: `styles.css`

- [ ] **Step 1: SideNav.jsx — add 2 nav items**

在 `NAV_ITEMS` 数组里,`metals` 之后、`ai-usage` 之前加两项:

```javascript
  { key: 'stocks',     label: '选股', tooltip: 'A股条件选股筛选器 (阶段一)' },
  { key: 'stock-watchlist', label: '自选股', tooltip: '股票自选列表 + 行情刷新' },
```

(放在 funds/metals 这组金融栏目附近,符合语义聚合)

- [ ] **Step 2: LazyNavPanel.jsx — add 2 loaders**

在 `LOADERS` 对象里加:

```javascript
  stocks: () => import("../stocks/StockLayout.jsx").then((m) => m.StockLayout),
  "stock-watchlist": () => import("../stocks/WatchlistPanel.jsx").then((m) => m.WatchlistPanel),
```

- [ ] **Step 3: Add CSS to styles.css**

在文件末尾追加(对照现有 `.fund-*` 风格):

```css
/* ── 选股分析 (阶段一) ── */
.stock-layout { display:flex; flex-direction:column; height:100%; padding:12px; gap:8px; }
.stock-header { display:flex; align-items:center; justify-content:space-between; }
.stock-header-left { display:flex; align-items:center; gap:8px; }
.stock-title { font-size:18px; font-weight:600; color:var(--text-primary,#e5e5e7); }
.stock-market-tag { font-size:11px; color:var(--text-secondary,#8e8e93); background:var(--surface-2,#2c2c2e); padding:2px 8px; border-radius:8px; }
.stock-header-right { display:flex; align-items:center; gap:8px; }
.stock-updated { font-size:11px; color:var(--text-secondary,#8e8e93); }
.stock-btn { background:var(--surface-2,#2c2c2e); color:var(--text-primary,#e5e5e7); border:1px solid var(--border,#3a3a3c); padding:5px 12px; border-radius:6px; font-size:12px; cursor:pointer; }
.stock-btn-primary { background:#0a84ff; color:#fff; border:none; font-weight:600; }
.stock-btn-lg { padding:10px 20px; font-size:14px; margin-top:8px; }

.stock-strategy-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 0; }
.stock-strategy-label { font-size:11px; color:var(--text-secondary,#636366); width:36px; }
.stock-strategy-chip { background:var(--surface-2,#2c2c2e); border:1px solid var(--border,#3a3a3c); color:var(--text-primary,#e5e5e7); padding:4px 10px; border-radius:11px; font-size:11px; cursor:pointer; }
.stock-strategy-chip.active { background:#0a84ff; color:#fff; border-color:#0a84ff; }
.stock-strategy-custom { border-style:dashed; }

.stock-criteria-panel { padding:8px 0; border-top:1px solid var(--border,#2c2c2e); border-bottom:1px solid var(--border,#2c2c2e); }
.stock-criteria-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:6px 0; }
.stock-criteria-field { display:flex; align-items:center; gap:5px; }
.stock-criteria-name { font-size:12px; color:var(--text-secondary,#8e8e93); }
.stock-criteria-input { background:var(--surface-2,#2c2c2e); border:1px solid var(--border,#3a3a3c); color:var(--text-primary,#e5e5e7); width:48px; padding:4px 6px; border-radius:5px; font-size:12px; text-align:center; }
.stock-criteria-select { background:var(--surface-2,#2c2c2e); border:1px solid var(--border,#3a3a3c); color:var(--text-primary,#e5e5e7); padding:4px 6px; border-radius:5px; font-size:12px; }
.stock-criteria-sep { color:var(--text-tertiary,#636366); font-size:11px; }
.stock-criteria-suffix { color:var(--text-tertiary,#636366); font-size:11px; }
.stock-criteria-advanced-toggle { font-size:11px; color:#0a84ff; background:none; border:none; cursor:pointer; margin-left:auto; }

.stock-table { flex:1; overflow-y:auto; }
.stock-table-head, .stock-table-row { display:grid; grid-template-columns:1.4fr 0.8fr 0.7fr 0.6fr 0.6fr 1fr 36px; align-items:center; padding:8px 6px; }
.stock-table-head { font-size:11px; color:var(--text-secondary,#8e8e93); font-weight:600; border-bottom:1px solid var(--border,#2c2c2e); position:sticky; top:0; background:var(--surface,#1c1c1e); z-index:1; }
.stock-th { cursor:pointer; }
.stock-th-right { text-align:right; } .stock-th-left { text-align:left; } .stock-th-center { text-align:center; }
.stock-th.sorted { color:#0a84ff; }
.stock-table-row { font-size:12px; border-bottom:1px solid var(--border,#2c2c2e); }
.stock-td-right { text-align:right; } .stock-td-center { text-align:center; }
.stock-td-name .stock-name { font-weight:500; } .stock-td-name .stock-code { color:var(--text-tertiary,#636366); font-size:11px; }
.stock-td.up, .stock-wl-chg.up { color:#34c759; } .stock-td.down, .stock-wl-chg.down { color:#ff453a; }
.stock-star { background:none; border:none; font-size:16px; color:var(--text-tertiary,#3a3a3c); cursor:pointer; }
.stock-star.active { color:#ffd60a; }
.stock-table-foot, .stock-table-error { padding:10px 6px; font-size:11px; color:var(--text-tertiary,#636366); }
.stock-table-error { color:#ff453a; }
.stock-empty-state { text-align:center; padding:40px 20px; }
.stock-empty-title { font-size:15px; font-weight:500; margin-bottom:4px; }
.stock-empty-sub { font-size:12px; color:var(--text-secondary,#8e8e93); }

.stock-watchlist { display:flex; flex-direction:column; gap:6px; }
.stock-wl-row { display:flex; align-items:center; gap:12px; padding:10px 6px; border-bottom:1px solid var(--border,#2c2c2e); }
.stock-wl-info { flex:1; } .stock-wl-info .stock-name { font-weight:500; } .stock-wl-info .stock-code { color:var(--text-tertiary,#636366); font-size:11px; }
.stock-wl-quote { text-align:right; } .stock-wl-price { font-size:14px; font-weight:600; display:block; }
.stock-wl-remove { background:none; border:none; color:var(--text-tertiary,#636366); cursor:pointer; font-size:14px; }

.stock-modal { max-width:420px; }
.stock-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid var(--border,#2c2c2e); }
.stock-modal-title { font-size:15px; font-weight:600; }
.stock-modal-close { background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-secondary,#8e8e93); }
.stock-modal-body { padding:14px 16px; }
.stock-modal-input { width:100%; background:var(--surface-2,#2c2c2e); border:1px solid var(--border,#3a3a3c); color:var(--text-primary,#e5e5e7); padding:8px 10px; border-radius:6px; font-size:13px; }
.stock-search-list { list-style:none; margin:10px 0 0; padding:0; max-height:300px; overflow-y:auto; }
.stock-search-item { display:flex; gap:10px; padding:8px 6px; border-radius:5px; cursor:pointer; }
.stock-search-item:hover { background:var(--surface-2,#2c2c2e); }
.stock-search-code { font-family:monospace; color:var(--text-secondary,#8e8e93); } .stock-search-name { flex:1; }
.stock-search-industry { font-size:11px; color:var(--text-tertiary,#636366); }
.stock-modal-hint, .stock-modal-error { font-size:12px; padding:8px 0; color:var(--text-secondary,#8e8e93); }
.stock-modal-error { color:#ff453a; }
```

- [ ] **Step 4: Build + verify**

Run: `npm run build:renderer`
Expected: builds without error

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SideNav.jsx src/renderer/components/LazyNavPanel.jsx styles.css
git commit -m "feat(stocks): wire SideNav tabs + LazyNavPanel loaders + CSS"
```

---

## Task 12: stockQuoteScheduler(后台行情刷新)

**Files:**
- Create: `src/main/stocks-scheduler.js`
- Modify: `src/main/ipc/index.js` — 注入 scheduler 到 ctx

> spec §5.3: 盘中 9:30-15:00 工作日,每 N 分钟推 `stocks:watchlist:quotes`。独立实例,不复用 fundScheduler。

- [ ] **Step 1: Write the scheduler**

```javascript
// src/main/stocks-scheduler.js
/**
 * src/main/stocks-scheduler.js
 *
 * 自选股行情后台刷新 scheduler. 对照 spec §5.3.
 * 盘中 (9:30-15:00 工作日) 每 quoteRefreshMinutes 分钟拉一次自选股行情,
 * 推送 stocks:watchlist:quotes 到渲染端. 非盘中休眠.
 * 独立实例, 不复用 fundScheduler.
 */
const { HttpClient } = require("./http-client");
const { fetchStocks } = require("../stocks/stock-fetcher");
const stockStore = require("./stock-store");

function isTradingHours(now = new Date()) {
  // 0=周日 6=周六
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  return mins >= 570 && mins <= 900; // 9:30 - 15:00
}

class StockQuoteScheduler {
  constructor({ sendToRenderer, intervalMs = 5 * 60 * 1000 } = {}) {
    this._send = sendToRenderer || (() => {});
    this._intervalMs = intervalMs;
    this._timer = null;
    this._running = false;
  }
  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), this._intervalMs);
    // 启动后立即跑一次 (但只在盘中)
    this._tick();
  }
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  async _tick() {
    if (this._running) return;
    if (!isTradingHours()) return;
    this._running = true;
    try {
      const items = stockStore.loadStockWatchlist();
      if (items.length === 0) return;
      const httpClient = new HttpClient({ timeout: 8000, maxRetries: 0 });
      const out = await fetchStocks(httpClient);
      if (out.error) return;
      const want = new Set(items.map((i) => i.code));
      const quotes = {};
      for (const row of out.rows) {
        if (want.has(row.code)) {
          quotes[row.code] = { price: row.price, changePct: row.changePct, pe: row.pe, roe: row.roe };
        }
      }
      this._send("stocks:watchlist:quotes", { quotes, fetchedAt: out.fetchedAt });
    } catch {
      /* noop — 不阻断 */
    } finally {
      this._running = false;
    }
  }
}

module.exports = { StockQuoteScheduler, isTradingHours };
```

- [ ] **Step 2: Write test**

```javascript
// tests/main/stocks-scheduler.test.js
import { describe, it, expect } from "vitest";
import { isTradingHours } from "../../src/main/stocks-scheduler";

describe("isTradingHours", () => {
  it("true on weekday during trading", () => {
    // 周三 10:30
    const wed = new Date(2026, 5, 24, 10, 30); // 2026-06-24 是周三
    expect(isTradingHours(wed)).toBe(true);
  });
  it("false on weekend", () => {
    const sat = new Date(2026, 5, 27, 10, 30); // 周六
    expect(isTradingHours(sat)).toBe(false);
  });
  it("false before 9:30", () => {
    const early = new Date(2026, 5, 24, 9, 0); // 周三早
    expect(isTradingHours(early)).toBe(false);
  });
  it("false after 15:00", () => {
    const late = new Date(2026, 5, 24, 16, 0);
    expect(isTradingHours(late)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/main/stocks-scheduler.test.js`
Expected: PASS (4 tests)

- [ ] **Step 4: Wire scheduler into bootstrap**

找到 `src/main/index.js`(或 bootstrap)里 `getFundScheduler` / scheduler 启动的地方,在 fund scheduler 启动后加(参照同款注入):

```javascript
const { StockQuoteScheduler } = require("./stocks-scheduler");
let stockQuoteScheduler = null;
function getStockQuoteScheduler() { return stockQuoteScheduler; }
// app ready 后:
stockQuoteScheduler = new StockQuoteScheduler({
  sendToRenderer: sendToRenderer, // 跟 fundScheduler 同一个 sendToRenderer
});
stockQuoteScheduler.start();
```

并把 `getStockQuoteScheduler` 注入 `registerIpcHandlers` 的 deps(可选——scheduler 主动推,IPC 不一定需要它;若 register-stocks 不调 scheduler 则这步只为启动)。

- [ ] **Step 5: Commit**

```bash
git add src/main/stocks-scheduler.js tests/main/stocks-scheduler.test.js src/main/index.js
git commit -m "feat(stocks): add StockQuoteScheduler (盘中定时推送自选股行情)"
```

---

## Task 13: 收尾(全量测试 + smoke + release notes)

**Files:**
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: ALL tests pass (现有 + 新增 stocks)

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`
验证清单:
- [ ] SideNav 出现"📈 选股" + "⭐自选股"两个 tab
- [ ] 点选股 tab → 策略 chip(低估值高ROE 高亮)+ 条件区 + 空结果
- [ ] 点"🔍 筛选" → 表格出结果,列头可排序
- [ ] 点 ⭐ → 存入自选股(星变实);切自选股 tab 能看到
- [ ] 自选股 tab 点"+ 添加" → 搜"600519" → 选 → 列表出现
- [ ] 自选股 tab 点"✕" → 删除
- [ ] 改条件 → 策略 chip 全部取消高亮(切 custom)
- [ ] 重启 app → 自选股 + 上次条件仍在(state.json 持久化)

- [ ] **Step 3: Add release notes**

在 `RELEASE-NOTES.md` 顶部加版本段(参照现有格式):

```markdown
## vX.Y.Z

### 新增
- **📈 选股分析(阶段一)** — A 股条件选股筛选器:
  - 4 个内置策略(低估值高ROE / 蓝筹白马 / 高股息 / 成长动量),一键填条件
  - 估值(PE/PB/ROE/股息率)+ 行情(涨跌/换手)+ 行业 + 市值 4 类筛选
  - 结果表格可排序,⭐ 存入自选股
  - 自选股 tab + 后台盘中行情刷新(独立 scheduler)
  - 数据源:东财接口(纯 JS,无新依赖)
```

并 bump `package.json` version。

- [ ] **Step 4: Final commit**

```bash
git add RELEASE-NOTES.md package.json
git commit -m "chore(release): 选股分析阶段一 release notes + version bump"
```

---

## Self-Review Checklist(执行前自查)

- [ ] spec §3.1 数据模型 → Task 5(stock-store)
- [ ] spec §3.2 内置策略 → Task 3(strategies)
- [ ] spec §3.3 自选股 → Task 5 + Task 10
- [ ] spec §4 IPC 6 个 → Task 6
- [ ] spec §5.1 文件结构 → 所有 Task
- [ ] spec §5.2 数据源字段映射 → Task 1 + Task 4
- [ ] spec §5.3 抓取时机 → Task 6(手动)+ Task 12(后台)
- [ ] spec §5.4 错误处理 → Task 4(fetcher)+ Task 6(cache/onError)
- [ ] spec §6 UI 组件 → Task 8/9/10/11
- [ ] spec §7 测试 → 每个 Task 都有测试
- [ ] spec §8 验收 → Task 13 smoke 清单覆盖
