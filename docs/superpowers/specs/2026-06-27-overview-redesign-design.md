# Pulse Overview 重构 + TopBar 死按钮修复 (v2.49.1 → v2.50)

- **日期**: 2026-06-27
- **作者**: brainstorming 产出 (superpowers + ui-ux-pro-max 反馈)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.49.0 → v2.50)
- **背景**: v2.49.0 发布后用户反馈 "界面渲染出错了" (preload.js 漏暴露 IPC) + "现在这个界面我不喜欢, 而且很多按钮点了都没反应"
- **目标特性**:
  - **Overview 重构**: 从 "KPI + Trend + Watchlist + Recent + AI Insights" 5 列布局 → "KPI 数字墙 + 关注列表 + 最近活动" 3 等宽列布局
  - **TopBar 死按钮修复**: `检查更新` / `AI 任务` / `通知` / `···` 溢出菜单 全部接 onClick
  - **架构微调**: 删 v2.49 错位的 Trend + AI Insights 区块 (Q1.3 不用), EmptyState 改 CTA, KPI 渐进式排版

## 0. 决策日志 (brainstorming 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 主痛点 | **Overview 5 列布局太散 + TopBar 多个按钮没 onClick** | 视觉风格微调 (不解决根) / 改 Theme (不是用户要的核心) |
| Overview 主用 | **a+c+d+e** = 1) 一眼看可升级 2) 关注列表查 app 状态 3) 最近活动 4) 瞄一眼就关 | b (AI 摘要) 用户明确不选 → 不应占主区 |
| 重构范围 | **Overview 重做 + TopBar 死按钮全接 + 架构微调 (5-6 task)** | 只改 Overview (TopBar 痛点遗留) / 全回滚 v2.49 (过激) |
| 视觉方案 | **A: Compact Dashboard (3 等宽列)** | B 数据驱动主面板 (要滚动 + 空状态难看) / 混合 (A 列布局 + B 内联可升级, 见 §6 YAGNI) |
| KPI 排版 | **渐进式**: 可升级 32px 橙 / 其他 20px 灰 | 等大 (无主次) / 4 横排 (首屏宽度不够) |
| AI 摘要 位置 | **Overview 完全不显示** (Q1.3 b 不选) | Overview 顶部小提示 (不一致, 你不用) / 可折叠块 (UI 噪音) |
| 首次启动 | **"运行首次检查" CTA 大按钮** | 骨架屏 (假加载) / 0/0/0/0 占位 (用户已吐槽) |
| TopBar 死按钮 | **`检查更新` 接到 `api.runCheck` 重命名 → `api.versionsRunCheck`** | 改原 IPC 名 (破坏性) / 删按钮 (你用) |
| 范围外 | **保留** Library / Insights / Diagnostics / Settings / CommandPalette / TopBar 整体 / FilterChip 合并 / Row 收编 | 都不动 → v2.49 主体保留, 只动 Overview 子树 + TopBar 按钮接线 |

## 1. 目标

### 1.1 Overview 重构 (3 等宽列)

- [ ] Overview 页面布局: `1.0fr / 1.4fr / 1.4fr` 三列 (KPI / 关注 / 最近)
- [ ] **列 1: KPI 数字墙**
  - 4 个数字垂直堆叠, 第一个 "可升级" 32px 橙红 (`#ff9500`), 其他 20px 灰
  - 可升级 = 橙; 最新 = 绿 (`#34c759`); 出错 = 红 (`#ff3b30`); 总监控 = 灰 (`#6e6e73`)
  - 每个数字右附 11px 灰字 "个可升级" / "个最新" / "个出错" / "总监控"
- [ ] **列 2: 关注列表**
  - 复用 `watchlist-store.js` 现有数据
  - 显示前 4 个, 第 5+ 显示 "+ N 个" 链接 (跳 Library)
  - 每行: 状态点 8px 圆 + app name + 右侧 "升" 橙 badge (有可升级时)
  - 顶 "View all →" 按钮跳 `/versions/library?filter=watched`
- [ ] **列 3: 最近活动**
  - 复用 `track.js` 现有事件源 (不新建 store)
  - 显示最近 5 条 (不是 10 条, 节省空间)
  - 每行: 12px 事件类型标签 (升/查/错/静/星) + 描述 + 相对时间 (2m / 5m / 1h / 昨天)
  - 顶 "View all →" 按钮跳 `/versions/settings#recent`
- [ ] **首次启动 (state.json 空)**
  - 三列全部显示骨架灰块 + 中央 "运行首次检查" CTA 大按钮
  - 按钮 onClick: `api.versionsRunCheck()` + loading 态 + 完成态切回正常布局
  - 不要 0/0/0/0 占位 (用户已吐槽)
- [ ] **删除 v2.49 错位组件** (本页不再用, 但保留文件不删, 防止 Insights 页误用)
  - 标记 `@deprecated` 注释: `TrendSparkline.jsx` / `AIInsightsBlock.jsx`
  - `OverviewPage.jsx` 中 import 这俩的代码删掉

### 1.2 TopBar 死按钮修复

- [ ] `TopBar.jsx` 中 `检查更新` 按钮 (原 `api.runCheck` 引用, 不存在):
  - 改成 `api.versionsRunCheck()` (新 IPC, 见 §3.4)
  - 加载时按钮显示 spinner + 禁用
  - 完成后 toast 提示 "已检查 N 个 app" (复用现有 toast, 不新建)
- [ ] `TopBar.jsx` 中 `AI 任务` 按钮 (无 onClick):
  - onClick: 打开 `CommandPalette` 并预填 "AI" 触发搜索
  - 备选: 跳 `/versions/insights` (跳页比开 palette 更直接, 采用)
- [ ] `TopBar.jsx` 中 `通知` 按钮 (无 onClick):
  - onClick: 跳 `/versions/diagnostics` (错过的检查 = 通知)
  - badge 数字 = 当前 `error` KPI 值 (实时)
- [ ] `TopBar.jsx` 中 `···` 溢出菜单 7 项 (目前只有关闭):
  - 诊断 → 跳 `/versions/diagnostics`
  - 关注列表 → 跳 `/versions/library?filter=watched`
  - Reminders → 跳 `/versions/settings#reminders`
  - Recent → 跳 `/versions/settings#recent`
  - 导出 JSON → 调 `api.versionsExportJson()` + toast
  - 导出 CSV → 调 `api.versionsExportCsv()` + toast
  - Release Notes → 调 `api.versionsOpenReleaseNotes()` (复用 v2.49 已有的)
- [ ] 全部新增跳转/调用都走 `route-store.navigateTo` 或 `api.xxx()` (不写 window.location)

### 1.3 架构微调

- [ ] `src/renderer/components/OverviewPage.jsx` 重写 (从 5 区块 → 3 列)
- [ ] 新建 `src/renderer/components/OverviewKPIWall.jsx` (列 1)
- [ ] 新建 `src/renderer/components/OverviewWatchlistMini.jsx` (列 2, 复用 watchlistStore)
- [ ] 新建 `src/renderer/components/OverviewRecentMini.jsx` (列 3, 复用 track.js)
- [ ] 新建 `src/renderer/components/OverviewEmptyState.jsx` (首次启动 CTA)
- [ ] `preload.js` 新增 1 个 IPC bridge: `versionsRunCheck: () => ipcRenderer.invoke("versions:run-check")`
- [ ] `src/renderer/api.js` 新增 1 个 wrapper: `versionsRunCheck: pick(overrides, "versionsRunCheck")`
- [ ] main 进程新增 IPC handler `versions:run-check` (复用 `check-session.js` 现有 `runCheck` 逻辑, 不重复实现)

### 1.4 横切 (Cross-cutting) — 跟 v2.49 一致, 增量

- [ ] 新 3 列布局 走 CSS Grid (不引入新依赖), `grid-template-columns: 1fr 1.4fr 1.4fr`
- [ ] 暗色模式 token 复用 (`--text-primary`, `--text-secondary`, `--accent-upgradable` 等)
- [ ] 减小动效: 列 2/3 出现用 fade-in 200ms (不用 slide), reduced-motion 下 0.01ms
- [ ] 新按钮 (检查更新, 首次检查 CTA) 加 `aria-label` + `aria-busy` 加载态
- [ ] 关注列表 / 最近活动 行加 `role="listitem"` (a11y 列表语义)

## 2. 非目标 (YAGNI)

- **不改** v2.49 其它页面 (Library / Insights / Diagnostics / Settings 整体保留)
- **不删** `TrendSparkline.jsx` / `AIInsightsBlock.jsx` 文件 — 标记 deprecated 即可, 后续可被 Insights 页复用
- **不重做** CommandPalette — 保留 v2.49 主体, 只在 AI 按钮复用
- **不引入** 新依赖 (CSS Grid 是浏览器原生)
- **不动** detector / worker / notification / bulk-upgrade 业务逻辑
- **不引入** 新路由 (Overview 仍然是 `/versions/overview`, 不改)
- **不重做** Insights 页 (虽然 AI 摘要可能迁过去, 但本 PR 范围不含)

## 3. 架构

### 3.1 Overview 新组件树

```
/versions/overview
└── <OverviewPage> (重写)
    ├── <PageHeader title="总览" subtitle="11 个 app · 3 个可升级" />
    │   └── <button "检查更新" onClick={api.versionsRunCheck} />  ← TopBar 那 1 个按钮的副本, 不是新加
    ├── if (state.total === 0) {
    │     <OverviewEmptyState />     ← "运行首次检查" CTA
    │   } else {
    │     <div class="overview-grid">  ← 1fr / 1.4fr / 1.4fr
    │       ├── <OverviewKPIWall />       ← 列 1: 4 数字渐进
    │       ├── <OverviewWatchlistMini /> ← 列 2: 关注列表
    │       └── <OverviewRecentMini />    ← 列 3: 最近活动
    │   }
    │
    │  ← Trend / AI Insights 区块从 OverviewPage 删除 (v2.49 错位, Q1.3 不用)
```

### 3.2 共享 / 复用

- `watchlistStore` (existing) → `OverviewWatchlistMini` 直接 `signal.value.slice(0, 4)` 取前 4 个
- `track.js` (existing event source) → `OverviewRecentMini` 订阅, 取最近 5 条
- `overviewStore` (existing) → `OverviewKPIWall` 读 `kpis.upgradable/latest/error/total`
- `routeStore.navigateTo` (existing) → "View all →" 按钮 / TopBar 死按钮跳转复用
- `toastStore` (existing) → "已检查 N 个" / 导出成功 / 失败 复用

### 3.3 store 变化

- 不新建 store, 全部复用现有
- `overviewStore.js` 中 `kpis` signal 数据结构不变 (4 个数字), 只是读它的组件从 5 个变成 1 个

### 3.4 IPC 变化

| Channel | 改/增 | 说明 |
|---|---|---|
| `versions:run-check` | **新增** | main 进程复用 `check-session.js` 的 `runCheck` 逻辑, 触发全量检查 + 返 { started: true } |
| `versions:overview-kpis` | 不变 | OverviewPage 仍读这个 (lazy 加载) |
| `versions:overview-watchlist` | 不变 | OverviewWatchlistMini 仍读这个 |
| `versions:overview-recent` | 不变 | OverviewRecentMini 仍读这个 |
| `versions:command-search` | 不变 | CommandPalette 用 |
| 其余 `versions:*` | 不变 | 保留 |

注意: v2.49 的 `versions:overview-trend` / `versions:overview-ai-insights` **保留不删** (main 进程 handler 还在), 只是在 OverviewPage 不再调用。**YAGNI 不删** — 后续 Insights 页可能要复用。

## 4. 数据流

### 4.1 Overview 加载流程

```
App mount → /versions/overview 路由
   ↓
OverviewPage render
   ↓
读 stateStore.total (from state.json)
   ├─ total === 0 → render <OverviewEmptyState /> (CTA)
   └─ total > 0   → render 3 列布局
          ↓
       <OverviewKPIWall useEffect on mount>
          api.versionsOverviewKpis() → set kpis signal → 渐进式 4 数字
          ↓
       <OverviewWatchlistMini useEffect on mount>
          api.versionsOverviewWatchlist() → set watchlist signal → 前 4 个
          ↓
       <OverviewRecentMini useEffect on mount>
          api.versionsOverviewRecent() → set recent signal → 5 条
```

### 4.2 TopBar 死按钮 onClick 流程

```
TopBar mount
   ↓
检查更新 button onClick:
   api.versionsRunCheck() → main: trigger 全量检查
                          → main: state.json 更新
                          → main: 返 { started: true }
                          → renderer: 显示 spinner
   ↓
   检查完成 (监听 state.json 变化 or IPC 推送)
   ↓
   toast "已检查 N 个 app"
```

### 4.3 状态依赖

- 关注列表: 依赖 `watchlistStore` (existing)
- 最近活动: 依赖 `track.js` event source (existing)
- KPI: 依赖 `overviewStore.kpis` signal (existing)
- EmptyState 切换: 依赖 `stateStore.total` (existing)

## 5. 错误处理

- [ ] `api.versionsRunCheck()` 失败: toast 红色 "检查失败, 请重试" (复用现有 toast)
- [ ] 首次检查 CTA 失败: 按钮恢复可点击, 提示 "请稍后再试"
- [ ] 关注列表 / 最近活动 数据加载失败: 显示 "加载失败, 点击重试" 内联, 不破坏整体布局
- [ ] 关注列表为空 (无 pin): 显示空插画 "暂无关注 app" + "在 Library 选 app 加关注" 链接
- [ ] 最近活动为空 (无事件): 显示空插画 "还没有活动"
- [ ] Overview 整体渲染失败: 走 `ErrorBoundary` 现有 fallback, 不新写

## 6. 跟 v2.49 关系

- v2.49 已经做的 (保留不动): TopBar / CommandPalette / 路由拆分 / FilterChip / Row 收编 / Library / Diagnostics / Settings / a11y / dark mode / 性能
- v2.49 错位的 (本 PR 修正): Overview 5 区块 → 3 区块 (本 spec)
- v2.49 漏的 (本 PR 补): TopBar 死按钮接线 (本 spec)
- v2.49 漏的 (本 PR 补): preload.js 漏暴露 IPC (在 hotfix v2.49.1 已修, 不在本 spec)
- v2.49.1 已修的: preload.js 暴露 `versions:*` 6 个 IPC

## 7. 测试 / 验收

### 7.1 必过 (TDD)

- [ ] `OverviewKPIWall` 测试: 数字按 (upgradable 32px / 其他 20px) 渲染, 颜色用 token
- [ ] `OverviewWatchlistMini` 测试: 显示前 4 个, 第 5+ 显示 "+ N 个", 空数据显空插画
- [ ] `OverviewRecentMini` 测试: 显示最近 5 条, 时间格式 2m/5m/1h/昨天
- [ ] `OverviewEmptyState` 测试: state.json 空时显示 CTA, CTA onClick 调 `api.versionsRunCheck`
- [ ] `OverviewPage` 集成测试: total === 0 走 EmptyState, total > 0 走 3 列
- [ ] `TopBar` onClick 接线测试: 8 个按钮全部有 handler (检查更新 / AI 任务 / 通知 / 4 个菜单项 / Release Notes)

### 7.2 视觉验收 (用户 review 时跑)

- [ ] Overview 3 列横向 1 行, 不滚动 (1440x900 viewport)
- [ ] KPI 第一个数字明显大于其他 3 个 (32px vs 20px)
- [ ] 关注列表 / 最近活动 顶部 "View all →" 可点击
- [ ] 首次启动 (清空 state.json) 显示 CTA, 点了触发检查
- [ ] TopBar `检查更新` 点了有 spinner + toast
- [ ] TopBar `AI 任务` 跳 `/versions/insights`
- [ ] TopBar `通知` 跳 `/versions/diagnostics`
- [ ] TopBar `···` 7 个菜单项全部有动作

### 7.3 性能 / 兼容

- [ ] Overview 首屏渲染 < 100ms (3 列布局, 不等 4 个 lazy)
- [ ] 3 列布局 dark mode 下对比度 WCAG AA
- [ ] reduced-motion 下 3 列 fade-in 0.01ms

## 8. 实施步骤 (5-6 task)

1. **Task 1**: 新建 `OverviewKPIWall` + 测试 + 接入 overviewStore
2. **Task 2**: 新建 `OverviewWatchlistMini` + 测试 + 接入 watchlistStore
3. **Task 3**: 新建 `OverviewRecentMini` + 测试 + 接入 track.js
4. **Task 4**: 新建 `OverviewEmptyState` + 测试 + 接入 stateStore.total
5. **Task 5**: 重写 `OverviewPage` (3 列布局, EmptyState 切换) + main 进程 `versions:run-check` handler + preload.js + api.js 接线
6. **Task 6**: 修 TopBar 8 个死按钮 onClick + 测试 + 跑全量 e2e + release commit (v2.50.0)

## 9. 风险 / 取舍

- **风险 1**: v2.49 错位的 Trend / AI Insights 区块被废弃, 后续 Insights 页可能还要写
  - **缓解**: 保留文件 + `@deprecated` 注释, 不真删
- **风险 2**: 3 列等宽布局在小屏 (1280 以下) 可能挤
  - **缓解**: 加 `@media (max-width: 1280px) { grid-template-columns: 1fr; }` 退化为竖排
- **风险 3**: TopBar 死按钮修完后, `···` 菜单项打开 diagnostics 跳页可能打断用户当前操作
  - **缓解**: 跟用户确认过, "瞄一眼就关" 的场景下跳页没事
- **风险 4**: 关注列表 / 最近活动 数据来源 (`watchlistStore` / `track.js`) 跟 v2.49 假设的 API 形状不一致
  - **缓解**: 先读现有 store 形状再写组件, 不依赖 v2.49 假设

## 10. 时间估算

- Task 1-5: 1 个 subagent 串行, 约 2-3 小时
- Task 6: 单独 subagent (TopBar 改动 + 全量回归), 约 1 小时
- 自审 + review commit: 30 分钟
- **总计**: 半天 (4-5 小时)

---

**等用户 review. 同意后开始 Task 1.**
