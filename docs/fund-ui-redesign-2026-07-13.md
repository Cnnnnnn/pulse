# 基金模块 UI 重设计 · 仪表盘总览（2026-07-13 第二轮）

> 第一轮（同日上午）只做了「布局微调」——把原横向 Hero 的指标拆成指标条、搜索挪到底部、操作收进 kebab。用户反馈「看起来没啥变化」，故第二轮按用户选定的 **「仪表盘总览」** 方向真正换骨架。

## 设计方向
在**不另起视觉语言**前提下（沿用项目 Apple 原生令牌 / oklch / 毛玻璃 / 系统字体），把基金总览从「数字在左、图表在右」的横向结构，改为资产管理仪表盘式排版：

1. **通栏 KPI 条**（`.fund-hero-kpi`）
   - `总市值` 作为展示级巨号：`clamp(34px, 6vw, 52px)` / 700 / tabular-nums / 负字距，唯一视觉焦点；
   - 右侧三块磁贴：`今日预估` / `总盈亏` / `收益率`，每块 = 小标签 + 带 ↑↓ 箭头的值 + 独立百分比行，红涨绿跌走 `--color-up`/`--color-down`；
   - 磁贴间用 1px `--border-subtle` 竖向分隔，KPI 条上下有细分隔线，明确「统计带」语义。

2. **通栏可视化带**（`.fund-hero-panels`）
   - 双栏：`minmax(0,320px)` 配置环面板 + `1fr` 组合走势面板；
   - 每面板独立 `--bg-section` 浅底 + `--radius-md` 卡片感，把 donut / trend 收进统一容器，不再贴边漂浮。

3. **搜索行**保留在卡片底部，顶部带分隔线，不抢焦点。

4. **卡片指标带**：`.fund-card-metrics` 加顶部细分隔线，成为卡片内独立「统计带」，与 Hero KPI 气质对齐（风险最低，纯视觉）。

## 响应式
- KPI 条：`≤900px` → 2 列（总市值跨整行）；`≤520px` → 单列堆叠，分隔线转横向。
- 可视化带：`≤760px` → 单栏堆叠。
- 卡片网格：3 → 2（≤900px）→ 1（移动端）列。

## 令牌合规
- 全部走 `--text-*` / `--color-up` / `--color-down` / `--space-*` / `--radius-*` / `--bg-section` / `--border-subtle`，**无裸 hex、无未知令牌**。
- 触控目标 ≥44px（搜索框、添加按钮、更多菜单、展开按钮均满足）。
- 键盘可达 + `aria-*` 已在第一轮 kebab 菜单落地；焦点环 `--focus-ring` 复用。

## 改动文件
- `src/renderer/funds/FundHero.jsx` — 去掉 `.fund-hero-main` 横向结构，改为 `.fund-hero-kpi` + `.fund-hero-panels`（工具栏/状态/搜索行功能全保留）。
- `styles.css`（13970 区一带 + KPI/面板新增块）— 旧 `.fund-hero-main/.fund-hero-number/.fund-hero-stats/.fund-hero-stat*` 替换为 KPI 条 + 面板带样式 + 三档断点；卡片指标带加分隔线。
- `docs/fund-dashboard-preview.html` — **独立预览页**，用项目真实令牌还原新排版，浏览器直接看（含深/浅切换），无需 rebuild。

## 校验
- `npx stylelint styles.css`：无裸 hex / 未知令牌（仅既有 `#ffffff→#fff` 长度提示，非本次改动）。
- `npx vitest run funds`：**32/32 通过**。
- `npm run build:renderer`：编译成功。

## 看效果
Electron 跑的是 `renderer-dist/`，改完 `src/` 后需 `npm run build:renderer`（或 `npm start` 自带 prestart）并**重启 app**。或直接打开 `docs/fund-dashboard-preview.html` 即时预览。

---

## Legacy 死代码清理（2026-07-13 第三轮 · 用户确认「要」）

用户确认后，清理了合并到 `invest` 导航前的旧基金 CSS（确认零引用、真死代码）。

### 删除（共 568 行，原 5840–6407 区段）
- `.fund-header` / `.fund-header-*` / `.fund-summary-cards` — 旧顶栏布局，已被 `fund-hero-*` 取代。
- `.fund-view-tab*` — 旧子标签，已被通用 `Tab`/`TabList` 组件取代。
- `.fund-row*` 全套（`.fund-row` / `.fund-row-main` / `.fund-row-info` / `.fund-row-line1/2` / `.fund-row-code` / `.fund-row-name` / `.fund-row-category` / `.fund-row-cat-icon` / `.fund-row-actions` / `.fund-row-action-btn*` / `.fund-row-metrics` / `.fund-row-stat*` / `.fund-row-est-tag` / `.fund-row-toggle` / `.fund-row-detail*`）— 旧行式卡片，已被 `fund-card*` 取代。

### 保留（确认仍被引用，未动）
- `.fund-layout`（FundLayout.jsx）、`.fund-search-dropdown-item` + `:hover`（AddFundModal）、`.fund-modal-footer`（AddFundModal / FundAlertModal / AIUsageAlertModal）。
- **整块 `.fund-pnl-*`（6420–6666 + 暗色块）** — 被 `FundPnlHistory.jsx` 实际用到，全保留。

### 附带清理（极小风险）
- 暗色块里随 `.fund-pnl-*` 一起的 `.fund-row-stat-value.positive/negative` 死选择器移除（不再匹配任何元素）。
- 孤立的 `.fund-row-action-btn--active` 删除。

### 校验
- `npx stylelint styles.css`：仅既有 `color-hex-length`（`#ffffff`→`#fff`）与一行既存 `unit-no-unknown`（line 2698，非本次改动），**无新增裸 hex / 未知令牌 / 语法错误**。
- `npm run build:renderer`：编译成功，CSS 有效。
- 未改任何 JSX，无回归面；`fund-pnl-*` 活样式一字未动。
