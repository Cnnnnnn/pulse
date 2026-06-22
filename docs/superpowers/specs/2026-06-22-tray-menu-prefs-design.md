# Tray 菜单配置选择展示 设计 (Phase v1)

| 日期       | 作者         | 状态                          |
| ---------- | ------------ | ----------------------------- |
| 2026-06-22 | brainstorming | 设计已批准,待 writing-plans |
| 2026-06-22 | (扩展) | v1 扩展:同步联动主面板 nav tab |

> 本 spec 对应用户原话:「菜单栏配置选择展示能力,比如有些用户他跟本不需要用到检查更新,他可以移除掉」。
> 不属于产品路线图直接编号任务,作为零散功能 v1 立项。

## 1. 背景与目的

当前 `src/main/tray.js` 的 `buildMenu()` 渲染 4 个动态段(🔄 检查更新 / 📊 AI 用量 / ⚽ 世界杯 / 💎 贵金属)+ 底部 4 个 action(打开面板 / 检查更新 / 打开配置文件 / 退出),**用户没有任何配置能力**。

有些用户(典型场景:装 Pulse 只是为了看 AI 用量 + 世界杯)根本不需要「检查更新」段,菜单里 13 个 app 的更新行纯噪声 — 关掉更清爽。

**v1 目标**(严格不超出):

- 用户可独立开关 **6 个项**:4 个动态段 + 2 个底部 action(检查更新按钮 / 打开配置文件)
- 「打开面板」「退出」**锁死不可关** — 关掉用户就被卡死或找不到入口
- 配置入口在 Tray 菜单底部新增「菜单栏配置...」(锁死位置,不进 prefs)
- 配置 UI 是主面板内的 modal(不开新 BrowserWindow)
- 持久化到 `state.json.tray_menu_prefs`
- happy-dom 单测覆盖 prefs 纯函数 + buildMenu 接线 + modal 关键交互

**v1 扩展(同日,实现期发现单控菜单栏不彻底)**:

- 4 个动态段(`updates` / `ai_usage` / `worldcup` / `metals`)**同时联动**主面板 SideNav 对应 nav tab:
  - `updates` ↔ `🔄 版本检查` · `ai_usage` ↔ `📊 AI 用量` · `worldcup` ↔ `🏆 世界杯` · `metals` ↔ `🥇 贵金属`
- 3 个固定 nav(`📰 IT 新闻` / `🔥 微博热搜` / `💰 基金管理`)+ 「🤖 AI 配置」按钮 **始终显示**(spec v1 没覆盖,留)
- `check_action` / `config_action` **只影响**菜单栏底部按钮(主面板无对应 nav)
- 当前 `activeNav` 被关时,自动切到第一个可见 nav(让用户进面板总有内容看)
- 实现要点:`SideNav` 订阅 `trayMenuPrefs` signal 过滤 nav 项;`navStore.installNavWatch()` effect 检测 `activeNav` 被关时切换

**v1 明确不做**(留给后续版本):

- 段顺序拖拽重排(用户已确认 only on/off)
- 跨设备同步
- 锁定项「power user 模式」(永不做 — 把自己卡死的风险大于收益)
- Tray badge 数字与 prefs 联动(badge = 有 N 个 update,跟菜单显示解耦)
- 配置导出/导入
- 锁定项被修改时的兜底 confirm(根本没暴露,不需要)

## 2. 架构与模块边界

### 2.1 新增文件 3 个

| 文件 | 估算行数 | 职责 |
|---|---|---|
| `src/main/tray-menu-prefs.js` | ~80 | 纯 CommonJS:默认 prefs 构造、key 校验、未知 key 丢弃、锁定 key 强制 true |
| `src/renderer/components/TrayMenuConfigModal.jsx` | ~120 | Modal UI:6 个 checkbox + 保存/取消 + 加载中态,无拖拽 |
| `tests/main/tray-menu-prefs.test.js` | ~60 | 默认 prefs / 未知 key 过滤 / 锁定 key 不可关 / 边界 null |

### 2.2 修改文件 5 个

| 文件 | 改动 | 估行 |
|---|---|---|
| `src/main/tray.js` | `buildMenu` 加 `trayPrefs` 参数 + `onOpenTrayConfig` 回调;动态段和底部 action 各包一层 `if (seg.X)`;`createTrayManager` 加 `setTrayMenuPrefs(prefs)` setter;`rebuildMenu` 把「菜单栏配置...」拼到「退出」正上方 | +50 |
| `src/main/state-store.js` | 新字段 `tray_menu_prefs`(默认全开);`saveTrayMenuPrefs(prefs)` 函数;`load()` 把 `tray_menu_prefs` 带回来;`getTrayMenuPrefs()` 兜底 | +30 |
| `src/main/ipc.js` | 新增 IPC handler:`'tray:open-config'`(main → renderer)、`'tray:close-config'`(renderer → main)、`'tray:get-prefs'`(renderer 拉)、`'tray:save-prefs'`(renderer 推) | +40 |
| `src/main/index.js` | 启动时 `loadTrayMenuPrefs()` 注入到 tray manager;订阅 `'tray:save-prefs'` 写盘后调 `setTrayMenuPrefs` 触发 `rebuildMenu` | +20 |
| `preload.js` | 暴露 `window.pulse.tray.openConfig()` / `closeConfigModal()` / `getPrefs()` / `savePrefs(prefs)` | +15 |

### 2.3 完全不动

- `config.json` — 用户的 tray 偏好不进产品配置文件(那是产品配置,这是用户偏好)
- `src/renderer/store.js`、`App.jsx` — modal 顶层 mounted,不进 nav store
- `src/renderer/api.js` — IPC bridge 已经在 modal 里 `window.pulse.tray.*` 直调
- 「打开面板」「退出」的渲染逻辑 — 锁死写死在 `buildMenu`

### 2.3.1 v1 扩展期调整(改动文件从 5 个增到 7 个)

| 文件 | 改动 | 估行 |
|---|---|---|
| `src/renderer/components/SideNav.jsx` | 加 `NAV_TO_PREFS_SEGMENT` map,4 个动态 nav 项订阅 `trayMenuPrefs` 过滤 | +15 |
| `src/renderer/worldcup/navStore.js` | 加 `installNavWatch()` effect — current nav 被关时切到第一个可见 | +25 |
| `src/renderer/trayConfigStore.js` | 加 `trayMenuPrefs` signal + `applyTrayPrefsFromMain(prefs)` | +10 |
| `src/renderer/index.jsx` | bootstrap 拉 prefs → apply + installNavWatch | +12 |
| `src/renderer/components/TrayMenuConfigModal.jsx` | 保存成功后 `applyTrayPrefsFromMain` (SideNav 立即过滤) | +3 |
| `jsconfig.json` + `vitest.config.js` | 新增 `@main/*` alias,允许 renderer import `src/main/*`(让 `TRAY_SEGMENTS` 单源真相在 renderer 测试里能解析) | +4 |

> 关键:navStore.js **改了**(原 spec 把它列在"完全不动",v1 扩展期被动)。`activeNav` 仍然在 navStore,**不**进 trayConfigStore — effect 装在 navStore 是因为 `activeNav` 是它管理的状态。

### 2.4 模块依赖图

```
TrayMenuConfigModal.jsx
   ├─> window.pulse.tray.{openConfig,closeConfigModal,getPrefs,savePrefs}  (preload.js 桥)
   └─> TRAY_SEGMENTS (从 tray-menu-prefs.js 共享同一个 key 列表)

tray.js
   ├─> tray-menu-prefs.js (DEFAULT_PREFS 常量,normalizePrefs 复用)
   └─> index.js (注入 onOpenTrayConfig → window.show + send 'tray:open-config')

state-store.js
   └─> tray-menu-prefs.js (DEFAULT_PREFS 兜底)

index.js
   ├─> state-store.js (loadTrayMenuPrefs / saveTrayMenuPrefs)
   └─> tray.js (createTrayManager + setTrayMenuPrefs)
```

## 3. 数据流与算法

### 3.1 持久化 schema

```json
// state.json.tray_menu_prefs
{
  "version": 1,
  "segments": {
    "updates":       true,   // 🔄 检查更新(动态段)
    "ai_usage":      true,   // 📊 AI 用量
    "worldcup":      true,   // ⚽ 世界杯
    "metals":        true,   // 💎 贵金属
    "check_action":  true,   // 底部「检查更新」按钮
    "config_action": true    // 底部「打开配置文件」按钮
  }
}
```

**锁死的 2 项**(`打开面板` / `退出`)**不进 schema,也不进 `TRAY_SEGMENTS` 列表** — `buildMenu` 永远渲染,根本不读 prefs。这两个 key 不存在于数据层,不存在「被尝试关闭」的可能。

**兼容性**:老 `state.json` 没有 `tray_menu_prefs` → `getTrayMenuPrefs()` 返回 `DEFAULT_PREFS`,无需迁移。

### 3.2 segment key 单源真相(`src/main/tray-menu-prefs.js`)

```js
const TRAY_SEGMENTS = [
  { key: 'updates',       label: '🔄 检查更新' },
  { key: 'ai_usage',      label: '📊 AI 用量' },
  { key: 'worldcup',      label: '⚽ 世界杯' },
  { key: 'metals',        label: '💎 贵金属' },
  { key: 'check_action',  label: '检查更新(按钮)' },
  { key: 'config_action', label: '打开配置文件' },
];

const DEFAULT_PREFS = {
  version: 1,
  segments: Object.fromEntries(TRAY_SEGMENTS.map(s => [s.key, true])),
};

// 纯函数:未知 key 丢弃,6 个已知 key 缺失则补默认 true
function normalizePrefs(input) {
  if (!input || typeof input !== 'object' || !input.segments) return DEFAULT_PREFS;
  const out = { version: 1, segments: {} };
  for (const s of TRAY_SEGMENTS) {
    const v = input.segments[s.key];
    out.segments[s.key] = typeof v === 'boolean' ? v : true;
  }
  return out;
}
```

### 3.3 IPC 接口

```js
// preload.js
window.pulse.tray = {
  openConfig:        () => ipcRenderer.send('tray:open-config'),
  closeConfigModal:  () => ipcRenderer.send('tray:close-config'),
  getPrefs:          () => ipcRenderer.invoke('tray:get-prefs'),
  savePrefs:         (prefs) => ipcRenderer.invoke('tray:save-prefs', prefs),
};

// main 端 ipc.js
ipcMain.on('tray:open-config', () => {
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('tray:open-config');  // renderer 监听开 modal
});

ipcMain.on('tray:close-config', () => {
  mainWindow.webContents.send('tray:close-config'); // renderer 监听关 modal
});

ipcMain.handle('tray:get-prefs', () => loadTrayMenuPrefs());

ipcMain.handle('tray:save-prefs', async (_e, prefs) => {
  const normalized = normalizePrefs(prefs);
  await saveTrayMenuPrefs(normalized);
  trayManager.setTrayMenuPrefs(normalized);   // 立刻 rebuildMenu
  return { ok: true };
});
```

### 3.4 `buildMenu` 接线(关键逻辑)

```js
function buildMenu(opts) {
  const {
    results = [],
    aiUsage = null,
    worldcup = null,
    metals = null,
    trayPrefs = DEFAULT_PREFS,
    onOpenPanel = () => {},
    onCheck = () => {},
    onOpenConfig = () => {},
    onQuit = () => {},
    onFocusUpdate = () => {},
    onFocusWorldcup = () => {},
    getConfigPath = () => '',
    getConfig = () => ({ apps: [] }),
  } = opts;
  const seg = trayPrefs.segments;
  const template = [];

  // 🔄 检查更新(原逻辑包 if)
  if (seg.updates) {
    if (results.length > 0) {
      const updates = results.filter((r) => r.has_update);
      const upToDate = results.filter((r) => r.status === 'up_to_date');
      if (updates.length > 0) {
        template.push({ label: `── 🔄 检查更新 (${updates.length} 待升级) ──`, enabled: false });
        updates.forEach(/* 原渲染逻辑 */);
        template.push({ type: 'separator' });
      } else if (upToDate.length > 0) {
        template.push({ label: `── 🔄 检查更新 · 全部最新 (${upToDate.length}) ──`, enabled: false });
        template.push({ label: '  点击"检查更新"手动刷新', enabled: false });
        template.push({ type: 'separator' });
      }
    } else {
      template.push({ label: '── 🔄 检查更新 · 尚未检查 ──', enabled: false });
      template.push({ type: 'separator' });
    }
  }

  // 📊 AI 用量 / ⚽ 世界杯 / 💎 贵金属 同样各包一层 if (seg.X && hasData)

  // 底部(锁死 + 可选)
  template.push({ label: '打开面板', click: () => onOpenPanel() });        // 锁死
  if (seg.check_action) {
    template.push({ label: '检查更新', click: () => onCheck() });
  }
  template.push({ type: 'separator' });
  if (seg.config_action) {
    template.push({ label: '打开配置文件', click: () => { /* 原逻辑 */ } });
  }
  template.push({ type: 'separator' });
  template.push({ label: '退出', click: () => onQuit() });                  // 锁死
  return template;
}
```

**退化情况**:6 项全关时最终 template = `[打开面板, sep, sep, 菜单栏配置, sep, 退出]` = 3 个 menu item + 3 个 separator,tray 菜单不空。

### 3.5 「菜单栏配置...」位置

```
... 动态段(根据 prefs 渲染)...
打开面板                              ← 锁死
检查更新                              ← seg.check_action
─────────
打开配置文件                          ← seg.config_action
─────────
菜单栏配置...                          ← 固定项,锁死位置,rebuildMenu 时拼入
退出                                  ← 锁死
```

放在「退出」正上方,符合 macOS 习惯(配置入口在退出附近)。

`rebuildMenu` 末尾:
```js
const tpl = buildMenu({ /* ... */ });
// 拼「菜单栏配置...」到「退出」之前
tpl.splice(-1, 0,
  { type: 'separator' },
  { label: '菜单栏配置...', click: () => onOpenTrayConfig() }
);
tray.setContextMenu(Menu.buildFromTemplate(tpl));
```

### 3.6 Modal 触发链路

```
[用户点击 Tray 「菜单栏配置...」]
       │
       ▼
[main: tray.onClick → onOpenTrayConfig()]
       │
       ├─ mainWindow.show() + mainWindow.focus()
       └─ mainWindow.webContents.send('tray:open-config')
              │
              ▼
[Renderer: App.jsx 注册 listener 'tray:open-config']
       │
       ▼
[setTrayConfigOpen(true)]
       │
       ▼
[<TrayMenuConfigModal /> 挂载]
```

关 modal 用 IPC 而非 React 状态直接关 — 让 main 拥有「modal 是否打开」的真相,Esc / 遮罩点 / 「取消」「保存」四种关法统一收口。

## 4. 测试护栏

### 4.1 `tests/main/tray-menu-prefs.test.js`(≥ 5 case)

1. `DEFAULT_PREFS.segments` 包含全部 6 个 key 且全为 `true`
2. `normalizePrefs({segments:{updates:false}})` → 其他 5 项仍 `true`
3. `normalizePrefs({segments:{unknown_key:true}})` → 未知 key 被丢弃,6 项齐全
4. `normalizePrefs({segments:{}})` → 全部 6 项为 `true`
5. `normalizePrefs(null)` / `normalizePrefs(undefined)` → 返回 `DEFAULT_PREFS`

### 4.2 `tests/main/tray-menu-build.test.js`(≥ 4 case)

复用已有的 `_internal.buildMenu`,扩展测试:

1. `trayPrefs.segments.updates = false` → 输出不含「🔄 检查更新」字样
2. 6 项全 `false` → 输出只剩「打开面板」「菜单栏配置...」「退出」(3 个 menu item,中间 1 个 separator)
3. 不传 `trayPrefs` → 默认全显示,行为与现状完全一致(向后兼容)
4. 「打开面板」「退出」**永远**在输出里,不依赖 prefs

### 4.3 `tests/renderer/tray-config-modal.test.js`(≥ 3 case)

1. 渲染时显示「加载中」,`getPrefs` resolve 后切换到 6 个 checkbox
2. 切换 checkbox → 「保存」按钮从 disabled 变 enabled
3. 点「保存」 → 调 `savePrefs`,且传入参数包含完整 6 个 key 的 `segments` 对象

### 4.4 `tests/renderer/sidenav-prefs.test.jsx`(≥ 5 case)— v1 扩展

SideNav 根据 `trayMenuPrefs` 过滤 nav 项:

1. 默认 prefs 全开 → 7 个 nav 全显示
2. 关 `updates` → `versions` nav 隐藏
3. 关 `ai_usage` → `ai-usage` nav 隐藏
4. 4 个动态全关 → 只剩 3 个固定 nav(ithome / wechat-hot / funds)
5. 只关 `check_action` / `config_action`(只影响菜单栏底部) → SideNav 全部 nav 仍显示

### 4.5 `tests/renderer/nav-store-prefs.test.js`(≥ 4 case)— v1 扩展

`navStore.installNavWatch` effect:

1. 全开 prefs → `activeNav` 不变
2. 关 `activeNav` 对应 segment → 自动切到第一个可见 nav(ithome 兜底)
3. `activeNav` 是固定 nav(funds) → 关任何动态 prefs 都不动
4. 4 个动态全关 + `activeNav=versions` → 切到 `ithome`

### 4.6 `tests/renderer/tray-config-store.test.js`(≥ 3 case)— v1 扩展

`trayConfigStore.trayMenuPrefs` signal + `applyTrayPrefsFromMain`:

1. `openTrayConfig` / `closeTrayConfig` 切换 `trayConfigOpen`
2. `applyTrayPrefsFromMain` 合法 prefs → 更新 signal
3. `applyTrayPrefsFromMain` 非法(null / 非对象 / 缺 segments)→ 不动 signal

## 5. 错误处理

| 场景 | 处理 |
|---|---|
| `state.json` 损坏 / 没 `tray_menu_prefs` 字段 | `getTrayMenuPrefs()` 返回 `DEFAULT_PREFS`,不抛 |
| `state.json` 写盘失败(磁盘满) | `saveTrayMenuPrefs` 抛 → IPC `tray:save-prefs` reject → modal 显示 toast「保存失败,重试」 |
| prefs 包含未知 key | `normalizePrefs` 静默丢弃 |
| 6 个已知 key 缺失 | `normalizePrefs` 补默认 `true` |
| 用户取消时 main 已写盘(竞态) | 不会发生 — modal 上「保存」才发 IPC,「取消」不发 |
| `getPrefs` 失败(renderer 拉初始值时 main 出错) | `try/catch`,modal 显示「加载失败,关闭重试」 |
| Modal 打开期间 tray 持续刷新 | `rebuildMenu` 不会影响 modal(modal 是独立 mounted 组件) |
| 用户多次打开/关闭 modal | modal `useEffect` cleanup 干净,IPC listener 注销正确 |

## 6. 风险与未做

**已故意不做**:

- 拖拽重排顺序(用户已确认 only on/off)
- 跨设备同步
- 锁定项可隐藏的「power user mode」(永不做 — 卡死风险大于收益)
- 配置导出/导入
- Tray badge 数字与 prefs 联动(badge = 有 N 个 update,跟菜单显示解耦)
- 锁定项被修改时的兜底 confirm(根本没暴露,不需要)

**边界已 cover**:

- 6 项全关 → 菜单退化到 3 行(打开面板 / 菜单栏配置... / 退出),不空
- 4 个动态全关 → SideNav 退化到 4 个固定项(IT 新闻 / 微博热搜 / 基金管理 / AI 配置),`activeNav` 自动切到 `ithome`
- 当前 `activeNav` 是被关的动态 nav → effect 立即切到第一个可见 nav(用户不会看到空白面板)
- 老用户升级 → 无 `tray_menu_prefs` 字段 → 自动全开(SideNav 显示全部 7 nav)
- 锁死项不进 schema 也不进 UI,单一真相 = `buildMenu` 硬编码 + modal 的 `TRAY_SEGMENTS` 常量 6 项
- `@main/*` alias 让 renderer 在测试里能解析 `src/main/tray-menu-prefs.js`(避免重复定义常量)

**v1 扩展期未做**(留给后续版本,跟 v1 不冲突):

- 主面板 nav tab 顺序拖拽重排 — 主面板 nav 顺序固定,跟 menu 一样只 on/off
- nav tab 内子 tab(如「赛程 / 球队」)跟随 prefs — 当前没暴露,UI 层级过深会反人类
- nav 锁定项「power user 模式」 — 同 menu,永不做
- 隐藏某 nav tab 后,自动重排 SideNav 顺序填补空位 — 当前固定 NAV_ITEMS 顺序,空位保留(简单可预测)