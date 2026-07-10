# 设计:检查更新页重构 — 默认页改为应用列表(方案 A)

**日期:** 2026-06-27
**状态:** 待用户审查
**涉及模块:** versions(renderer + 部分 IPC/测试)

## 1. 背景与动机

v2.50 把"检查更新"页(versions 模块的 overview 视图)重构成了一个 **3 列 dashboard**:KPI 数字墙 + 关注列表 mini + 最近活动 mini。

用户反馈这个排版**很乱、不好用**:

- 3 列平铺,KPI/关注/最近权重相同,但信息重要度差别很大("可升级"才是核心)。
- 没有"检查更新"的主操作位 —— 只能挤在 TopBar 右上角小图标里。
- KPI Wall 是 4 个孤立数字,没说"哪几个"可升级,想动手要点进 Library 找。
- 最近活动里的"升/查/星/错"单字标签含义靠猜。
- View all 跳转语义错位(最近活动 → settings)。
- 代码残留与断链:旧 `overview-store.js`/`Header.jsx` 仍在;CommandPalette 调 `api.runCheck`(不存在)静默失效。

用户实际想要的,是**回到"所有应用列出来"的列表/平铺视图** —— 一眼看全部 app 的更新状态。这种视图**在代码里其实已经存在**(Library 页,支持 Table 列表 + Card 卡片平铺 + ViewSwitcher 切换),只是被埋在了 `library` 路由,默认落地的是不讨喜的 dashboard。

## 2. 目标 / 成功标准

- **默认进应用第一眼 = 全部应用列表/平铺**,而非 dashboard。
- KPI 压缩成列表头部一行小字("13 个监控 · 2 个可升级")。
- 废弃 dashboard overview 的 KPI 墙 / 关注 mini / 最近活动 mini 三个概念。
- 首次启动空态仍保留引导 CTA("欢迎使用 Pulse / 运行首次检查")。
- "检查更新"主操作在列表头部有醒目按钮;TopBar 🔄 保留;修掉 CommandPalette 断链 bug。
- 不引入新概念、不新增未实现占位(YAGNI)。

## 3. 不在范围内(YAGNI,明确不做)

- 不保留也不重建 KPI 墙 / 关注 mini / 最近活动 mini。
- 不新建"概览"路由或保留 dashboard overview 视图。
- 不改侧边栏(nav 层):侧边栏是 `versions/ithome/wechat-hot/...` 顶级 nav,versions 内部 view 切换靠 TopBar/CommandPalette,本设计不触及。
- 不动主进程 `check-runner.js` 引擎与 `versions:overview-*` IPC 形状(契约被测试锁定,保持稳定)。

## 4. 设计方案(方案 A:列表即首页)

### 4.1 路由结构

**合并 overview 与 library**:不再保留 dashboard overview 视图。

- `currentRoute` 默认值由 `"overview"` 改为 `"library"`。
- `ROUTES` 从 `["overview","library","diagnostics","insights","settings"]` 改为 `["library","diagnostics","insights","settings"]`(移除 `"overview"`)。
- `VersionsLayout` 中移除 `route === "overview"` 分支;`route === "library"` 渲染 `<LibraryPage>`。
- 所有指向 `"overview"` 的 `navigateTo("overview")` 调用改为 `navigateTo("library")`(当前代码库中仅 route-store 默认值和潜在的外部引用,需全局核查)。
- `navigateTo` 对已移除的 `"overview"` 做一次容错:若传入 `"overview"`,内部重定向到 `"library"`(避免旧持久化状态/深链断裂)。

> **注意:** nav 侧边栏不受影响 —— 侧边栏是顶级 nav(`versions` 等),versions 内部的 view 切换与侧边栏无关。TopBar 的菜单项目前指向的是 `library/diagnostics/insights/settings`,无指向 `overview` 的入口(已核查 TopBar.jsx)。

### 4.2 默认页 = LibraryPage(应用列表)

`LibraryPage` 已具备所需能力,基本不需改动其内部:

- `PageHeader`(标题"应用库" + subtitle "N 个监控 · M 个可升级")+ `ViewSwitcher`(Table/Card 切换)。
- `MergedFilterChip`(搜索 + 状态 chip + 分类 chip)。
- `mode === "table"` → `ResultsView`(列表);`mode === "card"` → `AppCard` 网格(>100 行用 `VirtualCardGrid`)。

### 4.3 空态处理

在 `LibraryPage` 入口增加空态分支:

- `results.size === 0` → 渲染 `<OverviewEmptyState>`(沿用现空态组件,文案"欢迎使用 Pulse / 运行首次检查")。
- 空态 CTA 点击 → `api.versionsRunCheck()`,带 2s 视觉 hold(沿用现 OverviewPage 的 `runCheck` 逻辑,迁入 LibraryPage 或抽到小 hook)。
- `results.size > 0` → 正常列表/平铺。

> 组件命名保留 `OverviewEmptyState`(语义仍成立:它是 versions 模块的空态),避免无谓改名引入 churn。

### 4.4 "检查更新"主操作

- **TopBar 🔄 保留**(全局随时可点,`api.versionsRunCheck()`)。
- **新增**:`LibraryPage` 的 `PageHeader` 右侧(`children` slot,与 `ViewSwitcher` 并排)加一个醒目的「检查更新」主按钮。点击 → `api.versionsRunCheck()`,带 loading 态(检查中… 禁用)。
- **修 bug**:`CommandPalette.jsx:85` 的 `api.runCheck()` → `api.versionsRunCheck()`。

### 4.5 清理残留

- 删除 dashboard overview 相关组件与 CSS:
  - `OverviewPage.jsx` / `OverviewPage.css`
  - `OverviewKPIWall.jsx` / `OverviewKPIWall.css`
  - `OverviewWatchlistMini.jsx` / `OverviewWatchlistMini.css`
  - `OverviewRecentMini.jsx` / `OverviewRecentMini.css`
  - 保留 `OverviewEmptyState.jsx` / `OverviewEmptyState.css`(4.3 复用)。
- 删除已废弃的残留组件(已确认存在且在新结构下无人引用):
  - `AIInsightsBlock.jsx` / `RecentTimeline.jsx` / `WatchlistQuick.jsx`(三者仅 import 旧 `overview-store.js`,与 dashboard 同属 v2.48 残留,OverviewPage 顶部注释已声明不再 import 它们)。
  - `overview-store.js`(删除上述三者后,该 store 不再有引用方)。
  - `Header.jsx`(空 stub,`return null`,App.jsx 注释提及它属过时残留)。
- 全局核查并清理指向已删除组件的 import / 指向 `"overview"` 路由的调用。

**删除顺序(避免实现中途断链):**
1. 先把 `OverviewPage.jsx` 里的 `runCheck` 空态逻辑(loading 态 + `api.versionsRunCheck()` + 2s hold)迁移到 `LibraryPage`(或抽成一个 `useRunCheck` 小 hook),供空态 CTA 和 PageHeader 主按钮共用。
2. 改路由(4.1)并更新 `LibraryPage`(空态分支 + 主按钮,4.3/4.4)、修 `CommandPalette`(4.4)。
3. 删除 dashboard 组件(`OverviewPage`/`OverviewKPIWall`/`OverviewWatchlistMini`/`OverviewRecentMini`)。
4. 删除残留(`AIInsightsBlock`/`RecentTimeline`/`WatchlistQuick`/`overview-store`/`Header`)。
5. 同步更新测试(§5)。

## 5. 受影响测试

| 测试文件 | 处理方式 |
|---|---|
| `tests/renderer/overview-page.test.jsx` | 删除(被测组件已移除) |
| `tests/renderer/overview-kpi-wall.test.jsx` | 删除 |
| `tests/renderer/overview-watchlist-mini.test.jsx` | 删除 |
| `tests/renderer/overview-recent-mini.test.jsx` | 删除 |
| `tests/renderer/overview-empty-state.test.jsx` | 保留(组件复用),按需补充"在列表空态下渲染"断言 |
| `tests/renderer/overview-store.test.js` | 删除(store 已移除) |
| `tests/renderer/LibraryPage.test.jsx` | 更新:新增空态分支 + 检查更新按钮 + 默认路由断言 |
| `tests/renderer/a11y-versions.test.jsx` | 更新:移除 overview 路由相关断言,改为 library 默认 |
| `tests/main/versions-overview-ipc.test.js` | 保留(IPC 契约不动,形状被锁住,继续保障) |

> IPC 层 `versions:overview-kpis / -watchlist / -recent / -ai-insights / -run-check / -command-search` 通道**保留不动**。其中 kpis/watchlist/recent/ai-insights 在 UI 上不再消费,但契约被测试锁定且开销极小,删除 IPC 反而要动 register-versions-overview.js 与 preload.js,风险大于收益 —— 留作潜在的他用,不在本次范围内清理。若后续确认无用,另开任务清理。

## 6. 风险与权衡

- **路由默认值变更的持久化兼容:** 若有地方持久化了 `currentRoute="overview"`,启动会指向已移除的路由。缓解:`navigateTo` 对 `"overview"` 做重定向到 `"library"`(4.1)。
- **删除 IPC 消费方但保留 IPC 通道:** UI 不再调 kpis/watchlist/recent,这些 IPC 变成"死通道"。权衡:删除它们要动主进程+preload+ipc 测试,风险/收益不划算;留待后续。已在范围外说明。
- **空态组件复用 OverviewEmptyState:** 名字带 "Overview" 但语义是 versions 空态,可接受,避免 churn。

## 7. 验证清单(实现完成后)

- [ ] 启动应用默认进入"应用库"列表,非 dashboard。
- [ ] 有数据时显示 Table/Card(可切换),KPI 压缩为头部一行小字。
- [ ] 无数据时显示"欢迎使用 Pulse / 运行首次检查"CTA,点击触发检查。
- [ ] PageHeader 右侧有醒目「检查更新」按钮,点击触发检查并显示 loading。
- [ ] TopBar 🔄 仍可触发检查。
- [ ] Cmd+K 搜"检查更新"并选中,能真正触发(不再静默失效)。
- [ ] 原 dashboard 的 KPI 墙/关注/最近组件不再渲染,相关文件已删除。
- [ ] `npm test` 全绿(更新后的测试)。
