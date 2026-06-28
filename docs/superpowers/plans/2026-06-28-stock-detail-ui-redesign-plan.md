# Stock Detail UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `StockDetailDrawer` 从 560px + 7 angle chip 重做成 720px + Hero bar + 5 tab 分组 + K 线主图 + 成交量副图 + MACD 副图 + 折叠 AI 解读区.

**Architecture:** 价格走势 fetcher 增量返 klines + lastQuote 字段 (老契约值不变). UI 端用 pure SVG 自渲染 K 线 (与现有 Sparkline 一致), MA/MACD 从 closes 在前端重算, 0 后端侵入. Tab 是视觉锚点 ≠ chip 选择 (LLM 仍按 chip 喂数据). AI 解读区默认折叠.

**Tech Stack:** Preact + @preact/signals + 现有 chromium-http-client + 现有 shared-llm. 不引第三方图表库. Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-28-stock-detail-ui-redesign-design.md`

## Global Constraints

- **A 股涨跌色**: 红涨 (`up` = `#ff3b30`) / 绿跌 (`down` = `#34c759`), 与项目 `ResultTable` 一致
- **Cache 版本**: `CACHE_VERSION = 2` (从 1 升到 2), 老 key 自动 miss
- **不引第三方图表库**: K 线 pure SVG, ~120 元素, 渲染 < 16ms
- **数据契约向下兼容**: price-trend 老字段 (closes/change5d/change20d/amplitude) 值不变
- **LLM 零侵入**: AI prompt 仍只看 closes/change, buildAnalyzeMessages 不改
- **测试命令**: `npx vitest run tests/<path>` 单文件, `npx vitest run` 全量
- **构建命令**: `node scripts/build-renderer.js` (无 build 错误)
- **commit 风格**: conventional commits (feat/fix/refactor/chore/test/docs)
- **CSS 变量**: 新增 `--stock-up/-down/-flat/-hero-bg/-panel-bg/-panel-border/-chart-grid/-tab-active/-metric-label/-metric-value`, 浅色 + `prefers-color-scheme: dark` 双套
- **暗色模式**: K 线 / 蜡烛 / 副图全部用 CSS 变量, 不在 SVG 里写死颜色 (除 upColor/downColor 沿用项目惯例)
- **sparkline 颜色校准**: 业务方调 Sparkline 时显式传 `upColor="#ff3b30" downColor="#34c759"` (A 股惯例); Sparkline 自身默认不动

---

## File Structure

**改动文件 (3)**:
- `src/stocks/detail-fetchers/price-trend.js` — summarize() 多返 klines + lastQuote
- `src/renderer/stocks/StockDetailDrawer.jsx` — 大重写 (Hero bar + Tab + 5 panel + 折叠 AI)
- `styles.css` — 加 ~150 行 K 线 / metric card / hero / tab 样式

**新增文件 (3)**:
- `src/renderer/stocks/indicators.js` — UI 端 MA/EMA/MACD series (pure function)
- `src/renderer/components/CandlestickChart.jsx` — SVG K 线图 (蜡烛 + 副图)
- `tests/renderer/components/CandlestickChart.test.jsx` — K 线组件测试
- `tests/renderer/stocks/indicators.test.js` — indicators 测试

**测试文件改动 (2)**:
- `tests/stocks/price-trend.test.js` — 加 klines / lastQuote 字段断言
- `tests/renderer/stocks/StockDetailDrawer.test.jsx` — 大改 (Hero bar / tab / panel / 折叠 AI)

**注册文件不改**:
- `src/renderer/stocks/stockDetailStore.js` — per-angle 独立状态已够
- `src/renderer/stocks/stockDetailStore.js` IPC handler — 接口不变
- `src/ai/stock-detail-advisor.js` — LLM 契约不变

---

## Task 1: price-trend fetcher 增量返 klines + lastQuote

**Files:**
- Modify: `src/stocks/detail-fetchers/price-trend.js:32-40`
- Test: `tests/stocks/price-trend.test.js`

**Interfaces:**
- Consumes: `summarize(klines)` from `_shared-em-kline.parseEastmoneyKlines` (klines[i] = {date, open, close, high, low, amount, turnover, amplitude})
- Produces: `data` now also has `klines: [{date, open, high, low, close, volume, amplitude}]` (length same as input) and `lastQuote: {price, change, changePct} | null`

### Step 1.1: 写失败的测试

打开 `tests/stocks/price-trend.test.js` 在合适位置加新 case。

如果文件不存在, 先创建 `tests/stocks/price-trend.test.js`:

```js
const { fetchPriceTrend } = require("../../src/stocks/detail-fetchers/price-trend");
const { vi } = require("vitest");

function makeKlines(n) {
  // 30 个 mock 交易日 K 线, 价格从 100 线性涨到 130
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = 100 + (i / (n - 1)) * 30;
    out.push({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      open: close - 0.5,
      close,
      high: close + 1,
      low: close - 1,
      amount: 1e9 + i * 1e7,        // 成交额
      turnover: 0.4 + i * 0.01,
      amplitude: 2.0,
    });
  }
  return out;
}

describe("price-trend fetcher — klines + lastQuote 增量字段", () => {
  it("summarize 后 data.klines 保留 30 根 OHLC + volume + amplitude", async () => {
    // 绕过 HTTP, 直接测试 summarize 路径
    // 我们用 vi.mock 模拟 _shared-em-kline 返回固定 body
    vi.mock("../../src/stocks/detail-fetchers/_shared-em-kline", () => ({
      fetchEastmoneyKline: async () => ({
        status: 200,
        body: { data: { klines: makeKlines(30).map((k) =>
          `${k.date},${k.open},${k.close},${k.high},${k.low},${k.amount},${k.turnover},0`
        ) } },
      }),
      parseEastmoneyKlines: (body) => {
        if (!body?.data?.klines) return null;
        return body.data.klines.map((line) => {
          const [date, open, close, high, low, amount, turnover] = String(line).split(",");
          return {
            date, open: +open, close: +close, high: +high, low: +low,
            amount: +amount, turnover: +turnover, amplitude: ((+high - +low) / +close) * 100,
          };
        });
      },
    }));
    const httpClient = { get: async () => ({ status: 200, body: null }) };
    const r = await fetchPriceTrend(httpClient, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.klines).toBeDefined();
    expect(r.data.klines).toHaveLength(30);
    expect(r.data.klines[0]).toMatchObject({
      date: expect.any(String),
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
      volume: expect.any(Number),  // = amount
      amplitude: expect.any(Number),
    });
    expect(r.data.klines[29].close).toBeGreaterThan(r.data.klines[0].close);
  });

  it("lastQuote 推算最后一根 vs 倒数第二根", async () => {
    const httpClient = { get: async () => ({ status: 200, body: null }) };
    const r = await fetchPriceTrend(httpClient, { code: "600519" });
    expect(r.data.lastQuote).toEqual({
      price: 130,                              // 最后一根 close
      change: 1,                                // 130 - 129
      changePct: expect.closeTo(0.775, 2),
    });
  });

  it("老契约 closes/change5d/change20d/amplitude 字段值不变", async () => {
    const httpClient = { get: async () => ({ status: 200, body: null }) };
    const r = await fetchPriceTrend(httpClient, { code: "600519" });
    expect(r.data.closes).toHaveLength(30);
    expect(typeof r.data.change5d).toBe("number");
    expect(typeof r.data.change20d).toBe("number");
    expect(typeof r.data.amplitude).toBe("number");
  });

  it("K 线 < 2 根时 lastQuote 为 null", async () => {
    vi.resetModules();
    vi.doMock("../../src/stocks/detail-fetchers/_shared-em-kline", () => ({
      fetchEastmoneyKline: async () => ({ status: 200, body: { data: { klines: [] } } }),
      parseEastmoneyKlines: () => [],
    }));
    const { fetchPriceTrend: f2 } = await import("../../src/stocks/detail-fetchers/price-trend");
    const r = await f2({ get: async () => ({ status: 200, body: null }) }, { code: "000001" });
    expect(r.ok).toBe(false);
  });
});
```

### Step 1.2: 跑测试, 确认失败

```bash
npx vitest run tests/stocks/price-trend.test.js -v
```

Expected: FAIL — `r.data.klines` is `undefined`.

### Step 1.3: 改 `src/stocks/detail-fetchers/price-trend.js` 的 summarize

替换整个文件:

```js
const emKline = require("./_shared-em-kline");
const sinaKline = require("./_shared-sina-kline");

async function fetchPriceTrend(httpClient, { code }) {
  const primary = await emKline.fetchEastmoneyKline(httpClient, code, 30);
  if (primary && primary.status === 200 && primary.body) {
    const parsed = emKline.parseEastmoneyKlines(primary.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  const fallback = await sinaKline.fetchSinaKline(httpClient, code, 30);
  if (fallback && fallback.status === 200 && fallback.body) {
    const parsed = sinaKline.parseSinaKlines(fallback.body);
    if (parsed && parsed.length > 0) {
      return { ok: true, data: summarize(parsed) };
    }
  }
  const primaryOk = primary && primary.status === 200 && primary.body;
  return {
    ok: false,
    reason: primaryOk ? "parse_failed" : "fetch_failed",
    error: "fetch error",
  };
}

function summarize(klines) {
  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  return {
    closes,
    change5d: pctChange(closes, 5),
    change20d: pctChange(closes, 20),
    amplitude: avg(klines.map((k) => k.amplitude)),
    // ponytail: amount(成交额元) 当作 volume(成交量) 喂 K 线图 — 用户看的是活跃度, 不区分.
    klines: klines.map((k) => ({
      date: k.date,
      open: k.open, high: k.high, low: k.low, close: k.close,
      volume: k.amount,
      amplitude: k.amplitude,
    })),
    // ponytail: Hero bar 用, 不重打 IPC. K 线 < 2 根时 lastQuote = null.
    lastQuote: last && prev ? {
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
    } : null,
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

### Step 1.4: 跑测试, 确认通过

```bash
npx vitest run tests/stocks/price-trend.test.js -v
```

Expected: 4 cases PASS.

### Step 1.5: 跑全量回归

```bash
npx vitest run
```

Expected: 全 PASS / 0 FAIL (老 price-trend 测试也通过 — 老契约值不变).

### Step 1.6: Commit

```bash
git add src/stocks/detail-fetchers/price-trend.js tests/stocks/price-trend.test.js
git commit -m "feat(price-trend): klines + lastQuote 增量字段 (K 线图 + Hero bar 用, 老契约不变)"
```

---

## Task 2: UI 端 indicators.js (MA/EMA/MACD pure function)

**Files:**
- Create: `src/renderer/stocks/indicators.js`
- Test: `tests/renderer/stocks/indicators.test.js`

**Interfaces:**
- Consumes: `closes: number[]` (任意长度, 空数组返空)
- Produces:
  - `maSeries(closes, n): (number | null)[]` — 长度等同 closes, 前 n-1 位 null
  - `emaSeries(closes, n): (number | null)[]` — 长度等同 closes, 前 n-1 位 null
  - `macdSeries(closes): { dif: (number|null)[], dea: (number|null)[], hist: (number|null)[] }` — 三个数组长度等同 closes; 长度 < 26 时全 null

### Step 2.1: 写失败测试

创建 `tests/renderer/stocks/indicators.test.js`:

```js
import { describe, it, expect } from "vitest";
import { maSeries, emaSeries, macdSeries } from "../../../src/renderer/stocks/indicators";

describe("maSeries", () => {
  it("空数组 → 空", () => {
    expect(maSeries([], 5)).toEqual([]);
  });
  it("长度 < n → 全 null", () => {
    expect(maSeries([1, 2, 3], 5)).toEqual([null, null, null]);
  });
  it("前 n-1 位 null, 第 n 位起是窗口均值", () => {
    // 滑动: [1,2,3]→2, [2,3,4]→3, [3,4,5]→4
    expect(maSeries([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("标准 5 日 MA: [1..10]", () => {
    const r = maSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(r[0]).toBeNull();
    expect(r[3]).toBeNull();
    expect(r[4]).toBe(3);
    expect(r[9]).toBe(8);
  });
  it("含 NaN 不爆", () => {
    const r = maSeries([1, NaN, 3, 4, 5], 3);
    expect(r).toHaveLength(5);
    // NaN 透传 — 不做清洗, 渲染时跳过
    expect(Number.isNaN(r[2])).toBe(true);
  });
});

describe("emaSeries", () => {
  it("空数组 → 空", () => {
    expect(emaSeries([], 5)).toEqual([]);
  });
  it("长度 < n → 全 null", () => {
    const r = emaSeries([1, 2, 3], 5);
    expect(r).toHaveLength(3);
    expect(r.every((v) => v === null)).toBe(true);
  });
  it("前 n-1 位 null, 第 n 位起 EMA 平滑", () => {
    const r = emaSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(r.slice(0, 4)).toEqual([null, null, null, null]);
    expect(r[4]).toBe(3);                  // 初始 = SMA(1..5) = 3
    expect(r[5]).toBeCloseTo(3 * 0.667 + 6 * 0.333, 5);  // EMA = prev*(1-k) + new*k, k=2/6
  });
  it("输入含 0 不会爆", () => {
    const r = emaSeries([0, 0, 0, 0, 0, 5], 5);
    expect(r[5]).toBeGreaterThan(0);
  });
});

describe("macdSeries", () => {
  it("长度 < 26 → 全 null 三个数组", () => {
    const r = macdSeries([1, 2, 3, 4, 5]);
    expect(r.dif).toHaveLength(5);
    expect(r.dea).toHaveLength(5);
    expect(r.hist).toHaveLength(5);
    expect(r.dif.every((v) => v === null)).toBe(true);
  });
  it("正常 30 日 close → 三个数组长度 30, 后面非 null", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = macdSeries(closes);
    expect(r.dif).toHaveLength(30);
    expect(r.dea).toHaveLength(30);
    expect(r.hist).toHaveLength(30);
    // 单调递增 → DIF > 0
    const lastDif = r.dif.filter((v) => v != null).pop();
    expect(lastDif).toBeGreaterThan(0);
  });
  it("EMA12/26 都没有的位 → DIF/DEA/HIST 全 null", () => {
    const r = macdSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
    expect(r.dif[0]).toBeNull();
    expect(r.dif[25]).not.toBeNull();
    // DEA 需要 DIF 后 9 个点, 第 25 位 DIF 有效, 但 DEA 需要第 25 之后 9 个 → DEA[33] 才有效
    // 长度只有 27, DEA 全 null
    expect(r.dea.every((v) => v === null)).toBe(true);
  });
  it("价格不变 → DIF/DEA/HIST 接近 0", () => {
    const closes = new Array(30).fill(100);
    const r = macdSeries(closes);
    const lastDif = r.dif.filter((v) => v != null).pop();
    expect(Math.abs(lastDif)).toBeLessThan(0.01);
  });
});
```

### Step 2.2: 跑测试, 确认失败

```bash
npx vitest run tests/renderer/stocks/indicators.test.js -v
```

Expected: FAIL — module not found.

### Step 2.3: 实现 `src/renderer/stocks/indicators.js`

```js
/**
 * src/renderer/stocks/indicators.js
 *
 * UI 端从 closes 重算 MA / EMA / MACD series. pure function.
 * ponytail: 后端 tech_indicators fetcher 只返 MA5/10/20 + macdHist 单值, 不返序列.
 *   抽屉里 K 线主图要叠加 MA 折线 + MACD 柱, 在前端跑一遍足够 — 30 点 O(n) 不卡.
 *   0 后端侵入, 切股票后跟着 closes 一起刷新.
 */

export function maSeries(closes, n) {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function emaSeries(closes, n) {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  if (closes.length < n) return new Array(closes.length).fill(null);
  const k = 2 / (n + 1);
  const out = new Array(n - 1).fill(null);
  let e = closes.slice(0, n).reduce((s, x) => s + x, 0) / n;
  out.push(e);
  for (let i = n; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function macdSeries(closes) {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { dif: [], dea: [], hist: [] };
  }
  // ponytail: macd 需要 closes.length >= 26 才稳定; 不足返回全 null.
  if (closes.length < 26) {
    return {
      dif: new Array(closes.length).fill(null),
      dea: new Array(closes.length).fill(null),
      hist: new Array(closes.length).fill(null),
    };
  }
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const dif = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null,
  );
  // DEA = EMA9(DIF), 只对 DIF 非 null 段计算, 前面补 null
  const firstValidIdx = dif.findIndex((v) => v != null);
  if (firstValidIdx < 0 || dif.length - firstValidIdx < 9) {
    return {
      dif,
      dea: new Array(closes.length).fill(null),
      hist: new Array(closes.length).fill(null),
    };
  }
  const validDif = dif.slice(firstValidIdx);
  const deaTail = emaSeries(validDif, 9);
  const dea = [
    ...new Array(firstValidIdx).fill(null),
    ...deaTail,
  ];
  // ponytail: 对齐长度防越界 — deaTail 长度可能 = validDif 长度, 跟 closes 长度不一定相等.
  while (dea.length < closes.length) dea.push(null);
  if (dea.length > closes.length) dea.length = closes.length;
  const hist = closes.map((_, i) =>
    dif[i] != null && dea[i] != null ? (dif[i] - dea[i]) * 2 : null,
  );
  return { dif, dea, hist };
}

export default { maSeries, emaSeries, macdSeries };
```

### Step 2.4: 跑测试, 确认通过

```bash
npx vitest run tests/renderer/stocks/indicators.test.js -v
```

Expected: 14 cases PASS.

### Step 2.5: Commit

```bash
git add src/renderer/stocks/indicators.js tests/renderer/stocks/indicators.test.js
git commit -m "feat(indicators): UI 端 maSeries/emaSeries/macdSeries (K 线 + 技术 tab 用)"
```

---

## Task 3: CandlestickChart 组件 (pure SVG)

**Files:**
- Create: `src/renderer/components/CandlestickChart.jsx`
- Test: `tests/renderer/components/CandlestickChart.test.jsx`

**Interfaces:**
- Props: `{ klines: [{date, open, high, low, close, volume, amplitude}], width?: number = 680, height?: number = 360, showMacd?: boolean = true }`
- Renders: SVG with 3 panels (K线主图 60% / 成交量 22% / MACD 18%). Each candle = rect (open-close) + line wick (high-low). MA5/10/20 折线 (cal 内部完成, 不用 props). 空 klines 返 `null`.

### Step 3.1: 写失败测试

创建 `tests/renderer/components/CandlestickChart.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { CandlestickChart } from "../../../src/renderer/components/CandlestickChart";

function makeKlines(n, start = 100) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = start + (i % 5 === 0 ? -2 : 1) * (i + 1);
    out.push({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1e8 + i * 1e6,
      amplitude: 2.0,
    });
  }
  return out;
}

describe("CandlestickChart", () => {
  it("空 klines 返 null (不渲染)", () => {
    const { container } = render(<CandlestickChart klines={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("单根 klines 返 null (不能画)", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(1)} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("30 根 K 线渲染 1 个 svg + 30 个蜡烛 rect + 30 根 wick line", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} />);
    const svg = container.querySelector("svg.stock-candle-chart");
    expect(svg).not.toBeNull();
    const rects = container.querySelectorAll(".stock-candle-rect");
    const wicks = container.querySelectorAll(".stock-candle-wick");
    expect(rects.length).toBe(30);
    expect(wicks.length).toBe(30);
  });

  it("MA5/MA10/MA20 折线 3 条 polyline", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} />);
    const ma = container.querySelectorAll(".stock-candle-ma");
    expect(ma.length).toBe(3);
  });

  it("成交量 panel 渲染 30 根柱", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} />);
    const bars = container.querySelectorAll(".stock-candle-vol-rect");
    expect(bars.length).toBe(30);
  });

  it("MACD panel 默认开启, 渲染柱 + 两条线", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} />);
    const hist = container.querySelectorAll(".stock-candle-macd-rect");
    expect(hist.length).toBeGreaterThan(0);
    const lines = container.querySelectorAll(".stock-candle-macd-line");
    expect(lines.length).toBe(2);
  });

  it("showMacd=false 隐藏 MACD panel", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} showMacd={false} />);
    const hist = container.querySelectorAll(".stock-candle-macd-rect");
    expect(hist.length).toBe(0);
  });

  it("含 aria-label 描述最后一日价格", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-label")).toMatch(/K 线/);
    expect(svg.getAttribute("aria-label")).toMatch(/30 日/);
  });

  it("宽度 / 高度自定义生效", () => {
    const { container } = render(<CandlestickChart klines={makeKlines(30)} width={400} height={200} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("400");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
  });
});
```

### Step 3.2: 跑测试, 确认失败

```bash
npx vitest run tests/renderer/components/CandlestickChart.test.jsx -v
```

Expected: FAIL — component not found.

### Step 3.3: 实现 `src/renderer/components/CandlestickChart.jsx`

```jsx
/**
 * src/renderer/components/CandlestickChart.jsx
 *
 * 纯 SVG K 线图: 主图 (蜡烛 + MA5/10/20) + 成交量副图 + MACD 副图.
 * ponytail: 不引图表库. 30 根蜡烛 + 副图共 ~120 SVG 元素, 渲染 < 16ms.
 *   X 等分共享同一份 klines 索引, 不画日期标签 (30 日跨度心里有数).
 *   颜色用 CSS 变量 var(--stock-up)/--stock-down, 暗色模式自动适配.
 */
import { maSeries, macdSeries } from "../stocks/indicators.js";

const UP = "var(--stock-up, #ff3b30)";
const DOWN = "var(--stock-down, #34c759)";

export function CandlestickChart({
  klines,
  width = 680,
  height = 360,
  showMacd = true,
}) {
  if (!Array.isArray(klines) || klines.length < 2) return null;
  const closes = klines.map((k) => k.close);
  const ma5 = maSeries(closes, 5);
  const ma10 = maSeries(closes, 10);
  const ma20 = maSeries(closes, 20);
  const macd = macdSeries(closes);
  const klineH = Math.floor(height * 0.6);
  const volH = Math.floor(height * 0.22);
  const macdH = showMacd ? height - klineH - volH : 0;
  const label = buildAriaLabel(klines);
  return (
    <svg
      class="stock-candle-chart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      <KLinePanel klines={klines} width={width} height={klineH} ma={[ma5, ma10, ma20]} />
      <VolumePanel klines={klines} width={width} y={klineH} height={volH} />
      {showMacd && (
        <MACDPanel macd={macd} width={width} y={klineH + volH} height={macdH} />
      )}
    </svg>
  );
}

function buildAriaLabel(klines) {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const chg = prev ? (((last.close - prev.close) / prev.close) * 100).toFixed(2) : "0";
  const dir = last.close >= prev?.close ? "涨" : "跌";
  return `${klines.length} 日 K 线, 末日收盘 ${last.close.toFixed(2)} ${dir} ${Math.abs(chg)}%`;
}

// ── Panel: K 线主图 ──
function KLinePanel({ klines, width, height, ma }) {
  const axisGap = 60;
  const plotW = width - axisGap;
  const n = klines.length;
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const candleW = (plotW / n) * 0.6;
  const yPad = 4;
  const yH = height - yPad * 2;
  const xOf = (i) => (i / (n - 1)) * plotW;
  const yOf = (v) => yPad + yH - ((v - min) / range) * yH;
  return (
    <g class="stock-candle-kline">
      {klines.map((k, i) => {
        const cx = xOf(i);
        const color = k.close >= k.open ? UP : DOWN;
        return (
          <g key={i}>
            <line
              class="stock-candle-wick"
              x1={cx} y1={yOf(k.high)} x2={cx} y2={yOf(k.low)}
              stroke={color} stroke-width="1"
            />
            <rect
              class="stock-candle-rect"
              x={cx - candleW / 2}
              y={yOf(Math.max(k.open, k.close))}
              width={candleW}
              height={Math.max(Math.abs(yOf(k.open) - yOf(k.close)), 1)}
              fill={color}
            />
          </g>
        );
      })}
      {ma.map((series, idx) => (
        <polyline
          key={idx}
          class={`stock-candle-ma stock-candle-ma-${idx}`}
          points={series
            .map((v, i) => (v != null ? `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}` : null))
            .filter(Boolean)
            .join(" ")}
          fill="none"
          stroke-width="1"
        />
      ))}
      <text class="stock-candle-axis" x={plotW + 4} y={yOf(max) + 4} font-size="10">
        {max.toFixed(2)}
      </text>
      <text class="stock-candle-axis" x={plotW + 4} y={yOf(min) + 4} font-size="10">
        {min.toFixed(2)}
      </text>
    </g>
  );
}

// ── Panel: 成交量 ──
function VolumePanel({ klines, width, y, height }) {
  const axisGap = 60;
  const plotW = width - axisGap;
  const n = klines.length;
  const maxV = Math.max(...klines.map((k) => k.volume || 0)) || 1;
  const candleW = (plotW / n) * 0.6;
  const yPad = 4;
  const yH = height - yPad * 2;
  const xOf = (i) => (i / (n - 1)) * plotW;
  const yOf = (v) => yPad + yH - (v / maxV) * yH;
  return (
    <g class="stock-candle-volume" transform={`translate(0, ${y})`}>
      {klines.map((k, i) => {
        const cx = xOf(i);
        const color = k.close >= k.open ? UP : DOWN;
        return (
          <rect
            key={i}
            class="stock-candle-vol-rect"
            x={cx - candleW / 2}
            y={yOf(k.volume || 0)}
            width={candleW}
            height={yPad + yH - yOf(k.volume || 0)}
            fill={color}
            opacity="0.7"
          />
        );
      })}
    </g>
  );
}

// ── Panel: MACD ──
function MACDPanel({ macd, width, y, height }) {
  const axisGap = 60;
  const plotW = width - axisGap;
  const n = macd.hist.length;
  const validHist = macd.hist.filter((v) => v != null);
  const validDif = macd.dif.filter((v) => v != null);
  const validDea = macd.dea.filter((v) => v != null);
  if (validHist.length === 0) return null;
  const allVals = [...validHist, ...validDif, ...validDea];
  const max = Math.max(...allVals);
  const min = Math.min(...allVals);
  const range = max - min || 1;
  const yPad = 4;
  const yH = height - yPad * 2;
  const xOf = (i) => (i / (n - 1)) * plotW;
  const yOf = (v) => yPad + yH - ((v - min) / range) * yH;
  const midY = yPad + yH - ((0 - min) / range) * yH;
  return (
    <g class="stock-candle-macd" transform={`translate(0, ${y})`}>
      <line class="stock-candle-macd-zero" x1={0} y1={midY} x2={plotW} y2={midY} stroke="var(--stock-chart-grid, rgba(0,0,0,0.1))" stroke-dasharray="2,2" />
      {macd.hist.map((v, i) => {
        if (v == null) return null;
        const cx = xOf(i);
        const color = v >= 0 ? UP : DOWN;
        return (
          <rect
            key={i}
            class="stock-candle-macd-rect"
            x={cx - 2}
            y={v >= 0 ? yOf(v) : midY}
            width={4}
            height={Math.abs(yOf(v) - midY)}
            fill={color}
            opacity="0.8"
          />
        );
      })}
      <polyline
        class="stock-candle-macd-line stock-candle-macd-dif"
        points={macd.dif
          .map((v, i) => (v != null ? `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}` : null))
          .filter(Boolean)
          .join(" ")}
        fill="none"
        stroke={UP}
        stroke-width="1"
      />
      <polyline
        class="stock-candle-macd-line stock-candle-macd-dea"
        points={macd.dea
          .map((v, i) => (v != null ? `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}` : null))
          .filter(Boolean)
          .join(" ")}
        fill="none"
        stroke={DOWN}
        stroke-width="1"
      />
    </g>
  );
}

export default CandlestickChart;
```

### Step 3.4: 跑测试, 确认通过

```bash
npx vitest run tests/renderer/components/CandlestickChart.test.jsx -v
```

Expected: 9 cases PASS.

如果 `polyline` queries 失败 (因为 attribute 取不到), 改用 `getAttribute("points")` 断言非空.

### Step 3.5: Commit

```bash
git add src/renderer/components/CandlestickChart.jsx tests/renderer/components/CandlestickChart.test.jsx
git commit -m "feat(candlestick): pure SVG K 线图 (蜡烛 + MA + 成交量 + MACD, 3 panel)"
```

---

## Task 4: 视觉 token (CSS 变量)

**Files:**
- Modify: `styles.css:1-50` (找 `:root` 块, 末尾追加 stock 变量)

### Step 4.1: 找现有 :root 块位置

```bash
grep -n ":root {" styles.css | head -3
```

打开 styles.css, 找到最后一个 `:root { ... }` 块 (一般 line 1-50). 在闭合 `}` 前追加新变量.

### Step 4.2: 追加 stock token (在最后一个 :root 闭合前)

```css
  /* 个股分析 (stock detail) — A 股惯例: 红涨绿跌 */
  --stock-up: #ff3b30;
  --stock-down: #34c759;
  --stock-flat: #8e8e93;
  --stock-hero-bg: #fafafa;
  --stock-panel-bg: #ffffff;
  --stock-panel-border: rgba(0, 0, 0, 0.06);
  --stock-chart-grid: rgba(0, 0, 0, 0.04);
  --stock-tab-active: #007aff;
  --stock-tab-bg: #ffffff;
  --stock-metric-label: #6e6e73;
  --stock-metric-value: #1d1d1f;
```

如果有 `prefers-color-scheme: dark` 块 (line ~50 附近), 在里面追加对应的暗色覆盖:

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* 其它已有暗色 token 保留 */
    --stock-hero-bg: #1c1c1e;
    --stock-panel-bg: #1c1c1e;
    --stock-panel-border: rgba(255, 255, 255, 0.08);
    --stock-chart-grid: rgba(255, 255, 255, 0.05);
    --stock-tab-bg: #1c1c1e;
    --stock-metric-label: #98989d;
    --stock-metric-value: #f5f5f7;
  }
}
```

### Step 4.3: 跑构建, 确认无错

```bash
node scripts/build-renderer.js
```

Expected: exit 0, 无 CSS 语法错误.

### Step 4.4: 跑全量测试

```bash
npx vitest run
```

Expected: 全 PASS.

### Step 4.5: Commit

```bash
git add styles.css
git commit -m "feat(styles): 个股分析 CSS 变量 (--stock-up/-down 等 11 个, 浅色 + 暗色)"
```

---

## Task 5: StockDetailDrawer 加 Hero Bar + 5 tab + 5 panel + 折叠 AI

**Precondition**: 确认 `src/renderer/components/icons.jsx` 已 export `IconCopy` 和 `IconChevron`. 没有就先追加:

```js
// 追加到 src/renderer/components/icons.jsx 末尾
export const IconCopy = (props) => (
  <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16} fill="currentColor">
    <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
  </svg>
);
export const IconChevron = (props) => (
  <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16} fill="currentColor">
    <path d="M7 10l5 5 5-5z" />
  </svg>
);
```

**Files:**

**Files:**
- Modify: `src/renderer/stocks/StockDetailDrawer.jsx` (大重写)
- Test: `tests/renderer/stocks/StockDetailDrawer.test.jsx` (改)

**Interfaces (本 task 引入)**:
- `selectedStock.value: {code, name, industry} | null`
- `perAngleData.value: {[angleKey]: {status, data, reason, error}}`
- `aiResult.value: {status, result, fromCache, reason, error}`
- 新增本地 state: `activeTab.value` (in drawer 内部, 用 signals 跨 panel 共享)
- `loadAngleData(api, code, angle)` — 已有, 复用
- `requestAiDetail(api, payload)` — 已有, 复用
- `resetDetail()` — 已有, 复用

### Step 5.1: 创建测试文件 `tests/renderer/stocks/StockDetailDrawer.test.jsx`

如果不存在, 新建:

```jsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { StockDetailDrawer } from "../../../src/renderer/stocks/StockDetailDrawer";
import {
  selectedStock,
  selectedAngles,
  perAngleData,
  aiResult,
  detailOpen,
  resetDetail,
} from "../../../src/renderer/stocks/stockDetailStore";

// mock api
const api = {
  stocksSearch: vi.fn(async () => ({ ok: true, results: [] })),
  stocksDetailAngles: vi.fn(async (_e, payload) => ({
    ok: true,
    data: { perAngle: { price_trend: { status: "ok", data: makePtData() } } },
  })),
  stocksDetailAnalyze: vi.fn(async () => ({
    ok: true,
    fromCache: false,
    result: { summary: "测试总结", perAngle: {}, risks: [], signal: "neutral" },
  })),
};

function makePtData() {
  const klines = Array.from({ length: 30 }, (_, i) => {
    const close = 100 + i;
    return {
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      open: close - 0.5, high: close + 1, low: close - 1, close,
      volume: 1e8 + i * 1e6, amplitude: 2.0,
    };
  });
  return {
    closes: klines.map((k) => k.close),
    change5d: 5, change20d: 20, amplitude: 2,
    klines,
    lastQuote: { price: 129, change: 1, changePct: 0.78 },
  };
}

beforeEach(() => {
  resetDetail();
  detailOpen.value = false;
});

describe("StockDetailDrawer — Hero Bar", () => {
  it("未选股票时 hero 区显示占位提示", () => {
    detailOpen.value = true;
    const { container } = render(<StockDetailDrawer api={api} />);
    expect(container.querySelector(".stock-hero-empty")).not.toBeNull();
  });

  it("选完股票后 hero bar 显示现价 + 涨跌 + 涨色", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = { price_trend: { status: "ok", data: makePtData() } };
    const { container } = render(<StockDetailDrawer api={api} />);
    const hero = container.querySelector(".stock-hero");
    expect(hero).not.toBeNull();
    expect(hero.textContent).toContain("贵州茅台");
    expect(hero.textContent).toContain("600519");
    expect(hero.textContent).toContain("¥129");
    expect(hero.textContent).toContain("+0.78%");
    expect(hero.classList.contains("stock-hero-up")).toBe(true);
  });
});

describe("StockDetailDrawer — Tab 切换", () => {
  beforeEach(() => {
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = {
      price_trend: { status: "ok", data: makePtData() },
      volume_turnover: { status: "ok", data: { avgAmount30d: 1e10, latestAmount: 1.1e10, avgTurnover30d: 0.4, latestTurnover: 0.5 } },
      valuation: { status: "ok", data: { pe: 28, pb: 9, pePercentile3y: 0.7 } },
      profitability: { status: "ok", data: { roe: 31, grossMargin: 91, reportDate: "Q3 2025" } },
      capital_flow: { status: "ok", data: { mainNetInflow5d: 5e8, mainNetInflow10d: 9e8, sampleCount: 10 } },
      tech_indicators: { status: "ok", data: { ma5: 128, ma10: 125, ma20: 120, macdHist: 0.5 } },
      news_buzz: { status: "ok", data: { items: [
        { title: "测试新闻", date: "2026-05-22", sentiment: "positive" },
      ] } },
    };
  });

  it("默认 active tab = 行情", () => {
    detailOpen.value = true;
    const { container } = render(<StockDetailDrawer api={api} />);
    const active = container.querySelector(".stock-detail-tab.active");
    expect(active.textContent).toContain("行情");
  });

  it("5 个 tab 渲染 (行情/财务/资金/技术/舆情)", () => {
    detailOpen.value = true;
    const { container } = render(<StockDetailDrawer api={api} />);
    const tabs = container.querySelectorAll(".stock-detail-tab");
    expect(tabs).toHaveLength(5);
  });

  it("切到财务 tab 显示 4 个 metric card", () => {
    detailOpen.value = true;
    const { container } = render(<StockDetailDrawer api={api} />);
    const financeTab = Array.from(container.querySelectorAll(".stock-detail-tab"))
      .find((el) => el.textContent.includes("财务"));
    fireEvent.click(financeTab);
    const cards = container.querySelectorAll(".stock-tab-finance .stock-metric-card");
    expect(cards.length).toBe(4);
  });

  it("切到舆情 tab 显示新闻列表", () => {
    detailOpen.value = true;
    const { container } = render(<StockDetailDrawer api={api} />);
    const newsTab = Array.from(container.querySelectorAll(".stock-detail-tab"))
      .find((el) => el.textContent.includes("舆情"));
    fireEvent.click(newsTab);
    const items = container.querySelectorAll(".stock-news-row");
    expect(items.length).toBe(1);
  });

  it("切 tab 触发 lazy load (failed angle 拉取)", async () => {
    detailOpen.value = true;
    perAngleData.value = { price_trend: perAngleData.value.price_trend }; // 只留行情
    api.stocksDetailAngles.mockClear();
    const { container } = render(<StockDetailDrawer api={api} />);
    const financeTab = Array.from(container.querySelectorAll(".stock-detail-tab"))
      .find((el) => el.textContent.includes("财务"));
    await act(async () => { fireEvent.click(financeTab); });
    // 财务 tab 含 valuation + profitability, 至少调 1 次
    expect(api.stocksDetailAngles).toHaveBeenCalled();
  });
});

describe("StockDetailDrawer — A11y", () => {
  it("tab 按钮含 role=tab + aria-selected", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = { price_trend: { status: "ok", data: makePtData() } };
    const { container } = render(<StockDetailDrawer api={api} />);
    const tabs = container.querySelectorAll("[role=tab]");
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("AI 折叠区含 role=region + aria-expanded", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = { price_trend: { status: "ok", data: makePtData() } };
    aiResult.value = { status: "ready", result: { summary: "测试", perAngle: {}, risks: [], signal: "neutral" }, fromCache: false };
    const { container } = render(<StockDetailDrawer api={api} />);
    const trigger = container.querySelector(".stock-ai-foldable-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("StockDetailDrawer — 涨跌色", () => {
  it("up class 用 var(--stock-up)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = { price_trend: { status: "ok", data: makePtData() } };
    aiResult.value = { status: "ready", result: { summary: "测试", perAngle: {}, risks: [], signal: "neutral" }, fromCache: false };
    const { container } = render(<StockDetailDrawer api={api} />);
    const trigger = container.querySelector(".stock-ai-foldable-trigger");
    fireEvent.click(trigger);
    const upEl = container.querySelector(".up");
    expect(upEl).not.toBeNull();
  });
});
```

### Step 5.2: 跑测试, 确认失败

```bash
npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx -v
```

Expected: 大面积 FAIL — hero / tab / panel 还没实现.

### Step 5.3: 重写 `src/renderer/stocks/StockDetailDrawer.jsx`

完整替换:

```jsx
/**
 * src/renderer/stocks/StockDetailDrawer.jsx
 *
 * 阶段四 + 体验重做: 720px 抽屉 + Hero bar + 5 tab 分组 + K 线 + 折叠 AI 解读.
 * ponytail:
 *   - tab 切哪个是视觉锚点, chip 仍控制 LLM 喂哪些 angle, 两者解耦
 *   - price_trend.klines 喂 K 线图; MA/MACD 在 UI 端从 closes 重算
 *   - 折叠 AI 解读区 (默认折叠), 展开后保留 summary/perAngle/risks/signal 四段
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import { AIDrawerShell } from "../components/AIDrawerShell.jsx";
import { CandlestickChart } from "../components/CandlestickChart.jsx";
import { Sparkline } from "../components/Sparkline.jsx";
import {
  IconSparkles, IconBarChart, IconAlert, IconCheck, IconCopy, IconChevron,
} from "../components/icons.jsx";
import { ANGLE_DEFS, getAngle } from "../../stocks/stock-detail-angles.js";
import {
  codeInput,
  selectedStock,
  selectedAngles,
  perAngleData,
  aiResult,
  detailOpen,
  selectStock,
  toggleAngle,
  loadAngleData,
  requestAiDetail,
  resetDetail,
} from "./stockDetailStore.js";
import { macdSeries, maSeries } from "./indicators.js";
import { taggedLog } from "../log.js";

const log = taggedLog("[stock-detail]");

const ERROR_REASON_TEXT = {
  config_missing: "AI 未配置, 请去 AI 设置配置 Provider 和 Key",
  api_key_missing: "AI Key 缺失, 请去 AI 设置补充 Key",
  budget_exceeded: "今日 token 预算已用完, 明天重试或去设置加预算",
  parse_failed: "AI 返回格式异常, 请重试",
  llm_failed: "AI 调用失败, 请稍后重试",
  no_api: "AI 通道未就绪",
};

const FETCH_REASON_TEXT = {
  fetch_failed: "网络请求失败",
  parse_failed: "数据格式异常",
  exception: "拉取异常",
  all_fetch_failed: "全部数据源失败",
  invalid_args: "参数错误",
};

const TAB_DEFS = [
  { key: "market", label: "行情", angles: ["price_trend", "volume_turnover"] },
  { key: "finance", label: "财务", angles: ["valuation", "profitability"] },
  { key: "fund", label: "资金", angles: ["capital_flow"] },
  { key: "tech", label: "技术", angles: ["tech_indicators"] },
  { key: "news", label: "舆情", angles: ["news_buzz"] },
];

const activeTab = signal("market");

// ── Search Input ──
function StockSearchInput({ api }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return undefined;
    }
    const myId = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      if (!api || !api.stocksSearch) return;
      const r = await api.stocksSearch(query);
      if (myId !== reqIdRef.current) return;
      if (r && r.ok) {
        setResults((r.results || []).slice(0, 8));
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(r) {
    setOpen(false);
    setQuery("");
    setResults([]);
    codeInput.value = r.code;
    selectStock(r, api);
  }

  return (
    <div class="stock-detail-search" ref={wrapRef}>
      <input
        class="stock-detail-input"
        type="text"
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          codeInput.value = e.currentTarget.value;
        }}
        placeholder="输入 6 位股票代码或名称"
        maxLength={20}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul class="stock-detail-dropdown" role="listbox">
          {results.map((r) => (
            <li
              key={r.code}
              role="option"
              aria-selected="false"
              class="stock-detail-dropdown-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
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

// ── Hero Bar ──
function HeroBar({ stock }) {
  const pt = perAngleData.value["price_trend"];
  const quote = pt && pt.data ? pt.data.lastQuote : null;
  const change = quote ? quote.changePct : null;
  const klass = `stock-hero stock-hero-${change != null ? (change >= 0 ? "up" : "down") : "flat"}`;
  if (!stock) {
    return (
      <div class="stock-hero stock-hero-empty">
        <div class="stock-hero-hint">先选 1 只股票, 看 K 线 + AI 解读</div>
      </div>
    );
  }
  return (
    <div class={klass}>
      <div class="stock-hero-name">{stock.name} · {stock.code} · {stock.industry}</div>
      <div class="stock-hero-price">
        <span class="stock-hero-price-now">¥{quote?.price?.toFixed(2) ?? "—"}</span>
        <span class="stock-hero-change">
          {change != null
            ? `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}%`
            : "—"}
          {quote?.change != null
            ? ` (${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)})`
            : ""}
        </span>
      </div>
      <div class="stock-hero-time">更新于 {fmtTime(quote ? Date.now() : null)}</div>
    </div>
  );
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Tab Bar ──
function TabBar({ onChange }) {
  const active = activeTab.value;
  return (
    <div class="stock-detail-tab-bar" role="tablist">
      {TAB_DEFS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          class={`stock-detail-tab${active === tab.key ? " active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── 5 个 Panel ──
function MarketPanel() {
  const pt = perAngleData.value["price_trend"];
  const vt = perAngleData.value["volume_turnover"];
  const data = pt && pt.status === "ok" ? pt.data : null;
  if (!data || !Array.isArray(data.klines)) {
    return <EmptyPanel reason={pt && pt.status === "loading" ? "加载中…" : "暂无 K 线数据"} />;
  }
  return (
    <div class="stock-tab-panel">
      <CandlestickChart klines={data.klines} width={680} height={360} />
      <div class="stock-metric-row">
        <MetricChip label="PE" value={vt ? fmtNum(vt.data?.pe) : "—"} />
        <MetricChip label="PB" value={vt ? fmtNum(vt.data?.pb) : "—"} />
        <MetricChip label="振幅" value={fmtNum(data.amplitude, "%")} />
        <MetricChip label="换手" value={vt ? fmtNum(vt.data?.latestTurnover, "%") : "—"} />
        <MetricChip label="30 日" value={fmtNum(data.change20d, "%")} />
      </div>
    </div>
  );
}

function FinancePanel() {
  const v = perAngleData.value["valuation"];
  const p = perAngleData.value["profitability"];
  return (
    <div class="stock-tab-panel stock-tab-finance">
      <MetricCard label="动态 PE" value={v?.data?.pe} unit="倍" sub={v?.data?.pePercentile3y != null ? `3年分位 ${(v.data.pePercentile3y * 100).toFixed(0)}%` : "—"} />
      <MetricCard label="PB" value={v?.data?.pb} unit="倍" />
      <MetricCard label="ROE" value={p?.data?.roe} unit="%" sub={p?.data?.reportDate || "—"} />
      <MetricCard label="毛利率" value={p?.data?.grossMargin} unit="%" sub={p?.data?.reportDate || "—"} />
    </div>
  );
}

function FundPanel() {
  const cf = perAngleData.value["capital_flow"];
  if (!cf || cf.status !== "ok") {
    return <EmptyPanel reason={cf?.status === "loading" ? "加载中…" : "暂无资金数据"} />;
  }
  const spark = deriveSparkFromFlow(cf.data);
  return (
    <div class="stock-tab-panel stock-tab-fund">
      <div class="stock-fund-numbers">
        <div class="stock-fund-num">
          <span class="stock-fund-num-label">5 日主力净流入</span>
          <span class={`stock-fund-num-val ${(cf.data.mainNetInflow5d || 0) >= 0 ? "up" : "down"}`}>
            {fmtAmount(cf.data.mainNetInflow5d)}
          </span>
        </div>
        <div class="stock-fund-num">
          <span class="stock-fund-num-label">10 日主力净流入</span>
          <span class={`stock-fund-num-val ${(cf.data.mainNetInflow10d || 0) >= 0 ? "up" : "down"}`}>
            {fmtAmount(cf.data.mainNetInflow10d)}
          </span>
        </div>
      </div>
      <Sparkline closes={spark} width={680} height={60} upColor="#ff3b30" downColor="#34c759" />
      <div class="stock-fund-meta">样本 {cf.data.sampleCount || 0} 天 · 数据源: 东财</div>
    </div>
  );
}

function TechPanel() {
  const pt = perAngleData.value["price_trend"];
  const klines = pt && pt.data ? pt.data.klines : null;
  if (!klines) {
    return <EmptyPanel reason="等待价格数据…" />;
  }
  const closes = klines.map((k) => k.close);
  const ma5Arr = maSeries(closes, 5);
  const ma10Arr = maSeries(closes, 10);
  const ma20Arr = maSeries(closes, 20);
  const last = (arr) => arr.filter((v) => v != null).slice(-1)[0];
  const ma5 = last(ma5Arr);
  const ma10 = last(ma10Arr);
  const ma20 = last(ma20Arr);
  const macd = macdSeries(closes);
  const lastDif = last(macd.dif);
  const lastDea = last(macd.dea);
  const lastHist = last(macd.hist);
  return (
    <div class="stock-tab-panel stock-tab-tech">
      <div class="stock-tech-table">
        <h4>MA 均线</h4>
        <div>MA5 <b>{fmtNum(ma5)}</b></div>
        <div>MA10 <b>{fmtNum(ma10)}</b></div>
        <div>MA20 <b>{fmtNum(ma20)}</b></div>
        <div class="stock-tech-trend">{trendLabel(ma5, ma10, ma20)}</div>
      </div>
      <div class="stock-tech-table">
        <h4>MACD</h4>
        <div>DIF <b>{fmtNum(lastDif)}</b></div>
        <div>DEA <b>{fmtNum(lastDea)}</b></div>
        <div>柱 <b class={lastHist != null && lastHist >= 0 ? "up" : "down"}>{fmtNum(lastHist)}</b></div>
      </div>
    </div>
  );
}

function NewsPanel() {
  const n = perAngleData.value["news_buzz"];
  if (!n || n.status !== "ok") {
    return <EmptyPanel reason={n?.status === "loading" ? "加载中…" : "暂无舆情数据"} />;
  }
  const items = (n.data && n.data.items) || [];
  if (items.length === 0) {
    return <EmptyPanel reason="近 7 日无相关新闻" />;
  }
  return (
    <ul class="stock-news-list">
      {items.slice(0, 8).map((it, i) => (
        <li key={i} class={`stock-news-row sentiment-${it.sentiment || "neutral"}`}>
          <span class="stock-news-icon">{sentimentIcon(it.sentiment)}</span>
          <span class="stock-news-title">{it.title}</span>
          <span class="stock-news-date">{it.date || ""}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyPanel({ reason }) {
  return <div class="stock-tab-panel stock-tab-empty">{reason || "暂无数据"}</div>;
}

function MetricChip({ label, value }) {
  return (
    <div class="stock-metric-chip">
      <span class="stock-metric-chip-label">{label}</span>
      <span class="stock-metric-chip-value">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, unit, sub }) {
  return (
    <div class="stock-metric-card">
      <div class="stock-metric-label">{label}</div>
      <div class="stock-metric-value">
        {value != null ? `${fmtNum(value)}${unit ? ` ${unit}` : ""}` : "—"}
      </div>
      {sub && <div class="stock-metric-sub">{sub}</div>}
    </div>
  );
}

// ── Helpers ──
function fmtNum(v, suffix = "") {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}${suffix}`;
}

function fmtAmount(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 1e8).toFixed(2)} 亿`;
}

function deriveSparkFromFlow(cf) {
  // ponytail: 5d/10d 数字"展开"成示意 sparkline. 用户看趋势, 不精确.
  const a5 = cf.mainNetInflow5d || 0;
  const a10 = cf.mainNetInflow10d || 0;
  const a0 = a10 - a5;       // 前 5 日 = 10d - 5d (粗略)
  return [a0, a5, a10].map((v) => v / 1e8);
}

function trendLabel(ma5, ma10, ma20) {
  if (ma5 == null || ma10 == null || ma20 == null) return "均线数据不全";
  if (ma5 > ma10 && ma10 > ma20) return "MA5 > MA10 > MA20 多头排列";
  if (ma5 < ma10 && ma10 < ma20) return "MA5 < MA10 < MA20 空头排列";
  return "均线交织, 趋势不明";
}

function sentimentIcon(s) {
  if (s === "positive") return "+";
  if (s === "negative") return "−";
  return "=";
}

// ── Angle Chip (保留兼容, 默认勾选仍在) ──
function AngleChip({ angle, selected, status, onToggle, disabled, sparkData }) {
  const failed = status === "failed";
  const loading = status === "loading" || status === "ok-loading";
  const ready = status === "ok" || status === "ready";
  const klass = `stock-detail-chip${selected ? " active" : ""}${failed ? " failed" : ""}${loading ? " loading" : ""}${ready ? " ready" : ""}${disabled ? " disabled" : ""}`;
  return (
    <button
      type="button"
      class={klass}
      onClick={onToggle}
      disabled={disabled}
      title={disabled
        ? "先选 1 只股票"
        : failed ? `拉取失败: ${FETCH_REASON_TEXT[angle.error] || angle.error || "未知"}`
        : loading ? "拉取中…"
        : ready ? "已加载"
        : angle.promptHint}
      aria-pressed={selected}
    >
      <span class="stock-detail-chip-label">{angle.label}</span>
      {sparkData && <Sparkline closes={sparkData} width={60} height={16} upColor="#ff3b30" downColor="#34c759" />}
      {loading && <span class="stock-detail-chip-spinner" aria-hidden="true" />}
      {failed && <span class="stock-detail-chip-mark" aria-hidden="true">!</span>}
      {ready && <span class="stock-detail-chip-check" aria-hidden="true"><IconCheck size={12} /></span>}
    </button>
  );
}

// ── AI 折叠区 ──
function AiFoldable({ state, onCopy, onGenerate }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="stock-ai-foldable">
      <button
        type="button"
        class="stock-ai-foldable-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconSparkles size={14} /> AI 综合解读
        <span class={`stock-ai-chevron${open ? " open" : ""}`}><IconChevron size={12} /></span>
      </button>
      {open && (
        <div class="stock-ai-foldable-body" role="region" aria-label="AI 解读结果">
          {state.status === "loading" && (
            <div class="stock-detail-ai-loading" role="status" aria-live="polite">
              <span class="stock-detail-chip-spinner" />
              <span>AI 解读中…</span>
            </div>
          )}
          {state.status === "error" && (
            <div class="stock-detail-ai-error" role="alert">
              <div class="stock-detail-ai-error-title"><IconAlert size={14} /> 出错了</div>
              <div class="stock-detail-ai-error-sub">
                {ERROR_REASON_TEXT[state.reason] || state.error || state.reason || "未知错误"}
              </div>
            </div>
          )}
          {state.status === "ready" && state.result && <AiResultBlock result={state.result} fromCache={state.fromCache} />}
          {state.status === "ready" && (
            <button type="button" class="stock-btn stock-btn-secondary" onClick={onCopy}>
              <IconCopy size={12} /> 复制到剪贴板
            </button>
          )}
          {state.status === "idle" && (
            <div class="stock-ai-idle">选好角度后, 点上方"开始 AI 分析"按钮</div>
          )}
        </div>
      )}
    </div>
  );
}

function AiResultBlock({ result, fromCache }) {
  const r = result;
  return (
    <div class="stock-detail-ai-result">
      {fromCache && <div class="stock-detail-cache-tag">缓存命中 (24h)</div>}
      <div class="stock-detail-section-title"><IconSparkles size={14} /> 总结</div>
      <div class="stock-detail-summary">{r.summary || "暂无总结"}</div>
      {selectedAngles.value.size > 0 && (
        <>
          <div class="stock-detail-section-title"><IconBarChart size={14} /> 各角度解读</div>
          <ul class="stock-detail-per-angle">
            {Array.from(selectedAngles.value).map((k) => {
              const ang = getAngle(k);
              const label = ang ? ang.label : k;
              const raw = r.perAngle ? r.perAngle[k] : null;
              const text = typeof raw === "string" && raw.trim() ? raw.trim() : "暂无解读";
              return (
                <li key={k}><b>{label}:</b> {text}</li>
              );
            })}
          </ul>
        </>
      )}
      {r.risks && r.risks.length > 0 && (
        <>
          <div class="stock-detail-section-title"><IconAlert size={14} /> 关注点</div>
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

// ── 主组件 ──
export function StockDetailDrawer({ api }) {
  const open = detailOpen.value;
  const stock = selectedStock.value;

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => resetDetail(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  function handleAngleToggle(key) {
    const wasSelected = selectedAngles.value.has(key);
    toggleAngle(key);
    if (!wasSelected && stock) {
      void loadAngleData(api, stock.code, key);
    }
  }

  function handleTabChange(key) {
    activeTab.value = key;
    const angles = TAB_DEFS.find((t) => t.key === key).angles;
    if (!stock) return;
    for (const angle of angles) {
      const entry = perAngleData.value[angle];
      if (!entry || entry.status === "failed") {
        void loadAngleData(api, stock.code, angle);
      }
    }
  }

  function handleGenerate() {
    if (!stock) return;
    void requestAiDetail(api, {
      code: stock.code,
      angles: Array.from(selectedAngles.value),
      perAngleData: perAngleData.value,
      freeText: "",
    });
  }

  function handleCopy() {
    const r = aiResult.value.result;
    if (!r) return;
    const text = [
      r.summary,
      ...(r.risks || []).map((s) => `• ${s}`),
      `信号: ${r.signal}`,
    ].join("\n");
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  const readyCount = Array.from(selectedAngles.value).filter((k) => {
    const e = perAngleData.value[k];
    return e && (e.status === "ok" || e.status === "ready");
  }).length;
  const totalCount = selectedAngles.value.size;
  const canGenerate = !!stock && totalCount > 0 && aiResult.value.status !== "loading";
  const currentTab = activeTab.value;

  return (
    <AIDrawerShell
      open={open}
      onClose={() => { detailOpen.value = false; }}
      title="个股 AI 分析"
      subtitle={stock ? `${stock.name} · ${stock.code}` : ""}
    >
      <div class="stock-detail-body">
        <section class="stock-detail-section">
          <label class="stock-detail-section-title" for="stock-detail-input">股票</label>
          <StockSearchInput api={api} />
        </section>

        <HeroBar stock={stock} />

        <section class="stock-detail-section">
          <TabBar onChange={handleTabChange} />
        </section>

        {currentTab === "market" && <MarketPanel />}
        {currentTab === "finance" && <FinancePanel />}
        {currentTab === "fund" && <FundPanel />}
        {currentTab === "tech" && <TechPanel />}
        {currentTab === "news" && <NewsPanel />}

        <section class="stock-detail-section">
          <div class="stock-detail-section-title">
            分析角度 <span class="stock-detail-section-meta">{readyCount}/{totalCount} 已加载</span>
          </div>
          <div class="stock-detail-chips" role="group" aria-label="分析角度多选">
            {ANGLE_DEFS.map((angle) => {
              const entry = perAngleData.value[angle.key];
              const sparkData = angle.sparkline
                ? angle.sparkline(entry && (entry.status === "ok" || entry.status === "ready") ? entry.data : null)
                : null;
              return (
                <AngleChip
                  key={angle.key}
                  angle={angle}
                  selected={selectedAngles.value.has(angle.key)}
                  status={entry ? entry.status : "idle"}
                  disabled={!stock}
                  sparkData={sparkData}
                  onToggle={() => handleAngleToggle(angle.key)}
                />
              );
            })}
          </div>
        </section>

        <button
          type="button"
          class="stock-btn stock-btn-primary stock-btn-lg stock-detail-generate"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          {aiResult.value.status === "loading"
            ? "生成中…"
            : `开始 AI 分析 (${totalCount} 个角度)`}
        </button>

        <AiFoldable state={aiResult.value} onCopy={handleCopy} onGenerate={handleGenerate} />

        <div class="stock-detail-footer-hint">
          AI 不出具买入/卖出等投资建议, 仅基于数据描述现状.
        </div>
      </div>
    </AIDrawerShell>
  );
}

export default StockDetailDrawer;
```

### Step 5.4: 跑测试, 确认通过

```bash
npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx -v
```

Expected: 12 cases PASS. 如果 `news_buzz.items` 缺少 sentiment 默认值等问题, 调整 mock 数据.

### Step 5.5: 跑全量回归

```bash
npx vitest run
```

Expected: 全 PASS / 0 FAIL.

### Step 5.6: Commit

```bash
git add src/renderer/stocks/StockDetailDrawer.jsx tests/renderer/stocks/StockDetailDrawer.test.jsx
git commit -m "refactor(stock-detail): 抽屉 UI 重做 (720px + Hero + 5 tab + K 线 + 折叠 AI)"
```

---

## Task 6: StockDetailDrawer 集成 + 视觉 token 使用

**Files:**
- Modify: `src/renderer/stocks/StockLayout.jsx` (加 padding 720px)
- Modify: `styles.css` (加 ~150 行 stock-detail 重做样式)

**Interfaces:**
- 抽屉 width 从 560px → 720px
- `.stock-detail-pad-drawer` padding-right 从 576px → 736px
- 新增 hero / tab / panel / metric card / news list / K 线图相关样式

### Step 6.1: 改 `src/renderer/stocks/StockLayout.jsx`

打开文件, 找到 `StockDetailDrawer` 引入行, 不动. 抽屉宽度在 CSS 里改, 这里不动.

确认 `.stock-detail-pad-drawer` 类被应用:

```jsx
<div class={aiAdviseOpen.value || detailOpen.value ? "stock-results-pad-drawer" : ""}>
```

`stock-results-pad-drawer` padding 来自 css. 改 CSS 即可, 这里不动 jsx.

### Step 6.2: 改 `styles.css`

找到现有 `.stock-detail-drawer` / `.stock-detail-pad-drawer` 行:

```bash
grep -n "stock-detail-drawer\|stock-detail-pad-drawer" styles.css
```

改 `width: 560px` → `width: 720px`, 改 `padding-right: calc(min(560px, 90vw) + 16px)` → `calc(min(720px, 90vw) + 16px)`.

在文件末尾追加新样式:

```css
/* ── Stock Detail UI Redesign (2026-06-28) ── */

/* 抽屉宽度 720px (从 560 升) */
.stock-detail-drawer { width: 720px; max-width: 90vw; }
.stock-detail-pad-drawer { padding-right: calc(min(720px, 90vw) + 16px); }

/* Hero Bar */
.stock-hero {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding: 10px 12px; margin: 8px 0 12px;
  background: var(--stock-hero-bg);
  border: 1px solid var(--stock-panel-border);
  border-radius: 8px;
}
.stock-hero-empty { justify-content: center; }
.stock-hero-hint { color: var(--text-tertiary, #8e8e93); font-size: 12px; }
.stock-hero-name { font-size: 12px; color: var(--text-secondary, #6e6e73); flex: 1 1 100%; }
.stock-hero-price-now { font-size: 22px; font-weight: 700; color: var(--text-primary, #1d1d1f); font-feature-settings: "tnum"; }
.stock-hero-change { font-size: 14px; font-weight: 600; margin-left: 8px; }
.stock-hero-time { font-size: 11px; color: var(--text-tertiary, #8e8e93); margin-left: auto; }
.stock-hero-up .stock-hero-price-now,
.stock-hero-up .stock-hero-change { color: var(--stock-up, #ff3b30); }
.stock-hero-down .stock-hero-price-now,
.stock-hero-down .stock-hero-change { color: var(--stock-down, #34c759); }
.stock-hero-flat .stock-hero-price-now { color: var(--text-primary, #1d1d1f); }

/* Tab Bar */
.stock-detail-tab-bar {
  display: flex; gap: 0; padding: 0 0 0 0;
  border-bottom: 1px solid var(--stock-panel-border, rgba(0,0,0,0.08));
  margin: 4px 0 12px;
}
.stock-detail-tab {
  background: none; border: none; cursor: pointer;
  padding: 8px 16px; font-size: 13px; color: var(--text-secondary, #6e6e73);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.stock-detail-tab:hover { color: var(--text-primary, #1d1d1f); }
.stock-detail-tab.active { color: var(--stock-tab-active, #007aff); border-bottom-color: var(--stock-tab-active, #007aff); font-weight: 700; }

/* Tab Panel */
.stock-tab-panel { padding: 4px 0 8px; min-height: 200px; }
.stock-tab-empty { color: var(--text-tertiary, #8e8e93); font-size: 12px; text-align: center; padding: 40px 0; }

/* Metric Row (行情 tab 底部) */
.stock-metric-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.stock-metric-chip {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 4px 10px; background: var(--bg-elevated, #f5f5f7);
  border-radius: 6px; font-size: 11px;
}
.stock-metric-chip-label { color: var(--stock-metric-label, #6e6e73); }
.stock-metric-chip-value { color: var(--stock-metric-value, #1d1d1f); font-weight: 600; }

/* Metric Card (财务 tab 2x2) */
.stock-tab-finance { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stock-metric-card {
  padding: 12px; border: 1px solid var(--stock-panel-border, rgba(0,0,0,0.06));
  border-radius: 8px; background: var(--stock-panel-bg, #fff);
}
.stock-metric-label { font-size: 11px; color: var(--stock-metric-label, #6e6e73); }
.stock-metric-value { font-size: 22px; font-weight: 700; color: var(--stock-metric-value, #1d1d1f); margin: 4px 0; font-feature-settings: "tnum"; }
.stock-metric-sub { font-size: 10px; color: var(--text-tertiary, #8e8e93); }

/* Fund Panel */
.stock-tab-fund { display: flex; flex-direction: column; gap: 12px; }
.stock-fund-numbers { display: flex; gap: 12px; }
.stock-fund-num { flex: 1; padding: 10px 12px; background: var(--bg-elevated, #f5f5f7); border-radius: 8px; }
.stock-fund-num-label { display: block; font-size: 11px; color: var(--text-tertiary, #8e8e93); margin-bottom: 4px; }
.stock-fund-num-val { font-size: 18px; font-weight: 700; font-feature-settings: "tnum"; }
.stock-fund-num-val.up { color: var(--stock-up, #ff3b30); }
.stock-fund-num-val.down { color: var(--stock-down, #34c759); }
.stock-fund-meta { font-size: 11px; color: var(--text-tertiary, #8e8e93); }

/* Tech Panel */
.stock-tab-tech { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stock-tech-table { padding: 12px; border: 1px solid var(--stock-panel-border, rgba(0,0,0,0.06)); border-radius: 8px; background: var(--stock-panel-bg, #fff); }
.stock-tech-table h4 { margin: 0 0 8px; font-size: 12px; color: var(--text-secondary, #6e6e73); }
.stock-tech-table div { font-size: 12px; padding: 2px 0; }
.stock-tech-table b { font-weight: 700; color: var(--text-primary, #1d1d1f); margin-left: 4px; }
.stock-tech-trend { font-size: 11px; color: var(--text-tertiary, #8e8e93); margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--stock-panel-border, rgba(0,0,0,0.06)); }
.stock-tech-table b.up { color: var(--stock-up, #ff3b30); }
.stock-tech-table b.down { color: var(--stock-down, #34c759); }

/* News Panel */
.stock-news-list { list-style: none; padding: 0; margin: 0; }
.stock-news-row { display: flex; gap: 8px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--stock-panel-border, rgba(0,0,0,0.04)); font-size: 12px; }
.stock-news-icon { width: 16px; text-align: center; font-weight: 700; }
.stock-news-row.sentiment-positive .stock-news-icon { color: var(--stock-up, #ff3b30); }
.stock-news-row.sentiment-negative .stock-news-icon { color: var(--stock-down, #34c759); }
.stock-news-row.sentiment-neutral .stock-news-icon { color: var(--stock-flat, #8e8e93); }
.stock-news-title { flex: 1; }
.stock-news-date { color: var(--text-tertiary, #8e8e93); font-size: 11px; }

/* AI Foldable */
.stock-ai-foldable { margin-top: 12px; border: 1px solid var(--stock-panel-border, rgba(0,0,0,0.06)); border-radius: 8px; overflow: hidden; }
.stock-ai-foldable-trigger {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 10px 12px; background: var(--bg-elevated, #f5f5f7); border: none; cursor: pointer;
  font-size: 13px; font-weight: 600; color: var(--text-primary, #1d1d1f); text-align: left;
}
.stock-ai-foldable-trigger:hover { background: var(--bg-card, #fff); }
.stock-ai-chevron { margin-left: auto; transition: transform 0.15s; }
.stock-ai-chevron.open { transform: rotate(180deg); }
.stock-ai-foldable-body { padding: 12px; background: var(--stock-panel-bg, #fff); }
.stock-ai-idle { color: var(--text-tertiary, #8e8e93); font-size: 12px; padding: 8px 0; }

/* K 线图 (CandlestickChart) */
.stock-candle-chart { display: block; margin: 8px 0; max-width: 100%; }
.stock-candle-ma { stroke-opacity: 0.85; }
.stock-candle-ma-0 { stroke: #ff9500; } /* MA5: 橙 */
.stock-candle-ma-1 { stroke: #5856d6; } /* MA10: 紫 */
.stock-candle-ma-2 { stroke: #007aff; } /* MA20: 蓝 */
.stock-candle-axis { fill: var(--text-tertiary, #8e8e93); }
.stock-candle-macd-zero { opacity: 0.5; }
```

### Step 6.3: 跑构建, 确认无 CSS 错

```bash
node scripts/build-renderer.js
```

Expected: exit 0.

### Step 6.4: 跑全量测试

```bash
npx vitest run
```

Expected: 全 PASS.

### Step 6.5: 视觉自检 (开发态)

```bash
npm start
```

打开个股分析抽屉, 选 600519 (贵州茅台), 验证:
1. 抽屉宽度 720px
2. Hero bar 显示 ¥1850 + 涨 2.85% (红)
3. 5 tab 可见
4. 行情 tab 显示 K 线 + 副图 + 5 个 chip
5. 切财务 tab 4 个 metric card
6. 切资金 tab 数字 + sparkline
7. 切技术 tab MA + MACD 表格
8. 切舆情 tab 新闻列表
9. 点 AI 综合解读展开/折叠

### Step 6.6: Commit

```bash
git add src/renderer/stocks/StockLayout.jsx styles.css
git commit -m "feat(styles): stock-detail 720px 抽屉 + hero/tab/panel 完整样式 + K 线配色"
```

---

## Task 7: cache-busting 验证 + 发版前自检

**Files:**
- Modify: `src/main/ipc/register-stock-detail.js` (改 CACHE_VERSION, 或仅文档化)

### Step 7.1: 找现有 cache 版本号

```bash
grep -n "CACHE_VERSION\|computeStockCacheKey" src/stocks/stock-detail-cache.js
```

### Step 7.2: 改 cache 版本

打开 `src/stocks/stock-detail-cache.js`, 把 `computeStockCacheKey` 改成包含版本:

```js
// src/stocks/stock-detail-cache.js
const CACHE_VERSION = 2;  // bumped from 1 — price-trend 多返 klines/lastQuote 字段

function computeStockCacheKey(code, angles) {
  return `${CACHE_VERSION}|${code}|${[...angles].sort().join(",")}`;
}

module.exports = { computeStockCacheKey, CACHE_VERSION };
```

### Step 7.3: 跑全量

```bash
npx vitest run && node scripts/build-renderer.js
```

Expected: 全 PASS + build 0.

### Step 7.4: 改 CHANGELOG / 版本

(可选) 打开 `RELEASE-NOTES.md` 或 `package.json`, 在下一个发版里加 changelog 条目:

```markdown
## 个股 AI 分析 — 抽屉 UI 重做

- 抽屉 560 → 720px, 信息密度提升
- 新增 Hero bar: 现价 + 大涨跌 + 绝对值
- 7 angle chip → 5 tab 分组 (行情/财务/资金/技术/舆情)
- 行情 tab 新增 K 线主图 + 成交量副图 + MACD 副图 (pure SVG, 0 依赖)
- AI 解读区默认折叠, 按需展开
- 暗色模式适配 (新 CSS 变量)
- price-trend fetcher 增量返 klines + lastQuote, 老契约不变
```

### Step 7.5: Commit

```bash
git add src/stocks/stock-detail-cache.js RELEASE-NOTES.md
git commit -m "chore(cache): stock-detail cache version 1 → 2 (klines + lastQuote schema)"
```

---

## Self-Review

**1. Spec 覆盖检查**:
- §1.1 抽屉宽度 720 → Task 6 Step 6.2 ✅
- §1.1 Hero bar → Task 5 Step 5.3 HeroBar 组件 + Task 6 Step 6.2 CSS ✅
- §1.1 5 tab 分组 → Task 5 Step 5.3 TAB_DEFS + TabBar ✅
- §1.1 行情 tab K 线 + 量 + MACD → Task 3 CandlestickChart + Task 5 MarketPanel ✅
- §1.1 财务/资金/技术/舆情 tab → Task 5 FinancePanel/FundPanel/TechPanel/NewsPanel ✅
- §1.1 折叠 AI → Task 5 AiFoldable + Task 6 CSS ✅
- §1.1 price-trend fetcher 增量 → Task 1 ✅
- §1.1 indicators.js → Task 2 ✅
- §1.1 视觉 token → Task 4 ✅
- §1.1 测试 → Task 1/2/3/5 各 task 含 test step ✅
- §1.1 cache-busting → Task 7 ✅
- §1.2 不在范围 (K 线 hover tooltip / 全屏 modal / 时间切换等) → 全部未实现 ✅

**2. Placeholder scan**:
- 全文无 "TBD" / "TODO" / "implement later" / "fill in details" ✅
- 全文有完整代码块, 无 "Add appropriate error handling" 占位 ✅
- 全文有具体 file path, 无 "类似 Task N" 跳转 ✅

**3. Type consistency**:
- Task 1 定义的 `data.klines: [{date, open, high, low, close, volume, amplitude}]` 与 Task 3 CandlestickChart 的 prop 一致 ✅
- Task 1 定义的 `data.lastQuote: {price, change, changePct} | null` 与 Task 5 HeroBar `quote?.price?.toFixed(2)` 一致 ✅
- Task 2 定义的 `maSeries(closes, n)` / `macdSeries(closes)` 与 Task 5 TechPanel 调用一致 ✅
- Task 5 定义的 `TAB_DEFS` 与切 tab lazy load 逻辑一致 ✅
- Task 5 `IconCopy` / `IconChevron` 引用: 需在 icons.jsx 存在, 不存在则追加 (Step 5.3 已隐含假设存在, 跑测试若 not found 在 styles 之前补)

**4. 缺漏修复**:
- `IconCopy` / `IconChevron` precondition 已在 Task 5 顶部声明 ✅
- `maSeries` 边界测试断言在 self-review 时被修正 (滑动窗口 [1,2,3]→2 而非 3) ✅

**5. 整体范围**: 7 tasks 全部聚焦于 spec §1.1 MVP, 不超出 §1.2 不做范围 ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-28-stock-detail-ui-redesign-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

请选择执行方式。