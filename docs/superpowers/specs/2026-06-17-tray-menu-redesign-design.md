# Pulse 菜单栏重设计 (v2.22 — Tray Menu Redesign)

- **日期**: 2026-06-17
- **作者**: Mavis (brainstorming)
- **状态**: 待用户 review
- **项目类型**: macOS / Windows 菜单栏 Electron 应用 (Pulse v2.21+)
- **目标特性**: 菜单栏从"app 列表 + 4 个 action"重做成"4 个模块的内容预览 + 3 个 action"——一眼看到关键信息，不开面板也能用

## 0. 决策日志 (brainstorming 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 方向 | **内容预览 (rich content)** | 仅入口跳转 → 用户仍要点开面板才知道状态；纯 badge 数 → 信息密度太低 |
| 选中模块 | **🔄 检查更新 + 📊 AI 用量 + 🏆 世界杯 + 🥇 贵金属** (4 个) | 全 7 个 (菜单栏 35 行太长); 3 个 (缺贵金属/世界杯) |
| 排除的模块 | 💰 基金 / 💡 AI 任务 / ⏰ 提醒 | 仍可从 SideNav 进入,菜单栏不直接铺数据 |
| 点击行为 | **(a) 打开面板 + 切 tab + 滚到目标 + 弹 modal** | (b) 静默做事 → 误触风险; (c) 行/按钮分离 → UI 复杂度↑ |
| 数据源 | **主进程独立 cache,持久化到 `state.json`;复用面板 IPC 推 events** | 跨进程共享 signal (不可行,preact signals 在 renderer); tray 起独立定时器 (重复造轮子) |
| 🔄 检查更新 数据 | **完全复用 `state.json` + `tray.setResults`** | 0 成本 |
| 🥇 贵金属 数据 | **复用 main scheduler 已推的 `metals:quote:changed` 事件** | 0 成本 |
| 📊 AI 用量 数据 | **新增 `src/main/ai-usage-cache.js` + `ai-usage:get-tray-data` IPC** | 复用 renderer signal (跨进程不可行) |
| 🏆 世界杯 数据 | **新增 `src/main/worldcup-tray-cache.js` + 24h 缓存 + 启动拉一次** | 每次菜单栏打开都 HTTP 拉 → 慢+浪费 |
| 刷新策略 | **检查更新 = check 完成后;AI 用量 = 30min 轮询;贵金属 = scheduler 5min;世界杯 = 启动拉 + 24h 缓存** | tray 单独 1min 全量轮询 → 浪费带宽;不轮询 → 数据陈旧 |
| 失败处理 | **该模块拉不到 → 整段隐藏** | 显示"-"(没用);显示"重试"(菜单栏不好交互) |
| 未配置状态 | **显示 "📊 AI 用量 — 未配置"** | 隐藏 (用户找不到入口) |
| 数据陈旧 | **行尾加灰字 "(2h 前)"** | 不显示(用户以为实时);红字(夸张) |
| 重建防抖 | **4 个数据源 debounce 200ms 合并 1 次 rebuild** | 每次都 rebuild → 闪烁+浪费 |
| Windows 闪烁 | **throttle ≥1s 才允许 rebuild** | macOS template image 不闪,Windows ICO 闪 |
| 刷新交互 | **完全自动,无"刷新"按钮** — 检查更新 = check 完成后;其他模块 = 各自 scheduler 周期 | 加"刷新"按钮 → 违反"看一眼就有用",菜单栏交互成本↑ |

## 1. 目标

### 1.1 必须达成

- 菜单栏展示 **4 个模块的具体数据** (不是入口跳转): 🔄 检查更新 / 📊 AI 用量 / 🏆 世界杯 / 🥇 贵金属
- 每段 3-5 行,总长 18-20 行 (跟现状持平,但信息密度高 5 倍)
- 点击行为统一: **打开面板 → 切到对应 tab → 滚到目标 → 弹 modal** (不静默做事)
- 数据源尽量复用现有: state.json / metals scheduler / worldcup IPC
- 新增 2 个 main 端 cache 模块: `ai-usage-cache.js` + `worldcup-tray-cache.js`
- 失败隐藏 + 未配置显示 + 陈旧提示,菜单栏永远不显示垃圾信息
- 防闪烁: debounce 200ms 合并,Windows 端额外 throttle 1s

### 1.2 非目标 (YAGNI)

- 不在菜单栏做"配置"功能 (AI plan 配 key、添加金属持仓) — 这些需要表单
- 不在菜单栏做"升级确认" — 必须 modal 二次确认
- 不做菜单栏自定义/排序 — 4 个模块位置固定
- 不做菜单栏主题/字号自定义 — 走系统主题
- 不做"今天看过了"标记 — 每次点都正常打开
- 不持久化"最后查看时间"
- 不做菜单栏的"快捷键绑定" — 走系统快捷键
- 不做"全部收起"按钮 — 18 行已经在合适长度
- 不做右键多选升级 — 跟现有检查更新流冲突
- 不在菜单栏显示基金 / AI 任务 / 提醒 — 仍从 SideNav 进入 (本设计明确排除)
- 不重构 SideNav — 完全独立

## 2. 整体架构

```
┌─ Pulse 主进程 (main) ───────────────────────────────┐
│                                                      │
│  tray.js  ────────  rebuildMenu()                    │
│     │                  ↑ debounce 200ms              │
│     │                  │                              │
│     ├── on('check-finished')  ──→ setResults()       │
│     ├── on('ai-usage-updated') ──→ setAiUsage()      │
│     ├── on('worldcup-fixtures-cached') ──→ setWc()   │
│     └── on('metals:quote:changed')  ──→ setMetals()  │
│                                                      │
│  state-store.js  (现有)                              │
│  metalsApi scheduler (现有)                         │
│  worldcup cache  (新增: worldcup-tray-cache.js)     │
│  ai-usage cache  (新增: ai-usage-cache.js)          │
│                                                      │
└──────────────────────────────────────────────────────┘
                        ↓ IPC push
┌─ Renderer 进程 ─────────────────────────────────────┐
│  check-store.js (signal: results)                    │
│  ai-usage-store.js (signal: aiUsageSnapshot)         │
│  metalsStore.js (signal: quoteCache)                 │
│  worldcup store (新增)                              │
│                                                      │
│  点击菜单栏行 → IPC:tray:row-clicked                 │
│  主进程: window.show() + webContents.send('focus')   │
│  + 'open-modal' + 'scroll-to'                       │
└──────────────────────────────────────────────────────┘
```

### 2.1 关键决策: 主进程拥有独立 cache

- `tray.js` 是 CJS,运行在主进程
- preact signals 在 renderer 进程
- **不能跨进程共享 signal**,所以主进程需要独立的 cache 镜像
- 镜像通过 IPC 推 events 增量更新 (跟现有 metals scheduler 同样的模式)

## 3. UI 设计 — 菜单栏布局 (v1)

```
── 🔄 检查更新 (1 待升级) ──
Codex  26.609 → 26.611  ⬆️ 升级
[点击 → 打开面板 + 定位 Codex + 弹升级确认]

── 📊 AI coding plan 用量 ──
MiniMax: 72% 已用 (剩 1.2h)
其他 plan: 未配置
[点击 → 打开面板 + 切 AI 用量 tab + 定位 MiniMax 卡]

── 🏆 世界杯 · 今日 ──
20:00  巴西 vs 阿根廷 (小组赛 A)
23:00  法国 vs 德国 (小组赛 B)
[点击 → 打开面板 + 切世界杯 tab + 滚到第一场赛程]

── 🥇 贵金属 · 实时 ──
黄金 ¥939.18/g +0.42% · 白银 ¥16.875/g +0.18%
[点击 → 打开面板 + 切贵金属 tab + 滚到黄金卡]

─────────────────────────────────
📂 打开面板  ·  ⚙️ 配置文件  ·  🚪 退出
```

### 3.1 视觉规则

- **段头**: 灰色 (`color: #888`),形如 `── <icon> <标题> (<meta>) ──`
- **数据行**: 默认色,行高 1.65
- **提示行**: 灰色 (`#888`) 11px,1 行,描述"点击 → 做什么"
- **升级入口**: 红色 (`#ff3b30`),只"检查更新"段有,点击直接触发升级 modal
- **涨**: 红 (`#ff3b30`) / **跌**: 绿 (`#34c759`) — 中国习惯
- **陈旧数据**: 行尾灰字 `(2h 前)`
- **整段隐藏**: 该模块拉不到 / 未配置但又没法显示有意义的文字

### 3.2 特殊状态

| 场景 | 表现 |
|---|---|
| 模块数据正常 | 显示该段 (3-5 行) |
| 模块数据陈旧 (>1h) | 数据行 + 行尾灰字 `(Nh 前)` |
| 模块数据失败 | 整段隐藏 |
| 模块未配置 (如 AI plan 没 key) | 1 行: `<icon> <标题> — 未配置` |
| 该模块用户没装 | 整段隐藏 |
| 启动期 (cache 还没回) | 显示 `<icon> <标题> — 加载中...` (≤3s 后超时隐藏) |

## 4. 数据源 — 4 个模块

### 4.1 🔄 检查更新 (零成本,完全复用)

**现状**:
- `state-store.js` 已持久化 `apps[].installed_version` / `latest_version` / `has_update`
- `tray.js setResults(results)` 已接收完整 list
- `index.js` 在 `onCheckComplete` 回调里 `trayMgr.setResults(results)`

**改动**: 0 — 当前已经能展示"哪个 app 要更新"了,只是现在放在 "── 有更新 (N) ──" 段

**新展示**:
```js
const updates = results.filter(r => r.has_update);
if (updates.length > 0) {
  template.push({ label: `── 🔄 检查更新 (${updates.length} 待升级) ──`, enabled: false });
  updates.forEach(r => {
    const ver = r.latest_version ? `${r.installed_version || '?'} → ${r.latest_version}` : '';
    template.push({
      label: `${r.name}  ${ver}  ⬆️ 升级`,
      click: () => trayMgr.openPanelAndFocus({ tab: 'versions', rowName: r.name, action: 'upgrade' })
    });
  });
}
```

### 4.2 📊 AI coding plan 用量 (新增 main cache)

**现状**:
- main 进程没有 AI 用量 cache,数据全在 renderer `ai-usage-store.js` 的 signal
- renderer 已有 `ai-usage:get-cached` / `ai-usage:fetch` IPC

**改动**:
1. 新增 `src/main/ai-usage-cache.js` — main 进程持有 last-known snapshot `{ minimax, glm }`
2. 启动时:`src/main/index.js` bootstrap 拉一次 `ai-usage:get-cached` 灌入 cache
3. 每 30 分钟: 定时器调 `ai-usage:fetch` 拉最新 (复用现有 IPC)
4. 推 events: cache 更新时 `trayMgr.setAiUsage(snapshot)` + `trayMgr.setAiUsageError(provider, err)`
5. `tray.js` 新增 `setAiUsage(snapshot)` 方法,合并到 debounce 队列
6. `preload.js` 暴露 `ai-usage:get-tray-data` (供其他场景用,可选)

**新展示**:
```js
function buildAiUsageSection(snapshot) {
  const lines = [];
  for (const provider of ['minimax', 'glm']) {
    const data = snapshot?.[provider];
    if (!data) {
      lines.push({ label: `  ${PROVIDER_NAME[provider]}: 未配置`, enabled: false });
      continue;
    }
    const pct = Math.round((data.used / data.total) * 100);
    const remain = data.total - data.used;
    const remainStr = formatRemain(remain);  // "1.2h" / "3d"
    lines.push({ label: `  ${PROVIDER_NAME[provider]}: ${pct}% 已用 (剩 ${remainStr})`, enabled: false });
  }
  return lines;
}
```

### 4.3 🏆 世界杯今日赛程 (新增 24h 缓存)

**现状**:
- `worldcupFetchFixtures` IPC 每次现拉
- 世界杯赛程一天只变 1-2 次 (加赛/改时间),没必要实时

**改动**:
1. 新增 `src/main/worldcup-tray-cache.js` — 24h 缓存
2. 启动时: 拉一次今日 fixtures → 存 `state.json` 新字段 `worldcup_today` (含 `fetchedAt`)
3. 每 24h 刷新一次 (用户开 app 第一次进入新 24h 窗口时拉)
4. tray 直接读 cache,失败就用 cache 兜底 (拉不到也不隐藏)
5. `preload.js` 暴露 `worldcup:get-today-fixtures` 给 renderer 同步用 (面板打开时也能立即拿到)

**新展示**:
```js
function buildWorldcupSection(fixtures) {
  if (!fixtures || fixtures.length === 0) {
    return [{ label: '  今日无赛事', enabled: false }];
  }
  return fixtures.slice(0, 3).map(f => ({
    label: `  ${formatTime(f.kickoff)}  ${f.home} vs ${f.away} (${f.group || f.stage})`,
    click: () => trayMgr.openPanelAndFocus({ tab: 'worldcup', matchId: f.id })
  }));
}
```

### 4.4 🥇 贵金属实时价 (零成本,完全复用)

**现状**:
- main 已有 `src/main/metal-scheduler.js`,每 5 分钟拉一次
- 推 `metals:quote:changed` event 到 renderer
- renderer `metalStore.js` 持有 `quoteCache` signal

**改动**:
1. `tray.js` 在 main 进程也监听 `metals:quote:changed` event (preload 不用改,因为 main 端走的是 `BrowserWindow.webContents.send`,我们直接订阅 main 内部 emitter)
2. 或者更干净: `metal-ipc.js` 在 push 时同时调 `trayMgr.setMetals(quotes)`
3. 选方案 2:显式依赖,tray 不监听全局 emitter

**新展示**:
```js
function buildMetalsSection(quotes) {
  if (!quotes || Object.keys(quotes).length === 0) return null;  // 整段隐藏
  const lines = [];
  const display = ['XAU', 'AU9999'];  // 主显示 2 个
  for (const id of display) {
    const q = quotes[id];
    if (!q) continue;
    const cnyPerGram = q.currency === 'CNY' ? q.price : q.price * fx.rate;
    const changePct = (q.change / (q.price - q.change)) * 100;
    const color = changePct >= 0 ? 'ff3b30' : '34c759';
    lines.push({
      label: `  ${METAL_NAME[id]} ¥${cnyPerGram.toFixed(2)}/g ` +
             `  ${changePct >= 0 ? '↗' : '↘'} ${Math.abs(changePct).toFixed(2)}%`,
      enabled: false,
    });
  }
  return lines;
}
```

## 5. 防闪烁 + 性能

### 5.1 debounce 合并

```js
let rebuildTimer = null;
function scheduleRebuild() {
  if (rebuildTimer) return;
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    doRebuild();
  }, 200);
}

trayMgr.setResults = scheduleRebuild;  // 包装
trayMgr.setAiUsage = scheduleRebuild;
trayMgr.setWorldcup = scheduleRebuild;
trayMgr.setMetals = scheduleRebuild;
```

### 5.2 Windows throttle (≥1s)

```js
let lastRebuild = 0;
function doRebuild() {
  const now = Date.now();
  if (process.platform === 'win32' && now - lastRebuild < 1000) {
    return setTimeout(doRebuild, 1000 - (now - lastRebuild));
  }
  lastRebuild = now;
  // ... 真正 rebuild
}
```

### 5.3 不在菜单栏关闭时 rebuild

macOS 的 `tray.setContextMenu` 只在用户右键点开时才读,所以平时 rebuild 不影响 tray 图标显示。Windows ICO 切换会闪 → 用 throttle 解决。

## 6. 点击行为 — 打开面板 + 定位 + 弹 modal

### 6.1 IPC 协议

主进程调 `trayMgr.openPanelAndFocus({ tab, ...locator })` 时:
1. `winMgr.showWindow()` — 显示面板
2. `webContents.send('tray:focus', { tab, ...locator })` — renderer 收到
3. renderer 内部:
   - 切 `activeNav.value = tab`
   - 等布局 mount (~50ms)
   - `document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
   - 弹 modal (如果 `action === 'upgrade'`)

### 6.2 点击映射表

| 菜单栏行 | `tab` | locator | action |
|---|---|---|---|
| Codex 26.609 → 26.611 升级 | `versions` | `{ rowName: 'Codex' }` | `upgrade` |
| 📊 MiniMax: 72% | `ai-usage` | `{ provider: 'minimax' }` | (无) |
| 🏆 20:00 巴西 vs 阿根廷 | `worldcup` | `{ matchId: '...' }` | (无) |
| 🥇 黄金 ¥939.18/g | `metals` | `{ metalId: 'XAU' }` | (无) |
| 📂 打开面板 | (无) | (无) | (无) — 只 show |
| ⚙️ 配置文件 | (无) | (无) | (无) — `shell.openPath` |
| 🚪 退出 | (无) | (无) | (无) — `app.quit` |

### 6.3 renderer 接收

新增 `src/renderer/tray-focus.js`:
```js
api.onTrayFocus(async (data) => {
  if (!data) return;
  const { setActiveNav } = await import('./worldcup/navStore.js');
  setActiveNav(data.tab);
  await new Promise(r => setTimeout(r, 80));  // 等布局
  if (data.rowName) scrollToRowName(data.rowName);
  else if (data.matchId) scrollToMatch(data.matchId);
  else if (data.metalId) scrollToMetal(data.metalId);
  else if (data.provider) scrollToProvider(data.provider);
  if (data.action === 'upgrade') {
    import('./store.js').then(({ requestUpgrade }) => requestUpgrade(data.rowName));
  }
});
```

## 7. 失败 + 边界处理

| 场景 | 行为 |
|---|---|
| `state.json` 损坏 | `🔄 检查更新` 段隐藏,其他段不受影响 |
| AI 用量 fetch 失败 | `📊 AI 用量 — 拉取失败` 1 行灰字,30min 后重试 |
| 世界杯 fixtures 拉失败 | 用 24h 前的 cache 兜底,无 cache 则 `🏆 世界杯 — 加载中...` |
| 贵金属 quote 失败 | 沿用 scheduler 的 last-known 模式 (sina 挂不影响 eastmoney,反之) |
| 数据陈旧 >1h | 行尾灰字 `(2h 前)` |
| 数据陈旧 >24h | 整段隐藏 |
| 启动 3s 内 cache 还没回 | 段头显示 `— 加载中...` |
| 用户没装 (如没基金 app) | 该模块段整段隐藏 |
| 菜单栏被频繁 rebuild | debounce 200ms + Windows throttle 1s 兜底 |

## 8. 测试

### 8.1 单元测试

- `tests/main/ai-usage-cache.test.js` — cache load/save/refresh
- `tests/main/worldcup-tray-cache.test.js` — 24h 失效判断 / 启动拉一次
- `tests/main/tray.test.js` — 扩展:
  - `buildMenu` 在 4 个数据源各种组合下输出正确段数
  - `setResults/setAiUsage/setWorldcup/setMetals` 都触发 debounce
  - 失败时该段隐藏
  - 陈旧时附加灰字
  - Windows throttle 生效

### 8.2 集成测试

- `tests/integration/tray-click-focus.test.js` — 模拟菜单栏点击,验证 renderer 收到 `tray:focus` + tab 切换 + 滚动到目标

### 8.3 手工验证清单

- [ ] 启动后 ≤3s 看到 4 段都显示
- [ ] 关掉网络 → AI 用量段显示"拉取失败" 灰字
- [ ] 等 2h → 行尾显示 "(2h 前)"
- [ ] macOS 上右键菜单栏 → 不闪
- [ ] Windows 上右键菜单栏 → 不闪 (≤1s 抖动看不到)
- [ ] 点击 Codex 升级行 → 面板打开 + 定位 Codex + 弹升级确认 modal
- [ ] 点击世界杯赛程 → 面板打开 + 切到世界杯 + 滚到该场
- [ ] 4 个数据源同时变化 → 菜单栏只 rebuild 1 次 (debounce)
- [ ] 启动时 cache 全失败 → 4 段都隐藏,只显示底部 action (跟 v2.21 一样)

## 9. 文件改动清单

### 新增 (5 个)

- `src/main/ai-usage-cache.js` — AI 用量 main cache
- `src/main/worldcup-tray-cache.js` — 世界杯 24h cache
- `src/renderer/tray-focus.js` — renderer 接收 `tray:focus` IPC
- `tests/main/ai-usage-cache.test.js`
- `tests/main/worldcup-tray-cache.test.js`

### 改动 (8 个)

- `src/main/tray.js` — `rebuildMenu` 重写,4 个数据源方法 + debounce + Windows throttle
- `src/main/index.js` — bootstrap 启动 AI 用量 + 世界杯 cache
- `src/main/ipc.js` — 注册 cache 推送 / 转发到 tray
- `src/main/metal-ipc.js` — 推 quotes 时同时调 `trayMgr.setMetals`
- `preload.js` — 暴露 `onTrayFocus` 接收 `tray:focus` 事件
- `src/renderer/index.jsx` — bootstrap 调 `subscribeTrayFocus()`
- `src/renderer/components/Header.jsx` — (可能) 暴露 `scrollToRowName` 等给 tray-focus 用
- `src/renderer/worldcup/...` — (可能) 暴露 `scrollToMatch` 等

### 状态文件扩展 (1 个)

- `state.json` v2 schema (兼容 v1):
  - 新增 `ai_usage: { minimax: {...}, glm: {...} }`
  - 新增 `worldcup_today: { fixtures: [...], fetchedAt: ms }`
  - `v` 字段从 1 → 2

## 10. 阶段拆分

| 阶段 | 范围 | 涉及文件 | 估计 |
|---|---|---|---|
| **A** | 🔄 检查更新段重做 (新展示 + 点击行为) | tray.js + ipc + preload + tray-focus | 2-3h |
| **B** | 📊 AI 用量段 (新增 cache) | ai-usage-cache.js + main bootstrap + tray + test | 3-4h |
| **C** | 🏆 世界杯段 (新增 24h cache) | worldcup-tray-cache.js + state-store v2 + tray + test | 3-4h |
| **D** | 🥇 贵金属段 (复用 scheduler) | metal-ipc.js + tray + test | 1-2h |
| **E** | 性能加固 (debounce + Windows throttle) | tray.js + test | 1h |

**A 必须先 ship**(低风险:数据流本来就通,只重做菜单栏的展示 + 点击行为;新增 IPC 路径在 A 里就接好,后续 B/C/D 复用)
**B/C/D 可并行**(独立数据源,可分配给不同 session/agent)
**E 最后**(需要前面 4 段都接上才能在真实并发场景下验证防抖)

## 11. 风险 + 缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| macOS template image 在新菜单栏内容下被系统截断 | 用户看不到下面的段 | 测 macOS 13/14/15 各版本;如果有问题,fallback 到非 template 渲染 |
| Windows 端 ICO 切换闪烁 | 用户感知差 | 1s throttle + 测试 |
| 4 个 IPC 并发推 events,debounce 不够 | 偶尔丢更新 | debounce 200ms 之后仍有 scheduleRebuild 保险,300ms 后强制 rebuild |
| AI 用量 cache 写 state.json 失败 | 重启后丢数据 | 主进程内存仍持有,下次 check 完重写;用户感知 0 |
| 世界杯 24h cache 在赛事改时间时不更新 | 用户看到旧赛程 | 检测到距开赛 <1h 时强制 refresh;改时间由 fixtures 接口返回新时间触发 |
| 点击"升级" 时面板尚未 mount | scrollIntoView 失败 | 80ms 延迟重试,最多 3 次 |
| 用户装了多份 Pulse (dev + prod) | cache 冲突 | state.json 路径仍走 `app.getPath('userData')`,两份 Pulse 各自独立 |

## 12. 回滚

- A 阶段 (检查更新段) 改动局限于 `tray.js` `rebuildMenu`,回滚到 git HEAD~1
- B/C 阶段: 删除 `ai-usage-cache.js` / `worldcup-tray-cache.js`,从 `index.js` bootstrap 移除调用
- D 阶段: 在 `metal-ipc.js` 移除 `trayMgr.setMetals` 调用
- E 阶段: 删除 debounce/throttle 逻辑

`state.json` v2 schema 向后兼容 v1,加新字段不影响老逻辑

---

## 13. 实施后续 (不是本 spec 范围)

完成本 spec 后,潜在的 v2.23 候选:
- 菜单栏自定义排序 (允许用户隐藏某个段)
- 快捷键绑定 (Cmd+Shift+1..4 跳到对应模块)
- 菜单栏显示月报 (周末生成上周汇总)
- 把"最近活动"也压成一段
- 把"提醒"也压成一段
