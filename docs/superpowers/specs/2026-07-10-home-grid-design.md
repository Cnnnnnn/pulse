# Pulse · 首屏 Home Grid + 落点记忆 设计

> **日期**：2026-07-10
> **作者**：brainstorming 阶段
> **范围**：单一特性 — 把 Pulse 主窗口首屏改为 8 个顶级 nav 平铺的 grid，并记忆"上次停留的 nav"作为二次及以后启动的落点
> **状态**：待用户审阅 → writing-plans

---

## 1. 背景与目标

Pulse 是 macOS 菜单栏 App，主窗口目前没有"首屏"——`activeNav` signal 默认 `"versions"`，用户每次打开都直接进版本检查面板。

**目标**：
1. 首次启动（无持久化历史）显示一个桌面式 grid，平铺 8 个顶级 nav（版本检查 / AI 用量 / 世界杯 / 基金管理 / 贵金属 / 选股 / IT 新闻 / 微博热搜），让用户选择进入哪个模块
2. 第二次及以后的启动，直接进入**用户上次停留的模块**（不显示 grid）
3. 用户在任何模块内都可一键回到 home grid

**非目标（明确 YAGNI）**：
- home grid 上的搜索过滤
- 显示"上次停留时间" / "最常打开"等排序
- tile 拖拽排序
- 快捷键直接回 home（用 SideNav 按钮即可）
- mini 截图预览

---

## 2. 现状快照

| 项 | 当前值 |
|---|---|
| 顶级导航真源 | `src/renderer/worldcup/navStore.js` 的 `activeNav` signal |
| 顶级 nav key 集合 | `NAV_KEYS` = {ithome, wechat-hot, worldcup, funds, metals, stocks, ai-usage, versions}（8 个） |
| nav 切换函数 | `setActiveNav(key)` |
| 持久化字段 | `active_category`、`tray_menu_prefs`（菜单栏 + tray 同步）—— **没有"上次停留 nav"** |
| Layout 模型 | `AppShell` 渲染 `SideNav + LazyNavPanel`；`LazyNavPanel` 按 `nav` 动态 import 8 个 Layout 之一 |
| 启动默认值 | `activeNav = signal("versions")` |
| 默认窗口大小 | macOS popover ≈ 360-400px 宽 |

---

## 3. 设计 — 第 1 节：导航真源（activeNav + navStore）

### 3.1 `worldcup/navStore.js` 扩展

- `NAV_KEYS` 添加 `"home"` —— 让 `activeNav` 取值可以是 home
- `NAV_KEYS_LIST` **不加** `"home"` —— 它只描述 SideNav 渲染用的 8 个 nav；HomeGrid 独立铺
- `setActiveNav("home")` 通过现有白名单校验（NAV_KEYS.has）
- `installNavWatch` 的 `NAV_TO_PREFS_SEGMENT` map **不动** —— home 不在 map，prefs 关不掉，符合预期

### 3.2 ActiveNavKey 类型

```typescript
type ActiveNavKey =
  | 'home'
  | 'ithome' | 'wechat-hot' | 'worldcup'
  | 'funds' | 'metals' | 'stocks'
  | 'ai-usage' | 'versions';
```

### 3.3 AppShell 改动

```jsx
{activeNav.value === 'home'
  ? <HomeGrid />
  : <LazyNavPanel nav={activeNav.value} onCheck={onCheck} />}
```

其它逻辑**不变**。

### 3.4 SideNav 改动

- `NAV_ITEMS` 数组保持 8 个 nav —— home **不**进 SideNav，避免重复入口
- **新增**：折叠/展开按钮旁新增 🏠 小图标按钮 `onClick={() => setActiveNav("home")}`；不展开文字，tooltip "首页"

---

## 4. 设计 — 第 2 节：HomeGrid 组件

### 4.1 文件

`src/renderer/components/HomeGrid.jsx`，与 `SideNav.jsx` 同级。

### 4.2 视觉与布局

- 容器：`display: grid; gap: 12px; padding: 16px`
- CSS media query 自适应（不写 inline style）：
  - `width >= 600px` → `grid-template-columns: repeat(4, 1fr)`（4 列 2 行）
  - `400 <= width < 600` → `repeat(2, 1fr)`（2 列 4 行）
  - `width < 400` → `repeat(2, 1fr)`（紧凑 2 列）
- tile：`min-height: 88px; border-radius: var(--radius-md); background: var(--surface-elevated)`
- 标题字号 / 副标题字号：按 `docs/ui-design-system.md` 走

### 4.3 tile 交互

- 整块 `<button>`，可点击、可键盘 Tab、Enter 触发
- hover/focus：背景 → `var(--surface-overlay)` + `transform: scale(1.02)`
- focus 可见环：`var(--focus-ring)`（a11y）

### 4.4 HOME_TILES 数据

```javascript
const HOME_TILES = [
  { key: 'ithome',     title: 'IT 新闻',  subtitle: 'IT之家资讯 + AI 摘要',     icon: 'ithome' },
  { key: 'wechat-hot', title: '微博热搜', subtitle: '微博实时热搜',              icon: 'wechat-hot' },
  { key: 'worldcup',   title: '世界杯',   subtitle: '2026 世界杯赛程',            icon: 'worldcup' },
  { key: 'funds',      title: '基金管理', subtitle: '基金持仓 + 实时盈亏',         icon: 'funds' },
  { key: 'metals',     title: '贵金属',   subtitle: '黄金白银实时 + 持仓',         icon: 'metals' },
  { key: 'stocks',     title: '选股',     subtitle: 'A股条件选股 + AI 分析',      icon: 'stocks' },
  { key: 'ai-usage',   title: 'AI 用量',  subtitle: 'MiniMax coding plan 配额', icon: 'ai-usage' },
  { key: 'versions',   title: '版本检查', subtitle: 'App 版本监控',              icon: 'versions' },
];
```

**图标决策**：先复用 SideNav 已经在用的同一组 nav 图标组件（`SideNav` 用 `lucide-preact` 或仓库内同名组件），避免新增 SVG 资源。如果某个 key 在仓库无现成组件，用 SF Symbol emoji 字符 `'📰' / '🔥' / '⚽' / '💼' / '🏅' / '📈' / '🤖' / '🔄'` 作为兜底 —— 这是显式 YAGNI：不画 8 个新 SVG、不加 icon 库依赖。

**注**：不引用 `NAV_ITEMS`，避免循环依赖和"nav 表加一项 HomeGrid 多一项"的耦合。

### 4.5 onClick

```javascript
onClick={() => setActiveNav(tile.key)}
```

`setActiveNav` 内部已扩展落盘（见 §5）。

### 4.6 a11y

- 每个 tile 是 `<button>`，有 `aria-label`
- Tab + Enter 可触发

---

## 5. 设计 — 第 3 节：落盘 + 启动期决定 activeNav

### 5.1 落盘白名单

```javascript
const PERSISTABLE_NAV_KEYS = new Set([
  'ithome', 'wechat-hot', 'worldcup', 'funds',
  'metals', 'stocks', 'ai-usage', 'versions',
]);
// 'home' 不在内 —— home 是显示态不是落点
```

### 5.2 setActiveNav 扩展

```javascript
export function setActiveNav(key) {
  if (!NAV_KEYS.has(key)) return;
  const prev = activeNav.value;
  activeNav.value = key;

  // 已有副作用 (保留)
  if (key === 'funds' && prev !== 'funds') { trackFundView(); clearFundNavBadge(); }
  if (key === 'ai-usage' && prev !== 'ai-usage') { clearAiUsageNavBadge(); }
  if (key === 'ithome' && prev !== 'ithome') { trackIthomeView(); }
  if (key === 'wechat-hot' && prev !== 'wechat-hot') { clearWechatHotUnreadBadge(); }

  // 新增: 落盘 (仅 8 顶级, 排除 home)
  // ponytail: 同步路径上做了写盘前白名单过滤,
  // home 是显示态不是落点, 不写盘.
  // 写盘失败仅 console.warn, 不阻断 UI.
  if (key !== 'home' && PERSISTABLE_NAV_KEYS.has(key)) {
    if (typeof api?.saveLastActiveNav === 'function') {
      api.saveLastActiveNav(key).catch(() => { /* noop */ });
    }
  }
}
```

### 5.3 activeNav 默认值改 `home`

```javascript
// ponytail: 把"无历史 → 显示首页"作为唯一启动行为,
// 不再做 "尝试读主进程 / 失败 / 默认 versions" 这种兜底分支.
export const activeNav = signal('home');
```

### 5.4 启动期 await 加载（在 bootstrap）

`src/renderer/index.jsx` 的 `bootstrap()` 加 await（**在 `render(<App />)` 之前**）：

```javascript
async function bootstrap() {
  applyPlatformBodyClass();
  initTheme();

  // 1. 已有: 加载 config
  let cfg = { apps: [], check_on_launch: true };
  try { cfg = await api.getConfig(); cfg.apps = cfg.apps || []; } catch { /* noop */ }
  apps.value = cfg.apps;
  primeConfigCache(cfg);

  // 还需要 import PERSISTABLE_NAV_KEYS (从 navStore) 和 setActiveNav (从 navStore)

  // 2. 新增: 加载 lastActiveNav (复用 navStore 里已 export 的 PERSISTABLE_NAV_KEYS 白名单)
  if (typeof api.getLastActiveNav === 'function') {
    try {
      const { lastActiveNav } = await api.getLastActiveNav();
      if (lastActiveNav && PERSISTABLE_NAV_KEYS.has(lastActiveNav)) {
        setActiveNav(lastActiveNav);
      }
    } catch { /* noop */ }
  }

  const mount = document.getElementById('app') || document.body;
  render(
    <ErrorBoundary>
      <App onCheck={triggerCheck} />
    </ErrorBoundary>,
    mount,
  );

  wireRendererListeners();
  scheduleDeferredBootstrap(cfg);
}
```

**关键**：在 `render` 之前完成 `setActiveNav(lastActiveNav)`，否则首帧会闪 HomeGrid 再切到目标（视觉撕裂）。

---

## 6. 设计 — 第 4 节：主进程持久化

### 6.1 schema

**`src/main/state-store-schema.js`** 新增：

```javascript
last_active_nav: { kind: 'string' },  // 'ithome' | 'wechat-hot' | 'worldcup' | 'funds' | 'metals' | 'stocks' | 'ai-usage' | 'versions'
```

### 6.2 state-store.js

照 `loadActiveCategory` / `saveActiveCategory` 抄：

```javascript
const PERSISTABLE_NAV_VALUES = new Set([
  'ithome', 'wechat-hot', 'worldcup', 'funds',
  'metals', 'stocks', 'ai-usage', 'versions',
]);

// ponytail: 缺字段 / 非法值返回 null (区别于 active_category 的 'all' 兜底,
// 因为这里需要明确区分"无历史"和"上次停在 all", 渲染端据此决定是否显示 HomeGrid).
function loadLastActiveNav(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return null;
  const v = s.last_active_nav;
  if (typeof v !== 'string' || !PERSISTABLE_NAV_VALUES.has(v)) return null;
  return v;
}

function saveLastActiveNav(key, statePath = defaultPath()) {
  if (typeof key !== 'string' || !PERSISTABLE_NAV_VALUES.has(key)) {
    throw new TypeError('saveLastActiveNav: key must be a persistable nav key');
  }
  return patchState((next) => {
    next.last_active_nav = key;
  }, statePath);
}
```

### 6.3 字段保护（关键）

`state-store.js` 有中央 `PRESERVE_FIELDS` 清单（约 232-256 行），`patchState` 通过 `preserveExtraFields` 自动搬运。这不意味着要改 5 处——**只加一项到 PRESERVE_FIELDS 即可保护**：

```javascript
{ key: "last_active_nav", kind: "string" },  // P-N: HomeGrid 落点记忆
```

放在已有的 `{ key: "active_category", ... }` 紧邻条目旁边（注：`active_category` 因为是 base default 字段（`next` 构造里就赋值），不在 PRESERVE_FIELDS 里 —— 它靠的是 base next 默认 `||` 取 existing；新字段 `last_active_nav` 没有 base default，必须进 PRESERVE_FIELDS）。

### 6.4 IPC（`src/main/ipc/register-core.js`）

照 `get-active-category` / `save-active-category` 抄：

```javascript
'get-last-active-nav': () => {
  const lastActiveNav = stateStore.loadLastActiveNav();
  return { lastActiveNav };
},

'save-last-active-nav': (_evt, key) => {
  const r = stateStore.saveLastActiveNav(key);
  return { ok: true, lastActiveNav: r.last_active_nav };
},
```

**主进程白名单防御**：第二道防线，即使 renderer 白名单被绕过，main 抛 TypeError 拒绝。

### 6.5 preload.js

```javascript
getLastActiveNav: () => ipcRenderer.invoke('get-last-active-nav'),
saveLastActiveNav: (key) => ipcRenderer.invoke('save-last-active-nav', key),
```

---

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| `getLastActiveNav` 主进程抛出 | bootstrap `try/catch`，默认走 home |
| `getLastActiveNav` 字段非 string / 不在白名单 | 返回 `null` → renderer 走 home |
| `saveLastActiveNav("xxx")` main 校验失败抛 TypeError | renderer `.catch(() => {})` 吞掉，lastActiveNav 不变 |
| `saveLastActiveNav` IPC 链断 | `invoke` reject，renderer `.catch` 吞掉 |
| `state.json` atomic write 失败（disk full） | 已有 `patchState` 异常处理，state 不变；UI 不受影响 |
| 用户在 HomeGrid 触发回 home 后重启 | lastActiveNav 仍是上次 `"funds"`，下次启动仍进 funds（符合预期） |
| SideNav 项被 tray prefs 关掉但 activeNav 还在那 | 现有 `installNavWatch` effect 自动切到第一个可见 nav，触发 `setActiveNav(next)` → 落盘最新值 |

---

## 8. 数据流（端到端）

```
[启动]
  renderer bootstrap()
    ├─ await api.getConfig()
    ├─ await api.getLastActiveNav() → { lastActiveNav: "funds" }
    │   └─ if valid: setActiveNav("funds")
    │   └─ else:      activeNav 留默认 "home"
    └─ render(<App />)              (首帧已是目标 panel, 不会闪 HomeGrid)

[运行期 — 用户在 home 点 funds tile]
  → setActiveNav("funds")
    → activeNav.value = "funds"
    → api.saveLastActiveNav("funds")   (fire-and-forget)

[回首页]
  → SideNav 顶部 🏠 点击
    → setActiveNav("home")
    → activeNav.value = "home"
    → PERSISTABLE_NAV_KEYS 不含 "home" → 不落盘
```

---

## 9. 测试

`tests/main/state-store.lastActiveNav.test.js`（vitest，覆盖主进程 `state-store.js` 新增的纯函数）：

1. `loadLastActiveNav` 缺字段 → `null`
2. `loadLastActiveNav` 字段为 `"home"` → `null`（防回首页污染）
3. `loadLastActiveNav` 字段为合法 8 顶级 nav 之一 → 该值
4. `loadLastActiveNav` 字段为未知 key → `null`
5. `saveLastActiveNav("funds")` 正常 write → 后续 `loadLastActiveNav` 能读到
6. `saveLastActiveNav("home")` 抛 TypeError
7. `saveLastActiveNav("xxx")` 抛 TypeError

`tests/renderer/worldcup/navStore.lastActiveNav.test.js`（vitest，mock IPC）：

1. `setActiveNav("home")` → `api.saveLastActiveNav` **不**被调用（mock）
2. `setActiveNav("funds")` → `api.saveLastActiveNav("funds")` 被调用
3. `setActiveNav` saveLastActiveNav reject → activeNav 不回滚

主进程 patchState 字段保留（5 处 merge 都加 `last_active_nav: existing.last_active_nav`）通过 `saveLastActiveNav` 写一次，再写 `active_category`，再 `loadLastActiveNav` 看是否还在 —— 这条用例也合并到上面 5/7 号之间。

---

## 10. 风险清单

| 风险 | 缓解 |
|---|---|
| 首屏从默认 `"versions"` 改默认 `"home"`，老用户首次启动会"看不到版本检查" | **刻意的**——这就是设计目标。点击 tile 或之后点 SideNav `versions` 即可 |
| `NavKeys` 加 "home" 漏改某处遍历导致崩溃 | 重点检查 `installNavWatch` / `effectiveVisibleItems` / `setActiveNav` / `SideNav` 渲染循环；本 spec 不强求遍历保护，单元测试兜底 |
| 启动时序：`loadLastActiveNav` await 卡住 → 首屏空白 | 已有 `loadActiveCategory` 是同一套链路，参考它即可；不能 await 的情况：fallback 到 home + 后台异步同步 |
| SideNav 顶部加 🏠 按钮改变既有布局 | 仅在折叠状态成单图标，与 `IconSettings` 同处理 |
| 旧的 `currentRoute` 路由（library / diagnostics / settings）依然存在 | 互不影响：`lastActiveNav` 只针对 8 顶级 nav。`route-store.js` 的 `navigateTo` 内部不再"识别顶级 vs 二级"区分，靠 home 不在白名单自动解决 |

---

## 11. 范围 / YAGNI 复审（已落实）

✅ 不引入新依赖
✅ 不新加抽象层（无新 store / 无新 context）
✅ 不引第三方组件库（手写 grid + token 样式）
✅ 单元测试覆盖关键状态机
✅ 持久化完全复用 `active_category` 模式

未做（明确 YAGNI）：
❌ HomeGrid 加搜索过滤
❌ HomeGrid tile 显示"上次停留时间"
❌ HomeGrid tile 拖拽排序
❌ "回首页" 快捷键
❌ HomeGrid 的 mini 截图预览
