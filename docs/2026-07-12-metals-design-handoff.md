# 贵金属模块 · 组件级设计交付规范（Design Handoff）

> **设计方**：UI Designer ｜ **日期**：2026-07-12 ｜ **配套**：`metals-redesign-prototype.html`（高保真原型）、`2026-07-12-metals-redesign-analysis.md`（分析）
> **范围**：方案 B 双栏 IA + V2 金点缀；**纯行情数据看板**——P0 纯前端重组 + P1 可视化增强（K 线 / 指标卡 / 市场状态）。**交易下单 / 券商接入 / 订单状态机 / 持仓记账全部不做**（见 §4 说明）。
> **范围变更**：原型评审后用户明确"不需要交易下单，也不要任何持仓/记账内容，只保留纯行情数据看板能力"。本文档已移除 OrderTicket / OrderList / tradingApi / PositionGrid / 交易向 SandboxBanner / 持仓 Summary 等内容，与 `metals-redesign-prototype.html` 对齐。
> **令牌真源**：`styles.css` 统一体系（`ui-design-system.md`）；本模块仅新增 scoped `--metals-gold`，禁止裸 hex。

---

## 1. 组件树

```
MetalsModule
├── DataBanner              示例数据提示（常驻，中性）
├── MetalsHeader
│   ├── TitleBlock          medal + 标题 + 副标
│   └── StatusCluster      市场状态徽标(实时行情) + 刷新
└── MetalsMain (grid)
    ├── WatchlistPanel
    │   └── WatchRow × N    可选中 + ★关注
    └── DetailPanel         (<900px 降级为底部抽屉)
        ├── DetailHeader    品种名 + 现价 + 涨跌
        ├── ChartCard       KLineSVG + VolumeSVG + IntervalSeg(日/周/月)
        └── IndicatorGrid   5 格：现价/涨跌/振幅/52w高/52w低
```

> 注：`SummaryTriple`（总市值/总盈亏/今日预估）与 `PositionGrid`（持仓概览/目标备注）已从原型与组件树移除——模块收敛为纯行情数据看板，不含任何持仓/记账内容。

---

## 2. 设计令牌映射（本模块用到）

| 用途 | 令牌 | 备注 |
|------|------|------|
| 主强调（主操作/按钮） | `--accent-primary` (`#007aff`) | 仅用于主按钮等，无买/卖语义（模块无交易） |
| 涨 | `--color-up` (`#ff3b30`) | 红，配 ▲ |
| 跌 | `--color-down` (`#34c759`) | 绿，配 ▼ |
| 模块品牌点缀 | `--metals-gold` (浅 `#b8893b` / 暗 `#e2c275`) | 选中条/品牌点/示例数据提示，**用量<5%** |
| 表面 / 边框 | `--surface` `--border` `--bg-secondary` | 跟随明暗主题 |
| 文字 | `--text-primary/-secondary/-tertiary` | |
| 圆角 | `--radius-sm/md/lg` (6/10/14) | 输入/按钮/卡片/弹窗 |
| 间距 | `--sp-2/3/4` (8/12/16) | 行内距/区块/页面 |
| 字号 | `--fs-2xs…4xl` (10…28) | 元信息/正文/价格大数 |
| 数字 | `tabular-nums` | 价格/金额等宽对齐 |
| 阴影 | `--shadow-sm/md/lg` | 卡片/hover/抽屉 |
| 动效 | `cubic-bezier(0.22,1,0.36,1)` (ease-out-quart)；`--t-norm 280ms` | 面板/抽屉过渡 |
| 焦点 | `--focus-ring` | 全局 `:focus-visible` |

> **新增令牌**（需加入 `styles.css`，作用域 `.metals-layout` 或全局均可，因仅模块用）：
> `--metals-gold:#b8893b;` 与 `[data-theme="dark"]{--metals-gold:#e2c275;}`；附 `--metals-gold-soft` / `--metals-gold-line` 半透明衍生。

---

## 3. 组件规格

### 3.1 MetalsHeader
- **布局**：flex，wrap；标题左、Status 右（窄屏 Status 占满换行）。
- **StatusCluster**：`badge.open`（实时行情，绿点脉冲）；刷新按钮 `ghost-btn`，点击 → `⟳ 更新中…` 禁用 ~900ms。
- **a11y**：`header` 语义；市场状态 `aria-label="实时行情"`。

### 3.2 WatchlistPanel / WatchRow
- **尺寸**：行高 `--row-h:48px`（≥44 触控）；网格 `1.3fr 1fr 0.9fr auto 30px`（名称 / 价格 / 涨跌 / sparkline / ★关注）；padding `0 16px`。
- **选中态**：左侧 3px `--metals-gold` 竖条 + 行底 `--metals-gold-soft`；未选中 hover `--bg-secondary`。
- **内容**：名称(短+国内/国际标签) / 价格`num` / 涨跌(`▲%` + `(±¥/克)`) / sparkline(84×30 SVG) / ★关注按钮(30×30)。
- **a11y**：`role="button" tabindex=0`，Enter/Space 选中；★ `aria-label="关注"`；sparkline `aria-hidden`（文字涨跌已承载信息）。

### 3.3 DetailPanel（抽屉）
- **桌面 ≥900px**：grid 右列并排，常驻。
- **移动 <900px**：`position:fixed; bottom:0; transform:translateY(102%)` → `.open` 滑入；配 `scrim` 遮罩（点击关闭）；关闭按钮仅移动端显示。
- **过渡**：`transform 280ms ease-out-quart`；`prefers-reduced-motion` 关闭。

### 3.4 ChartCard（K 线 + 量）
- **KLine**：复用项目已有 `CandlestickChart.jsx`（props：数据/周期）；容器 `width:100% height:200px`，`preserveAspectRatio="none"`。
- **Volume**：副图 `height:42px`，柱用 `--text-tertiary` 0.5 透明。
- **末值参考线**：虚线 `--metals-gold-line`，标识最新价。
- **IntervalSeg**：segmented control（日/周/月），选中项 `--surface`+`--shadow-sm`。
- **a11y**：`svg aria-label="XAU 日 K 线"`；周期切换 `role="tablist"`。

### 3.5 IndicatorGrid
- 5 格 `repeat(5,1fr)`；`<520px`(容器查询) → `repeat(2,1fr)`。
- 每格：label(`--fs-2xs` tertiary) + value(`--fs-md` 600 `num`)；涨跌格带 `up/down` 类。

---

## 4. 交易 / 持仓能力已取消（说明）

> 原 §4（tradingApi 数据契约 + 订单状态机）与 §3.7/§3.8（OrderTicket / OrderList）、以及 `PositionGrid` / `SummaryTriple` / `AddMetalModal` **整体移除**。模块定位为**纯行情数据看板**，不含任何交易下单、券商接入、订单状态或持仓记账。如未来需补交易或持仓，须独立立项：新增券商适配层 + preload `tradingApi` + 下单票/订单 UI + 合规护栏，或新增本地 `config.holdings` 记账层 + 持仓归因组件；本文档不预留交易或持仓钩子。

---

## 5. 响应式规格

| 断点 | 布局 |
|------|------|
| ≥900px | `MetalsMain` 双栏 `minmax(300,0.9fr) minmax(360,1.2fr)`；详情常驻 |
| <900px | 单栏；详情 → 底部抽屉 + scrim；Status 占满换行 |
| 容器 <520px | IndicatorGrid 5→2 列 |
| 触控 | 行高/按钮 ≥44px；drawer 遮罩关闭 |

---

## 6. 实现检查清单（P0 / P1）

**P0 — 纯前端重组**
- [ ] `MetalLayout` 改双栏网格；`MetalHeader` 加市场状态徽标（去掉持仓 Summary 三数）。
- [ ] `WatchlistPanel` 替代原 `MetalTable` 行交互，选中驱动 `selectedMetalId`（复用现有 signal）。
- [ ] `DetailPanel` 新增：DetailHeader / ChartCard（接 `CandlestickChart`）/ IndicatorGrid。
- [ ] 令牌：加入 `--metals-gold*`；红涨绿跌沿用 `--color-up/down` + ▲▼ 字形。
- [ ] 响应式：<900px 抽屉 + scrim；容器查询降级指标栅格。
- [ ] a11y：语义标签、焦点环、`aria-label`、reduced-motion。

**P1 — 可视化增强（无交易 / 无持仓）**
- [ ] ChartCard：K 线主图 + 成交量副图 + 区间切换（日/周/月），复用 `CandlestickChart`。
- [ ] IndicatorGrid：现价/涨跌/振幅/52w高/低 五格指标卡。
- [ ] 市场状态：交易中/休市语义徽标 + 会话时间。
- [ ] DataBanner「示例数据」中性提示替换交易向沙箱横幅。

**护栏**
- [ ] 禁止裸 hex（Stylelint `color-no-hex`）；所有色走令牌。
- [ ] 不动原 scheduler/fetcher/IPC/数据层。
- [ ] 不引入 `tradingApi` / `AddMetalModal` / `config.holdings` 等交易或持仓钩子。

---

**UI Designer** · 2026-07-12 · 交付物：分析 + 原型 + 本规范，可直接进入 P0 / P1（纯行情数据看板）实现评审。
