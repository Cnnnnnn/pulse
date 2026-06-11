# v2.9.0 — 世界杯专栏 设计 spec

**date**: 2026-06-11
**status**: 设计拍板, 拍 6 边界
**scope**: Pulse 仓库新增 1 个独立 view (左侧 nav 第 2 项)

---

## 0. 背景

Pulse 之前是 "app 更新监听工具". v2.8.2 (你拍) 砍了所有 v2.7/v2.8 引入, 回到 v2.6 干净状态 (4 status tab / 11 app 监控).

你新拍: 在 Pulse 仓库内**加 1 个独立 view "世界杯专栏"**, 通过左侧 nav 切换. **不**沿用 v2.7.x library 任何代码 (彻底删干净了), 全新独立路径.

---

## 1. 数据源 (拍 `src_openfootball`)

**GitHub raw URL**: `https://raw.githubusercontent.com/openfootball/worldcup/master/2026--usa/cup.txt`

- 0 鉴权, 0 限流, 0 CORS (因为 main 进程 server-side fetch)
- 公共领域 (CC0-1.0)
- 616 stars, 1930-2026 全部世界杯赛程, **含 `2026--usa/` 目录**
- 格式: **Football.TXT** (人读 + 机器读, 不是 JSON), 100 场赛事按 group stage + knockout 顺序

### TXT 解析器 (`src/main/worldcup/parser.js`)

轻量 ~80 行, 解析 TXT → 内存结构:
```js
{
  name: "World Cup 2026",
  groups: [
    { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "Czech Republic"] },
    ...
  ],
  matches: [
    { stage: "Group A", round: "Matchday 1", date: "2026-06-11", time: "13:00", timezone: "UTC-6",
      team1: "Mexico", team2: "South Africa", venue: "Mexico City", score: null },
    ...
    { stage: "Final", round: null, date: "2026-07-19", time: "15:00", timezone: "UTC-4",
      team1: "W101", team2: "W102", venue: "New York/New Jersey", score: null }
  ]
}
```

- stage: `Group A` / `Group B` / ... / `Round of 16` / `Quarter-finals` / `Semi-finals` / `Match for third place` / `Final`
- 100 场赛事全在 matches array
- date 字段是 `YYYY-MM-DD` (本机用, 不用 UTC 转换, 保持数据源原貌)

---

## 2. 拍 6 边界 (你拍过)

### 2.1 数据源: openfootball/worldcup Football.TXT (`src_openfootball`)

### 2.2 赛事范围: 2026 世界杯 (6/11 - 7/19) (`year_wc26`)

### 2.3 主页面: section by day (`view_section_by_day`)

每天 1 个 section header (`2026-06-11 · 周四`), 下面 match card. 按 `date` group, 日期升序. 总 39 天 (6/11 - 7/19) × 每天 1-4 场.

match card 极简 (你拍 `card_minimal`):
- 左: `team1` 队名 (本机本字段)
- 中: `VS` (未赛) / `0-0` (已赛比分)
- 右: `team2` 队名
- 下面 meta: 北京时间 + 场址
- 不点: 没详情 modal
- 不做: 倒计时 / 实时比分 (TXT 数据静态, 没实时)

### 2.4 左侧 nav: 可折叠 (`shell_collapsible_leftnav`)

180px ↔ 40px:
- 展开: nav item 显示中文 + 图标 (180px)
- 折叠: nav item 只剩图标 (40px)
- 顶部汉堡 `☰` 切换
- 状态记 `store.navCollapsed` (signal, 0 store 持久化, 重启重置)

### 2.5 默认进 版本检查 (`default_versions`)

启动进 [版本检查] tab, [世界杯] 需点 nav item 才进. **保持原 Pulse 用户习惯**.

### 2.6 跟版本检查 隔离: 完全独立 (`isolated_views`)

- 2 个 view, **不共享 store / signal** (除全局 Header `check-updates` 按钮跟 `Toast` / `AITasksDrawer` 复用)
- worldcup 自己的 store: `worldcupMatches` / `worldcupLoading` / `worldcupError` 3 signal
- worldcup 自己的 IPC: `worldcup:fetch-fixtures` 1 通道

---

## 3. 架构 (新模块隔离)

```
src/
  main/
    worldcup/                          ← 新模块
      parser.js                         (Football.TXT 解析器, ~80 行)
      fetcher.js                        (server-side fetch, 8s timeout)
      parser.test.js                    (单测)
    ipc.js                              (加 worldcup:fetch-fixtures 1 handler)
    index.js                            (无 bootstrap 改动)
  preload.js                            (加 worldcupFetchFixtures 1 暴露)
  renderer/
    worldcup/                           ← 新模块
      store.js                          (3 signal: matches / loading / error)
      WorldcupView.jsx                  (主 view: section by day)
      MatchCard.jsx                     (单场 card)
      MatchCard.test.jsx
    api.js                              (加 worldcupFetchFixtures 1 pick)
    components/
      AppShell.jsx                      (新: Shell 布局 + 左侧 nav)
      AppShell.test.jsx
      SideNav.jsx                       (新: 180↔40 可折叠)
      SideNav.test.jsx
      AppShell.css                      (新: layout)
    App.jsx                             (改: 用 AppShell 替代原 App 顶层)
    store.js                            (加 navCollapsed 1 signal)
```

**改动规模**:
- 新增 11 文件
- 改 5 文件 (ipc / preload / api / App / store)
- 净增: ~600-800 行

---

## 4. UI 布局 (Shell + SideNav + Main)

```
┌────────┬──────────────────────────┐
│  ☰     │  Pulse         检查更新  │  ← Header (保留)
│        ├──────────────────────────┤
│  🏆    │                          │
│  世界杯 │  [Shell 渲染哪个 view]   │
│        │                          │
│  🔄    │  若 navKey='versions':   │
│  版本检查│  <ResultsView />         │
│        │                          │
│        │  若 navKey='worldcup':  │
│        │  <WorldcupView />        │
│        │                          │
│        │                          │
├────────┤                          │
│  ⚙ 设置│                          │
│        │                          │
└────────┴──────────────────────────┘
   ↑ 180px  ↑ main
```

**SideNav 收起 (40px)**:
- 只剩图标, nav item 名字 hover 才出 tooltip

**store**:
- `activeNav` = `'versions' | 'worldcup'` (默认 `'versions'`)
- `navCollapsed` = `false`

---

## 5. 视觉 (跟 v2.6 主体语言一致)

- 颜色: `var(--text-*)` / `var(--bg-*)` / `var(--accent-primary, #007aff)` 不引入新 design token
- 间距: 跟 `ResultsView` 一致 (gap 8/12/16)
- Match card: 圆角 8px, 1px border (`var(--border-subtle)`), padding 12/16
- Section header: 跟 WeeklyBanner 同款 (uppercase 13px 600 + day count meta)
- 队名: 中文优先 (但 TXT 是英文, 直接显示英文), 国旗 emoji 用 `🏳️`/`🏴`/`🚩` 配 `xx-Flag` (后续可视情况加)

---

## 6. 数据流 (3 步)

1. **启动时** (renderer bootstrap): `worldcup:fetch-fixtures` IPC
2. **main 进程** fetcher: fetch raw URL → 8s timeout → TXT 字符串
3. **main 进程** parser: TXT → JS 对象 → IPC 返 renderer
4. **renderer** store: `worldcupMatches.value = data.matches`
5. **WorldcupView** render: group by date → section header + match card

**失败**: store `worldcupError.value = msg`, WorldcupView 显示 "赛程加载失败, 重试" 按钮 (重调 fetch).

---

## 7. 测试

- `parser.test.js` (3-4 case): 解析 sample TXT → 期望结构 / 边界 (空 TXT / 异常行)
- `MatchCard.test.jsx` (3 case): 渲染 1 场 / 比分 / 场址
- `SideNav.test.jsx` (2 case): 展开 折叠 nav item 显示
- `AppShell.test.jsx` (2 case): navKey='versions' 渲染 ResultsView / 'worldcup' 渲染 WorldcupView
- `fetcher.test.js` (1-2 case): 8s timeout / 网络错误

**总计**: ~10-12 case, vitest 跑

---

## 8. 风险 + 缓释

| 风险 | 缓释 |
|---|---|
| TXT 解析容错 (跟 JSON 比) | parser test + 边界 case + try/catch 包裹 |
| 网络偶尔拉不到 | 8s timeout + 失败重试按钮 + 缓存到 `app.getPath('userData')/worldcup-cache.json` 24h |
| 仓库体积大 (Football.TXT 100 场 ~30KB) | raw URL gzip 几 KB, 缓 |
| 数据 "不鲜" (TXT 手工, 跟 2022 一样可能 2026 比赛期间 没 改) | 用户知道 (你拍 card_minimal 没倒计时 / 没实时比分) |
| 跟 v2.7.0+ 已删 路径混淆 | spec 写明 "全新独立路径", 0 引用任何 v2.7+ 文件名 |

---

## 9. 拍 6 边界 总结

| 维度 | 拍 | 备注 |
|---|---|---|
| 数据源 | openfootball/worldcup TXT | 0 鉴权 0 限流 |
| 范围 | 2026 世界杯 | 6/11 - 7/19 |
| 主页面 | section by day | 39 section × 1-4 场 |
| 左侧 nav | 180↔40 折叠 | 1 个汉堡 |
| 默认 tab | 版本检查 | 保 v2.6 习惯 |
| 跟主体隔离 | 完全独立 view | 0 共享 store |

---

## 10. 实施步骤 (待你拍 OK 后开干)

1. v2.9.0 spec 写完 (这文档) ✅
2. `src/main/worldcup/parser.js` + `fetcher.js` + 单测
3. `src/renderer/worldcup/WorldcupView.jsx` + `MatchCard.jsx` + `store.js` + 单测
4. `src/renderer/components/AppShell.jsx` + `SideNav.jsx` + 单测
5. `App.jsx` 改用 AppShell + `store.js` 加 `activeNav` / `navCollapsed`
6. ipc / preload / api 加 1 通道
7. 跑 vitest 验, 写 changelog v2.9.0 + commit
8. 真机试 Pulse 进 [版本检查] 还是 [世界杯] (默认版本检查)

**估时**: 1 天 (你估的 1 天对得上)

---

## 11. 不做的 (跟 v2.7+v2.8 砍的方向一致, 边界)

- ❶ 实时比分: TXT 是赛程数据, 比赛期间不更新
- ❷ 倒计时: 静态日期, 比赛开始后不显示
- ❸ 队详情 modal: card_minimal 不点
- ❹ 收藏球队 / 关注赛: 跟 v2.7.0 Pinned 同根, 不加
- ❺ 通知 (开赛前 5 分钟): 不加, 跟 v2.6 通知策略保持一致
- ❻ 多赛事 (中超 / 世界杯 都加): 你拍只 2026 世界杯, 不加
- ❼ 2026 后赛事 (2027 欧国联等): 不加
