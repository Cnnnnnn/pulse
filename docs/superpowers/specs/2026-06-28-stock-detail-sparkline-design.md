# Stock Detail Sparkline Design

## 背景

个股 AI 分析抽屉 (StockDetailDrawer) 在选完股票、angle 自动加载后, PerAnglePreview 已能展示每 angle 的 summarizeForAi 短文 (T1 上线) + AI 解读 (T2 上线). 但 price_trend 这个 angle 始终只有文字 ("30 日 close 从 80 → 140, 累计 75%"), **用户没有视觉感**.

行业惯例: 在价格趋势类数据旁放一个迷你折线图 (sparkline), 一眼看到走势. 项目里之前没用过第三方图表库 (无 light-weight-charts / recharts / d3 依赖), 所以**走自写 SVG**.

## 目标

在 StockDetailDrawer 的两处加 sparkline, 全部基于 raw closes 数组 (0 网络开销, 复用 fetcher 已拿到的数据):
1. **AngleChip** (在 chip 下方) — 不论 angle 是否 ready, 选完后即可看历史走势
2. **PerAnglePreview** (在 price_trend ready row 内部, summarize 文字上方) — 强化 ready 状态视觉

## 改动

### 1. 新增 `src/renderer/components/Sparkline.jsx`

纯 Preact 函数组件, 接受 props:
- `closes: number[]` — 收盘价序列
- `width: number = 100` — SVG 宽
- `height: number = 30` — SVG 高
- `upColor: string = "#34c759"` — 涨色
- `downColor: string = "#ff3b30"` — 跌色
- `flatColor: string = "#8e8e93"` — 平 (首尾相等) 色

**渲染逻辑**:
- 空数组 / `null` → 返 `null` (不渲染)
- 长度 1 → 画 1 个点 (radius 1.5)
- 长度 ≥ 2 → polyline + 起点 / 终点 small dot
- X 缩放: `(i / (n-1)) * width` (i=0..n-1)
- Y 缩放: `[min..max] → [height-2 .. 2]`, 等价于 `y = height - 2 - ((v - min) / (max - min || 1)) * (height - 4)`. 加 2 像素 padding 防越界.
- 颜色: `closes[0] < closes[n-1]` 涨色, `>` 跌色, `===` 平色. (用 `num()` 风格先做 `Number()` 转换防 NaN.)

**shape**: `<svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="价格走势迷你图">` + polyline + 2 个 circle. 配 `class="stock-sparkline"`.

**不做**:
- 不做 hover tooltip (太重, sparkline 的价值是一眼)
- 不做平滑曲线 (Bezier 反而模糊趋势)
- 不画坐标轴 / 网格
- 不动画

### 2. 新增 `src/stocks/stock-detail-angles.js` helper

在 `price_trend` 注册项加 1 个函数 `getSparklineData(d)`, 返 `{ closes: number[], color: "up"|"down"|"flat" }`:

```js
function getSparklineData(d) {
  if (!d || !Array.isArray(d.closes) || d.closes.length === 0) return null;
  const closes = d.closes;
  const first = Number(closes[0]);
  const last = Number(closes[closes.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const color = last > first ? "up" : last < first ? "down" : "flat";
  return { closes, color };
}
```

ANGLE_DEFS 的 price_trend entry 加 `sparkline: getSparklineData` 字段 (与 `summarizeForAi` 同位, 调用方统一通过 `getAngle(key).sparkline(data)` 拿).

### 3. 改 `src/renderer/stocks/StockDetailDrawer.jsx`

**AngleChip**:
- 新增 props: `sparkline: { closes, color } | null`
- 渲染: chip 在 ready 状态且 sparkline 非 null 时, 在 `.stock-detail-chip-label` 下方加 `<Sparkline closes={...} width={60} height={16} upColor/downColor/flatColor={...} />`
- 关键是 **只有 price_trend 显示** (其它 angle 没 sparkline 数据). 在调用方 `ANGLE_DEFS.map(...)` 处用 `const sparkData = angle.sparkline ? angle.sparkline(perAngleData.value[angle.key]?.data) : null` 然后传给 chip.

**PerAnglePreview** (price_trend ready row):
- 在 `summary` text 上方加 `<Sparkline>` (用 raw closes 数据, 同样色). 与文字上下排列, 提升 ready 状态的"信息密度".

### 4. CSS (`styles.css`)

```css
.stock-sparkline { display: block; }
.stock-sparkline polyline { fill: none; stroke-width: 1.5; }
.stock-detail-chip .stock-sparkline { margin-top: 2px; }
.stock-detail-preview-row.status-ok .stock-sparkline { margin-bottom: 4px; }
```

颜色直接用 SVG props (upColor / downColor / flatColor), 不在 CSS 里写死 (dark mode 后续要改也是 1 处).

## 不做

- 不引第三方图表库
- 不动 fetcher (`_shared-em-kline.js` / `_shared-sina-kline.js`)
- 不动其它 angle (只 price_trend 加 sparkline)
- 不动 AI 解读
- 不动 cache
- 不做 dark mode 适配 (放后续 polish)
- 不动 sparkline 组件外的 SVG (项目其它地方不画图)
- 不动画

## 验收

### 测试 (`tests/renderer/Sparkline.test.jsx` 新建)

1. 空 `closes` → `null` (不渲染)
2. 1 个点 → 渲染 1 个 circle, 无 polyline
3. 2 个点 (涨) → polyline 用 upColor
4. 2 个点 (跌) → polyline 用 downColor
5. 2 个点 (平) → polyline 用 flatColor
6. 30 个点 (典型 K 线序列) → 渲染 1 个 polyline + 2 circle, viewBox 正确

### `tests/renderer/stocks/StockDetailDrawer.test.jsx` 补 2 个

1. price_trend chip 在 ready 状态下含 `.stock-sparkline` svg
2. price_trend preview row 在 ready 状态下含 `.stock-sparkline` svg

### `tests/stocks/stock-detail-angles.test.js` 补 1 个

`getSparklineData` 5 个分支 (null data / 空 closes / 涨 / 跌 / 平)

### 手工

1. `npm start` → 选股 → 看 price_trend chip 下方小绿/红图
2. PerAnglePreview 的 price_trend ready row 出现 svg + 文字
3. 涨跌反过来, 颜色也跟着反

### 回归

- `npx vitest run` 全 PASS, 0 FAIL
- `node scripts/build-renderer.js` exit 0
- 0 个 modified 文件 (只动 4 个目标文件 + 加 2 个 test 文件)

## 风险

- SVG 元素数 (polyline + 2 circle) < 10, 渲染开销可忽略
- 30 个 close 数值已是 fetcher 拿到的 raw data, 不增加网络
- dark mode 颜色不自动切 (留后续 polish, 不阻断合并)
- 只改 price_trend, 其它 6 angle 行为不变

## 影响面

- 新增 2 个文件 (Sparkline.jsx + Sparkline.test.jsx)
- 修改 3 个文件 (stock-detail-angles.js + StockDetailDrawer.jsx + styles.css)
- 净增约 +120 / -10 行
- 不改 IPC / fetcher / store / AI / cache / IPC
- 不引入新依赖
- 不破坏向后兼容 (sparkline 字段加在 price_trend, 其它 angle 保持不变)
