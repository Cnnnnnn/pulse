# 个股 AI 分析 — 抽屉 UI 重做 + K 线图 (设计)

> **范围**: 在阶段四 (2026-06-26-stock-detail-ai) 已交付的 `StockDetailDrawer` 基础上做 UI 体验重做:
> 720px 抽屉 + Hero bar + 5 tab 分组 + K 线主图 + 成交量副图 + MACD 副图 + 折叠 AI 解读区.
> 沿用现有 fetcher / IPC / cache / store / LLM 模式, 不动 AI 解读的契约.

## 0. 背景与目的

阶段四交付后用户反馈:
1. 560px 抽屉信息密度低, 7 个 angle chip 平铺看不出重点
2. price_trend 只有文字 + 迷你 sparkline, 看不到 K 线 / 量能 / MACD
3. AI 解读一直展开, 跟原始数据混在一起, 首屏看不清主体
4. 切 angle 需要手动点 chip, 没有按"维度"分组的视觉锚点

v2 路线图 Pillar 4 (AI 驱动) 收口, v3 路线图 (2026-06-25-product-roadmap-v2) 把「选股垂直深化」列为
补完项. 本 spec 是该方向的第 1 步: **抽屉体验重做**, 后续可能有"加入关注" / "历史分析" 等.

## 1. 范围 (MVP)

### 1.1 必须做

- **抽屉宽度**: 560 → **720px** (`.stock-detail-pad-drawer` padding 同步)
- **Hero bar**: 股票名 + 代码 + 行业 + 现价 + 大涨跌 + 绝对值 + 时间戳 (新增组件段)
- **5 tab 分组** (按 angle.group 聚合):
  | Tab | Angle | Fetcher |
  |---|---|---|
  | 行情 | price_trend, volume_turnover | price-trend, volume-turnover |
  | 财务 | valuation, profitability | valuation, profitability |
  | 资金 | capital_flow | capital-flow |
  | 技术 | tech_indicators | tech-indicators |
  | 舆情 | news_buzz | news-buzz |
- **行情 tab 内**:
  - K 线主图 (蜡烛 + MA5/MA10/MA20 三条线)
  - 成交量副图 (按日 amount, 涨红跌绿)
  - MACD 副图 (柱 + DIF/DEA 两条线, UI 端从 closes 重算)
  - 底部关键指标 chip 行 (PE / PB / 振幅 / 换手 / 30 日涨跌)
- **其它 tab**: metric card grid (财务 2×2) / 累计数字 + sparkline (资金) / MA 表格 + MACD 详情 (技术) / 新闻列表 (舆情)
- **折叠 AI 解读区**: 默认折叠, 展开后保留现有 summary/perAngle/risks/signal 四段, 加「📋 复制」按钮
- **price-trend fetcher**: 多返 `klines: [{date, open, high, low, close, volume, amplitude}]` (向下兼容)
- **UI 端 indicators 计算**: 新增 `src/renderer/stocks/indicators.js` (MA/MACD series from closes)
- **视觉 token**: 新增 `--stock-up/-down/-flat/-hero-bg/-panel-bg/-panel-border/-chart-grid/-tab-active/-metric-label/-metric-value`, 浅色 + 暗色双套
- **测试**: 7 个新/改测试覆盖 K 线 / tab / hero bar / indicators / 折叠 AI
- **发版 cache-busting**: stockDetailCache 清空 (spec §7)

### 1.2 不在范围 (留后续)

- ❌ K 线时间范围切换 (30/60/90 天)
- ❌ K 线全屏 modal (右上角 ⤢ 按钮占位, 第一版只抽屉内)
- ❌ 蜡烛 hover tooltip
- ❌ 拖拽缩放 / 十字光标
- ❌ 同业对比 / 大盘指数叠加
- ❌ 自定义 prompt 编辑
- ❌ 多轮对话追问
- ❌ 历史分析记录 (24h 之外)
- ❌ 国际化 i18n

## 2. 架构

### 2.1 模块分布

```
src/
  stocks/
    detail-fetchers/
      price-trend.js                    # 改: summarize() 多返 klines + lastQuote 字段
    stock-detail-angles.js              # 不改 (group 字段已存在, UI 按 group 聚合)
  renderer/
    stocks/
      indicators.js                     # 新: UI 端 MA/MACD series 计算 (从 closes)
      StockDetailDrawer.jsx             # 改: 大重写 (hero bar + 5 tab panel + 折叠 AI)
        # 内含 MarketPanel / FinancePanel / FundPanel / TechPanel / NewsPanel
        # (按"5 个 panel 体量小 + 共享 perAngleData"考量内联, 不另开 5 个文件)
      stockDetailStore.js               # 不改 (per-angle 独立状态已够)
    components/
      CandlestickChart.jsx              # 新: SVG K 线图 (蜡烛 + 副图)
  styles.css                            # 改: ~150 行 K 线 / metric card / hero / tab 样式
```

### 2.2 架构原则

- **K 线图 pure SVG**: 不引第三方图表库, 30 根蜡烛 + 副图共 ~120 SVG 元素, 渲染 < 16ms
- **数据契约增量**: `price-trend.klines` 是新增字段, 老契约 `closes/change5d/change20d/amplitude` 保留, LLM / 60s cache / 24h cache 全兼容
- **指标 UI 重算**: MA/MACD 在 UI 端用 `price-trend.klines[i].close` 重算 series, 0 后端侵入, 切股票后跟着 closes 一起刷新
- **Tab 视觉锚点 ≠ chip 选择**: tab 切哪个是"看哪个面板", chip 仍控制 LLM 喂哪些 angle, 两者解耦
- **Lazy 数据**: 切 tab 触发该 group 内未 ready 的 angle fetch, 沿用现有 `loadAngleData` 不重写

## 3. 组件

### 3.1 Hero Bar (在 `StockDetailDrawer.jsx` 内)

```jsx
function HeroBar({ stock, pt, fetchedAt }) {
  // ponytail: lastQuote 从 price_trend angle 的 data.lastQuote 取, 不是 selectedStock 自身.
  //   price-trend fetcher 加 lastQuote 字段后, UI 直接消费, 不重打 IPC.
  const quote = pt && pt.lastQuote;
  const change = quote ? quote.changePct : null;
  const klass = `stock-hero stock-hero-${change != null ? (change >= 0 ? "up" : "down") : "flat"}`;
  return (
    <div class={klass}>
      <div class="stock-hero-name">{stock?.name} · {stock?.code} · {stock?.industry}</div>
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
      <div class="stock-hero-time">更新于 {fmtTime(fetchedAt)}</div>
    </div>
  );
}
```

**数据来源**: `perAngleData["price_trend"].data.lastQuote` — price-trend fetcher 加 `lastQuote` 字段
(从 `klines[last]` 与 `klines[last-1]` 推 `{price, change, changePct}`), 不重打 IPC.

### 3.2 Tab Bar

```jsx
const TAB_DEFS = [
  { key: "market", label: "行情", angles: ["price_trend", "volume_turnover"] },
  { key: "finance", label: "财务", angles: ["valuation", "profitability"] },
  { key: "fund", label: "资金", angles: ["capital_flow"] },
  { key: "tech", label: "技术", angles: ["tech_indicators"] },
  { key: "news", label: "舆情", angles: ["news_buzz"] },
];

function TabBar({ active, onChange }) {
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
```

**激活态**: `border-bottom: 2px solid var(--stock-tab-active)` + 文字 700 weight.

**切 tab 触发 lazy load**:
```js
function handleTabChange(key) {
  activeTab.value = key;
  const angles = TAB_DEFS.find((t) => t.key === key).angles;
  if (selectedStock.value) {
    for (const angle of angles) {
      if (!perAngleData.value[angle] || perAngleData.value[angle].status === "failed") {
        void loadAngleData(api, selectedStock.value.code, angle);
      }
    }
  }
}
```

### 3.3 CandlestickChart.jsx

```jsx
export function CandlestickChart({ klines, width = 680, height = 360, showMacd = true }) {
  if (!Array.isArray(klines) || klines.length < 2) return <EmptyChart />;
  const closes = klines.map((k) => k.close);
  const ma = computeMASeries(closes, [5, 10, 20]);
  const macd = computeMACDSeries(closes);
  const klineH = Math.floor(height * 0.6);
  const volH = Math.floor(height * 0.22);
  const macdH = showMacd ? height - klineH - volH : 0;
  return (
    <svg class="stock-candle-chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={buildAriaLabel(klines)}>
      <KLinePanel klines={klines} width={width} height={klineH} ma={ma} />
      <VolumePanel klines={klines} width={width} y={klineH} height={volH} />
      {showMacd && <MACDPanel macd={macd} width={width} y={klineH + volH} height={macdH} />}
    </svg>
  );
}
```

**关键实现细节**:
- X 等分: `(i / (n-1)) * (width - 60) + 0`, 最右 60px 留空 (axis gap)
- 蜡烛宽: `(width - 60) / n * 0.6`, 中间 40% 留白
- Wick: `<line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={color} />`
- Rect: `<rect x={cx - w/2} y={topY} width={w} height={max(h, 1)} fill={color} />`
- 颜色: `close >= open ? "var(--stock-up)" : "var(--stock-down)"` (红涨绿跌)
- 成交量: 按日 `volume` (用 amount), 颜色按当日涨跌
- MACD: 柱 = `(DIF - DEA) * 2`, 颜色按正负

**aria-label**: `"贵州茅台 30 日 K 线, 5/22 收盘 1850 涨 2.85%, 区间 1790-1870, MA5=1852 多头排列"`.

### 3.4 Indicators.js (UI 端重算)

```js
// src/renderer/stocks/indicators.js
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
  const k = 2 / (n + 1);
  const out = new Array(n - 1).fill(null);
  if (closes.length < n) return out.concat(closes.map(() => null)).slice(0, closes.length);
  let e = closes.slice(0, n).reduce((s, x) => s + x, 0) / n;
  out.push(e);
  for (let i = n; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function macdSeries(closes) {
  // ponytail: macd 需要 closes.length >= 26 才稳定; 不足返回空 hist.
  if (!Array.isArray(closes) || closes.length < 26) {
    return { dif: closes.map(() => null), dea: closes.map(() => null), hist: closes.map(() => null) };
  }
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const dif = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null,
  );
  // DEA = EMA9(DIF), 只对 DIF 非 null 段计算, 长度跟 closes 一样, 前面补 null
  const firstValidIdx = dif.findIndex((v) => v != null);
  if (firstValidIdx < 0 || dif.length - firstValidIdx < 9) {
    return { dif, dea: closes.map(() => null), hist: closes.map(() => null) };
  }
  const validDif = dif.slice(firstValidIdx);
  const deaTail = emaSeries(validDif, 9);
  const dea = [
    ...new Array(firstValidIdx).fill(null),
    ...deaTail,
  ];
  // 对齐长度防越界
  while (dea.length < closes.length) dea.push(null);
  const hist = closes.map((_, i) =>
    dif[i] != null && dea[i] != null ? (dif[i] - dea[i]) * 2 : null,
  );
  return { dif, dea, hist };
}
```

**纯函数**, 单测覆盖 5 个 case (空 / 长度不足 / 正常 / 边界 / NaN).

### 3.5 5 个 Tab 子面板

**行情 tab** (`MarketPanel.jsx` 内联在 drawer):
```jsx
function MarketPanel({ angleData }) {
  const pt = angleData["price_trend"]?.data;
  if (!pt || !Array.isArray(pt.klines)) return <EmptyTab reason="数据加载中…" />;
  return (
    <div class="stock-tab-panel">
      <CandlestickChart klines={pt.klines} width={680} height={360} />
      <MetricsRow>
        <MetricChip label="PE" value={fmt(pt.pe)} />
        <MetricChip label="PB" value={fmt(pt.pb)} />
        <MetricChip label="振幅" value={fmt(pt.amplitude, "%")} />
        <MetricChip label="换手" value={fmt(vt?.latestTurnover, "%")} />
        <MetricChip label="30 日" value={fmt(pt.change20d, "%")} />
      </MetricsRow>
    </div>
  );
}
```

**财务 tab** (`FinancePanel.jsx` 内联):
```jsx
function FinancePanel({ angleData }) {
  const v = angleData["valuation"]?.data;
  const p = angleData["profitability"]?.data;
  return (
    <div class="stock-tab-panel stock-tab-finance">
      <MetricCard label="动态 PE" value={fmt(v?.pe)} unit="倍" sub={v?.pePercentile3y != null ? `3年分位 ${(v.pePercentile3y * 100).toFixed(0)}%` : "—"} />
      <MetricCard label="PB" value={fmt(v?.pb)} unit="倍" />
      <MetricCard label="ROE" value={fmt(p?.roe)} unit="%" sub={p?.reportDate || "—"} />
      <MetricCard label="毛利率" value={fmt(p?.grossMargin)} unit="%" sub={p?.reportDate || "—"} />
    </div>
  );
}
```

**资金 tab** (`FundPanel.jsx` 内联):
```jsx
function FundPanel({ angleData }) {
  const cf = angleData["capital_flow"]?.data;
  if (!cf) return <EmptyTab />;
  return (
    <div class="stock-tab-panel stock-tab-fund">
      <div class="stock-fund-numbers">
        <div class="stock-fund-num"><span class="stock-fund-num-label">5 日主力净流入</span><span class="stock-fund-num-val up">{fmtAmount(cf.mainNetInflow5d)}</span></div>
        <div class="stock-fund-num"><span class="stock-fund-num-label">10 日主力净流入</span><span class="stock-fund-num-val up">{fmtAmount(cf.mainNetInflow10d)}</span></div>
      </div>
      <Sparkline closes={deriveSparkFromFlow(cf)} width={680} height={60} upColor="#ff3b30" downColor="#34c759" />
      <div class="stock-fund-meta">样本 {cf.sampleCount || 0} 天 · 数据源: 东财</div>
    </div>
  );
}
```

> ponytail: `deriveSparkFromFlow` 在 5d/10d 数字上"展开"成示意 sparkline — 用户看的是趋势, 不是精确日序列.
> 这是"宁少勿多"选择, 不动 capital_flow fetcher. 第二版再扩 `series` 字段.

**技术 tab** (`TechPanel.jsx` 内联):
```jsx
function TechPanel({ angleData, klines }) {
  const closes = klines?.map((k) => k.close) || [];
  const ma5 = lastN(closes, 5).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(5, closes.length));
  const ma10 = lastN(closes, 10).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(10, closes.length));
  const ma20 = lastN(closes, 20).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(20, closes.length));
  const macd = computeMACDSeries(closes);
  const lastDif = macd.dif.filter((v) => v != null).slice(-1)[0];
  const lastDea = macd.dea.filter((v) => v != null).slice(-1)[0];
  const lastHist = macd.hist.filter((v) => v != null).slice(-1)[0];
  return (
    <div class="stock-tab-panel stock-tab-tech">
      <div class="stock-tech-table">
        <h4>MA 均线</h4>
        <div>MA5 <b>{fmt(ma5)}</b></div>
        <div>MA10 <b>{fmt(ma10)}</b></div>
        <div>MA20 <b>{fmt(ma20)}</b></div>
        <div class="stock-tech-trend">{trendLabel(ma5, ma10, ma20)}</div>
      </div>
      <div class="stock-tech-table">
        <h4>MACD</h4>
        <div>DIF <b>{fmt(lastDif)}</b></div>
        <div>DEA <b>{fmt(lastDea)}</b></div>
        <div>柱 <b class={lastHist >= 0 ? "up" : "down"}>{fmt(lastHist)}</b></div>
      </div>
    </div>
  );
}
```

**舆情 tab** (`NewsPanel.jsx` 内联):
```jsx
function NewsPanel({ angleData }) {
  const items = angleData["news_buzz"]?.data?.items || [];
  if (items.length === 0) return <EmptyTab reason="近 7 日暂无相关新闻" />;
  return (
    <ul class="stock-news-list">
      {items.slice(0, 8).map((it, i) => (
        <li key={i} class={`stock-news-row sentiment-${it.sentiment}`}>
          <span class="stock-news-icon">{sentimentIcon(it.sentiment)}</span>
          <span class="stock-news-title">{it.title}</span>
          <span class="stock-news-date">{it.date}</span>
        </li>
      ))}
    </ul>
  );
}
```

### 3.6 折叠 AI 解读区

```jsx
function AiResultFoldable({ state, onCopy }) {
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
        <IconChevron size={12} class={`stock-ai-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div class="stock-ai-foldable-body">
          {state.status === "ready" ? <AiResultBlock result={state.result} /> : <AiStatusBlock state={state} />}
          {state.status === "ready" && (
            <button type="button" class="stock-btn stock-btn-secondary" onClick={onCopy}>
              <IconCopy size={12} /> 复制到剪贴板
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

**折叠状态**: 本地 useState, 不入 store (每个 drawer 实例独立).

## 4. 数据契约改动

### 4.1 price-trend fetcher 改动

**`src/stocks/detail-fetchers/price-trend.js`**:

```js
function summarize(klines) {
  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  return {
    closes,
    change5d: pctChange(closes, 5),
    change20d: pctChange(closes, 20),
    amplitude: avg(klines.map((k) => k.amplitude)),
    // 新增 — K 线图 / Hero bar / 指标重算都用这个
    klines: klines.map((k) => ({
      date: k.date,
      open: k.open, high: k.high, low: k.low, close: k.close,
      volume: k.amount,         // ponytail: amount(成交额元) 当作 volume(成交量) — 用户看的是活跃度, 不区分
      amplitude: k.amplitude,
    })),
    // 新增 — Hero bar 用, 不重打 IPC
    lastQuote: last && prev ? {
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
    } : null,
  };
}
```

**关键不变量**:
- 老契约 `closes / change5d / change20d / amplitude` 字段值不变, 已有调用方零修改
- `klines` / `lastQuote` 是纯增量, 不破坏 LLM / 60s cache key / 24h cache hash
- AI prompt 仍只看 closes/change (没改 buildAnalyzeMessages)

### 4.2 capital-flow fetcher 不改

按推荐方案, 资金 tab 用 `mainNetInflow5d/10d` 数字 + 示意 sparkline, 不扩 `series` 字段.

### 4.3 tech-indicators fetcher 不改

UI 端从 closes 重算, 0 后端侵入.

## 5. 错误处理

沿用现有错误分类 (§5 in stock-detail-ai-design), 增量改动:

| 层级 | 新增 reason | UI 文案 | 可重试 |
|---|---|---|---|
| Hero bar | `no_quote` | 现价位显示 "—" | 是 (切股票重拉) |
| Tab | `tab_loading` | tab 上 spinner | 否 (自动完成) |
| K 线图 | `klines_empty` | "K 线数据缺失" + 灰色骨架 | 是 (切股票) |

**失败隔离**:
- 1 个 tab 内 angle 失败 → 该 tab 角标 !, 不影响其它 tab
- 1 个 tab 内 angle 失败 → AI 解读仍可用 (LLM 收到缺数据的 fallback 标注)
- K 线图区失败 → Hero bar + 关键指标 chip 行仍正常显示

**降级顺序**:
1. K 线图区 loading → 显示骨架 + "加载中…"
2. K 线图区 failed → 显示 "K 线数据加载失败" + "重试" 按钮 (切股票)
3. 整个 angle 失败 → 显示 "数据源全挂" + 重试按钮

## 6. 测试

### 6.1 新增 / 改动测试

| 文件 | 类型 | 关键 case |
|---|---|---|
| `tests/renderer/components/CandlestickChart.test.jsx` | 新 | 空 klines / 单点 / 30 蜡烛 / MA 折线 3 条 / 成交量柱 / MACD 柱 / aria-label |
| `tests/renderer/stocks/indicators.test.js` | 新 | maSeries 5 case / emaSeries 5 case / macdSeries 5 case |
| `tests/renderer/stocks/StockDetailDrawer.test.jsx` | 改 | 渲染骨架 / tab 切换 / K 线区 / metric card / Hero bar / 折叠 AI |
| `tests/stocks/price-trend.test.js` | 改 | summarize 多返 klines/lastQuote, 老契约值不变 |
| `tests/renderer/stocks/StockDetailDrawer.test.jsx` | 加 | A11y: role=tab / aria-selected / aria-expanded |
| `tests/renderer/stocks/StockDetailDrawer.test.jsx` | 加 | 涨跌色: up class 红 / down class 绿 |

**估算**: 6 个测试文件, 净增 ~30-40 cases.

### 6.2 集成验证

- `npm run build:renderer` ✅
- `npx vitest run` → 全 PASS / 0 FAIL
- 手动: 开抽屉 → 输 600519 → 选股 → 行情 tab 看到 K 线 + MA + 量 + MACD + 关键指标
- 手动: 切财务 tab 看到 4 个 metric card
- 手动: 切资金 tab 看到 5/10 日数字 + sparkline
- 手动: 切技术 tab 看到 MA 表 + MACD 详情
- 手动: 切舆情 tab 看到新闻列表
- 手动: 点 AI 综合解读 → 折叠展开
- 手动: 失败场景 (断网 / 输错代码)

### 6.3 性能预算

- 抽屉打开 → 0ms
- Hero bar → 0ms (已有 selectedStock)
- 切股票 → 1-3s (并行 5 angle, 60s cache 命中更快)
- 切 tab → 0ms (若该 tab angle 已 ready) / 1-3s (lazy load)
- K 线图渲染 (30 蜡烛 + 60 副元素) → < 16ms
- Tab 切换 fade 动画 → 200ms

## 7. Cache-busting

发版时必须清空:
- `state.json.stockDetailCache` (24h AI cache)
- `_detailCache` (60s 内存, 进程重启即清)

**实现方式**: 在 `register-stock-detail.js` 里加 `version` 字段到 cache key, 新版本号变化 → 老 key 全 miss 自动重打.

```js
const CACHE_VERSION = 2;  // 改 schema 时 +1
function computeStockCacheKey(code, angles) {
  return `${CACHE_VERSION}|${code}|${angles.sort().join(",")}`;
}
```

## 8. 设计要点

- **K 线图 pure SVG**: 不引第三方库, 30 元素性能忽略
- **数据契约增量**: 字段加, 不改老值
- **UI 重算优先**: MA/MACD 在前端跑, 后端零侵入
- **Tab ≠ chip**: 视觉锚点 vs LLM 喂数据, 解耦
- **折叠 AI 区**: 首屏聚焦图表, AI 按需展开
- **A11y**: 涨跌色 + ▲▼ 字符, role/aria 全覆盖
- **暗色模式**: CSS 变量 + prefers-color-scheme

## 9. 不在本次范围

- ❌ K 线时间范围切换
- ❌ K 线全屏 modal
- ❌ 蜡烛 hover tooltip
- ❌ 拖拽缩放 / 十字光标
- ❌ 同业对比 / 大盘叠加
- ❌ 自定义 prompt 编辑
- ❌ 多轮对话追问
- ❌ 历史分析记录 (24h 外)
- ❌ 国际化 i18n

## 10. 实施 note

- 实施计划见 `docs/superpowers/plans/2026-06-28-stock-detail-ui-redesign-plan.md` (后续)
- 阶段四已建立稳定的 "main 拉 + IPC + 缓存 + shared-llm + prompt-registry" 模式, 本 spec 沿用
- K 线组件按 SVG 自渲染路线 (与现有 Sparkline 一致), 不引第三方图表库
- 优先实施 行情 tab + K 线 (信息密度收益最大), 财务/资金/技术/舆情 tab 可按 1 PR / 2 tab 节奏推进