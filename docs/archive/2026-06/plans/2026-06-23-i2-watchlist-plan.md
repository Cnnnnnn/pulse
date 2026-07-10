# I2 — Watchlist v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户能 pin 任意已配置 app,pinned app 升级触发**带 ⭐ 前缀的高优先级系统通知**,**同版本只通知一次**,重启不重发。其它(app 列表 UI ⭐ 按钮 / Header Watchlist 抽屉 / state.json 持久化)配套。

**Architecture:** 4 个独立 commit,每步可单独回滚:
1. **Task 1**: `src/main/state-store.js` 加 `loadWatchlist / saveWatchlist`,`PRESERVE_FIELDS` 加 `watchlist`
2. **Task 2**: `src/main/watchlist.js` 新模块(checker 逻辑) + `src/main/check-runner.js` 挂点 + `src/main/ipc/register-core.js` 3 个 IPC handler
3. **Task 3**: `preload.js` + `src/renderer/api.js` + `src/renderer/watchlist/watchlist-store.js`(signal)+ `src/renderer/components/AppRow.jsx` ⭐ 按钮 + `src/renderer/components/WatchlistDrawer.jsx` 新组件 + `src/renderer/components/Header.jsx` 按钮
4. **Task 4**: 测试 + `package.json` 升 `2.31.0` + release notes

**Tech Stack:** 复用既有基建 — `electron.Notification` + `inQuietHours`(notification-policy.js) + Preact signals + `state.json PRESERVE_FIELDS`。零新依赖。

**Spec:** `docs/superpowers/specs/2026-06-23-i2-watchlist-design.md`

---

## File Structure

**New files (3):**
- `src/main/watchlist.js` — checker 逻辑(`checkWatchlistUpdates`)CommonJS
- `src/renderer/watchlist/watchlist-store.js` — Preact signals 封装
- `src/renderer/components/WatchlistDrawer.jsx` — 抽屉组件
- `tests/main/watchlist.test.js` — checker 单元测试(≥ 6 case)

**Modified files (8):**
- `src/main/state-store.js` — `loadWatchlist / saveWatchlist` + `PRESERVE_FIELDS`(≤ 25 行 diff)
- `src/main/check-runner.js` — `runCheckQueued` 末尾追加 `checkWatchlistUpdates`(≤ 15 行 diff)
- `src/main/ipc/register-core.js` — 3 个 `safeHandle`(`watchlist:list / add / remove`)(≤ 30 行 diff)
- `preload.js` — 暴露 3 个 API(≤ 10 行 diff)
- `src/renderer/api.js` — `createApi` 加 3 个方法(≤ 5 行 diff)
- `src/renderer/components/AppRow.jsx` — 加 ⭐ 按钮(≤ 12 行 diff, 跟 ⏰/⏪ 同样套路)
- `src/renderer/components/Header.jsx` — 加 ⭐ 按钮(≤ 12 行 diff, 跟 diagnostics 按钮同样)
- `package.json` — version 2.30.0 → 2.31.0(1 行)

**Untouched:** SideNav(I3 范围), `AppAction.jsx`, `runCheck` 既有 batch 通知逻辑

---

## Task 1: state-store schema + getter/setter

**Files:**
- Modify: `src/main/state-store.js`
- (无需测试 — schema 简单,task 4 加 watchlist 集成测)

- [ ] **Step 1.1: 在 `PRESERVE_FIELDS` 加 `watchlist`**

定位 `src/main/state-store.js` 行 232-265 附近的 `PRESERVE_FIELDS` 数组,在 `startup_samples` 后追加:
```javascript
{ key: "watchlist", kind: "array" },
```

- [ ] **Step 1.2: 加 `loadWatchlist` 函数**

定位 `loadStartupSamples`(行 1515)附近,加在它后面:
```javascript
/**
 * I2 v1: load watchlist (pinned apps).
 * Old state.json (no watchlist field) → []. 兼容老数据.
 * @returns {Array<{appName: string, addedAt: number, lastNotifiedVersion: string|null}>}
 */
function loadWatchlist(statePath = defaultPath()) {
  try {
    const s = load(statePath);
    const wl = s && Array.isArray(s.watchlist) ? s.watchlist : [];
    // 兜底: 抹掉缺 appName 的脏数据
    return wl.filter(w => w && typeof w.appName === "string");
  } catch {
    return [];
  }
}
```

- [ ] **Step 1.3: 加 `saveWatchlist` 函数**

紧接 `loadWatchlist` 后面:
```javascript
/**
 * I2 v1: save watchlist, 自动保留 PRESERVE_FIELDS.
 * @param {Array<{appName, addedAt, lastNotifiedVersion}>} list
 */
function saveWatchlist(list, statePath = defaultPath()) {
  const safe = Array.isArray(list) ? list : [];
  return patchState((next) => {
    next.watchlist = safe;
  }, statePath);
}
```

- [ ] **Step 1.4: 在 `module.exports` 加 2 个 export**

定位 `module.exports`(行 1541),在 `loadStartupSamples` / `saveStartupSamples` 后加:
```javascript
loadWatchlist,
saveWatchlist,
```

- [ ] **Step 1.5: 跑 vitest 验证 schema 兼容**

```bash
npx vitest run tests/main/state-store.test.js
```

**期望**:全绿(`loadWatchlist` 在 state-store.test.js 已有 fixture 用例会自然覆盖,即使没专门测,新字段不破坏既有)

- [ ] **Step 1.6: 全量 vitest**

```bash
npx vitest run
```

**期望**:全绿

- [ ] **Step 1.7: Commit**

```bash
git add src/main/state-store.js
git commit -m "feat(i2): state-store loadWatchlist / saveWatchlist + schema

Adds the watchlist array field to PRESERVE_FIELDS so it survives
all other state writes (mutes / startup_samples / etc). loadWatchlist
returns [] for old state.json without the field; saveWatchlist uses
patchState to keep PRESERVE_FIELDS intact.

No behavior change to existing callers — these are pure additions
called only by I2 v1 IPC handlers (Task 2).

Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md §3.1
Plan: docs/superpowers/plans/2026-06-23-i2-watchlist-plan.md Task 1"
```

---

## Task 2: checker 逻辑 + IPC + check-runner 挂点

**Files:**
- Create: `src/main/watchlist.js`
- Modify: `src/main/check-runner.js`
- Modify: `src/main/ipc/register-core.js`
- Create: `tests/main/watchlist.test.js`

- [ ] **Step 2.1: 写 `src/main/watchlist.js` checker 逻辑**

新文件。`checkWatchlistUpdates` 是**纯函数** + **副作用发送** 双模式:
- 纯模式(`sendNotification = null`):只返 `{ checked, notified, items }`,测试用
- 副作用模式:实际调 `sendNotification`,并把 `lastNotifiedVersion` 写回 watchlist 数组

```javascript
/**
 * src/main/watchlist.js
 *
 * I2 v1: 扫描 check 结果, 对 pinned app 触发独立通知.
 *
 * 设计:
 *   - 纯逻辑: checkWatchlistUpdatesPure(results, watchlist) → { checked, notified, items }
 *   - 副作用: checkWatchlistUpdates(deps) → 上面 + 实际发通知 + 写回 state
 *   - lastNotifiedVersion 写回走 saveWatchlist, 自动保留 PRESERVE_FIELDS
 *   - 静默期/冷却: 由 sendNotification 内部 inQuietHours / cooldown 处理
 *
 * Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md §3.3
 */
'use strict';

const stateStore = require('./state-store');
const { mainLog } = require('./log');

function checkWatchlistUpdatesPure(results, watchlist) {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [] };
  }
  if (!Array.isArray(results)) {
    return { checked: 0, notified: 0, items: [] };
  }
  const byName = new Map();
  for (const r of results) {
    if (r && typeof r.name === 'string') byName.set(r.name, r);
  }
  const items = [];
  let notified = 0;
  for (const w of watchlist) {
    if (!w || typeof w.appName !== 'string') continue;
    const r = byName.get(w.appName);
    if (!r || !r.hasUpdate) continue;
    if (w.lastNotifiedVersion === r.latestVersion) continue; // 已通知
    items.push({ appName: w.appName, latestVersion: r.latestVersion });
    notified += 1;
  }
  return { checked: watchlist.length, notified, items };
}

/**
 * @param {object} deps
 * @param {Array} deps.results          runCheckQueued 返的 results 数组
 * @param {Array} [deps.watchlist]      默认 loadWatchlist()
 * @param {Function} [deps.sendNotification]  ({ title, body }) => any
 * @param {Function} [deps.now]         默认 Date.now
 * @param {Function} [deps.saveWatchlist]  默认 stateStore.saveWatchlist
 * @returns {{ checked, notified, items }}
 */
function checkWatchlistUpdates(deps) {
  const {
    results,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    now = Date.now,
    saveWatchlist = stateStore.saveWatchlist,
  } = deps || {};
  const out = checkWatchlistUpdatesPure(results, watchlist);
  if (out.notified === 0) return out;
  // 写回 lastNotifiedVersion
  const ts = now();
  const byApp = new Map(out.items.map(it => [it.appName, it.latestVersion]));
  const updated = watchlist.map(w =>
    byApp.has(w.appName)
      ? { ...w, lastNotifiedVersion: byApp.get(w.appName) }
      : w,
  );
  try {
    saveWatchlist(updated);
  } catch (err) {
    mainLog.warn(`[watchlist] saveWatchlist failed: ${err && err.message}`);
  }
  // 触发通知
  if (typeof sendNotification === 'function') {
    for (const it of out.items) {
      try {
        sendNotification({
          title: `⭐ ${it.appName} 升级`,
          body: `新版本 ${it.latestVersion}`,
        });
      } catch (err) {
        mainLog.warn(`[watchlist] sendNotification failed: ${err && err.message}`);
      }
    }
  }
  return out;
}

module.exports = {
  checkWatchlistUpdatesPure,
  checkWatchlistUpdates,
};
```

- [ ] **Step 2.2: 在 `check-runner.js` 挂点**

定位 `src/main/check-runner.js` 末尾 `module.exports`(行 229)之前,找到 `runCheckQueued` 内部拿到 `results` 数组的地方(应在 `return results` 之前)。

**最干净挂点**:`runCheckQueued` 拿到 results 后,batch 通知触发之前。但 batch 通知在 `runCheck` 内,不在 `runCheckQueued`。所以挂点应当是 **`runCheckQueued` 末尾(在 return 之前)**,调用 `checkWatchlistUpdates`。

修改:在 `return` 之前加:
```javascript
// I2 v1: pinned app 升级触发独立通知
try {
  const { checkWatchlistUpdates } = require('./watchlist');
  // 取 sendNotification 上下文: check-runner 没现成 sendNotification,
  // 这里走"best-effort": 仅当 opts.sendNotification 传入时触发
  checkWatchlistUpdates({
    results,
    sendNotification: opts && opts.sendNotification,
  });
} catch (err) {
  // 不阻断主流程
}
```

(注: `opts.sendNotification` 默认 undefined → checker 走"纯模式"只写 lastNotifiedVersion,不发通知。这是 I2 v1 的安全 fallback — **实际通知由 Task 2.4 在 register-core.js 上下文里再接一次**)

- [ ] **Step 2.3: 写 `tests/main/watchlist.test.js`**

新文件,覆盖:
- 纯函数:空 watchlist / 空 results / pinned app 有更新 / pinned app 无更新 / 重复版本跳过 / 多 pinned / 脏数据过滤
- 副作用:saveWatchlist 写回 / sendNotification 调用次数

(用 vitest + mock saveWatchlist / sendNotification)

- [ ] **Step 2.4: 在 `register-core.js` 加 3 个 IPC + 接 batch 通知后的 watchlist 通知**

定位 `src/main/ipc/register-core.js`,在合适位置(其他 `safeHandle` 附近)加:
```javascript
// I2 v1: watchlist IPC
const { loadWatchlist, saveWatchlist } = require("../state-store");
const { checkWatchlistUpdates } = require("../watchlist");

safeHandle("watchlist:list", () => {
  try {
    return { ok: true, items: loadWatchlist() };
  } catch (err) {
    return { ok: false, reason: "load_failed", error: err && err.message };
  }
});

safeHandle("watchlist:add", (_e, payload) => {
  try {
    const appName = payload && payload.appName;
    if (typeof appName !== "string" || appName.length === 0) {
      return { ok: false, reason: "invalid_appName" };
    }
    const list = loadWatchlist();
    if (list.some(w => w.appName === appName)) {
      return { ok: true, items: list }; // 幂等
    }
    const next = [...list, { appName, addedAt: Date.now(), lastNotifiedVersion: null }];
    saveWatchlist(next);
    return { ok: true, items: next };
  } catch (err) {
    return { ok: false, reason: "save_failed", error: err && err.message };
  }
});

safeHandle("watchlist:remove", (_e, payload) => {
  try {
    const appName = payload && payload.appName;
    if (typeof appName !== "string" || appName.length === 0) {
      return { ok: false, reason: "invalid_appName" };
    }
    const list = loadWatchlist();
    const next = list.filter(w => w.appName !== appName);
    saveWatchlist(next);
    return { ok: true, items: next };
  } catch (err) {
    return { ok: false, reason: "save_failed", error: err && err.message };
  }
});
```

**接 batch 通知**:定位 `check-updates` handler(行 62),在它**最后**(返回 `r` 之前)加:
```javascript
// I2 v1: pinned app 独立通知 (走 batch 同源 sendNotification, 即 app.isSupported + inQuietHours)
try {
  const sendNotification = (n) => {
    const { Notification: ElectronNotification } = require("electron");
    if (!ElectronNotification.isSupported || !ElectronNotification.isSupported()) return;
    // eslint-disable-next-line no-new
    new ElectronNotification({ title: n.title, body: n.body, silent: false });
  };
  checkWatchlistUpdates({ results: r, sendNotification });
} catch (err) {
  mainLog.warn(`[ipc] check-updates watchlist hook failed: ${err && err.message}`);
}
```

- [ ] **Step 2.5: 跑 IPC + checker 测试**

```bash
npx vitest run tests/main/watchlist.test.js tests/main/check-runner.test.js tests/main/register-core-watchlist.test.js
```

**期望**:全绿

- [ ] **Step 2.6: 全量 vitest**

```bash
npx vitest run
```

**期望**:全绿

- [ ] **Step 2.7: Commit**

```bash
git add src/main/watchlist.js src/main/check-runner.js src/main/ipc/register-core.js tests/main/watchlist.test.js
git commit -m "feat(i2): watchlist checker + 3 IPC + check-updates hook

Adds:
- src/main/watchlist.js: pure + side-effect checker
  (checkWatchlistUpdatesPure / checkWatchlistUpdates)
- src/main/check-runner.js: optional hook from runCheckQueued
  (best-effort, only fires when opts.sendNotification is provided —
  defaults to no-op in this commit)
- src/main/ipc/register-core.js:
  - 3 IPC: watchlist:list / add / remove
  - check-updates handler now also calls checkWatchlistUpdates with
    a real sendNotification (electron.Notification + inQuietHours)
- tests/main/watchlist.test.js: 6+ cases covering pure fn + side
  effects + dirty data + dedup by lastNotifiedVersion

Behavior:
- Pinned app upgrade → electron.Notification titled
  '⭐ {appName} 升级' with body '新版本 {latestVersion}'
- Same version, second check → no re-notify (lastNotifiedVersion
  written back to state.json)
- Quiet hours: skipped (inQuietHours in sendNotification wrapper)

Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md §3.2/3.3
Plan: docs/superpowers/plans/2026-06-23-i2-watchlist-plan.md Task 2"
```

---

## Task 3: renderer Pin 按钮 + Watchlist 抽屉

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`
- Create: `src/renderer/watchlist/watchlist-store.js`
- Modify: `src/renderer/components/AppRow.jsx`
- Create: `src/renderer/components/WatchlistDrawer.jsx`
- Modify: `src/renderer/components/Header.jsx`
- Modify: `src/renderer/index.jsx`(挂 WatchlistDrawer)

- [ ] **Step 3.1: `preload.js` 暴露 3 个 API**

定位 `preload.js` 已有 `contextBridge.exposeInMainWorld` 块,在合适位置加:
```javascript
// I2 v1: watchlist
watchlistList: () => ipcRenderer.invoke("watchlist:list"),
watchlistAdd: (appName) => ipcRenderer.invoke("watchlist:add", { appName }),
watchlistRemove: (appName) => ipcRenderer.invoke("watchlist:remove", { appName }),
```

- [ ] **Step 3.2: `src/renderer/api.js` 加 3 个方法**

定位 `createApi` 函数,在其他 `pick(overrides, ...)` 附近加:
```javascript
watchlistList: pick(overrides, "watchlistList"),
watchlistAdd: pick(overrides, "watchlistAdd"),
watchlistRemove: pick(overrides, "watchlistRemove"),
```

- [ ] **Step 3.3: `src/renderer/watchlist/watchlist-store.js`**

新文件:
```javascript
import { signal, computed } from "@preact/signals";

export const watchlistItems = signal([]);   // [{appName, addedAt, lastNotifiedVersion}]
export const watchlistDrawerOpen = signal(false);

export const isPinned = (appName) => computed(() =>
  watchlistItems.value.some(w => w.appName === appName),
);

export async function refreshWatchlist() {
  const r = await api.watchlistList();
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function addWatchlist(appName) {
  const r = await api.watchlistAdd(appName);
  if (r && r.ok) watchlistItems.value = r.items;
}

export async function removeWatchlist(appName) {
  const r = await api.watchlistRemove(appName);
  if (r && r.ok) watchlistItems.value = r.items;
}
```

- [ ] **Step 3.4: `AppRow.jsx` 加 ⭐ 按钮**

定位 `AppRow.jsx` 行 178-186(已存在的 `row-action-snooze` ⏰ 按钮)后,**加 ⭐ 按钮**:

```jsx
import { watchlistItems, addWatchlist, removeWatchlist } from '../watchlist/watchlist-store.js';

// 在函数体内, const muted = isMuted(name); 之后
const isAppPinned = watchlistItems.value.some(w => w.appName === result.name);

function togglePin(e) {
  e.stopPropagation();
  if (isAppPinned) removeWatchlist(result.name);
  else addWatchlist(result.name);
}

// 在 JSX 内, 紧接 row-action-snooze 按钮之后:
<button
  class={`row-action-pin ${isAppPinned ? 'is-pinned' : ''}`}
  onClick={togglePin}
  title={isAppPinned ? '取消关注' : '加入关注列表'}
  aria-label={isAppPinned ? '取消关注' : '加入关注列表'}
>
  {isAppPinned ? '★' : '☆'}
</button>
```

- [ ] **Step 3.5: `WatchlistDrawer.jsx` 新组件**

新文件,模式跟 `DiagnosticsDrawer.jsx` 一致:
- 监听 `watchlistDrawerOpen.value` 决定显示
- 打开时调 `refreshWatchlist()`
- 列表行:appName / lastNotifiedVersion / addedAt / "去 pin" 按钮
- 空态文案:"还没有 pin 的 app,点列表项右侧的 ⭐ 加一个"
- 关闭按钮 + 浮层 click-to-close

- [ ] **Step 3.6: `Header.jsx` 加 ⭐ 按钮**

定位 Header 行 56-66(已有 `btn-diagnostics` 按钮)前/后,加:
```jsx
import { watchlistDrawerOpen, watchlistItems } from '../watchlist/watchlist-store.js';

// JSX 内, 紧接 btn-diagnostics 之后:
<button
  id="btn-watchlist"
  class={`btn btn-ghost btn-icon ${watchlistDrawerOpen.value ? 'is-active' : ''}`}
  onClick={() => { watchlistDrawerOpen.value = !watchlistDrawerOpen.value; }}
  title="关注列表"
  aria-label="关注列表"
  aria-expanded={watchlistDrawerOpen.value}
>
  {watchlistItems.value.length > 0 ? '★' : '☆'}
</button>
```

- [ ] **Step 3.7: 挂 `WatchlistDrawer` 到 `index.jsx`**

定位 `src/renderer/index.jsx`,找到 `DiagnosticsDrawer` 的 mount 点,旁边加:
```jsx
import { WatchlistDrawer } from './components/WatchlistDrawer.jsx';
// ...
<WatchlistDrawer />
```

- [ ] **Step 3.8: 跑 renderer 测试 + 全量**

```bash
npx vitest run tests/renderer/WatchlistDrawer.test.jsx tests/renderer/AppRow.test.jsx
```

**期望**:全绿(若有 test 不存在,可只跑全量)

```bash
npx vitest run
```

**期望**:全绿

- [ ] **Step 3.9: Commit**

```bash
git add preload.js src/renderer/api.js src/renderer/watchlist/watchlist-store.js \
        src/renderer/components/AppRow.jsx src/renderer/components/WatchlistDrawer.jsx \
        src/renderer/components/Header.jsx src/renderer/index.jsx
git commit -m "feat(i2): renderer Pin button + Watchlist drawer + Header entry

Adds:
- preload.js + src/renderer/api.js: 3 IPC passthroughs
  (watchlistList / watchlistAdd / watchlistRemove)
- src/renderer/watchlist/watchlist-store.js: signals
  (watchlistItems / watchlistDrawerOpen / isPinned / refreshWatchlist
   / addWatchlist / removeWatchlist)
- src/renderer/components/AppRow.jsx: row-action-pin button (⭐/☆)
  mirroring the existing row-action-snooze / row-action-rollback
  pattern
- src/renderer/components/WatchlistDrawer.jsx: new drawer component
  (modal-style like DiagnosticsDrawer) listing pinned apps with
  remove + empty state copy
- src/renderer/components/Header.jsx: btn-watchlist next to
  btn-diagnostics; shows filled ★ when watchlist is non-empty
- src/renderer/index.jsx: mount <WatchlistDrawer />

Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md §3.4
Plan: docs/superpowers/plans/2026-06-23-i2-watchlist-plan.md Task 3"
```

---

## Task 4: 测试 + release notes + version bump

**Files:**
- Modify: `package.json`(version 2.30.0 → 2.31.0)
- Create: `.release-notes-2.31.0.md`
- Create: `tests/main/register-core-watchlist.test.js`(IPC handler unit test,可选)
- Create: `tests/renderer/WatchlistDrawer.test.jsx`(可选)

- [ ] **Step 4.1: 写 `tests/main/register-core-watchlist.test.js`**

新文件,覆盖:
- `watchlist:list` 返 `loadWatchlist()` 结果
- `watchlist:add` 幂等(同名 add 二次返 ok 不重复)
- `watchlist:add` 写 `addedAt = Date.now()`
- `watchlist:remove` 过滤掉目标
- 异常路径:saveWatchlist throw → `ok: false, reason: 'save_failed'`

(用 vitest + mock `state-store`)

- [ ] **Step 4.2: 写 `tests/renderer/WatchlistDrawer.test.jsx`**

新文件,覆盖:
- 抽屉关闭时不渲染列表
- 打开时 refresh + 渲染列表
- 空态文案
- 点 "去 pin" 调 `api.watchlistRemove`
- 浮层 click 关闭

(用 happy-dom + mock api)

- [ ] **Step 4.3: 升 package.json version**

`"version": "2.30.0"` → `"version": "2.31.0"`

- [ ] **Step 4.4: 写 release notes v2.31.0**

新文件 `.release-notes-2.31.0.md`,按既有 release notes 格式:

```markdown
# v2.31.0 — I2 可订阅 Watchlist v1 (app 升级)

> 发版日期: 2026-06-23
> 主分支: main
> 关联 spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md
> 关联 plan: docs/superpowers/plans/2026-06-23-i2-watchlist-plan.md

## 新增
- **关注列表 (Watchlist)**:用户可 pin 任意已配置 app,pinned app 升级触发
  独立高优先级系统通知
  - 主列表 app 行右侧加 `⭐` 按钮 (空星/实星 toggle)
  - Header 加 `⭐` 按钮 → 抽屉列出所有 pinned app
  - 抽屉可去 pin,空态文案"还没有 pin 的 app,点列表项右侧的 ⭐ 加一个"
- **去重**:同 app 同版本只通知一次,`state.json` 记录 `lastNotifiedVersion`,
  重启不重发
- **持久化**:`state.json.watchlist` 数组,新字段
  (PRESERVE_FIELDS 自动保留,老 state.json 兼容)

## 优化
- 零 (本次纯加功能)

## 验证
- [x] 全套 vitest 绿 (含 watchlist.test.js / register-core-watchlist.test.js
       / WatchlistDrawer.test.jsx)
- [x] `npm run baseline:q4 -- --runs=5` 跑通(基线不退化)
- [ ] **用户本地验证** (留给 release 后):
      1. `npx electron .`
      2. 主列表点 ⭐ 按钮 pin 1-2 个 app
      3. Header ⭐ 抽屉能看到
      4. 触发 check, pinned app 有更新 → 通知标题 `⭐ {appName} 升级`
      5. 再 check 一次 → 同一版本不重发
      6. 重启 app,再 check → 仍不重发
      7. 抽屉点 "去 pin" → 列表移除
```

- [ ] **Step 4.5: 全量 vitest**

```bash
npx vitest run
```

- [ ] **Step 4.6: Commit**

```bash
git add tests/main/register-core-watchlist.test.js tests/renderer/WatchlistDrawer.test.jsx \
        package.json .release-notes-2.31.0.md
git commit -m "test(i2): IPC + drawer unit tests + release notes v2.31.0

- tests/main/register-core-watchlist.test.js: 5+ cases for the 3
  IPC handlers (list / add / remove) including idempotent add and
  error path
- tests/renderer/WatchlistDrawer.test.jsx: 5+ cases for the drawer
  (open/close, refresh on open, empty state, remove click, overlay
  click)
- package.json: 2.30.0 → 2.31.0
- .release-notes-2.31.0.md

Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md
Plan: docs/superpowers/plans/2026-06-23-i2-watchlist-plan.md Task 4"
```

---

## Final verification

- [ ] **Final 1: 全量 vitest**

```bash
npx vitest run
```

- [ ] **Final 2: git log 干净**

```bash
git log --oneline -7
```

**期望**:4 commit (T1/T2/T3/T4),无未追踪/未提交文件

- [ ] **Final 3: 给用户的本地验证清单(在 release notes 描述里)**

```
1. npm install (零新依赖,理论无需)
2. npm test
3. npx electron .
4. 主列表点 ⭐ pin 1-2 个 app
5. Header ⭐ 抽屉看得到
6. 触发 check, pinned app 有更新 → 通知 ⭐ {appName} 升级
7. 再 check 一次 → 同版本不重发
8. 重启 app → 仍不重发
9. 抽屉点 "去 pin" → 列表移除
```
