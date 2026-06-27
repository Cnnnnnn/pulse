# Stock Detail Sparkline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `price_trend` angle 加纯 SVG 迷你折线图 (sparkline), 在 AngleChip 和 PerAnglePreview 两处显示, 0 第三方依赖.

**Architecture:** 新建一个纯 Preact 函数组件 `Sparkline.jsx`, 接受 `closes` 数组 + 颜色, 渲染 polyline + 起点/终点 circle. 在 `stock-detail-angles.js` 加 `getSparklineData(d) => {closes, color} | null` helper 并挂到 `price_trend.sparkline` 字段. `StockDetailDrawer.jsx` 在 chip + preview 两处消费. styles.css 加 3 行.

**Tech Stack:** Preact (项目既定), 原生 SVG, Vitest + @testing-library/preact.

**Spec:** `docs/superpowers/specs/2026-06-28-stock-detail-sparkline-design.md`

## Global Constraints

- 0 第三方依赖 (不引 lightweight-charts / recharts / d3)
- 只动 4 个文件 + 新增 2 个 test 文件
- 不动 `src/stocks/detail-fetchers/*` (fetcher 数据不变)
- 不动 `src/ai/*` (AI 解读不变)
- 不动 `src/main/*` (cache / IPC 不变)
- 只 `price_trend` 加 sparkline 字段; 其它 6 angle 注册项不动
- 测试覆盖: Sparkline 组件 (5 个分支) + angle helper (5 个分支) + drawer 集成 (2 个新 it)
- 全量 `npx vitest run` 通过, `node scripts/build-renderer.js` exit 0
- 提交用 conventional commits
- 代码放文件顶部 (无 inline import)
- imports 用 ESM + createRequire 模式 (per 项目 sibling 约定, vitest 1.6 ESM-only)

---

### Task 1: 写 Sparkline 组件测试 (TDD red)

**Files:**
- Create: `tests/renderer/components/Sparkline.test.jsx`
- Test: `tests/renderer/components/Sparkline.test.jsx`

**Interfaces:**
- Consumes: `<Sparkline closes={...} width={...} height={...} upColor={...} downColor={...} flatColor={...} />` (尚未存在)
- Produces: 6 个 it 验证空数组/单点/2 点(涨/跌/平)/30 点

- [ ] **Step 1: 写失败测试**

写入 `tests/renderer/components/Sparkline.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Sparkline } from "../../../src/renderer/components/Sparkline.jsx";

describe("Sparkline", () => {
  it("空 closes 数组不渲染任何 svg", () => {
    const { container } = render(<Sparkline closes={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("1 个点渲染 1 个 circle, 无 polyline", () => {
    const { container } = render(<Sparkline closes={[100]} />);
    const svg = container.querySelector("svg.stock-sparkline");
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll("circle").length).toBe(1);
    expect(svg.querySelector("polyline")).toBeNull();
  });

  it("2 个点上涨: polyline 用 upColor", () => {
    const { container } = render(
      <Sparkline closes={[80, 100]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly).not.toBeNull();
    expect(poly.getAttribute("stroke")).toBe("#34c759");
  });

  it("2 个点下跌: polyline 用 downColor", () => {
    const { container } = render(
      <Sparkline closes={[100, 80]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly.getAttribute("stroke")).toBe("#ff3b30");
  });

  it("2 个点平: polyline 用 flatColor", () => {
    const { container } = render(
      <Sparkline closes={[100, 100]} upColor="#34c759" downColor="#ff3b30" flatColor="#8e8e93" />,
    );
    const poly = container.querySelector("polyline");
    expect(poly.getAttribute("stroke")).toBe("#8e8e93");
  });

  it("30 个点: polyline + 起点/终点 2 circle, viewBox 正确", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { container } = render(<Sparkline closes={closes} width={100} height={30} />);
    const svg = container.querySelector("svg.stock-sparkline");
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 30");
    expect(svg.getAttribute("width")).toBe("100");
    expect(svg.getAttribute("height")).toBe("30");
    expect(svg.querySelector("polyline")).not.toBeNull();
    expect(svg.querySelectorAll("circle").length).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/components/Sparkline.test.jsx`
Expected: FAIL — `Sparkline.jsx` 还没建, import 抛 `ERR_MODULE_NOT_FOUND` (或 `Sparkline is not a function`).

- [ ] **Step 3: 提交失败测试**

```bash
git add tests/renderer/components/Sparkline.test.jsx
git commit -m "test(sparkline): Sparkline 组件渲染分支断言 (red)"
```

---

### Task 2: 实现 Sparkline 组件 (TDD green)

**Files:**
- Create: `src/renderer/components/Sparkline.jsx`

**Interfaces:**
- Consumes: Task 1 的 6 个 it 断言
- Produces: Sparkline 函数组件, props 同上

- [ ] **Step 1: 创建组件文件**

写入 `src/renderer/components/Sparkline.jsx`:

```jsx
/**
 * src/renderer/components/Sparkline.jsx
 *
 * 纯 SVG 迷你折线图. 接受 closes 数组, 画 polyline + 起点/终点 circle.
 * 颜色按 closes[0] vs closes[n-1] 涨/跌/平 三态.
 *
 * ponytail: 不引图表库. 30 点以内 polyline 性能可忽略.
 *          不做 hover/tooltip/animation/平滑曲线 — sparkline 的价值是一眼.
 */
export function Sparkline({
  closes,
  width = 100,
  height = 30,
  upColor = "#34c759",
  downColor = "#ff3b30",
  flatColor = "#8e8e93",
}) {
  if (!Array.isArray(closes) || closes.length === 0) return null;

  // 单点 → 1 个 circle, 无 polyline
  if (closes.length === 1) {
    const cy = height / 2;
    return (
      <svg
        class="stock-sparkline"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="价格走势迷你图"
      >
        <circle cx={width / 2} cy={cy} r={1.5} fill={flatColor} />
      </svg>
    );
  }

  const values = closes.map((v) => Number(v));
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const yPad = 2;
  const yH = height - yPad * 2;

  // X 等分: i=0..n-1 → 0..width
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = yPad + yH - ((v - min) / range) * yH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const first = values[0];
  const last = values[values.length - 1];
  const stroke = last > first ? upColor : last < first ? downColor : flatColor;

  return (
    <svg
      class="stock-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="价格走势迷你图"
    >
      <polyline points={points} stroke={stroke} stroke-width="1.5" fill="none" />
      <circle cx={0} cy={yPad + yH - ((first - min) / range) * yH} r={1.5} fill={stroke} />
      <circle
        cx={width}
        cy={yPad + yH - ((last - min) / range) * yH}
        r={1.5}
        fill={stroke}
      />
    </svg>
  );
}

export default Sparkline;
```

- [ ] **Step 2: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/components/Sparkline.test.jsx`
Expected: 6 个 it 全部 PASS.

- [ ] **Step 3: 提交**

```bash
git add src/renderer/components/Sparkline.jsx
git commit -m "feat(sparkline): 纯 SVG 迷你折线图组件"
```

---

### Task 3: 写 getSparklineData helper 测试 (TDD red)

**Files:**
- Modify: `tests/stocks/stock-detail-angles.test.js` (在末尾追加 1 个 describe)
- Test: `tests/stocks/stock-detail-angles.test.js`

**Interfaces:**
- Consumes: `getSparklineData(d)` 返 `{ closes, color } | null` (尚未存在)
- Produces: 5 个 it 覆盖 null data / 空 closes / 涨 / 跌 / 平

- [ ] **Step 1: 读现有 test 文件, 找到合适的插入位置**

Run: `Read tests/stocks/stock-detail-angles.test.js` (在文件末尾找最后一个 `});`)

- [ ] **Step 2: 追加新 describe 块**

在最后一个 `});` 之前插入:

```js
describe("price_trend.getSparklineData", () => {
  // import 在文件顶部
  // const { ANGLE_DEFS, getAngle } = require("../../src/stocks/stock-detail-angles.js");
  // (如果文件顶部已有 import, 复用, 不重复声明)
  const ang = getAngle("price_trend");

  it("null data 返 null", () => {
    expect(ang.sparkline(null)).toBeNull();
    expect(ang.sparkline(undefined)).toBeNull();
  });

  it("空 closes 返 null", () => {
    expect(ang.sparkline({ closes: [] })).toBeNull();
  });

  it("NaN/非数 返 null", () => {
    expect(ang.sparkline({ closes: [NaN, NaN] })).toBeNull();
  });

  it("上涨: 返 closes + color='up'", () => {
    expect(ang.sparkline({ closes: [80, 90, 100] })).toEqual({
      closes: [80, 90, 100],
      color: "up",
    });
  });

  it("下跌: 返 closes + color='down'", () => {
    expect(ang.sparkline({ closes: [100, 90, 80] })).toEqual({
      closes: [100, 90, 80],
      color: "down",
    });
  });

  it("平: 返 closes + color='flat'", () => {
    expect(ang.sparkline({ closes: [100, 100] })).toEqual({
      closes: [100, 100],
      color: "flat",
    });
  });
});
```

> 注意: 顶部 import 块如已有 `ANGLE_DEFS, getAngle`, 直接用; 若没有, 在 describe **之前** 顶部加 `const { ANGLE_DEFS, getAngle } = require("../../src/stocks/stock-detail-angles.js");` (按文件现有 import 风格). 避免重复声明.

- [ ] **Step 3: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/stocks/stock-detail-angles.test.js`
Expected: FAIL — `ang.sparkline is not a function` (字段尚未挂上).

- [ ] **Step 4: 提交失败测试**

```bash
git add tests/stocks/stock-detail-angles.test.js
git commit -m "test(angle): getSparklineData helper 5 分支断言 (red)"
```

---

### Task 4: 实现 getSparklineData + 挂字段 (TDD green)

**Files:**
- Modify: `src/stocks/stock-detail-angles.js` (加函数 + 挂到 price_trend 注册项)

**Interfaces:**
- Consumes: Task 3 的 6 个 it
- Produces: `getSparklineData` 顶层函数, `price_trend.sparkline` 字段

- [ ] **Step 1: 加 getSparklineData 函数**

在 `src/stocks/stock-detail-angles.js` 的 `summarizePriceTrend` 函数之后, 加:

```js
function getSparklineData(d) {
  if (!d || !Array.isArray(d.closes) || d.closes.length === 0) return null;
  const first = Number(d.closes[0]);
  const last = Number(d.closes[d.closes.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const color = last > first ? "up" : last < first ? "down" : "flat";
  return { closes: d.closes, color };
}
```

- [ ] **Step 2: 挂到 price_trend 注册项**

把 `src/stocks/stock-detail-angles.js` 的 `price_trend` 对象 (line 8-16) 末尾加一行:

```js
  {
    key: "price_trend",
    label: "价格趋势",
    group: "行情",
    promptHint: "近 30 日收盘价序列、振幅、近 5/20 日涨跌幅",
    dataShape: "PriceTrendData",
    fetcher: require("./detail-fetchers/price-trend").fetchPriceTrend,
    summarizeForAi: summarizePriceTrend,
    sparkline: getSparklineData,  // 新加
  },
```

- [ ] **Step 3: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/stocks/stock-detail-angles.test.js`
Expected: 既有 N 个 + 6 个新 = N+6 全部 PASS.

- [ ] **Step 4: 提交**

```bash
git add src/stocks/stock-detail-angles.js
git commit -m "feat(angle): price_trend 加 sparkline helper + 注册字段"
```

---

### Task 5: 在 StockDetailDrawer 集成 sparkline (chip + preview)

**Files:**
- Modify: `src/renderer/stocks/StockDetailDrawer.jsx` (AngleChip 改 + PerAnglePreview 改 + chip 调用方加 sparkData 计算)
- Modify: `tests/renderer/stocks/StockDetailDrawer.test.jsx` (补 2 个 it)
- Modify: `styles.css` (加 3 行)

**Interfaces:**
- Consumes: Task 2 的 Sparkline, Task 4 的 `angle.sparkline(data)` 返 `{closes, color}|null`
- Produces: AngleChip ready 状态下显示 60×16 sparkline; PerAnglePreview price_trend ready row 显示 sparkline

- [ ] **Step 1: 写失败测试**

在 `tests/renderer/stocks/StockDetailDrawer.test.jsx` 末尾追加 2 个 it:

```jsx
  it("price_trend chip ready 状态下含 .stock-sparkline", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend"]);
    perAngleData.value = {
      price_trend: { status: "ok", data: { closes: [80, 85, 90, 95, 100] } },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const chip = container.querySelector(".stock-detail-chip");
    expect(chip.querySelector("svg.stock-sparkline")).not.toBeNull();
  });

  it("price_trend preview ready row 含 .stock-sparkline (在文字上方)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend"]);
    perAngleData.value = {
      price_trend: { status: "ok", data: { closes: [80, 85, 90, 95, 100] } },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const previewRow = container.querySelector(".stock-detail-preview-row.status-ok");
    expect(previewRow.querySelector("svg.stock-sparkline")).not.toBeNull();
  });
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx`
Expected: 2 个新 it FAIL — chip / preview 尚未消费 sparkline.

- [ ] **Step 3: 改 StockDetailDrawer.jsx**

**A. 加 import**: 在文件顶部 import 区追加:

```jsx
import { Sparkline } from "../components/Sparkline.jsx";
```

**B. 改 AngleChip**:

读现有 AngleChip (line 138 起), 把签名加 `sparkData` prop:

```jsx
function AngleChip({ angle, selected, status, onToggle, disabled, sparkData }) {
```

在 `.stock-detail-chip-label` 后 (即 chip body 内, label 之后) 加 sparkline 渲染:

```jsx
        <span class="stock-detail-chip-label">{ang.label}</span>
        {sparkData && (
          <Sparkline
            closes={sparkData.closes}
            width={60}
            height={16}
          />
        )}
```

**C. 改 chip 调用方** (在 `<AngleChip ...>` JSX 处, line 339-347 附近):

```jsx
              {ANGLE_DEFS.map((angle) => {
                const entry = perAngleData.value[angle.key];
                const sparkData = angle.sparkline
                  ? angle.sparkline(entry && entry.status === "ok" ? entry.data : null)
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
```

**D. 改 PerAnglePreview**:

读现有 PerAnglePreview (line 169-198), 在 `text = ready ? summary || "已加载" : ...` 之前, 加 sparkline 渲染分支. 在 `<li>` 内 `<span class="stock-detail-preview-label">` 之后, 添加 (仅 price_trend 且 ready):

找到 `text = ready ? summary || "已加载" : ...` 这一行, 改 preview row 渲染:

```jsx
        const summary = ready && ang && typeof ang.summarizeForAi === "function"
          ? ang.summarizeForAi(entry.data)
          : null;
        const sparkData = ready && ang && typeof ang.sparkline === "function"
          ? ang.sparkline(entry.data)
          : null;
        const text = ready
          ? summary || "已加载"
          : ...;
        return (
          <li key={k} class={klass}>
            <span class="stock-detail-preview-label">{ang ? ang.label : k}</span>
            {sparkData && <Sparkline closes={sparkData.closes} width={120} height={24} />}
            <span class="stock-detail-preview-status">{text}</span>
          </li>
        );
```

- [ ] **Step 4: 加 CSS**

在 `styles.css` 的 sparkline 相关位置 (搜索 `.stock-detail-preview-row.status-ok` 块附近) 加 3 行:

```css
.stock-sparkline { display: block; }
.stock-sparkline polyline { fill: none; stroke-width: 1.5; }
.stock-detail-chip .stock-sparkline { margin-top: 2px; }
.stock-detail-preview-row.status-ok .stock-sparkline { margin-bottom: 4px; }
```

> 注: `.stock-sparkline polyline` 的 fill: none 可能与内联 `<polyline fill="none" stroke=...>` 重复 — 实际上 inline attribute 优先, 但加 CSS 兜底更稳.

- [ ] **Step 5: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/stocks/StockDetailDrawer.test.jsx`
Expected: 既有 5 个 + 2 个新 = 7 个全部 PASS.

- [ ] **Step 6: 全量回归**

Run: `npx vitest run`
Expected: 3160 + 6 (Sparkline test) + 6 (helper test) + 2 (drawer test) = 3174 个, 全部 PASS, 0 FAIL.

- [ ] **Step 7: renderer build 验证**

Run: `node scripts/build-renderer.js`
Expected: exit 0.

- [ ] **Step 8: 提交**

```bash
git add src/renderer/stocks/StockDetailDrawer.jsx tests/renderer/stocks/StockDetailDrawer.test.jsx styles.css
git commit -m "feat(stock-detail): 集成 sparkline (chip + preview) + 样式"
```

---

### Task 6: 终验

**Files:** 无 (仅验证)

- [ ] **Step 1: 全量测试再跑一次**

Run: `npx vitest run 2>&1 | tail -3`
Expected: `PASS (3174) FAIL (0)`.

- [ ] **Step 2: git log 看 5 个新 commit**

Run: `git log --oneline -7`
Expected: 看到 5 个新 commit (test-red / feat-component / test-red-angle / feat-helper / feat-integration).

- [ ] **Step 3: git status 干净 (仅 working tree 已有的 in-progress 不算)**

Run: `git status --short | head -10`
Expected: 0 个与 sparkline 相关的 modified. (若有其它 in-progress modified 是先前会话遗留, 不算本任务失败.)

---

## 备注

- 5 个任务独立可执行, 无 T3 类似的"评审发现 wiring gap"风险 — 改动面是单方向依赖链 (Sparkline → helper → 注册 → 集成)
- 不需要 worktree (改动 4 文件, 集中在 chip + preview + helper)
- dark mode 不在 scope (后续 polish)
- sparkline 性能: 30 点 polyline 渲染 < 1ms, 无需优化
