# Metals Module Theme Refactor (Bloomberg CN variant)

## 背景

贵金属模块 (MetalLayout) 经过 Phase 1-3 已经具备:
- 30 天日线走势 (东方财富 kline + 自存 historyMap)
- 4 sparkline tab + 单 DetailTrend 大图
- 3 张总览卡 + 4 个 MetalCard (¥/克主价 + 持仓)

用户对**现有表现和整体主题**不满, 明确"重构"诉求. 经过 brainstorming 收敛:

| 决策 | 选项 |
|------|------|
| 重构范围 | 仅贵金属 Tab, 不动其他模块 |
| 配色方向 | Dark Bloomberg 质感 (深背景 + 红涨绿跌 = 国内金融 App 深色变体) |
| 信息密度 | Bloomberg 超密集 (44px 行高, 11-13px 字号) |
| 主体布局 | 表格 + sparkline 内嵌 (Bloomberg 标准) — 删 DetailTrend 大图 |
| 功能保留 | 持仓/关注/添加 全部保留 |
| 颜色逻辑 | A 股: 涨红 (`--metals-up: #ef4444`) / 跌绿 (`--metals-down: #22c55e`) |
| 主题污染 | 0 — 加 `--metals-*` 前缀 token, 不影响其他模块 |

## 目标

把 `MetalLayout` 从"卡片堆叠 + DetailTrend 大图" 重构为 **单表格密集视图**, 视觉上接近 Bloomberg Terminal 风格, 但保留 A 股配色习惯.

## 架构

### 1. Token 系统 (styles.css 新增)

```css
:root {
  /* Metals module — dark theme, scoped via --metals-* prefix */
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
  --metals-up: #ef4444;        /* 红涨 (A 股习惯) */
  --metals-down: #22c55e;      /* 绿跌 */
  --metals-flat: #6e7681;
}
```

**作用域**: 整个 `.metals-layout` 子树 (含 header / table / modal) 应用这些 token. **其他 Tab 不受影响.**

### 2. 组件重构

| 文件 | 操作 | 说明 |
|------|------|------|
| `MetalLayout.jsx` | 改 | render `<MetalHeader />` + `<MetalTable />` + `<AddMetalModal />` |
| `MetalHeader.jsx` | 改 | 单行 status bar (标题 + 3 总览数字 + 刷新按钮); 删除 3 总览卡 grid + tab bar |
| `MetalTable.jsx` | **新建** | 单表格组件 (~200 行), 每行 = 1 品种 |
| `MetalGrid.jsx` | **删除** | 被 table 取代 |
| `MetalCard.jsx` | **删除** | 不再用 |
| `MetalTrendStrip.jsx` | 保留 (注释标 "已废弃") | 当前 UI 不渲染, 文件不删避免破坏 export |
| `MetalDetailTrend.jsx` | **删除** | 不再用, sparkline 嵌入表格 |
| `AddMetalModal.jsx` | 不变 | 添加/编辑持仓流程不变 |

### 3. 布局结构

**Layout 视觉骨架:**

```
.metals-layout (background: --metals-bg-page)
├── .metals-header (深色横条, 1 行, height 56px)
│   ├── 标题 "贵金属" (icon + 文字)
│   ├── 中部: 总市值 ¥X | 总盈亏 +¥X | 今日预估 +¥X
│   └── 右侧: 最后更新时间 | 刷新按钮
└── .metals-table (深色表格)
    └── header row + 4 data rows (XAU / XAG / AU9999 / AG9999)
```

**表格列定义:**

| 列 | 宽度 | 内容 | 备注 |
|----|------|------|------|
| 品种 | 88px | `shortName` + 小字国内/国际 | 等宽, 固定 |
| 最新价 | 120px | `¥X.XX/克` 主显 | `tabular-nums`, 涨红跌绿 |
| 涨跌 | 110px | `↑ X.XX%` + `(+¥X.XX/克)` | 同色 |
| 30 天走势 | flex (min 140px) | `<Sparkline width=140 height=28>` | 涨红跌绿 |
| 持仓 | 130px | 持仓量 + 累计盈亏; 或 "+ 录入持仓" 文字链 | 等宽数字 |
| 操作 | 56px | ★ pin + ⋯ more 按钮 | icon-only |

**响应式**: < 800px 视口隐藏 "持仓" 列, sparkline 缩到 100px 宽.

**行高**: 44px (header row) / 44px (data row) — Bloomberg 标准.
**字体**: 等宽数字 (`tabular-nums`), 主文 13px, 副文 11px, 标题 15px.

### 4. 数据流 (不变)

| 流向 | 路径 |
|------|------|
| 主进程 → renderer | `metals:quote:changed` → `quoteCache` signal |
| 主进程 → renderer | `metals:history:changed` → `historyMap` signal |
| 后端拉取 | scheduler 每 5min 拉新浪 hf_* / 东方财富 push2delay |
| 历史拉取 | scheduler tick 后调 `snapshotDailyClose` 写 state.json; 冷启动 `triggerBackfill` 1h 冷却补齐 |
| 用户操作 | `AddMetalModal` → `upsertHolding` IPC → 持久化 |

### 5. MetalTable 组件设计

```jsx
// 伪代码
export function MetalTable({ onEdit }) {
  return (
    <table class="metals-table">
      <thead>
        <tr>
          <th>品种</th>
          <th class="num">最新价</th>
          <th class="num">涨跌</th>
          <th>30 天走势</th>
          <th class="num">持仓</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {METALS.map((m) => <MetalTableRow metal={m} onEdit={onEdit} />)}
      </tbody>
    </table>
  );
}

function MetalTableRow({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const arr = historyMap.value[metal.id] || [];
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));
  const trend = computeTrend(quote);
  // ... render row with all 6 cells
}
```

**关键 helper:**
- `computeTrend(quote)` → `{ changePerGramCNY, changePct, direction: 'up'|'down'|'flat' }`
- `formatCNY(value, decimals=2)` → `¥X.XX` (复用 metalStore 已有的)
- `isLoading(quote, error)` → 是否 loading skeleton 状态

### 6. 错误与 Loading 态

| 状态 | 行渲染 |
|------|--------|
| 无 quote (loading) | 表格行保留, 价格列显示 `.metals-cell-skeleton`, sparkline 列显示 "30 天加载中" |
| 有 error | 行加 `.metals-row-error` 类, 价格列显示错误文案 (用 IconAlert) |
| 有 quote 无 history | sparkline 列显示 "30 天加载中" |
| 全有 | 正常渲染 |

**Skeleton 复用**: Phase 2 已定义 `.metals-metal-tab-loading` 文字骨架; 表格里复用相同文案.

### 7. 测试

**保留 (不动):**
- `tests/metals/metal-config.test.js` — config 字段
- `tests/metals/metal-kline-fetcher.test.js` — kline fetcher
- `tests/metals/metal-scheduler-history.test.js` — scheduler snapshot/gap
- `tests/main/metal-ipc-history.test.js` — IPC handlers
- `tests/main/metal-ipc.test.js` — D1 refactor (含 scheduler mock)
- `tests/renderer/metals/metalStore-history.test.js` — store signals

**更新:**
- `tests/renderer/metals/MetalHeader.test.jsx` — 改: 1 行 status bar + 表格
- `tests/renderer/metals/MetalTrendStrip.test.jsx` — 删 (组件 UI 不再渲染)
- `tests/renderer/metals/MetalDetailTrend.test.jsx` — 删 (组件删除)

**新增:**
- `tests/renderer/metals/MetalTable.test.jsx` — 5 用例:
  1. 渲染 4 行 (XAU/XAG/AU9999/AG9999)
  2. quote 缺失 → 该行价格列 skeleton, sparkline 列 loading 文本
  3. quote 存在 → 渲染价格 + 涨跌 + sparkline svg
  4. holdings 有 → 持仓列显示数量; 持仓盈亏颜色
  5. holdings 空 → 持仓列 "+ 录入持仓" 文字链
- `tests/renderer/metals/MetalCard-polish.test.jsx` — 删
- `tests/renderer/metals/MetalGrid-empty.test.jsx` — 删

### 8. 不动的部分 (强约束)

- **scheduler / fetcher / IPC / preload** — 全部不碰
- **metalStore signals** — `quoteCache / fxCache / historyMap / selectedMetalId / config` 全保留 (即使 selectedMetalId 没人用了, 信号本身不动)
- **AddMetalModal** — UI 不变, 仅颜色受 `--metals-*` 影响
- **WatchlistModal / PinIcon** — 不变
- **其他 Tab** (IT 新闻 / 微博 / 世界杯 / 基金 / 选股 / AI 配置 / 版本检查) — 完全不动
- **existing scheduler mocks** — `tests/main/metal-ipc.test.js` 里有 mock scheduler 含 `snapshotDailyClose + detectHistoryGap`, 不能删

### 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 删 MetalCard / MetalGrid / MetalDetailTrend 影响外部 import | grep 整个 src/, 确认只有 MetalLayout 引用; 删除前再次验证 |
| styles.css `--metals-*` 污染其他模块 | 所有规则嵌套在 `.metals-layout` 选择器下, 不放 :root |
| 表格列宽在小窗口挤压 | `@media (max-width: 800px)` 隐藏持仓列 |
| 删除 MetalTrendStrip 测试影响回归 | 同步删, 加 MetalTable 测试覆盖 |
| colors 不够深 / 对比度不足 | WCAG check: 文本对比 ≥ 4.5:1 (--metals-text-primary vs --metals-bg-page = #e6edf3 vs #0d1117 = 13.5:1 PASS) |
| "Bloomberg 风格" 过度严肃 | 保留轻量圆角 (8px), 不要纯硬边; sparkline 末端圆点保留 (vibe 友好) |

### 10. 实施步骤 (粗)

1. `styles.css` 顶部加 `--metals-*` token + 嵌套选择器重写 metals 区域样式
2. 新建 `MetalTable.jsx` + 测试
3. 重写 `MetalHeader.jsx` (单 status bar)
4. 更新 `MetalLayout.jsx` (render Header + Table + Modal)
5. 删除 `MetalCard.jsx` / `MetalGrid.jsx` / `MetalDetailTrend.jsx`
6. 删除对应测试 (`MetalCard-polish`, `MetalGrid-empty`, `MetalTrendStrip`, `MetalDetailTrend`)
7. 更新 `MetalHeader.test.jsx`
8. 跑 `npx vitest run` + `node scripts/build-renderer.js`

预计改动:
- 源码: +1 (`MetalTable.jsx`) / 改 3 (`MetalLayout/Header/MetalHeader.test.jsx`) / 删 3 (`MetalCard/MetalGrid/MetalDetailTrend`)
- 测试: +1 (`MetalTable.test.jsx`) / 改 1 (`MetalHeader.test.jsx`) / 删 4 (`MetalCard-polish/MetalGrid-empty/MetalTrendStrip/MetalDetailTrend`)
- styles: +1 (新 --metals-* 块 + 嵌套重写)

---

**Spec 自审 (writing-clearly 视角):**

- 范围: ✅ 聚焦 (单一模块重构)
- 一致性: ✅ 数据流不变, 只换皮
- 歧义: ✅ selectedMetalId 暂时无人使用 → 保留信号但 UI 不驱动
- 占位符: ✅ 无 TBD/TODO
- YAGNI: ✅ 不引入新依赖, 不改 scheduler/IPC/数据层
