# 基金管理系统 · 开发改造计划（2026-07-14）

> 目标：把 `fund-management-redesign/` 的蓝绿色原型，落地为 Pulse 现有 `invest/funds` 模块的真实工程实现。
> 本文是 **实施计划（非代码）**，分 6 个阶段，每阶段带质量门禁。

---

## 0. 现状盘点（必须读完再动手）

### 0.1 已有地基（可直接复用，别重写）
| 资产 | 位置 | 说明 |
|---|---|---|
| 投资面板外壳 | `src/renderer/invest/InvestLayout.jsx` + `InvestLayoutHeader.jsx` + `InvestLayout.css` | 顶级 nav：基金 / 贵金属 / 选股；统一刷新按钮、键盘 tablist |
| 基金容器 | `src/renderer/funds/FundLayout.jsx` (`FundContent`) | 现渲染 `FundHero + CategoryTabs + FundCardGrid + FundPnlHistory` |
| 基金数据层 | `src/renderer/funds/fundStore.js` | signals + computed：`holdings` / `navCache` / `navHistoryCache` / `dailySnapshots` / `categoryAllocation` / `totalMetrics` / `filteredRows` / `pnlRollups` / `benchmark(000300)`；actions：`loadFunds/loadNavState/loadFundHistory/fetchNavNow/prefetchAllNavHistory/subscribeNavUpdates/openAddModal/openEditModal` 等 |
| 卡片网格 | `Funds/FundCard.jsx` `FundCardGrid.jsx` | 现有列表卡片 |
| 净值 sparkline | `Funds/FundCardSparkline.jsx` | **正确写法**：`viewBox="0 0 100 24" preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"` + `stroke="var(--color-up)"` |
| 图表子组件 | `FundAllocationDonut.jsx` `FundPortfolioTrend.jsx` `FundPnlHistory.jsx` | donut / 走势 / 盈亏历史已存在 |
| 弹窗 | `AddFundModal.jsx` `FundAlertModal.jsx` `CategoryTabs.jsx` | 加自选 / 预警 / 分类 tab |
| 设计令牌 | `styles.css`（`:root` + dark block） | OKLCH、`--accent-primary:#007aff`、红涨绿跌 `--color-up`/`--color-down`、4px 基线、`--space-*`/`--radius-*` |
| 现有基金设计文档 | `docs/fund-ui-redesign-2026-07-13.md` | 已按「Apple 原生令牌、系统蓝、红涨绿跌、无裸 hex、无新令牌」重构 |

### 0.2 关键冲突（本计划必须解决）
**配色分歧**：本会话原型 = 蓝绿色系（teal 主色）；项目现有基金模块（2026-07-13 文档）= Apple 系统蓝 + 红涨绿跌，且 stylelint 禁止裸 hex / 未知令牌。
→ 解决见 §1.1。

**导航模型分歧**：原型用 hash 路由切 4 视图；项目用 signals（`fundView`）切二级 tab，且与 `InvestLayoutHeader` 的 `FUND_VIEW_TABS` 耦合。
→ 解决见 §1.2。

**图表技术分歧**：原型用 `cv()` 把 CSS 变量解析成具体色值写进 SVG（因担心 var() 不解析）；但现有 `FundCardSparkline` 实测 `stroke="var(--color-up)"` 在 Electron/Chromium 可正常解析。
→ 解决见 §1.3。

---

## 1. 关键决策（落地前需确认）

### 1.1 配色：作用域蓝绿 fund 主题 + 保留红涨绿跌
- **新增作用域令牌**（写进 `styles.css` 的 `:root` 与 `[data-theme="dark"]`，OKLCH、零裸 hex、过 stylelint）：
  - `--fund-brand`（teal 主色，对应原型 `--brand`）、`--fund-brand-2`、`--fund-accent`（蓝，对应 `--accent`）
  - `--fund-brand-soft` / `--fund-line` / `--fund-ink`（浅底/描边/文字）
  - 深浅两套：dark 下提亮 L、保持 hue
- **数据语义不动**：涨/跌继续用既有 `--color-up`（红）/ `--color-down`（绿），符合 A 股习惯与现有令牌。原型的 `--pos`(绿涨)/`--neg`(红跌) **不引入**，避免与项目冲突。
- **理由**：用户明确要蓝绿「金融风格」，但项目已强约束 Apple 体系；引入*作用域* blue-green 主题既满足视觉诉求，又不污染全局、不破 stylelint。

### 1.2 导航：扩展 `fundView` 为 4 视图路由
- 现有 `fundView` ∈ `all | watch`。改为基金子路由 signal：`fundRoute = { page: 'dashboard'|'list'|'trade', view:'all'|'watch', code?:string }`，或新增 `fundPage` signal（`dashboard|list|trade`）+ `selectedFundCode` signal（详情为列表下钻，非独立 tab）。
- 在 `InvestLayoutHeader` 的 `FUND_VIEW_TABS` 改为 `概览 / 列表 / 交易`（详情从列表行点击进入，写 `selectedFundCode`）。
- 保持与 `investPrimary`（基金/贵金属/选股）两级结构一致，键盘 tablist 模式不变。

### 1.3 图表：对齐项目既有 SVG 模式
- **Sparkline**：直接复用 `FundCardSparkline` 的 `preserveAspectRatio="none" + vector-effect="non-scaling-stroke"` 写法（已验证无裁切/溢出问题，正是原型折腾 3 轮想解决的）。原型里 `cv()` 只保留用于**渐变 `stop-color` 与 `<text fill>`**（这两处 var() 风险高），stroke 直接用 `var(--fund-*)`。
- **面积/环形/柱状/雷达**：沿用原型手绘 SVG 引擎，但颜色取值统一走 `cv()`（渲染时 getComputedStyle 解析），保证深浅主题切换正确。

### 1.4 数据层缺口（需新增）
- 申购/赎回：新增 `tradeRecords` signal + `submitPurchase(code, amount)` / `submitRedeem(code, shares)` actions（原型为模拟，真实需接主进程/IPC）。
- 风险评级：新增 `riskRating(code)` computed 或字段（原型用模拟 R1–R5 指标）。
- 持仓明细：现有 `holdings` 可复用，需补「个基持仓占比」维度。

---

## 2. 目标架构

```
src/renderer/funds/
  fundRoute.js            # 新增：fundPage / selectedFundCode / fundView signals + 切换 actions
  FundDashboard.jsx       # 新增：概览仪表盘（KPI 条 + 资产走势 + 持仓分布 + 收益对比 + 最近交易 + 风险概览）
  FundList.jsx            # 新增/重构：多维筛选 + 排序表 + 分页 + 骨架（基于现有 FundCardGrid 演进）
  FundDetail.jsx          # 新增：净值走势 + 持仓明细 + 交易记录 + 风险雷达（复用 FundPortfolioTrend/FundAllocationDonut）
  FundTrade.jsx           # 新增：申购/赎回表单 + 交易历史 + toast 反馈
  FundSparkline.jsx       # 改名/收敛现有 FundCardSparkline 为共享 sparkline
  FundAreaChart.jsx       # 新增：面积走势（hover 竖线+圆点+tooltip，复用原型 charts.area 逻辑）
  FundDonut.jsx           # 收敛现有 FundAllocationDonut
  FundRadar.jsx           # 新增：风险雷达
  fundStore.js            # 扩展：tradeRecords / submitPurchase / submitRedeem / riskRating
  funds.css               # 新增：fund 模块专属样式（或并入 styles.css 基金区块，遵循现有分区约定）

src/renderer/invest/
  InvestLayoutHeader.jsx  # 改：FUND_VIEW_TABS → 概览/列表/交易
  InvestLayout.jsx        # 改：按 fundPage 渲染 FundDashboard/FundList/FundTrade；detail 为 FundList 下钻
```

> 图表引擎（`charts.js` 原型的 area/donut/bars/radar/sparkline）**不整体搬入**，而是按上面拆成 Preact 组件，逐个接入真实 signals 数据。

---

## 3. 分阶段实施

### Phase 0 — 令牌与主题（半天）
- [ ] `styles.css` 新增 `--fund-*` 浅/深两套令牌（OKLCH，零裸 hex）
- [ ] 加 `prefers-reduced-motion` 已全局存在，确认 fund 动效继承
- [ ] 质量门禁：`npx stylelint styles.css` 无新增裸 hex / 未知令牌
- [ ] 交付：深/浅切换验证蓝绿主题生效

### Phase 1 — 概览仪表盘（1–1.5 天）
- [ ] `fundRoute.js`：fundPage signal + actions
- [ ] `FundDashboard.jsx`：KPI 条（总市值巨号 + 今日预估/总盈亏/收益率，走 `totalMetrics`）、资产走势（`FundAreaChart` 接 `navHistoryCache` + 区间 1M/3M/6M/1Y）、持仓分布（`FundDonut` 接 `categoryAllocation`）、收益对比 bar（接 benchmark `000300`）、最近交易、风险概览
- [ ] `InvestLayoutHeader` 二级 tab 加「概览」
- [ ] 质量门禁：`vitest` 加 dashboard 渲染测试；`build:renderer` 通过

### Phase 2 — 基金列表（1 天）
- [ ] `FundList.jsx`：名称/类型/风险多维筛选（`filteredRows` 扩展）、列排序（净值/涨跌幅/累计收益）、分页、骨架屏（`Skeleton.jsx` 复用）
- [ ] 行点击 → `selectedFundCode` + `fundPage='detail'`
- [ ] 移动端表格→卡片态（参考现有 `card-mode` 媒体查询）
- [ ] 质量门禁：排序/筛选单测；playwright 快照

### Phase 3 — 基金详情（1–1.5 天）
- [ ] `FundDetail.jsx`：净值走势（区间切换 + hover tooltip，复用 `FundAreaChart`）、持仓明细表（接 `holdings`）、交易记录表、风险雷达（`FundRadar` 接 `riskRating`）、返回列表
- [ ] 质量门禁：下钻/返回路由测试

### Phase 4 — 交易管理（1–1.5 天）
- [ ] `FundTrade.jsx`：申购/赎回 segmented 表单（金额校验、预计份额/到账实时算、快捷金额）、确认弹窗（`ModalShell.jsx` 复用）、交易历史表（状态徽章）、成功/错误 toast（`toast-store.js` 复用）
- [ ] `fundStore.js`：新增 `tradeRecords` / `submitPurchase` / `submitRedeem`（先 mock + IPC 桩，标注 TODO 接主进程）
- [ ] 质量门禁：表单校验单测；toast 触发测试

### Phase 5 — 外壳收尾 + QA（1 天）
- [ ] 左侧菜单/顶部导航接入 fund 4 视图（确认 `AppShell`/`SideNav` 入口）
- [ ] 实时刷新：手动刷新（现有 `nav-refresh`）+ 自动轻量同步（`subscribeNavUpdates` 已存在）
- [ ] 响应式全量走查（≤1080 / ≤860 / ≤560 断点）
- [ ] 对比度 WCAG AA、焦点环、触控 ≥44px、`prefers-reduced-motion`
- [ ] 质量门禁：`vitest run funds` + `test:visual`（playwright 快照对比）+ `build:renderer` + `build:mac` 冒烟

---

## 4. 设计系统对接（Handoff 规格）

### 4.1 新增令牌表（节选）
| Token | 浅色 (OKLCH) | 深色 (OKLCH) | 用途 |
|---|---|---|---|
| `--fund-brand` | `oklch(0.58 0.085 195)` | `oklch(0.72 0.10 195)` | 主操作/图表主描边/品牌 |
| `--fund-brand-2` | `oklch(0.52 0.100 210)` | `oklch(0.68 0.11 210)` | 渐变次色/辅助线 |
| `--fund-accent` | `oklch(0.55 0.120 250)` | `oklch(0.70 0.12 250)` | 链接/强调 |
| `--fund-brand-soft` | `oklch(0.955 0.028 195)` | `oklch(0.30 0.045 195)` | 浅底徽章/选中态 |
| `--fund-line` | `oklch(0.86 0.05 195)` | `oklch(0.40 0.06 195)` | 描边 |
| `--fund-ink` | `oklch(0.45 0.090 215)` | `oklch(0.64 0.10 215)` | 文字 |

> 数值沿用原型 `charts.js` 的 oklch 取值，确保预览与原型一致。

### 4.2 组件规格
- **KPI 卡**：标签 12.5px/600 + 巨号 `clamp(34px,6vw,52px)`/700/`tabular-nums`；sparkline 用 `preserveAspectRatio="none"` 自适应，无溢出
- **表格**：表头 11.5px/700 大写、sticky；行 hover `--bg-hover`；可排序列 caret 用 `--fund-brand`
- **图表交互**：面积图 hover 竖线+圆点+fixed tooltip（复用原型 `data-points` 解析）
- **表单**：输入 42px 高、聚焦 `--fund-line` + ring；错误态 `--accent-red` 边框

### 4.3 复用清单（避免重复造轮子）
`Skeleton.jsx` · `ModalShell.jsx` · `Badge.jsx` · `SubtabList.jsx` · `toast-store.js` · `nav-refresh.js` · `FundCardSparkline` 写法 · `FundAllocationDonut` · `FundPortfolioTrend`

---

## 5. 质量门禁（每阶段必过）
- **Stylelint**：`npm run lint:css` — 无裸 hex、无未知令牌（项目硬约束）
- **单测**：`npm test`（vitest）— funds 相关用例全绿
- **视觉回归**：`npm run test:visual`（playwright）— 关键视图快照无回退
- **构建**：`npm run build:renderer` — esbuild 编译通过（Preact + jsx automatic）
- **手动**：`npm start` 重启 app，深/浅主题 + 四视图走查

---

## 6. 风险与回滚
- **R1 配色回归**：若 review 认为蓝绿与全局 Apple 风冲突 → 仅保留 `--fund-*` 作用于基金模块，不外溢；或回退到 `--accent-primary` 系统蓝（令牌已并存，改引用即可）。
- **R2 数据接真实 API**：交易/风险原型为模拟，Phase 4 先用 mock + IPC 桩，主进程接口未 Ready 不阻塞 UI 合并。
- **R3 破坏性**：所有新增为*新增文件/新增信号*，不改 `FundContent` 现有渲染路径直至 Phase 5 切换，可独立 revert。

---

## 7. 验收标准
- [ ] 四视图（概览/列表/详情/交易）在 `invest → 基金` 下可达，深浅主题均正常
- [ ] 图表无溢出/裁切（sparkline 走 `non-scaling-stroke`）
- [ ] 筛选/排序/分页/表单校验/toast 全部可用
- [ ] `stylelint` + `vitest` + `playwright` + `build` 全绿
- [ ] 对比度 ≥4.5:1、焦点可见、触控 ≥44px、reduced-motion 生效
- [ ] 不引入裸 hex、不污染全局令牌（仅新增作用域 `--fund-*`）

---

**相关文件**：`fund-management-redesign/`（原型源）、`docs/fund-ui-redesign-2026-07-13.md`（既有基金设计）、`styles.css`（令牌真源）、`src/renderer/funds/`（落地目录）
