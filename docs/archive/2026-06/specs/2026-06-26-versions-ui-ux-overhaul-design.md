# Pulse 版本检查 UI/UX 全面重构 (v2.49 主体)

- **日期**: 2026-06-26
- **作者**: brainstorming 产出 (superpowers + ui-ux-pro-max)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.48.1 → v2.49)
- **目标特性**:
  - **Phase P1 (Shell)**: 新增全局 TopBar + Command Palette (`Cmd+K`)，重构顶部信息架构
  - **Phase P2 (Library)**: Library 页重做（Table / Card 双视图，行级收编，Filter 合并，虚拟列表）
  - **Phase P3 (Overview)**: 新 Overview 主页（KPI 卡片 + Trend + Watchlist Quick + Recent Timeline + AI Insights）
  - **Phase P4 (Insights & Settings)**: Insights 页（AI 摘要 + Release Notes in-place + 统计） + Settings 页（Reminders / Watchlist / Recent / Export）

## 0. 决策日志 (brainstorming 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 主痛点 | **Header 按钮太杂 (9 个)** + AppRow 交互多 (9 元素) + 抽屉/弹窗乱 + 多层过滤 | 视觉风格 / 单点修复 → 不解决根问题 |
| 必留顶部按钮 | **检查更新 / AI 任务** | 升级全部 / 关注列表 / 错误诊断 / Release Notes / JSON/CSV 导出 / Reminders / Recent 全下沉 |
| 低频按钮位置 | **Header 右侧 `···` 滑出菜单** (方案 A)/ **TopBar 全局** (方案 B，本文档采纳) | 第二行 toolbar / 左 rail / 独立 tab → 增加布局复杂度 |
| 一键升级全部 | **普通 overflow / TopBar Command Palette 项** | 主操作按钮 (依赖上下文，平常不该高频) / 状态 badge (过度设计) |
| Header 风格 | **现代工具栏**: logo · search · 主操作 · AI · `···` | 压缩统计型 (丢 logo) / 全局 shell (内容没标题) |
| AppRow 收编 | **行级 9 元素 → 3 元素** + `···` 菜单 | 不动 (体验差) / 后面单独项目 (本次一起) |
| 过滤策略 | **FilterBar + CategoryTabs 合并** → 单一 chip 集合 (status + category) | 保留所有 / 删 search / 后面再说 |
| 抽屉/弹窗 | **统一右侧 480px，单实例** | 中央 modal stack / 不动 |
| 横切 | **a11y + reduced-motion + dark-mode + perf 全选** | 都不要 → 不可接受；只选 1-2 个 → 不彻底 |
| EmptyState / WeeklyBanner / BulkUpgradeModal | **全部纳入本次重做** | 不动 → 用户已反馈需要 |
| 痛点修复 | **changelog 重复 + icon 混乱 + AI 排版混乱 全做** | 单选 → 用户反馈 3 项都要修 |
| 设计风格 (ui-ux-pro-max) | **Data-Dense Dashboard + Flat/Minimalism + Fira 字体** | Glassmorphism (装饰重) / Brutalism (粗旷) / Editorial (过头) |
| 主色调 | **沿用现有 Pulse 蓝主调 + 橙红 accent (可升级)** | 蓝绿 (不一致) / 全黑 (沉重) |
| **总体方案** | **方案 B (激进重构)** — 全信息架构重做 | 方案 A (保守) → 用户选了 B |
| 阶段拆分 | **P1+P2+P3+P4** 全做 | 只 TopBar → 不彻底；P1+P2 → Overview/Insights 缺失 |

## 1. 目标

### 1.1 必须达成

#### P1 (Shell)
- [ ] 新增 `<TopBar />` 全局组件 (32px fixed top，跨所有 view)
- [ ] TopBar 内容：Pulse logo · global search · AI 任务按钮 · 通知 bell (有更新时 badge) · `···` 菜单 (诊断 / 关注列表 / Reminders / Recent / 导出 JSON / 导出 CSV / Release Notes)
- [ ] 删除原 `<Header />` 中的所有按钮（检查更新 + AI + 9 项全部移到 TopBar / 各 view / Command Palette）
- [ ] `<CommandPalette />`：`Cmd+K` 唤起，全局搜索 (app 名称 / bundle / category) + 动作 (检查更新 / 打开 Library / 打开 Overview / 切换 view) + 键盘导航 (↑↓ Enter Esc)
- [ ] 原 `<Header />` 简化为 `<PageHeader />` (page title + subtitle + page-level 操作)
- [ ] App.jsx 路由拆分：`/versions/overview` (默认) · `/versions/library` · `/versions/diagnostics` · `/versions/insights` · `/versions/settings`

#### P2 (Library)
- [ ] 顶部 `<PageHeader title="应用库" subtitle="11 个监控 · 3 个可升级">` + view switcher (Table / Card) + `<MergedFilterChip />` (status + category 合并)
- [ ] **Table 视图** (默认): `<AppRow />` 9 元素 → 3 元素 (avatar+name+version · 升级按钮 · `···` 菜单)；snooze / rollback / pin / changelog 全部进 `···` 菜单
- [ ] **Card 视图** (可选): 网格布局，`<AppCard />` 每张卡 (avatar + name + current→latest + 升级按钮 + 最近检查时间)
- [ ] 虚拟列表: 11-30 行时虚拟化不必要，但 100+ 行时启用；先用 signal-based windowing (复用现有 per-row signal pattern)
- [ ] FilterChip 合并：`<FilterChip variant="status" />` (4 status) + `<FilterChip variant="category" />` (8+ category) 用同一组件，不同 variant
- [ ] 保留 search input (从原 FilterBar 抽出来)

#### P3 (Overview)
- [ ] KPI 卡片 4 个: 可升级 (橙) / 最新 (绿) / 出错 (红) / 总监控 (灰)，每张含数字 + 趋势小标
- [ ] Trend sparkline: 过去 7 天 "可升级数量" 变化 (SVG 实现，复用 pulse-trend-svg.jsx 或新建)
- [ ] Watchlist quick view: 最多 6 个 pin app (复用 watchlist-store)，超过显示 "View all →" 跳 Library
- [ ] Recent Activity timeline: 最近 10 条 (升级 / 检查 / 静音 / pin)，复用 `track.js` 的事件源
- [ ] AI Insights: 复用 stock-screener-advisor.js 的 advisor pattern — "本周哪些 app 更新活跃 / 哪些错误模式重复出现"
- [ ] 整体加载顺序: KPIs (instant) → trend (lazy) → watchlist (lazy) → recent (lazy) → AI insights (lazy + 24h cache)

#### P4 (Insights & Settings)
- [ ] Insights 页：AI 摘要 (复用 digest drawer 升级到 view) + Release Notes in-place widget (不再开浏览器) + 统计图 (升级频率 / 错误率 / 检查耗时)
- [ ] Settings 页：Reminders 设置 · Watchlist 管理 · Recent Activity 清除 · Export (JSON/CSV 移到这里)

### 1.2 三大痛点修复

#### Changelog 重复
- [ ] 顶部 `<a class="changelog-releases-btn">↗ GitHub Releases</a>` **保留**
- [ ] 底部 fallback `<a>查看官网</a>` **删除** (统一到顶部按钮)
- [ ] 版本标签简化: `2.48.0 (current)` → `2.48.0` (顶部 HistoryTabs 已经清楚区分 current vs 历史)
- [ ] HistoryTabs 文案: `current` → `latest` (跟版本标签对齐)

#### Icon 混乱
- [ ] 全项目 emoji 清查，迁到 `src/renderer/components/icons.jsx` SVG
- [ ] 新增 icon: `IconCommand` (Cmd+K) · `IconSparkles` (AI) · `IconGrid` · `IconList` · `IconBell` · `IconEllipsis` · `IconRefresh` · `IconFilter` · `IconLayout`
- [ ] 删除 emoji：Header 🔍 检查更新 / ⚠️ / JSON / CSV · StockDetailDrawer 🔍 / 💡 / 📊 / ⚠️ · AiAdviseDrawer 🧠 / 📊 / 💡 · StockLayout 🧠 / 🔍 · ResultTable · UpgradeAdvice · stockStore · StockLayout 等
- [ ] 枚举文件中的 emoji (预计 20-30 处)

#### AI 排版混乱
- [ ] 统一 AI 按钮样式：`<AIIcon />` SVG + 文字 "AI 任务" / "AI 推荐" / "AI 分析"，三种 size (sm/md/lg) + 两种 variant (primary/ghost)
- [ ] 统一 AI drawer 排版: 统一 480px 右侧 + 统一 header (title + 状态 chip) + 统一 sections (sticky 头 + 内容)
- [ ] AiAdviseDrawer / StockDetailDrawer / AiUsageLayout 共享 `<AIDrawerShell />` (新组件)

### 1.3 横切 (Cross-cutting)

#### A11y
- [ ] 所有 button 加 `aria-label` (尤其 icon-only 按钮)
- [ ] Command Palette: `role="dialog"` + `aria-modal="true"` + `role="combobox"` + `role="listbox"` + `role="option" aria-selected`
- [ ] Focus trap: 抽屉/Command Palette 打开时 Tab 键循环在内部
- [ ] Focus restoration: 抽屉关闭后焦点回到触发按钮
- [ ] 键盘快捷键文档化: `Cmd+K` (palette) · `Cmd+R` (检查更新) · `0-9` (Library tab) · `Esc` (关闭抽屉) · `↑↓` (palette 导航)
- [ ] aria-live region: AI 加载 → 完成的过渡 (屏幕阅读器可感知)
- [ ] 颜色对比: dark/light mode 都验证 WCAG AA (4.5:1 文字 / 3:1 大元素)

#### Reduced motion
- [ ] 全局 CSS: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- [ ] spinner 静态化 (不旋转) 在 reduced-motion 下
- [ ] 抽屉 slide 动画 → 直接 fade

#### Dark mode
- [ ] 全 token 审计: `--bg-card`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent-primary`, `--border`, `--surface-2` 全部走 var
- [ ] 新组件全部用 token，不硬编码颜色
- [ ] Dark mode 下: 阴影调暗 1 级 / border 调亮 1 级 / focus ring 调饱和

#### 性能
- [ ] virtual list (只在 row > 100 时启用，< 100 不必要)
- [ ] per-row signal 订阅粒度不变 (已经做)
- [ ] 重渲染审计: KPI 卡片 / sparkline / watchlist 各自独立 signal，避免一处更新全树重渲染
- [ ] Lazy load: Overview 的 trend / watchlist / recent / AI insights 各自 useEffect lazy trigger
- [ ] Command Palette: debounce search 250ms (复用 stock-detail 模式)

## 2. 非目标 (YAGNI)

- **不做** Linux/Windows 适配 (仍 macOS only)
- **不改** detector / worker / notification / bulk-upgrade 业务逻辑
- **不引入** 新 npm 依赖 (virtual list 自实现 or 评估后用 1 个超轻量库)
- **不重写** Preact + signals + custom CSS 框架
- **不拆** main / preload / renderer 进程边界
- **不做** 经典布局 (legacy) 切换开关 — 用户已确认全量方案 B；后续有需要再加

## 3. 架构

### 3.1 新组件树

```
App.jsx
├── TopBar (新增, fixed 32px top)
│   ├── PulseLogo
│   ├── GlobalSearch (触发 Command Palette)
│   ├── AITasksButton (TopBar 级)
│   ├── NotificationBell (新: badge 显示可升级数)
│   └── OverflowMenu (新: ··· 滑出, 6 项)
├── RouteSwitcher
│   ├── /versions/overview (默认)
│   │   └── <OverviewPage>
│   │       ├── <KPICards /> (4 卡片)
│   │       ├── <TrendSparkline /> (lazy)
│   │       ├── <WatchlistQuick /> (lazy)
│   │       ├── <RecentTimeline /> (lazy)
│   │       └── <AIInsightsBlock /> (lazy + 24h cache)
│   ├── /versions/library
│   │   └── <LibraryPage>
│   │       ├── <PageHeader title="应用库" subtitle="11 监控 · 3 可升级">
│   │       ├── <ViewSwitcher Table/Card>
│   │       ├── <MergedFilterChip />
│   │       ├── <TableView /> (默认)
│   │       │   └── <AppRow /> (收编到 3 元素)
│   │       └── <CardView /> (optional)
│   ├── /versions/diagnostics
│   │   └── <DiagnosticsPage /> (原 DiagnosticsDrawer 升级)
│   ├── /versions/insights
│   │   └── <InsightsPage />
│   └── /versions/settings
│       └── <SettingsPage />
├── CommandPalette (新增, Cmd+K 唤起, 全局 modal)
└── AIDrawerShell (新共享组件, 480px 右侧)
    ├── AiAdviseDrawer (existing, 重构用 Shell)
    └── StockDetailDrawer (existing, 重构用 Shell)
```

### 3.2 共享模块

- `src/renderer/components/icons.jsx` — 加 9 个新 icon
- `src/renderer/components/TopBar.jsx` — 新建
- `src/renderer/components/CommandPalette.jsx` — 新建
- `src/renderer/components/AIDrawerShell.jsx` — 新建 (替换 AiAdviseDrawer / StockDetailDrawer 内联 ModalShell)
- `src/renderer/components/PageHeader.jsx` — 新建 (从原 Header 抽取 page-level 部分)
- `src/renderer/components/KPICard.jsx` — 新建
- `src/renderer/components/TrendSparkline.jsx` — 新建
- `src/renderer/components/WatchlistQuick.jsx` — 新建
- `src/renderer/components/RecentTimeline.jsx` — 新建
- `src/renderer/components/AIInsightsBlock.jsx` — 新建
- `src/renderer/components/ViewSwitcher.jsx` — 新建
- `src/renderer/components/AppCard.jsx` — 新建 (Card 视图)
- `src/renderer/components/MergedFilterChip.jsx` — 新建 (合并 status + category)

### 3.3 store 变化

- 新建 `src/renderer/route-store.js` — 路由 signal (currentRoute, navigateTo)
- 新建 `src/renderer/command-palette-store.js` — open + query + results
- 新建 `src/renderer/library-view-store.js` — viewMode (table/card) + filter组合 (status + category + search)
- 现有 `src/renderer/store.js` 拆: `check-session.js` (already separate) · `app-state.js` (results / per-row signals)
- 新建 `src/renderer/overview-store.js` — KPI 派生 + trend data + AI insights cache

### 3.4 IPC 变化

- 新增 `versions:overview-kpis` — 返回 { upgradable, latest, error, total, trend }
- 新增 `versions:ai-insights` — 返回 AI 摘要 (24h cache, 复用 state-store preserve)
- 新增 `versions:recent-activity` — 返回最近 10 条活动
- 保留现有 IPC (不删, deprecated 注释)

## 4. 数据流

### 4.1 Overview 加载流程
```
App mount → /versions/overview 路由
   ↓
KPICards (instant) ← selectors 派生
   ↓
TrendSparkline (lazy 100ms) ← IPC versions:overview-kpis
   ↓
WatchlistQuick (lazy 200ms) ← IPC versions:overview-watchlist
   ↓
RecentTimeline (lazy 300ms) ← IPC versions:recent-activity
   ↓
AIInsightsBlock (lazy 500ms, 24h cache) ← IPC versions:ai-insights
```

### 4.2 Command Palette 流程
```
Cmd+K
   ↓
palette.open = true, focus input
   ↓
input typing → debounce 250ms
   ↓
search (app names + actions) ← IPC versions:command-search
   ↓
results → listbox
   ↓
Enter → execute action / navigate
   ↓
palette.open = false, focus restored
```

### 4.3 Library 视图切换流程
```
LibraryPage mount
   ↓
viewMode (table/card) ← library-view-store
   ↓
filter (status + category + search) ← library-view-store
   ↓
filteredResultsBySection (复用现有 selector) → filtered
   ↓
TableView 渲染 filtered rows (per-row signal)
   或 CardView 渲染 filtered cards
```

## 5. 错误处理

| 场景 | 错误 | 处理 |
|---|---|---|
| Overview KPI 加载失败 | IPC error | KPI 卡片显示 "—" + 重试按钮 |
| Trend sparkline 加载失败 | IPC error | 显示 fallback "暂无趋势数据" |
| Watchlist quick 加载失败 | IPC error | 显示 fallback "暂无关注" |
| Recent timeline 加载失败 | IPC error | 显示 fallback "暂无活动" |
| AI Insights 加载失败 | IPC error | 显示 "AI 暂不可用" + 重试 |
| Command Palette 搜索失败 | IPC error | 显示 "搜索失败" + 重试 |
| AI drawer 加载失败 | 已有 error 状态 | 保留 (AiAdviseDrawer / StockDetailDrawer 的 ERROR_REASON_TEXT) |
| 路由不存在 | 不存在的 URL | 重定向到 /versions/overview |
| Reduced motion 用户 | 始终尊重 | 全局 CSS + 检查 prefers-reduced-motion |
| Dark mode | 系统设置变化 | 监听 prefers-color-scheme (已有支持, 验证) |

## 6. 测试

### 6.1 单元测试 (vitest)
- [ ] TopBar 渲染测试 (4 个主按钮 + overflow 菜单)
- [ ] CommandPalette: 键盘导航测试 (↑↓ Enter Esc)
- [ ] CommandPalette: 搜索 debounce 测试
- [ ] PageHeader 渲染测试
- [ ] KPICard: 数字 / trend / loading / error 各状态测试
- [ ] TrendSparkline: SVG 路径生成测试
- [ ] ViewSwitcher: Table/Card 切换测试
- [ ] MergedFilterChip: status + category 合并逻辑测试
- [ ] AppRow: 收编后 3 元素 + `···` 菜单测试
- [ ] AppCard: Card 视图测试
- [ ] AIDrawerShell: 共享逻辑测试 (focus trap / esc / click-outside)
- [ ] icons.jsx: 9 个新 icon SVG 渲染测试
- [ ] route-store: navigateTo + currentRoute 测试
- [ ] library-view-store: viewMode + filter 组合测试

### 6.2 集成测试
- [ ] App.jsx mount → /versions/overview 默认
- [ ] Command Palette: Cmd+K → 搜索 → Enter → 跳转
- [ ] Library: 切换 view → filter 应用 → 结果变化
- [ ] 抽屉统一: 开 A 后开 B → A 自动关闭

### 6.3 A11y 测试
- [ ] axe-core 自动扫描 (新组件全部 pass)
- [ ] 键盘 only 操作: 启动 → 检查更新 → 打开 AI 抽屉 → 关闭
- [ ] Screen reader (VoiceOver) 验证 aria-label / aria-live

### 6.4 Reduced motion 测试
- [ ] `prefers-reduced-motion: reduce` 设置下, 检查 transition / animation 全部禁用

### 6.5 Dark mode 测试
- [ ] 所有新组件在 dark mode 下颜色对比 >= WCAG AA

### 6.6 性能测试
- [ ] 11 app Library render < 50ms
- [ ] 100 app Library render < 200ms (含虚拟列表)
- [ ] Command Palette 搜索 debounce 250ms 触发
- [ ] KPI 卡片局部更新: 1 个变化不影响其他

## 7. 风险评估

| 风险 | 等级 | 缓解 |
|---|---|---|
| 工作量大（≈4 倍方案 A） | 高 | 分 4 阶段交付 + 每个阶段独立 ship |
| 测试大改 | 高 | selectors / store 名字保留, 只改 import path |
| 用户适应成本 | 中 | 在 Overview 页加 "新版说明" tooltip 3 个月 |
| 与 stock/screener 子系统冲突 | 低 | TopBar 是全局组件, versions 子页面独立 |
| Layout shift 风险 | 中 | TopBar 32px fixed, 避免内容跳动; CSS variables 统一 |
| A11y focus trap 复杂度 | 中 | 复用 AiAdviseDrawer 的现有 useEffect 模式 |
| Reduced-motion 测试覆盖 | 中 | 全局 CSS 处理 80%, 剩余 20% 手动验证 |

## 8. 实施顺序

每个阶段独立 ship (PR + release notes + 测试 + commit + tag):

| Phase | 内容 | 预计 PR 数 | 预计 LOC |
|---|---|---|---|
| P1 | TopBar + Command Palette + PageHeader + 路由拆分 + icons.jsx 9 新 icon + AIDrawerShell | 4 | ~1500 |
| P2 | Library 重做 (AppRow 收编 + Card 视图 + MergedFilterChip + virtual list) | 3 | ~1200 |
| P3 | Overview 页 (KPI + trend + watchlist + recent + AI insights) | 3 | ~1000 |
| P4 | Insights + Settings 页 + 横切 (a11y / reduced-motion / dark-mode audit) | 2 | ~800 |
| Total | | 12 | ~4500 |

**预计总工作量**: 4-6 天 (4 phases 并行 dispatch subagent)

## 9. 兼容性 / 迁移

### 9.1 数据迁移
- state.json: 不破坏现有字段 (results / watchlist / reminders / activity), 只新增 overview cache 字段 (PRESERVE_FIELDS 加 `overviewCache`)
- 版本升级: v2.48.1 → v2.49 自动迁移, 不需用户操作

### 9.2 API 兼容
- 保留所有现有 IPC (deprecated 注释, 不删)
- 新 IPC 加 `versions:*` 前缀
- 现有导出 JSON/CSV 格式不变

### 9.3 UI 兼容
- 不提供经典布局 (legacy) 开关 — 用户确认全量方案 B
- 旧版 Header 完全删除 (不并存)

## 10. 成功标准

- [ ] Header 按钮 9 → 4 (主) + 6 (overflow)
- [ ] AppRow 元素 9 → 3 + `···` 菜单
- [ ] 抽屉 / 弹窗统一 480px 单实例
- [ ] Filter 合并为单一 chip 集合
- [ ] Changelog 顶部 ↗ Releases 按钮 + 删除底部 fallback link + 版本标签简化
- [ ] Emoji 清查 → inline SVG (预计 20-30 处)
- [ ] AI drawer 共享 AIDrawerShell
- [ ] A11y: 所有新组件 axe-core pass + 键盘 only 操作可行 + VoiceOver 验证
- [ ] Reduced-motion: 全局 CSS 启用 + spinner 静态化
- [ ] Dark mode: 所有新组件 token 化 + WCAG AA
- [ ] 性能: 11 app render < 50ms, 100 app render < 200ms
- [ ] 测试: 现有 3194 测试全 pass + 新增 ≥ 30 测试
- [ ] 文档: design doc + plan + release notes 完整

---

**Status**: 待用户 review. Brainstorming 完成, 等用户确认设计 doc 后进入 writing-plans skill 阶段。