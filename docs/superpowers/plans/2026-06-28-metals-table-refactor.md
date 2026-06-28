# Metals Module Theme Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `MetalLayout` 为 Bloomberg CN 风格表格视图. 深背景 + 红涨绿跌 + 表格 + 内嵌 sparkline + 删除 DetailTrend/Card/Grid.

**Architecture:** 删 3 个旧组件 (MetalCard / MetalGrid / MetalDetailTrend), 新建 1 个 `MetalTable.jsx`. MetalHeader 改 1 行 status bar. styles.css 加 `--metals-*` token. **数据层 0 改动** — scheduler / fetcher / IPC / store signals / preload 全部保留.

**Spec:** `docs/superpowers/specs/2026-06-28-metals-table-refactor-design.md`

**Tech Stack:** Preact (renderer), Vitest + @testing-library/preact.

---

## Global Constraints

- **Vitest 跑在 ESM 模式**, 测试文件必须 `import { ... } from "vitest";` (CJS `require("vitest")` 会报错). 后端源码仍 CJS `require`/`module.exports`.
- 0 新增第三方依赖 (纯 SVG 自写).
- 复用现有 `Sparkline.jsx` 习惯 (viewBox / polyline / NaN 过滤), 不破坏现有 4 处 Sparkline 使用方.
- 复用 `calcChange` / `calcHoldingPnl` / `calcTodayPnl` / `calcOverview` (from `src/metals/metal-calc.js`), 不重新写.
- 复用 `metalStore` 的全部 signal (`config` / `quoteCache` / `fxCache` / `historyMap` / `selectedMetalId` / `overview`).
- styles.css 加 token **不污染**其他 Tab — `--metals-*` 前缀, 嵌套在 `.metals-layout` 下.
- 现有 `--color-up` / `--color-down` 不动 (其他模块还在用).
- `metals.historyMap` 字段缺失视为空, 不报错 (向后兼容).
- 测试覆盖: MetalTable (5 用例) + MetalHeader (改写为 2 用例)
- 全量 `npx vitest run` 通过, `node scripts/build-renderer.js` exit 0
- 提交用 conventional commits
- ponytail ceiling 注释: 表格 4 行 O(4) 渲染, sparkline 单行 ≤ 30 点

---

## Task 1: styles.css 加 `--metals-*` token + 嵌套选择器重写 metals 区域样式

**Files:**
- Modify: `styles.css` (append new block, 不删除现有 rules)

**Goal:** 引入 dark Bloomberg 主题, 嵌套在 `.metals-layout` 下, 不污染其他 Tab.

**Steps:**

- [ ] **Step 1.1: 在 styles.css 末尾追加 `--metals-*` token 块 + metals 重构样式**

定位 styles.css 当前末尾 (line ~11221, 已是 phase 3 之后的状态), 追加：

```css
/* ============================================================
 * v2.50 metals-tab-refactor: dark Bloomberg CN 主题
 * 全部 token 以 --metals-* 前缀, 仅 .metals-layout 子树生效
 * ============================================================ */
:root {
  --metals-bg-page: #0d1117;
  --metals-bg-card: #161b22;
  --metals-bg-card-hover: #1c2230;
  --metals-bg-header: #0d1117;
  --metals-border: #30363d;
  --metals-border-strong: #484f58;
  --metals-text-primary: #e6edf3;
  --metals-text-secondary: #8b949e;
  --metals-text-tertiary: #6e7681;
  --metals-accent: #58a6ff;
  --metals-up: #ef4444;        /* 红涨 A 股 */
  --metals-down: #22c55e;      /* 绿跌 */
  --metals-flat: #6e7681;
  --metals-row-height: 44px;
}

/* 主容器 (应用 dark 背景) */
.metals-layout {
  background: var(--metals-bg-page);
  color: var(--metals-text-primary);
  min-height: 100%;
}

/* --- Header (1 行 status bar) --- */
.metals-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid var(--metals-border);
  background: var(--metals-bg-header);
  gap: 24px;
}
.metals-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--metals-text-primary);
}
.metals-header-summary {
  display: flex;
  gap: 28px;
  font-size: 12px;
  flex: 1;
  margin-left: 24px;
}
.metals-header-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metals-header-summary-label {
  font-size: 10px;
  color: var(--metals-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.metals-header-summary-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--metals-text-primary);
}
.metals-header-summary-value.metals-pos { color: var(--metals-up); }
.metals-header-summary-value.metals-neg { color: var(--metals-down); }
.metals-header-status {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--metals-text-secondary);
}
.metals-refresh-btn {
  /* reuse existing .btn .btn-ghost .btn-sm; 仅覆盖颜色 */
  color: var(--metals-text-secondary);
}
.metals-refresh-btn:hover {
  color: var(--metals-text-primary);
}

/* --- Table --- */
.metals-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.metals-table thead th {
  background: var(--metals-bg-card);
  color: var(--metals-text-tertiary);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: left;
  padding: 0 12px;
  height: 36px;
  border-bottom: 1px solid var(--metals-border);
}
.metals-table thead th.num {
  text-align: right;
}
.metals-table tbody tr {
  height: var(--metals-row-height);
  border-bottom: 1px solid var(--metals-border);
  transition: background 100ms ease;
}
.metals-table tbody tr:hover {
  background: var(--metals-bg-card-hover);
}
.metals-table tbody tr.metals-row-error {
  background: rgba(239, 68, 68, 0.06);
}
.metals-table td {
  padding: 0 12px;
  vertical-align: middle;
  color: var(--metals-text-primary);
}
.metals-table td.num {
  text-align: right;
}

/* Cell: 品种名 */
.metals-cell-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metals-cell-name-short {
  font-size: 13px;
  font-weight: 600;
  color: var(--metals-text-primary);
}
.metals-cell-name-tag {
  font-size: 10px;
  color: var(--metals-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Cell: 价格 */
.metals-cell-price {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.metals-cell-price.metals-pos { color: var(--metals-up); }
.metals-cell-price.metals-neg { color: var(--metals-down); }
.metals-cell-price-unit {
  font-size: 10px;
  color: var(--metals-text-tertiary);
  font-weight: 400;
  margin-left: 2px;
}

/* Cell: 涨跌 */
.metals-cell-change {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-variant-numeric: tabular-nums;
}
.metals-cell-change-pct {
  font-size: 13px;
  font-weight: 600;
}
.metals-cell-change-pct.metals-pos { color: var(--metals-up); }
.metals-cell-change-pct.metals-neg { color: var(--metals-down); }
.metals-cell-change-amount {
  font-size: 10px;
  color: var(--metals-text-tertiary);
}

/* Cell: sparkline */
.metals-cell-sparkline {
  display: flex;
  align-items: center;
  height: var(--metals-row-height);
}
.metals-cell-sparkline svg {
  display: block;
  max-width: 100%;
}
.metals-cell-sparkline-loading {
  font-size: 10px;
  color: var(--metals-text-tertiary);
}

/* Cell: 持仓 */
.metals-cell-holding {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.metals-cell-holding-qty {
  font-size: 12px;
  color: var(--metals-text-primary);
}
.metals-cell-holding-pnl {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.metals-cell-holding-pnl.metals-pos { color: var(--metals-up); }
.metals-cell-holding-pnl.metals-neg { color: var(--metals-down); }
.metals-add-holding-text {
  background: none;
  border: none;
  color: var(--metals-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-align: left;
  font: inherit;
}
.metals-add-holding-text:hover { text-decoration: underline; }

/* Cell: 操作 */
.metals-cell-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.metals-cell-action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--metals-text-tertiary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.metals-cell-action-btn:hover {
  color: var(--metals-text-primary);
  background: rgba(255, 255, 255, 0.06);
}
.metals-cell-action-btn.is-active {
  color: var(--metals-accent);
}

/* Skeleton */
.metals-cell-skeleton {
  display: inline-block;
  width: 60px;
  height: 14px;
  background: linear-gradient(90deg,
    var(--metals-bg-card) 0%,
    var(--metals-bg-card-hover) 50%,
    var(--metals-bg-card) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: 3px;
}

/* 移动端 fallback */
@media (max-width: 800px) {
  .metals-header { flex-wrap: wrap; height: auto; padding: 12px 16px; gap: 12px; }
  .metals-header-summary { gap: 16px; margin-left: 0; flex-wrap: wrap; }
  .metals-table th.metals-col-holding,
  .metals-table td.metals-col-holding {
    display: none;
  }
}
```

- [ ] **Step 1.2: 检查污染**

确保 `--metals-*` 选择器**不**是 `:root` 直接定义全局变量？等等 —— 上面 `:root` 内的 `--metals-*` 是**全局变量**, 但因为带了 `--metals-` 前缀, 其他 CSS 用不到就不会冲突 (现有 CSS 只用 `--color-up` / `--space-3` 这类无前缀变量). 

**IMPORTANT**: 如果项目其他 CSS 已经写过 `.metals-layout` / `.metals-header` 等浅色样式 (Phase 1-3 加的), **会跟新规则冲突** —— 后定义的覆盖前定义的, 所以本 task 把新规则 append 在末尾是对的. 但保险起见, 用浏览器开发者工具 (或检查最后生效规则) 确认无残留.

**Static 检查** (在 plan 里 grep):

```bash
grep -n "^\.metals-layout\|^\.metals-header\|^\.metals-overview-cards\|^\.metals-metal-tabs" styles.css
```

若发现 line < 11200 有任何规则, 用 `StrReplace` 删除 (Phase 1-3 老的浅色规则整套都不要再用, 因为 MetalsTable 不再依赖).

具体删除列表:
- `.metals-layout` 旧定义 (如有)
- `.metals-header` 旧定义 (如有, Phase 1 加的)
- `.metals-header-row` 旧定义
- `.metals-overview-cards` 旧定义 + 旧媒体查询
- `.overview-card` / `.overview-label` / `.overview-value` / `.overview-meta` 旧定义 (可能其他地方还在用, 先不动)
- `.metals-metal-tabs` / `.metals-metal-tab*` 旧定义 (Phase 2/3 加的)
- `.metals-trend-strip` / `.metals-trend-cell*` 旧定义 (Phase 1)
- `.metals-detail-trend*` 旧定义 (Phase 1)
- `.metal-card*` 旧定义 (Phase 1)
- `.metal-grid` / `.metal-empty-*` / `.metal-add-holding-btn` 旧定义 (Phase 1+Task 10)
- `.metals-modal*` 旧定义 (AddMetalModal 用的, **不要删**, 保留给 AddMetalModal 用)

**保留**:
- `.metals-modal-overlay` / `.metals-modal` / `.metals-modal-header` / `.metals-modal-body` / `.metals-modal-actions` / `.metals-modal-error` (AddMetalModal 在用)
- `.metals-add-holding-btn` 旧定义 (Task 10 加的, 跟新的 `.metals-add-holding-text` 不冲突)

**风险**: 如果删错, AddMetalModal 或其他组件挂掉. 缓解: 删完跑 `node scripts/build-renderer.js` + smoke test 视觉检查. AddMetalModal 本身不动代码, 它的 class 是 `.metals-modal-*` 不是上面要删的.

- [ ] **Step 1.3: 跑 build + 视觉检查**

```bash
node scripts/build-renderer.js
```

预期 exit 0. 不会跑测试 (本 task 不改任何 .jsx 文件).

- [ ] **Step 1.4: 提交**

```bash
git add styles.css
git commit -m "refactor(styles): metals 重做 dark Bloomberg 主题 + 加 --metals-* token"
```

---

## Task 2: 新建 `MetalTable.jsx` 组件 + 单测 (TDD red→green)

**Files:**
- Create: `src/renderer/metals/MetalTable.jsx`
- Create: `tests/renderer/metals/MetalTable.test.jsx`

**Interfaces:**
- Consumes: `METALS` (from `metal-config.js`), `config` / `quoteCache` / `fxCache` / `historyMap` signals, `calcChange` / `calcHoldingPnl` helpers, `Sparkline` component, `PinIcon` / `IconMoreHorizontal` / `IconAlert` icons
- Produces: `<MetalTable onEdit={(metalId) => void} />` — 6 列 `<table>`, 4 行 (XAU / XAG / AU9999 / AG9999)

**Steps:**

- [ ] **Step 2.1: 写失败测试 (red)**

写入 `tests/renderer/metals/MetalTable.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalTable } from "../../../src/renderer/metals/MetalTable.jsx";
import {
  config, quoteCache, fxCache, historyMap, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalTable", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 行 (XAU / XAG / AU9999 / AG9999) + 6 列 header", () => {
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(4);
    const headers = container.querySelectorAll("thead th");
    expect(headers.length).toBe(6);
    expect(container.textContent).toMatch(/黄金/);
    expect(container.textContent).toMatch(/白银/);
    expect(container.textContent).toMatch(/AU9999/);
    expect(container.textContent).toMatch(/AG9999/);
  });

  it("quote 缺失 → 该行价格列 skeleton, sparkline 列 loading 文本", () => {
    config.value = { watchedIds: ["AG9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    // AG9999 行 (第 4 行) 含 skeleton
    const row = container.querySelectorAll("tbody tr")[3];
    expect(row.querySelector(".metals-cell-skeleton")).not.toBeNull();
    expect(row.textContent).toMatch(/30 天加载中/);
  });

  it("quote 存在 + history 30 天 → 渲染价格 + 涨跌 + sparkline svg", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
    };

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    // 价格列含 ¥ 符号
    expect(xauRow.querySelector(".metals-cell-price").textContent).toMatch(/¥/);
    // 涨跌列百分比
    expect(xauRow.querySelector(".metals-cell-change-pct").textContent).toMatch(/%/);
    // sparkline svg
    expect(xauRow.querySelector(".metals-cell-sparkline svg")).not.toBeNull();
  });

  it("上涨 → 价格 + 涨跌 + sparkline 都用 metals-up (红) 类", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1910, prevClose: 1890, change: 20, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
    };

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    expect(xauRow.querySelector(".metals-cell-price").className).toMatch(/metals-pos/);
    expect(xauRow.querySelector(".metals-cell-change-pct").className).toMatch(/metals-pos/);
  });

  it("holdings 有 → 持仓列显示数量 + 累计盈亏; 空 → '+ 录入持仓' 文字链", () => {
    config.value = {
      watchedIds: ["XAU"],
      holdings: { XAU: { quantity: 10, costPriceCNY: 500, costCurrency: "CNY", costPrice: 500 } },
      deletedIds: [],
    };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    // 有持仓 → 显示数量 + pnl
    expect(xauRow.querySelector(".metals-cell-holding-qty").textContent).toMatch(/10/);
    expect(xauRow.querySelector(".metals-cell-holding-pnl")).not.toBeNull();

    // AG9999 行无持仓 → 显示 "+ 录入持仓"
    const agRow = container.querySelectorAll("tbody tr")[3];
    const link = agRow.querySelector(".metals-add-holding-text");
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/录入持仓/);
  });
});
```

跑:
```bash
npx vitest run tests/renderer/metals/MetalTable.test.jsx
```
Expected: FAIL — 模块不存在 (`Cannot find module ... MetalTable.jsx`).

- [ ] **Step 2.2: 实现 `MetalTable.jsx` (green)**

写入 `src/renderer/metals/MetalTable.jsx`:

```jsx
/**
 * src/renderer/metals/MetalTable.jsx
 *
 * Bloomberg 风格表格: 6 列, 4 行 (XAU / XAG / AU9999 / AG9999).
 * 内嵌 sparkline + 持仓盈亏 + 添加持仓文字链.
 *
 * 颜色: A 股 — 涨红 (--metals-up) / 跌绿 (--metals-down).
 */
import { config, quoteCache, fxCache, historyMap } from "./metalStore.js";
import { METALS } from "../../metals/metal-config.js";
import {
  calcChange, calcHoldingPnl,
} from "../../metals/metal-calc.js";
import { Sparkline } from "../components/Sparkline.jsx";
import { PinIcon, IconMoreHorizontal, IconAlert } from "../components/icons.jsx";
import {
  isMetalPinned, addWatchlistItem, removeWatchlistItem,
} from "../watchlist/watchlist-store.js";

const GRAM_PER_OZ = 31.1035;

function formatCNY(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}`;
}

function getRefPriceCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return quote.price;
  if (fx == null) return null;
  return (quote.price * fx) / GRAM_PER_OZ;
}

function getChangePerGramCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return calcChange(quote).change;
  if (fx == null) return null;
  return (calcChange(quote).change * fx) / GRAM_PER_OZ;
}

export function MetalTable({ onEdit }) {
  return (
    <table class="metals-table">
      <thead>
        <tr>
          <th>品种</th>
          <th class="num">最新价</th>
          <th class="num">涨跌</th>
          <th>30 天走势</th>
          <th class="num metals-col-holding">持仓</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {METALS.map((m) => (
          <MetalTableRow key={m.id} metal={m} onEdit={onEdit} />
        ))}
      </tbody>
    </table>
  );
}

function MetalTableRow({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
  const holding = config.value.holdings[metal.id];
  const fx = fxCache.value.rate;
  const arr = historyMap.value[metal.id] || [];
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));
  const hasHistory = closes.length >= 2;

  const refCNY = getRefPriceCNY(quote, fx);
  const changePerGram = getChangePerGramCNY(quote, fx);
  let changePct = 0;
  let direction = "flat";
  if (quote) {
    const c = calcChange(quote);
    changePct = c.changePct;
    direction = c.change > 0 ? "up" : c.change < 0 ? "down" : "flat";
  }
  const priceClass = direction === "up" ? "metals-pos"
    : direction === "down" ? "metals-neg" : "";

  const holdingPnl = holding && quote
    ? calcHoldingPnl(holding, quote, fx) : null;

  const pinned = isMetalPinned(metal.id);
  const togglePin = (e) => {
    e.stopPropagation();
    if (pinned) removeWatchlistItem({ type: "metal", ref: metal.id });
    else addWatchlistItem({ type: "metal", ref: metal.id });
  };

  const sparklineColor = direction === "up"
    ? "var(--metals-up)"
    : direction === "down"
    ? "var(--metals-down)"
    : "var(--metals-flat)";

  return (
    <tr class={error ? "metals-row-error" : ""}>
      <td>
        <div class="metals-cell-name">
          <span class="metals-cell-name-short">{metal.shortName}</span>
          <span class="metals-cell-name-tag">
            {metal.currency === "CNY" ? "国内" : "国际"}
            {metal.proxyLabel ? ` · ${metal.proxyLabel}` : ""}
          </span>
        </div>
      </td>

      <td class="num">
        {error ? (
          <span class="metals-cell-price" style={{ color: "var(--metals-up)" }}>
            <IconAlert size={12} /> 数据获取失败
          </span>
        ) : !quote || refCNY == null ? (
          <span class="metals-cell-skeleton" />
        ) : (
          <span class={`metals-cell-price ${priceClass}`}>
            {formatCNY(refCNY)}<span class="metals-cell-price-unit">/克</span>
          </span>
        )}
      </td>

      <td class="num">
        {!quote ? (
          <span class="metals-cell-skeleton" style={{ width: "50px" }} />
        ) : (
          <div class="metals-cell-change">
            <span class={`metals-cell-change-pct ${priceClass}`}>
              {direction === "up" ? "↑" : direction === "down" ? "↓" : "—"}
              {" "}{Math.abs(changePct).toFixed(2)}%
            </span>
            {changePerGram != null && (
              <span class="metals-cell-change-amount">
                ({changePerGram >= 0 ? "+" : ""}{formatCNY(changePerGram)})
              </span>
            )}
          </div>
        )}
      </td>

      <td>
        <div class="metals-cell-sparkline">
          {hasHistory ? (
            <Sparkline
              closes={closes}
              width={140}
              height={28}
              upColor={sparklineColor}
              downColor={sparklineColor}
              flatColor={sparklineColor}
            />
          ) : (
            <span class="metals-cell-sparkline-loading">30 天加载中</span>
          )}
        </div>
      </td>

      <td class="num metals-col-holding">
        {holding ? (
          <div class="metals-cell-holding">
            <span class="metals-cell-holding-qty">
              {holding.quantity.toLocaleString("zh-CN")} {metal.unit}
            </span>
            {holdingPnl && (
              <span class={`metals-cell-holding-pnl ${
                holdingPnl.pnlCNY > 0 ? "metals-pos"
                : holdingPnl.pnlCNY < 0 ? "metals-neg" : ""
              }`}>
                {holdingPnl.pnlCNY >= 0 ? "+" : ""}{formatCNY(holdingPnl.pnlCNY)}
              </span>
            )}
          </div>
        ) : (
          <button
            class="metals-add-holding-text"
            onClick={() => onEdit(metal.id)}
          >
            + 录入持仓
          </button>
        )}
      </td>

      <td>
        <div class="metals-cell-actions">
          <button
            type="button"
            class={`metals-cell-action-btn${pinned ? " is-active" : ""}`}
            onClick={togglePin}
            title={pinned ? "取消关注" : "加入关注列表"}
            aria-label={pinned ? "取消关注" : "加入关注列表"}
          >
            <PinIcon filled={pinned} size={14} />
          </button>
          <button
            type="button"
            class="metals-cell-action-btn"
            onClick={() => onEdit(metal.id)}
            title="编辑"
            aria-label="编辑"
          >
            <IconMoreHorizontal size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default MetalTable;
```

- [ ] **Step 2.3: 跑测试, 验证通过 (green)**

```bash
npx vitest run tests/renderer/metals/MetalTable.test.jsx
```
Expected: 5 个 it 全 PASS.

- [ ] **Step 2.4: 提交**

```bash
git add src/renderer/metals/MetalTable.jsx tests/renderer/metals/MetalTable.test.jsx
git commit -m "feat(metals): MetalTable 表格组件 (Bloomberg CN 风格)"
```

---

## Task 3: 重写 `MetalHeader.jsx` (单 status bar) + 改单测

**Files:**
- Modify: `src/renderer/metals/MetalHeader.jsx`
- Modify: `tests/renderer/metals/MetalHeader.test.jsx`

**Steps:**

- [ ] **Step 3.1: 改写 MetalHeader (整个文件)**

读取当前 `src/renderer/metals/MetalHeader.jsx` (Phase 3 后约 124 行), **完全重写**为单 status bar 形态:

```jsx
/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * 单行 status bar: 标题 + 总览数字 (总市值/总盈亏/今日预估) + 刷新按钮.
 * Phase 4 移除 3 总览卡 grid + sparkline tab bar (改由 MetalTable 行内嵌 sparkline).
 */
import {
  overview, schedulerState, refreshNow,
} from "./metalStore.js";
import { IconMedal, IconRefresh } from "../components/icons.jsx";

function formatCNY(value) {
  if (value == null) return "—";
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit", minute: "2-digit",
  });
}

function pnlClass(value) {
  if (value == null) return "";
  if (value > 0) return "metals-pos";
  if (value < 0) return "metals-neg";
  return "";
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;

  return (
    <header class="metals-header">
      <div class="metals-header-title">
        <IconMedal size={18} />
        <span>贵金属</span>
      </div>

      <div class="metals-header-summary">
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">总市值</span>
          <span class="metals-header-summary-value">
            {formatCNY(ov.totalMarketValueCNY)}
          </span>
        </div>
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">总盈亏</span>
          <span class={`metals-header-summary-value ${pnlClass(ov.totalPnlCNY)}`}>
            {formatCNY(ov.totalPnlCNY)}
          </span>
        </div>
        <div class="metals-header-summary-item">
          <span class="metals-header-summary-label">今日预估</span>
          <span class={`metals-header-summary-value ${pnlClass(ov.todayEstimatedCNY)}`}>
            {formatCNY(ov.todayEstimatedCNY)}
          </span>
        </div>
      </div>

      <div class="metals-header-status">
        {state.lastFetch && <span>更新 {formatTime(state.lastFetch)}</span>}
        {state.status === "running" && <span class="spinner">⟳</span>}
        <button
          class="btn btn-ghost btn-sm metals-refresh-btn"
          onClick={refreshNow}
        >
          <IconRefresh size={14} /> 刷新
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3.2: 重写测试**

整个替换 `tests/renderer/metals/MetalHeader.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  config, quoteCache, fxCache, schedulerState, overview, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader Phase 4: status bar", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("status bar 渲染: 标题 + 3 总览数字 + 刷新按钮", () => {
    config.value = { watchedIds: ["XAU"], holdings: { XAU: null }, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    overview.value = {
      totalMarketValueCNY: 10000,
      totalPnlCNY: 100,
      todayEstimatedCNY: 50,
      hasFxMissing: false,
    };

    const { container } = render(<MetalHeader />);
    expect(container.querySelector(".metals-header-title").textContent).toMatch(/贵金属/);
    const summary = container.querySelectorAll(".metals-header-summary-item");
    expect(summary.length).toBe(3);
    expect(summary[0].textContent).toMatch(/总市值/);
    expect(summary[1].textContent).toMatch(/总盈亏/);
    expect(summary[2].textContent).toMatch(/今日预估/);
    expect(container.querySelector(".metals-refresh-btn")).not.toBeNull();
  });

  it("总盈亏 / 今日预估 为正 → 加 metals-pos 类 (红)", () => {
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
    schedulerState.value = { status: "idle", lastFetch: null };
    overview.value = {
      totalMarketValueCNY: 10000,
      totalPnlCNY: 100,
      todayEstimatedCNY: 50,
      hasFxMissing: false,
    };

    const { container } = render(<MetalHeader />);
    const values = container.querySelectorAll(".metals-header-summary-value");
    expect(values[1].className).toMatch(/metals-pos/);
    expect(values[2].className).toMatch(/metals-pos/);
  });
});
```

- [ ] **Step 3.3: 跑测试**

```bash
npx vitest run tests/renderer/metals/MetalHeader.test.jsx
```
Expected: 2 个 it 全 PASS.

- [ ] **Step 3.4: 提交**

```bash
git add src/renderer/metals/MetalHeader.jsx tests/renderer/metals/MetalHeader.test.jsx
git commit -m "refactor(metals): header 改单行 status bar (3 总览 + 刷新)"
```

---

## Task 4: 改 `MetalLayout.jsx` (Header + Table + Modal 装配)

**Files:**
- Modify: `src/renderer/metals/MetalLayout.jsx`

**Steps:**

- [ ] **Step 4.1: 重写 MetalLayout**

```jsx
/**
 * src/renderer/metals/MetalLayout.jsx
 *
 * Phase 4 装配: 单 status bar Header + 表格 Table + 添加/编辑 Modal.
 * 删除 MetalGrid / MetalCard / MetalTrendStrip / MetalDetailTrend 的引用.
 */
import { useEffect } from "preact/hooks";
import { MetalHeader } from "./MetalHeader.jsx";
import { MetalTable } from "./MetalTable.jsx";
import { AddMetalModal } from "./AddMetalModal.jsx";
import {
  addModalOpen, editingMetalId,
  initMetalStore, cleanupMetalStore,
} from "./metalStore.js";

export function MetalLayout() {
  useEffect(() => {
    initMetalStore();
    return () => cleanupMetalStore();
  }, []);

  const handleEdit = (metalId) => {
    editingMetalId.value = metalId;
    addModalOpen.value = true;
  };

  return (
    <div class="metals-layout">
      <MetalHeader />
      <MetalTable onEdit={handleEdit} />
      {addModalOpen.value && <AddMetalModal />}
    </div>
  );
}
```

- [ ] **Step 4.2: 验证不破坏 build**

```bash
node scripts/build-renderer.js
```
Expected exit 0.

(本 task 不加新测试, 因为 MetalLayout 是装配, 没有独立逻辑; MetalTable + MetalHeader 测试已覆盖组件)

- [ ] **Step 4.3: 提交**

```bash
git add src/renderer/metals/MetalLayout.jsx
git commit -m "refactor(metals): layout 装配 Header + Table + Modal"
```

---

## Task 5: 删除 `MetalCard.jsx` / `MetalGrid.jsx` / `MetalDetailTrend.jsx`

**Files:**
- Delete: `src/renderer/metals/MetalCard.jsx`
- Delete: `src/renderer/metals/MetalGrid.jsx`
- Delete: `src/renderer/metals/MetalDetailTrend.jsx`
- Delete: `tests/renderer/metals/MetalCard-polish.test.jsx`
- Delete: `tests/renderer/metals/MetalGrid-empty.test.jsx`
- Delete: `tests/renderer/metals/MetalTrendStrip.test.jsx`
- Delete: `tests/renderer/metals/MetalDetailTrend.test.jsx`

**Steps:**

- [ ] **Step 5.1: 静态扫描引用**

先 grep 确认这 3 个组件没有其他地方还在用 (除了已删除的 MetalLayout 旧版):

```bash
grep -rn "from.*MetalCard\b" src/ tests/
grep -rn "from.*MetalGrid\b" src/ tests/
grep -rn "from.*MetalDetailTrend\b" src/ tests/
```

Expected: 0 results (MetalLayout 已改). 若有残留, 修掉再删.

- [ ] **Step 5.2: 物理删除**

```bash
rm src/renderer/metals/MetalCard.jsx
rm src/renderer/metals/MetalGrid.jsx
rm src/renderer/metals/MetalDetailTrend.jsx
rm tests/renderer/metals/MetalCard-polish.test.jsx
rm tests/renderer/metals/MetalGrid-empty.test.jsx
rm tests/renderer/metals/MetalTrendStrip.test.jsx
rm tests/renderer/metals/MetalDetailTrend.test.jsx
```

- [ ] **Step 5.3: 注释标 "已废弃" 在 MetalTrendStrip.jsx 头部** (虽然不再用, 文件保留防 import 报错)

读取 `src/renderer/metals/MetalTrendStrip.jsx`, 头部注释改为:

```jsx
/**
 * src/renderer/metals/MetalTrendStrip.jsx
 *
 * 已废弃: Phase 4 起, MetalTable 行内嵌 sparkline 直接替代本组件.
 * 文件保留以防任何外部 import 错误, 当前 UI 不再渲染.
 * 若确认无外部依赖, 可于下个版本删除.
 */
```

(本 task 不删 MetalTrendStrip.jsx, 因为它是单元 export, 不破坏 build)

- [ ] **Step 5.4: 跑全量测试, 确认无破坏**

```bash
npx vitest run
```
Expected: PASS (金属模块现有 6 个文件测试 + 其他模块都不应受影响).

- [ ] **Step 5.5: build 验证**

```bash
node scripts/build-renderer.js
```
Expected exit 0.

- [ ] **Step 5.6: 提交**

```bash
git add -u src/renderer/metals/ tests/renderer/metals/
git commit -m "refactor(metals): 删 MetalCard/MetalGrid/MetalDetailTrend + 4 测试"
```

---

## Task 6: 全量回归 + build 验证

**Steps:**

- [ ] **Step 6.1: 跑 vitest**

```bash
npx vitest run
```
Expected: 0 FAIL (本计划改/增的测试: +5 MetalTable, 改写 MetalHeader 2 用例; 删 4 个旧测试).

- [ ] **Step 6.2: 跑 build**

```bash
node scripts/build-renderer.js
```
Expected exit 0.

- [ ] **Step 6.3: 视觉检查 (手动)**

```
npm start
# 切到 贵金属 Tab, 视觉确认:
# - 深背景 (近黑 #0d1117)
# - 红涨绿跌 (黄金涨 → 红)
# - 4 行表格, 6 列, 内嵌 sparkline
# - 持仓列显示数量 + 盈亏颜色
# - 添加持仓是文字链 (蓝)
```

(本步骤人工验证, 不写入 commit)

- [ ] **Step 6.4: 总结提交**

```bash
git log --oneline -10
```

输出应包含本 plan 6 个 commit (Task 1-5 各自 + 任何 plan/spec 文档 commit).

---

## Plan 总览

| Task | 文件 | 提交消息 |
|------|------|----------|
| 1 | styles.css | `refactor(styles): metals 重做 dark Bloomberg 主题 + 加 --metals-* token` |
| 2 | +MetalTable.jsx, +MetalTable.test.jsx | `feat(metals): MetalTable 表格组件 (Bloomberg CN 风格)` |
| 3 | MetalHeader.jsx, MetalHeader.test.jsx | `refactor(metals): header 改单行 status bar (3 总览 + 刷新)` |
| 4 | MetalLayout.jsx | `refactor(metals): layout 装配 Header + Table + Modal` |
| 5 | -3 source, -4 tests | `refactor(metals): 删 MetalCard/MetalGrid/MetalDetailTrend + 4 测试` |

预期 diff:
- `+ ~600` lines (MetalTable 200 + styles.css 300 + tests 100)
- `- ~700` lines (MetalCard 220 + MetalGrid 100 + MetalDetailTrend 60 + 4 tests 200 + styles.css 100 旧规则)
- net: 略减 ~100 lines, 表格化密度提升

---

## 依赖与执行顺序

```
Task 1 (styles)
   ↓
Task 2 (MetalTable) ──┐
                      ├─ Task 3 (Header) ── Task 4 (Layout) ── Task 5 (delete) ── Task 6 (verify)
                      └────────────────────────────────────────────────────────────────────┘
```

- Task 2/3 可并行 (零依赖, 改不同文件)
- Task 4 必须在 Task 2 + 3 之后 (import 它们)
- Task 5 必须在 Task 4 之后 (确认无引用)
- Task 6 最后

## 执行模式建议

跟 Phase 1-3 一致 — **subagent-driven-development**, 每个 Task 派独立 subagent (Task 2 + 3 可并行). 完成后主线程跑 Task 6 全量回归 + build.
