# Metals Trend Board Design

## 背景

贵金属模块 (MetalLayout) 当前只展示**当下快照**: MetalHeader 3 张总览卡 (总市值/总盈亏/今日预估) + MetalGrid 4 个 MetalCard (¥/克主价 + 昨收涨跌 + 持仓), 5 分钟 main 进程 scheduler 拉一次新浪 hf_* / 东方财富 push2delay。

用户视角的痛点:
- **看不到趋势**: 想判断"现在是不是高位" / "近 30 天是涨是跌", 只有单点 + 昨收变化。
- **总览卡信息密度低**: 3 张卡片区域大, 但只有 3 个数字 + 1 行汇率, 横向空间浪费。
- **Card 内部层级稍乱**: 持仓/录入持仓按钮/错误态/加载态叠加时比例失衡。

行业惯例: 价格类面板上方放近 N 天走势 (折线/区域), sparkline 给"一眼判断方向", 大图给"看区间+起终"。项目里已有 `src/renderer/components/Sparkline.jsx` (纯 SVG, 0 依赖), 直接复用。

## 目标

1. **4 个品种各自近 30 天日线走势** (折线 + 面积 + 终点圆点), 统一 ¥/克 口径。
2. **Header 重做**: 横向 4 列, 第 4 列是 4 个 sparkline 横排 (mini), 点击展开下方大图 (DetailTrend)。
3. **布局优化**: MetalCard 紧凑化 + AddMetalModal 文案润色 + 空状态改进。

## 数据源调研结论 (本期已验证 2026-06-28 实时拉取)

东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get?secid=...&klt=101&fqt=0&beg=YYYYMMDD&end=YYYYMMDD&lmt=N` 返 JSON, `data.klines` 数组每条 `日期,开盘,收盘,最高,最低,成交量,成交额`。

| 品种 | 历史 secid | 价格口径 | 备注 |
|------|-----------|---------|------|
| AU9999 (国内黄金) | `118.AU9999` | 元/克 | 直接可用 |
| AG9999 (国内白银) | `118.AG9999` | 元/千克 | 渲染时 ÷1000 → 元/克 |
| XAU (国际黄金, 沪金代理) | `113.AU<YYMM>` 主连 | 元/克 | 沪金期货日线, 跟 XAU 现货同向 |
| XAG (国际白银, 沪银代理) | `113.AG<YYMM>` 主连 | 元/千克 | 同上 |

**为什么用沪金/沪银做国际代理**:
- 用户视角的"近 30 天金价走势"是模糊诉求, 沪金/沪银期货 (上海期货交易所) 是人民币计价的连续合约, 跟 XAU/XAU 现货同向。
- 沪金本身就是 ¥/g, 跟 card 主显示口径一致, **不需要汇率换算**。
- 替代方案 (新浪 kline / 东方财富国际 secid) 已实测全部 `rc=100 data=null`, 不可行。
- 标题明示"沪金2608代理", 透明告知用户数据口径。

**主连合约月份选定策略**: 写死在 `metal-config.js` (`shfeMainContract: 'AU2608'`), 每月手工滚合约。简单粗暴可靠, 避免自动判定引入时间逻辑漏洞。

## 改动

### 1. 新增 `src/metals/metal-kline-fetcher.js`

东方财富 kline 客户端。注入 `httpGet(url, headers) => Promise<string>`, 跟现有 `metal-eastmoney-fetcher.js` / `metal-sina-hf-fetcher.js` 同款约定。

**exports**:
- `buildKlineUrl(secid, beg, end)` → 拼 URL。
- `parseKlineResponse(text, secid)` → 解析 JSON → `{ id, unit, points: [{date, open, close, high, low}], source }`。
- `dedupeByDate(points, maxDays=30)` → 按 date 去重, 保留最近 maxDays 条, 按 date 升序。
- `fetchMetalKline(items, httpGet)` → 批量并发拉 (同款 allSettled 隔离)。items = `[{id, secid, unitDivisor}]` (`unitDivisor: 1` 表示元/克, `1000` 表示元/千克)。

**边界**:
- `rc != 0 || data == null` → 抛 `Error('eastmoney kline parse failed for secid=...')`, 走 dispatcher's `Promise.allSettled` 隔离。
- 非 JSON / 空字符串 → 返回 `null`, 不抛。

### 2. 改 `src/metals/metal-config.js`

`METALS` 数组每项追加 2 字段:
- `historySecid: string` — 用于 kline 拉取 (国内 `118.AU9999`, 国际 `113.AU2608`)。
- `proxyLabel: string | null` — UI 上展示的"代理来源"标签 (国内 null, 国际 `"沪金2608代理"`)。
- `unitDivisor: number` — `1` (元/克) 或 `1000` (元/千克, 白银类)。

### 3. 改 `src/metals/metal-scheduler.js`

扩展 `MetalScheduler`, 加 2 个方法 + 1 个 tick hook:

```js
class MetalScheduler {
  // ... 现有 ...

  /**
   * 把当前 quotes 的 price 当作"当日 close"写入 historyMap.
   * 同日重复调用不重复写 (按 date 去重).
   * 超过 30 天的条目裁掉.
   * historyMap 在外部 (metal-ipc.js) 闭包持有, 这里通过 getter/setter 注入.
   */
  snapshotDailyClose(quotes, historyMap) {
    const today = isoDate(new Date());
    for (const [id, q] of Object.entries(quotes || {})) {
      if (!Number.isFinite(q.price)) continue;
      const arr = historyMap[id] || (historyMap[id] = []);
      if (arr.some((p) => p.date === today)) continue;
      arr.push({ date: today, close: q.price });
      arr.sort((a, b) => (a.date < b.date ? -1 : 1));
      while (arr.length > 30) arr.shift();
    }
  }

  /**
   * 检查 historyMap, 返 { need: [{id, secid, unitDivisor}] }.
   * 任意品种 history.length < 30 即触发补齐.
   * 全空也算 need (首次安装).
   */
  detectHistoryGap(historyMap, config) {
    const need = [];
    for (const m of config.metals) {
      const arr = historyMap[m.id] || [];
      if (arr.length < 30) {
        need.push({ id: m.id, secid: m.historySecid, unitDivisor: m.unitDivisor });
      }
    }
    return { need };
  }
}
```

主 tick `fetchNow()` 完成后, 调用方 (`metal-ipc.js`) 串行:
1. `scheduler.snapshotDailyClose(quotes, historyMap)` → 写当日。
2. `const gap = scheduler.detectHistoryGap(historyMap, config)` → 查缺口。
3. 若 `gap.need.length > 0 && now - lastBackfillAt > 3600000` → 调 `fetchMetalKline(...)` → 合并入 historyMap → 写 state.json → 更新 `lastBackfillAt`。
4. backfill 触发后广播 `metals:history:changed`。

**不变量**:
- backfill 失败不抛 (best-effort), 仅 log.warn, 下个 tick 再试。
- backfill 1h 冷却 (`lastBackfillAt`), 防止重启风暴。

### 4. 改 `src/main/metal-ipc.js`

加 2 个 IPC handler + 1 个持久化字段:

```js
// 复用现有 patchState 路径, metals 字段下加 historyMap
function loadConfig() {
  // ...
  historyMap: stored.historyMap || {},  // 新增
  lastBackfillAt: stored.lastBackfillAt || 0,  // 新增
  // ...
}

// 新 IPC handler
ipcMain.handle('metals:history:get', () => ({
  historyMap: loadConfig().historyMap,
  source: METALS.reduce((acc, m) => (acc[m.id] = { secid: m.historySecid, label: m.proxyLabel }, acc), {}),
}));

// 启动时 backfill 入口 (替代 trigger from inside scheduler)
function startBackfillTimer() { ... }  // 1h sweep
```

修改 `startMetalScheduler()`: 每次 `onUpdate` 触发后, 调 `snapshotDailyClose()`; 启动时立即检测 1 次 gap, 触发 backfill。

### 5. 改 `preload.js` (`window.metalsApi`)

加 2 个 method:
```js
getHistory: () => ipcRenderer.invoke('metals:history:get'),
onHistoryChanged: (cb) => {
  const handler = (_evt, data) => cb(data);
  ipcRenderer.on('metals:history:changed', handler);
  return () => ipcRenderer.removeListener('metals:history:changed', handler);
},
```

### 6. 改 `src/renderer/metals/metalStore.js`

加 1 个 signal:
```js
export const historyMap = signal({});
export const selectedMetalId = signal('XAU');  // 默认展开 XAU 的 detail

export async function initMetalStore() {
  // ... 现有 ...
  const hist = await window.metalsApi.getHistory();
  historyMap.value = hist.historyMap;
  _unsubHist = window.metalsApi.onHistoryChanged((data) => {
    if (data.historyMap) historyMap.value = data.historyMap;
  });
}
```

`cleanupMetalStore()` 同步解绑 `_unsubHist`。

### 7. 新增 `src/renderer/components/SparklineArea.jsx`

在现有 `Sparkline.jsx` 基础上加 area-fill 变体。**不修改**现有 Sparkline (向后兼容), 新组件 import Sparkline 内部 polyline + 自己加 `<defs><linearGradient id="sa-XXX"/></defs>` + 闭合 path。

props:
- `closes: number[]`
- `width: number = 280`
- `height: number = 80`
- `upColor / downColor / flatColor` (默认与 Sparkline 一致)
- `showEndpoints: boolean = true` — 是否画起点/终点圆点

实现要点:
- 闭合路径: `M x0,y0 L x1,y1 ... L xn,yn L xn,(height-yPad) L x0,(height-yPad) Z`。
- fill `url(#sa-grad-${colorKey})`, 渐变从 `currentColor` opacity 0.35 → 0。
- 颜色用 `currentColor` 让父容器控制 (CSS 改 stroke / fill, 不动 JS)。

### 8. 新增 `src/renderer/metals/MetalTrendStrip.jsx`

横向 4 列 mini sparkline 横排 + 选中态。

```jsx
import { historyMap, selectedMetalId } from './metalStore.js';
import { METALS } from '../../metals/metal-config.js';
import { Sparkline } from '../components/Sparkline.jsx';

export function MetalTrendStrip() {
  const selected = selectedMetalId.value;
  const select = (id) => { selectedMetalId.value = id; };

  return (
    <div class="metals-trend-strip">
      {METALS.map((m) => {
        const arr = (historyMap.value[m.id] || []);
        const closes = arr.map((p) => p.close / (m.unitDivisor || 1));
        const isSelected = m.id === selected;
        return (
          <button
            type="button"
            class={`metals-trend-cell${isSelected ? ' is-selected' : ''}`}
            onClick={() => select(m.id)}
            key={m.id}
          >
            <div class="metals-trend-cell-head">
              <span class="metals-trend-cell-name">{m.shortName}</span>
              {m.proxyLabel && <span class="metals-trend-cell-proxy">{m.proxyLabel}</span>}
            </div>
            <div class="metals-trend-cell-chart">
              {closes.length >= 2
                ? <Sparkline closes={closes} width={120} height={36} />
                : <div class="metals-trend-cell-skeleton">30 天加载中</div>}
            </div>
            <div class="metals-trend-cell-stats">
              {arr.length >= 1 ? (
                <>
                  <span>{closes.length} 天</span>
                  <span>起 ¥{closes[0]?.toFixed(2)}</span>
                  <span>终 ¥{closes[closes.length - 1]?.toFixed(2)}</span>
                </>
              ) : <span>—</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

### 9. 新增 `src/renderer/metals/MetalDetailTrend.jsx`

选中品种的大图 (折线 + 面积 + 起/终/高/低/区间文本)。

```jsx
import { historyMap, selectedMetalId } from './metalStore.js';
import { getMetalById } from '../../metals/metal-config.js';
import { SparklineArea } from '../components/SparklineArea.jsx';

export function MetalDetailTrend() {
  const id = selectedMetalId.value;
  const metal = getMetalById(id);
  if (!metal) return null;
  const arr = (historyMap.value[id] || []);
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));
  if (closes.length < 2) {
    return <div class="metals-detail-trend-empty">30 天数据待刷新</div>;
  }
  const first = closes[0];
  const last = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const pct = ((last - first) / first) * 100;
  // trend color
  const colorKey = last > first ? 'up' : last < first ? 'down' : 'flat';
  return (
    <div class={`metals-detail-trend metals-detail-trend-${colorKey}`}>
      <div class="metals-detail-trend-head">
        <span class="metals-detail-trend-name">{metal.name}</span>
        {metal.proxyLabel && <span class="metals-detail-trend-proxy">{metal.proxyLabel}</span>}
        <span class="metals-detail-trend-range">近 {closes.length} 天</span>
      </div>
      <div class="metals-detail-trend-figure">
        <span class="metals-detail-trend-last">¥{last.toFixed(2)}/克</span>
        <span class={`metals-detail-trend-pct pct-${colorKey}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
        <span class="metals-detail-trend-meta">
          {closes.length} 天前 ¥{first.toFixed(2)} → 今 ¥{last.toFixed(2)}
        </span>
      </div>
      <div class="metals-detail-trend-chart">
        <SparklineArea closes={closes} width={560} height={120} />
      </div>
      <div class="metals-detail-trend-stats">
        <span>高 <b>{high.toFixed(2)}</b></span>
        <span>低 <b>{low.toFixed(2)}</b></span>
        <span>均 <b>{avg.toFixed(2)}</b></span>
        <span>区间 <b>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</b></span>
      </div>
    </div>
  );
}
```

### 10. 改 `src/renderer/metals/MetalHeader.jsx`

把现有 3 总览卡 + 标题行的结构保留, 改为**4 列栅格**: 前 3 列是现有总览卡 (微调 padding), 第 4 列嵌入 `<MetalTrendStrip />`。

```jsx
<div class="metals-overview-cards">
  <div class="overview-card">总市值...</div>
  <div class="overview-card">总盈亏...</div>
  <div class="overview-card">今日预估...</div>
  <div class="overview-card overview-card-trend">
    <MetalTrendStrip />
  </div>
</div>
{selectedMetalId.value && <MetalDetailTrend />}
```

### 11. 改 `styles.css`

新增 / 改:
```css
.metals-overview-cards {
  grid-template-columns: 1fr 1fr 1fr 1.6fr;  /* 第 4 列稍宽 */
}
.overview-card-trend { padding: 10px 12px; }   /* 比其它卡紧凑 */
.metals-trend-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.metals-trend-cell { background: var(--surface-1); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 6px 8px; cursor: pointer; text-align: left; }
.metals-trend-cell:hover { border-color: var(--accent); }
.metals-trend-cell.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.metals-trend-cell:not(.is-selected) { opacity: 0.7; }
.metals-trend-cell-name { font-size: 12px; font-weight: 600; }
.metals-trend-cell-proxy { font-size: 10px; color: var(--text-tertiary); margin-left: 4px; }
.metals-trend-cell-skeleton { color: var(--text-tertiary); font-size: 10px; }
.metals-trend-cell-stats { display: flex; gap: 6px; font-size: 10px; color: var(--text-secondary); }
.metals-detail-trend { padding: 14px 16px; background: var(--surface-1); border: 1px solid var(--border-subtle); border-radius: 8px; margin: 8px 0 12px; }
.metals-detail-trend-head { display: flex; gap: 8px; align-items: baseline; }
.metals-detail-trend-figure { display: flex; gap: 12px; align-items: baseline; margin: 8px 0; }
.metals-detail-trend-last { font-size: 24px; font-weight: 700; }
.metals-detail-trend-pct.pct-up { color: var(--color-up); }
.metals-detail-trend-pct.pct-down { color: var(--color-down); }
.metals-detail-trend-stats { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-top: 6px; }
.metals-detail-trend-empty { padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 12px; }

@media (max-width: 800px) {
  .metals-overview-cards { grid-template-columns: 1fr 1fr; }
  .metals-trend-strip { grid-template-columns: 1fr 1fr; }
}
```

颜色全部走 CSS 变量, light/dark 模式自动适配。

### 12. MetalCard 布局微调 (`src/renderer/metals/MetalCard.jsx` + CSS)

- 卡片 padding `16px → 14px`。
- "录入持仓"按钮 → 文字链 `+ 录入持仓` (减小视觉权重)。
- 错误态卡片高度与正常态对齐 (避免 reflow)。

### 13. AddMetalModal 文案润色 (`src/renderer/metals/AddMetalModal.jsx`)

- cost currency 切换时若输入非空, 保留输入 (现行为已 OK, 文档化)。
- 错误文案: "请输入有效的数量" → "数量必须大于 0"。
- fx 缺失时 preview 文案加 icon (现有 IconAlert 已就绪)。
- aria-label 加描述 (`'添加贵金属关注'` / `'编辑 XAU 持仓'`)。

### 14. 空状态改进 (`src/renderer/metals/MetalGrid.jsx`)

把单一按钮换成 ghost 卡片列表: 显示 4 个候选品种 (黄金/白银/AU9999/AG9999) + 各自的 icon + 一键关注按钮。点中后该卡片从候选中淡出。

## 不做

- 不做 candle 蜡烛图 (用户选了 area-line)。
- 不做跨品种对比图 (4 个独立 sparkline 已够)。
- 不做"自定义时间窗口" (30 天固定, 先验证产品需求)。
- 不做时间序列导出 / 分享。
- 不做 30 天均价等统计图表 (仅显示文本标签)。
- 不改 MetalCard 主结构 (仅 padding + 持仓按钮文案润色)。
- 不改 AddMetalModal 数据模型 (仅 UI 文案/视觉润色)。
- 不重写 scheduler (扩展现有 scheduler, 不另起新调度器)。
- 不重写 metalStore 的 IPC listener 机制。
- 不引入新依赖 (图表继续走 SVG)。
- 不做 dark mode 颜色单独适配 (复用现有 CSS 变量)。
- 不改 Sparkline 组件 (向后兼容, 新做 SparklineArea)。
- 不动 MetalCard 的涨跌颜色逻辑。
- 不动 calcChange / calcHoldingPnl 等纯函数。

## 验收

### 后端测试 (5 个新文件)

1. `tests/metals/metal-kline-fetcher.test.js`
   - `parseKlineResponse` 5 个分支: 正常响应 / `rc=100 data=null` / 空字符串 / 非 JSON / 缺字段。
   - `dedupeByDate`: 同日重复 → 保留 1 条; 超 30 天 → 裁剪; 排序正确。
   - `buildKlineUrl`: secid + beg + end 拼接正确。
   - `fetchMetalKline`: 部分失败 → 返部分结果; 全失败 → 抛聚合 error。

2. `tests/fixtures/eastmoney_kline/au9999_day30.txt` — 真实东方财富响应 fixture (从本次调研抓的)。

3. `tests/metals/metal-scheduler-history.test.js`
   - `snapshotDailyClose`: 同日重复调用 → 数组不变; 不同日 → 累加; 超 30 天裁剪。
   - `detectHistoryGap`: 全空 → need=4; 满 30 → need=[]; 部分缺口 → 只列缺口品种。

4. `tests/main/metal-ipc-history.test.js`
   - `metals:history:get` handler: fixture state → 返 historyMap。
   - backfill 1h 冷却: 第二次触发在 1h 内 → 跳过。

5. `tests/main/metal-history-flow.test.js`
   - 启 scheduler → mock http 喂 kline 响应 → 跑 1 tick → 验 state.json `metals.historyMap` 写入 → IPC 拉回一致。

### 前端测试 (4 个新文件 + 1 个改)

6. `tests/renderer/SparklineArea.test.jsx` — 新组件单测: 空数组 / 单点 / 2 点 / 30 点 / 闭合 path / endpoint circle。
7. `tests/renderer/metals/MetalTrendStrip.test.jsx` — 4 个 cell 渲染; 点击切换 selectedMetalId; history 为空 → 骨架占位。
8. `tests/renderer/metals/MetalDetailTrend.test.jsx` — 选中 XAU → 渲染 XAU 数据; 涨/跌/平三色; 空 history → "30 天数据待刷新"。
9. `tests/renderer/metals/MetalHeader.test.jsx` — 4 列栅格结构; selectedMetalId 切换 → DetailTrend 同步。
10. `tests/renderer/metals/MetalCard.test.jsx` — 补: padding 微调后结构稳定; "录入持仓"是文字链样式。

### 视觉

`tests/renderer/metals-trend-visual.test.jsx` snapshot: `MetalHeader` + 选中 XAU + 含 30 天 fixture → 输出 snapshot。

### 手工

1. `npm start` → 切到贵金属 → 看到 Header 4 列 (3 总览 + 4 sparkline 横排) → 默认 XAU 高亮 → 下方展开 XAU 30 天大图。
2. 依次点击 XAG / AU9999 / AG9999 → 选中态切换 + 大图内容切换。
3. 删光所有持仓 → 看到新空状态 (4 候选品种 ghost 卡片)。
4. 切到添加 modal → 错误文案润色 → aria-label 通过屏幕阅读器。
5. 重启 app → 30 天数据从 state.json 即时加载 (无 loading 阻塞)。
6. 删除 watchedIds 里某品种 → 重启 → historyMap 该项保留; 加回 → 立刻有图。

### 回归

- `npx vitest run` 全 PASS, 0 FAIL。
- `node scripts/build-renderer.js` exit 0。
- 老 API (`metals:list` / `metals:quote:fetch` / `metals:quote:state`) 全部不动, 向后兼容。
- `state.json.metals.historyMap` 缺失 → 视为空, 不报错。

## 风险

- 沪金主连每月换月: 写死在 config, 若忘记改月 → backfill 失败 → log.warn; 下个手动 tick 仍可重试。每月发版时人工校准。
- 冷启动用户首次安装: scheduler 启动后立即 backfill 1 次 (~2s), UI 期间显示骨架屏。可接受。
- 东方财富 kline 接口限流: 4 个 secid × 1 次 = 4 个 HTTP, 跟现有实时 fetch 错峰 (实时每 5min 1 轮, kline 仅冷启动 + 换月时触发), 不会撞限流。
- historyMap 写入 state.json: 每 tick (5min) snapshotDailyClose 检查是否同日 → 实际写入平均 1 次/天, 写放大可忽略。
- Sparkline + SparklineArea 共存: 文件分离, 不破坏现有 4 处 Sparkline 使用方。
- AG9999 `unitDivisor=1000` 折算: 在 fetcher 解析时除, 不在 UI 折算, 避免重复除法误差。

## 影响面

- 新增 7 个文件 (1 fetcher + 2 组件 + 4 测试) + 1 个 fixture。
- 修改 9 个文件 (config / scheduler / ipc / preload / store / MetalHeader / MetalCard / AddMetalModal / MetalGrid + 1 个 CSS)。
- 净增约 +650 / -80 行。
- 不引第三方图表库 (SVG 自写)。
- 不改 IPC 协议 (只加 method)。
- 不破坏向后兼容 (historyMap 缺失视为空)。

## ponytail ceiling 注释

- `snapshotDailyClose` ceiling: 5min tick × 30 天 = 上限 8640 个数据点, 安全; 90 天窗口需重新设计压缩。
- `detectHistoryGap` ceiling: 1h 冷却, 重启风暴下不会狂拉东方财富; 但并发重启 (多窗口) 仍可能瞬时 4 × N 个请求, 待下期评估是否加全局去重锁。
- `SparklineArea` ceiling: 单图 < 50 个 polyline 点, SVG 性能可忽略; 上 1000 点需转 canvas。
