# I6 v2 — 微博热搜未读角标 + SideNav 联动 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 wechat-hot(微博热搜)补齐与 ithome 对称的 read 机制 —— 点击热搜行标记已读(持久化到 state.json)+ SideNav「🔥 微博热搜」item 右上角未读数字胶囊。

**Architecture:** 5 层改动,自底向上:①main `read-store.js`(state.json wechat_hot.readIds 纯函数) → ②state-store load/save 封装 + schema → ③IPC mark-read/load-read + preload → ④renderer store(readIds/newIds/unreadBadge + applyPayload diff) → ⑤WechatHotList 行级已读 + SideNav navBadges。每层都有 ithome 现成实现当模板照抄。

**Tech Stack:** Node fs + state-store patchState(main)/ Preact + @preact/signals(renderer)/ vitest(forks pool)

**Spec:** `docs/superpowers/specs/2026-06-24-i6v2-wechat-hot-sidenav-unread-badge-design.md`

---

## File Structure

| 文件 | 改动 | 职责 |
| ---- | ---- | ---- |
| `src/main/wechat-hot/read-store.js` | 新建 | state.json wechat_hot.readIds 读写纯函数 |
| `src/main/state-store.js` | 修改 | 加 loadWechatHotRead/saveWechatHotRead + PRESERVE_FIELDS + module.exports |
| `src/main/ipc/register-wechat-hot.js` | 修改 | 加 wechat-hot:load-read / wechat-hot:mark-read handler |
| `preload.js` | 修改 | 加 wechatHotLoadRead / wechatHotMarkRead |
| `src/renderer/wechat-hot/store.js` | 修改 | 加 readIds/newIds/unreadBadge signal + applyPayload diff + markItemRead + bootstrap 拉 readIds |
| `src/renderer/wechat-hot/components/WechatHotList.jsx` | 修改 | 点行标记 + 已读 is-read 变灰 |
| `src/renderer/wechat-hot/components/WechatHotLayout.jsx` | 修改 | 透传 readIds + markItemRead 给 List |
| `src/renderer/components/SideNav.jsx` | 修改 | navBadges 加 'wechat-hot' 键 |
| `styles.css` | 修改 | 加 `.wechat-hot-list-row.is-read` |
| `tests/main/wechat-hot/read-store.test.js` | 新建 | read-store 纯函数测试 |
| `tests/main/state-store-wechat-hot-read.test.js` | 新建 | state-store load/save + schema forward compat |
| `tests/renderer/wechat-hot-store.test.js` | 新建 | renderer store diff/markItemRead/bootstrap |
| `tests/renderer/wechat-hot-list-read.test.jsx` | 新建 | WechatHotList 点行 + 已读变灰 |
| `tests/renderer/sidenav-wechat-hot-badge.test.jsx` | 新建 | SideNav 集成 badge |

**测试文件位置约定** (跟现有结构对齐):
- main 纯函数 → `tests/main/wechat-hot/read-store.test.js`
- state-store → `tests/main/state-store-wechat-hot-read.test.js`
- renderer store → `tests/renderer/wechat-hot-store.test.js`
- 组件 → `tests/renderer/wechat-hot-list-read.test.jsx`
- SideNav 集成 → `tests/renderer/sidenav-wechat-hot-badge.test.jsx`

---

## Task 1: main read-store.js 纯函数 (TDD)

**Files:**
- Create: `src/main/wechat-hot/read-store.js`
- Test: `tests/main/wechat-hot/read-store.test.js`

- [ ] **Step 1: 新建测试文件,写失败的 case**

新建 `tests/main/wechat-hot/read-store.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { loadReadIds, markItemRead } = await import(
  "../../../src/main/wechat-hot/read-store.js"
);

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-wxh-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

function writeFile(obj) {
  fs.writeFileSync(tmpFile, JSON.stringify(obj), "utf-8");
}

describe("wechat-hot read-store (I6 v2)", () => {
  it("loadReadIds 无 wechat_hot 字段 → {}", () => {
    writeFile({ v: 1, apps: {} });
    expect(loadReadIds(tmpFile)).toEqual({});
  });

  it("loadReadIds 有 wechat_hot.readIds → 返回该 map", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "热词A": 1000 } } });
    expect(loadReadIds(tmpFile)).toEqual({ "热词A": 1000 });
  });

  it("markItemRead 写 readIds[title] = now 并保留其它字段", () => {
    writeFile({ v: 1, apps: { X: { installed: "1.0" } }, mutes: {} });
    const r = markItemRead("新热词", tmpFile);
    expect(r.ok).toBe(true);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["新热词"]).toBeGreaterThan(0);
    // 其它字段保留
    expect(after.apps.X.installed).toBe("1.0");
  });

  it("markItemRead 重复标记 → 更新 readAt, 幂等", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "词": 100 } } });
    const r = markItemRead("词", tmpFile);
    expect(r.ok).toBe(true);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["词"]).not.toBe(100); // 已更新
  });

  it("markItemRead 保留已有 readIds (不覆盖)", () => {
    writeFile({ v: 1, apps: {}, wechat_hot: { readIds: { "旧词": 50 } } });
    markItemRead("新词", tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["旧词"]).toBe(50);
    expect(after.wechat_hot.readIds["新词"]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败 (模块不存在)**

Run: `npx vitest run tests/main/wechat-hot/read-store.test.js`
Expected: FAIL — `Cannot find module .../read-store.js`

- [ ] **Step 3: 新建 read-store.js**

新建 `src/main/wechat-hot/read-store.js`:

```js
/**
 * src/main/wechat-hot/read-store.js
 *
 * wechat-hot 已读词持久化 — state.json.wechat_hot.readIds.
 * 仿 src/main/ithome/news-store.js 的 markArticleRead 模式.
 *
 * state.json 结构: { ..., wechat_hot: { readIds: { "<title>": <readAt(ms)> } } }
 *
 * diff key = title (热搜词本身; rank 随热度浮动不稳定).
 * 只存 readIds (已读词); newIds 是 session 级, 不落盘 (重启清零, 跟 ithome 一致).
 */

const fs = require("fs");
const stateStore = require("../state-store");
const { mainLog } = require("../log");

function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[wechat-hot/read-store] state read failed", {
      msg: err && err.message,
    });
    return {};
  }
}

/**
 * 读 wechat_hot.readIds (无则 {})
 * @param {string} [statePath]
 * @returns {Record<string, number>}
 */
function loadReadIds(statePath) {
  const s = _readStateRaw(statePath);
  const wh = s && s.wechat_hot;
  if (!wh || typeof wh !== "object") return {};
  const readIds = wh.readIds;
  if (!readIds || typeof readIds !== "object" || Array.isArray(readIds)) return {};
  return readIds;
}

/**
 * 标记一个热搜词已读 — 写 readIds[title] = now, atomic write 落盘.
 * 幂等: 重复标记只更新 readAt. 保留已有 readIds + 其它 state 字段.
 * @param {string} title
 * @param {string} [statePath]
 * @returns {{ ok: boolean, readIds?: object }}
 */
function markItemRead(title, statePath) {
  if (!title || typeof title !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  try {
    const result = stateStore.patchState((next) => {
      const existing = _readStateRaw(statePath);
      const prevReadIds =
        existing.wechat_hot && existing.wechat_hot.readIds
          ? existing.wechat_hot.readIds
          : {};
      next.wechat_hot = {
        readIds: { ...prevReadIds, [title]: Date.now() },
      };
    }, statePath);
    return { ok: true, readIds: result && result.wechat_hot && result.wechat_hot.readIds };
  } catch (err) {
    mainLog.warn("[wechat-hot/read-store] markItemRead failed", {
      msg: err && err.message,
    });
    return { ok: false, reason: "write_failed" };
  }
}

module.exports = { loadReadIds, markItemRead };
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/main/wechat-hot/read-store.test.js`
Expected: PASS (5 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/main/wechat-hot/read-store.js tests/main/wechat-hot/read-store.test.js
git commit -m "feat(i6v2): wechat-hot read-store (state.json wechat_hot.readIds)

仿 ithome news-store markArticleRead: patchState atomic write,
保留已有 readIds + 其它 state 字段. diff key = title."
```

---

## Task 2: state-store 封装 + schema (TDD)

**Files:**
- Modify: `src/main/state-store.js` (PRESERVE_FIELDS 加一行 + 新增 load/save + module.exports)
- Test: `tests/main/state-store-wechat-hot-read.test.js`

- [ ] **Step 1: 新建测试文件,写失败的 case**

新建 `tests/main/state-store-wechat-hot-read.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { initStateStorePaths, loadWechatHotRead, saveWechatHotRead } = await import(
  "../../src/main/state-store.js"
);

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-ss-wxh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  initStateStorePaths({ statePath: tmpFile });
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

describe("state-store wechat_hot read (I6 v2)", () => {
  it("loadWechatHotRead 无字段 → {}", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: {} }));
    expect(loadWechatHotRead(tmpFile)).toEqual({});
  });

  it("saveWechatHotRead 写入 + loadWechatHotRead 读回", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: { A: { installed: "1" } } }));
    saveWechatHotRead({ "词X": 12345 }, tmpFile);
    expect(loadWechatHotRead(tmpFile)).toEqual({ "词X": 12345 });
    // 其它字段保留
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.apps.A.installed).toBe("1");
  });

  it("forward compat: saveAll 保留 wechat_hot (PRESERVE_FIELDS)", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ v: 1, apps: {}, wechat_hot: { readIds: { "保留词": 1 } } })
    );
    const { saveOne } = await import("../../src/main/state-store.js");
    // saveOne 模拟其它模块写 state, 应保留 wechat_hot
    saveOne({ name: "Z", installed_version: "2.0", has_update: false }, tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.wechat_hot.readIds["保留词"]).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/main/state-store-wechat-hot-read.test.js`
Expected: FAIL — `loadWechatHotRead is not a function`

- [ ] **Step 3: 改 state-store.js**

**(a)** PRESERVE_FIELDS 数组末尾(last_seen_release 之后)加一行。找到:
```js
  { key: "last_seen_release", kind: "object", notArray: true },  // ON: { version, at } — release notes onboarding
];
```
改为:
```js
  { key: "last_seen_release", kind: "object", notArray: true },  // ON: { version, at } — release notes onboarding
  { key: "wechat_hot", kind: "object", notArray: true },          // I6 v2: { readIds: { title: readAt } } — wechat-hot 已读词
];
```

**(b)** 在现有 wechat-hot 相关位置(saveWorldcupScores 附近,或文件末尾 module.exports 之前)加 load/save 函数。紧跟 `saveWorldcupScores` 函数之后追加:

```js
// ─── I6 v2: wechat-hot 已读词 ───────────────────────────────

/**
 * 读 wechat_hot.readIds. 老 state.json 无该字段 → {} (兼容).
 * @param {string} [statePath]
 * @returns {Record<string, number>}
 */
function loadWechatHotRead(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.wechat_hot || typeof s.wechat_hot !== "object") return {};
  const readIds = s.wechat_hot.readIds;
  if (!readIds || typeof readIds !== "object" || Array.isArray(readIds)) return {};
  return readIds;
}

/**
 * 写 wechat_hot.readIds. atomic write, 保留所有其它字段.
 * @param {Record<string, number>} readIds
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveWechatHotRead(readIds, statePath = defaultPath()) {
  if (!readIds || typeof readIds !== "object" || Array.isArray(readIds)) {
    throw new TypeError("saveWechatHotRead: readIds must be plain object");
  }
  return patchState((next) => {
    next.wechat_hot = { readIds };
  }, statePath);
}
```

**(c)** module.exports 末尾(最后一个导出项之后)加:
```js
  loadWechatHotRead,
  saveWechatHotRead,
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/main/state-store-wechat-hot-read.test.js`
Expected: PASS (3 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/main/state-store.js tests/main/state-store-wechat-hot-read.test.js
git commit -m "feat(i6v2): state-store load/save wechat_hot.readIds + schema

PRESERVE_FIELDS 注册 wechat_hot (forward compat 跨 saveAll 保留).
仿 loadWorldcupScores/saveWorldcupScores 模式."
```

---

## Task 3: IPC handlers + preload (TDD)

**Files:**
- Modify: `src/main/ipc/register-wechat-hot.js`
- Modify: `preload.js`
- Test: `tests/main/wechat-hot/register-wechat-hot-ipc.test.js` (追加 case)

- [ ] **Step 1: 在现有 IPC 测试文件追加 case**

打开 `tests/main/wechat-hot/register-wechat-hot-ipc.test.js`。该测试用 `require.cache` stub 模式。在文件顶部 stubModules 附近,需要额外 stub read-store。

先看文件顶部的 stub 列表,在 `fetchWechatHot` stub 附近加 read-store stub。找到:
```js
const fetchWechatHot = vi.fn();
```
后面加:
```js
const readStorePath = require.resolve("../../../src/main/wechat-hot/read-store.js");
const loadReadIds = vi.fn(() => ({}));
const markItemRead = vi.fn(() => ({ ok: true }));
```

然后在 `stubModules()` 函数里(其它 `require.cache[...]` 之后)加:
```js
  require.cache[readStorePath] = {
    id: readStorePath,
    filename: readStorePath,
    loaded: true,
    exports: { loadReadIds, markItemRead },
  };
```

在文件末尾(最后一个 describe 之后)追加新 describe:

```js
describe("register-wechat-hot IPC: mark-read / load-read (I6 v2)", () => {
  it("注册 wechat-hot:load-read channel", () => {
    const channels = {};
    const safeHandle = (name, fn) => { channels[name] = fn; };
    const ctx = { safeHandle, sendToRenderer: vi.fn() };
    stubModules();
    const { registerWechatHotHandlers } = require("../../../src/main/ipc/register-wechat-hot.js");
    registerWechatHotHandlers(ctx);
    expect(typeof channels["wechat-hot:load-read"]).toBe("function");
  });

  it("注册 wechat-hot:mark-read channel", () => {
    const channels = {};
    const safeHandle = (name, fn) => { channels[name] = fn; };
    const ctx = { safeHandle, sendToRenderer: vi.fn() };
    stubModules();
    const { registerWechatHotHandlers } = require("../../../src/main/ipc/register-wechat-hot.js");
    registerWechatHotHandlers(ctx);
    expect(typeof channels["wechat-hot:mark-read"]).toBe("function");
  });

  it("wechat-hot:load-read 调 readStore.loadReadIds", async () => {
    loadReadIds.mockReturnValueOnce({ "词": 1 });
    const channels = {};
    const safeHandle = (name, fn) => { channels[name] = fn; };
    const ctx = { safeHandle, sendToRenderer: vi.fn() };
    stubModules();
    const { registerWechatHotHandlers } = require("../../../src/main/ipc/register-wechat-hot.js");
    registerWechatHotHandlers(ctx);
    const r = await channels["wechat-hot:load-read"]();
    expect(loadReadIds).toHaveBeenCalled();
    expect(r).toEqual({ "词": 1 });
  });

  it("wechat-hot:mark-read 调 readStore.markItemRead(title)", async () => {
    markItemRead.mockResolvedValueOnce({ ok: true });
    const channels = {};
    const safeHandle = (name, fn) => { channels[name] = fn; };
    const ctx = { safeHandle, sendToRenderer: vi.fn() };
    stubModules();
    const { registerWechatHotHandlers } = require("../../../src/main/ipc/register-wechat-hot.js");
    registerWechatHotHandlers(ctx);
    const r = await channels["wechat-hot:mark-read"]({}, "热搜词");
    expect(markItemRead).toHaveBeenCalledWith("热搜词");
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败 (channel 未注册)**

Run: `npx vitest run tests/main/wechat-hot/register-wechat-hot-ipc.test.js`
Expected: FAIL — 新 case 找不到 `wechat-hot:load-read` / `wechat-hot:mark-read` channel

- [ ] **Step 3: 改 register-wechat-hot.js**

在文件顶部 require 区加 read-store import。找到:
```js
const { fetchWechatHot } = require("../wechat-hot/fetcher.js");
const { createWechatHotCache } = require("../wechat-hot/cache.js");
```
后面加:
```js
const { loadReadIds, markItemRead } = require("../wechat-hot/read-store.js");
```

在 `registerWechatHotHandlers` 函数内,现有两个 safeHandle(`wechat-hot:load` / `wechat-hot:refresh`)之后,加两个新 handler:

```js
  safeHandle("wechat-hot:load-read", () => loadReadIds());

  safeHandle("wechat-hot:mark-read", (_evt, title) => {
    if (!title || typeof title !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return markItemRead(title);
  });
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/main/wechat-hot/register-wechat-hot-ipc.test.js`
Expected: PASS (原有 case + 新增 4 case 全绿)

- [ ] **Step 5: 改 preload.js**

找到(约第 149-156 行):
```js
  // 微信热搜 (v2.24)
  wechatHotLoad: () => ipcRenderer.invoke("wechat-hot:load"),
  wechatHotRefresh: () => ipcRenderer.invoke("wechat-hot:refresh"),
  onWechatHotUpdated: (cb) => {
```
在 `wechatHotRefresh` 这行之后、`onWechatHotUpdated` 之前,加:
```js
  wechatHotRefresh: () => ipcRenderer.invoke("wechat-hot:refresh"),
  wechatHotLoadRead: () => ipcRenderer.invoke("wechat-hot:load-read"),
  wechatHotMarkRead: (title) => ipcRenderer.invoke("wechat-hot:mark-read", title),
  onWechatHotUpdated: (cb) => {
```

- [ ] **Step 6: 跑 main 全量测试确认无回归**

Run: `npx vitest run tests/main/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/register-wechat-hot.js preload.js tests/main/wechat-hot/register-wechat-hot-ipc.test.js
git commit -m "feat(i6v2): IPC wechat-hot:mark-read / load-read + preload

仿 ithome:mark-read. safeHandle 注册, read-store 纯函数落盘.
preload 桥接 wechatHotMarkRead / wechatHotLoadRead."
```

---

## Task 4: renderer store — readIds/newIds/unreadBadge + diff (TDD)

**Files:**
- Modify: `src/renderer/wechat-hot/store.js`
- Test: `tests/renderer/wechat-hot-store.test.js` (新建)

- [ ] **Step 1: 新建测试文件**

新建 `tests/renderer/wechat-hot-store.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLoadRead = vi.fn(() => Promise.resolve({}));
const mockMarkRead = vi.fn(() => Promise.resolve({ ok: true }));

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    wechatHotLoad: () => Promise.resolve({ items: [], fetchedAt: 0 }),
    wechatHotRefresh: () => Promise.resolve({ items: [], fetchedAt: 0, source: "x" }),
    wechatHotLoadRead: () => mockLoadRead(),
    wechatHotMarkRead: (t) => mockMarkRead(t),
    onWechatHotUpdated: () => () => {},
  },
}));

import {
  wechatHotReadIds,
  wechatHotNewIds,
  wechatHotUnreadBadge,
  applyPayload,
  markWechatHotRead,
} from "../../src/renderer/wechat-hot/store.js";

beforeEach(() => {
  wechatHotReadIds.value = {};
  wechatHotNewIds.value = {};
  mockLoadRead.mockClear();
  mockMarkRead.mockClear();
});

describe("wechat-hot store diff + markRead (I6 v2)", () => {
  it("applyPayload 产生 newIds (未读的新词)", () => {
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotNewIds.value["词A"]).toBe(1);
    expect(wechatHotNewIds.value["词B"]).toBe(1);
    expect(wechatHotUnreadBadge.value).toBe(2);
  });

  it("readIds 已有的词不进 newIds", () => {
    wechatHotReadIds.value = { "词A": 100 };
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotNewIds.value["词A"]).toBeUndefined();
    expect(wechatHotNewIds.value["词B"]).toBe(1);
    expect(wechatHotUnreadBadge.value).toBe(1);
  });

  it("重复 applyPayload 不重复累加已追踪的词", () => {
    applyPayload({ items: [{ title: "词A" }] });
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    expect(wechatHotUnreadBadge.value).toBe(2); // A 不重复
  });

  it("markWechatHotRead 减 newIds + 加 readIds + 调 IPC", async () => {
    applyPayload({ items: [{ title: "词A" }, { title: "词B" }] });
    await markWechatHotRead("词A");
    expect(wechatHotNewIds.value["词A"]).toBeUndefined();
    expect(wechatHotReadIds.value["词A"]).toBeGreaterThan(0);
    expect(wechatHotUnreadBadge.value).toBe(1);
    expect(mockMarkRead).toHaveBeenCalledWith("词A");
  });

  it("markWechatHotRead 无效 title → invalid_args", async () => {
    const r = await markWechatHotRead("");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/renderer/wechat-hot-store.test.js`
Expected: FAIL — `wechatHotReadIds` / `wechatHotUnreadBadge` 未导出

- [ ] **Step 3: 改 store.js**

**(a)** import 加 computed。找到第 8 行:
```js
import { signal } from "@preact/signals";
```
改为:
```js
import { signal, computed } from "@preact/signals";
```

**(b)** signal 声明区(wechatHotUpdatedUnsub 之后)加 3 个:
```js
export const wechatHotReadIds = signal({});
export const wechatHotNewIds = signal({});
/**
 * SideNav 未读角标 (I6 v2) — 本 session 新增且未读的热搜词数.
 * 派生自 wechatHotNewIds: 点行 (markWechatHotRead) → -1; refresh 新词 → +N; 重启 → 归 0.
 */
export const wechatHotUnreadBadge = computed(
  () => Object.keys(wechatHotNewIds.value).length
);
```

**(c)** applyPayload 末尾(`wechatHotError.value = null;` 之后,函数结束前)加 diff:
```js
export function applyPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  wechatHotItems.value = Array.isArray(payload.items) ? payload.items : [];
  wechatHotLastFetched.value = payload.fetchedAt || 0;
  wechatHotLoaded.value = true;
  wechatHotError.value = null;
  // I6 v2: diff 产生 newIds — 本 session 首次出现且未读的词
  const prevIds = new Set(Object.keys(wechatHotNewIds.value));
  const newMap = { ...wechatHotNewIds.value };
  let mutated = false;
  for (const it of wechatHotItems.value) {
    const title = it && it.title;
    if (title && !prevIds.has(title) && !wechatHotReadIds.value[title]) {
      newMap[title] = 1;
      mutated = true;
    }
  }
  if (mutated) wechatHotNewIds.value = newMap;
}
```

**(d)** 在 `cleanupWechatHotUpdates` 之后加 markWechatHotRead:
```js
export async function markWechatHotRead(title) {
  if (!title || typeof title !== "string") {
    return { ok: false, reason: "invalid_args" };
  }
  const now = Date.now();
  wechatHotReadIds.value = { ...wechatHotReadIds.value, [title]: now };
  if (wechatHotNewIds.value[title]) {
    const next = { ...wechatHotNewIds.value };
    delete next[title];
    wechatHotNewIds.value = next;
  }
  try {
    await api.wechatHotMarkRead(title);
  } catch {
    /* signal is source of truth */
  }
  return { ok: true };
}
```

**(e)** bootstrapWechatHotTab 开头加拉 readIds。找到:
```js
export async function bootstrapWechatHotTab() {
  try {
    const cached = await api.wechatHotLoad();
```
改为:
```js
export async function bootstrapWechatHotTab() {
  try {
    // I6 v2: 先拉已读词, 再 load (diff 依赖 readIds)
    wechatHotReadIds.value = await api.wechatHotLoadRead();
    const cached = await api.wechatHotLoad();
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/wechat-hot-store.test.js`
Expected: PASS (5 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wechat-hot/store.js tests/renderer/wechat-hot-store.test.js
git commit -m "feat(i6v2): renderer store readIds/newIds/unreadBadge + diff

applyPayload diff 产生 newIds (仿 ithome _applyPayload).
markWechatHotRead 乐观更新 + fire-and-forget IPC.
bootstrap 先拉 readIds 再 load. computed unreadBadge."
```

---

## Task 5: WechatHotList 行级已读 + Layout 透传 (TDD)

**Files:**
- Modify: `src/renderer/wechat-hot/components/WechatHotList.jsx`
- Modify: `src/renderer/wechat-hot/components/WechatHotLayout.jsx`
- Test: `tests/renderer/wechat-hot-list-read.test.jsx` (新建)

- [ ] **Step 1: 新建测试文件**

新建 `tests/renderer/wechat-hot-list-read.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { WechatHotList } from "../../src/renderer/wechat-hot/components/WechatHotList.jsx";

// openExternal 是 side effect, mock 掉避免真打开浏览器
vi.mock("../../src/renderer/utils/external-link.js", () => ({
  openExternal: vi.fn(),
}));

const items = [
  { rank: 1, title: "热词A", url: "https://weibo.com/a" },
  { rank: 2, title: "热词B", url: "https://weibo.com/b" },
];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("WechatHotList 行级已读 (I6 v2)", () => {
  it("点行调 onMarkRead(title)", () => {
    const onMarkRead = vi.fn();
    const { container } = render(
      <WechatHotList items={items} readIds={{}} onMarkRead={onMarkRead} />
    );
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    fireEvent.click(rows[0]);
    expect(onMarkRead).toHaveBeenCalledWith("热词A");
  });

  it("已读词 (readIds 含) → 行带 is-read class", () => {
    const { container } = render(
      <WechatHotList items={items} readIds={{ "热词A": 1 }} />
    );
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows[0].classList.contains("is-read")).toBe(true);
    expect(rows[1].classList.contains("is-read")).toBe(false);
  });

  it("不传 readIds (默认 {}) → 无行 is-read", () => {
    const { container } = render(<WechatHotList items={items} />);
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows[0].classList.contains("is-read")).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/renderer/wechat-hot-list-read.test.jsx`
Expected: FAIL — 点行不调 onMarkRead;无 is-read 逻辑

- [ ] **Step 3: 改 WechatHotList.jsx**

**(a)** 函数签名加 props:
```jsx
export function WechatHotList({ items = [], query = "", reason = "empty",
                                 readIds = {}, onMarkRead } = {}) {
```

**(b)** map 渲染加 is-read + onClick 标记。找到现有的 `<li key={it.url}>` 块,改为:
```jsx
      {filtered.map((it) => {
        const isRead = !!(readIds && readIds[it.title]);
        return (
          <li key={it.url}>
            <button
              type="button"
              class={`wechat-hot-list-row${isRead ? " is-read" : ""}`}
              aria-label={`打开热搜：${it.title}`}
              onClick={() => {
                if (onMarkRead) onMarkRead(it.title);
                if (it.url) openExternal(it.url);
              }}
            >
              <span class={`wechat-hot-list-rank ${rankClass(it.rank)}`}>{it.rank}</span>
              <span class="wechat-hot-list-title">{it.title}</span>
              {it.tag ? <span class="wechat-hot-list-tag">{it.tag}</span> : null}
              {it.heat ? <span class="wechat-hot-list-heat">{it.heat}</span> : null}
            </button>
          </li>
        );
      })}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/wechat-hot-list-read.test.jsx`
Expected: PASS (3 case 全绿)

- [ ] **Step 5: 改 WechatHotLayout.jsx 透传 readIds + markItemRead**

**(a)** import 加 readIds signal + markWechatHotRead。找到:
```js
import {
  bootstrapWechatHotTab,
  cleanupWechatHotUpdates,
  subscribeWechatHotUpdates,
  wechatHotError,
  wechatHotItems,
  wechatHotLoading,
} from "../store.js";
```
加 `wechatHotReadIds` 和 `markWechatHotRead`:
```js
import {
  bootstrapWechatHotTab,
  cleanupWechatHotUpdates,
  subscribeWechatHotUpdates,
  wechatHotError,
  wechatHotItems,
  wechatHotLoading,
  wechatHotReadIds,
  markWechatHotRead,
} from "../store.js";
```

**(b)** 组件内订阅 readIds(在现有 `const items = wechatHotItems.value;` 附近):
```js
  const items = wechatHotItems.value;
  const loading = wechatHotLoading.value;
  const error = wechatHotError.value;
  const readIds = wechatHotReadIds.value;   // I6 v2
```

**(c)** 渲染 `<WechatHotList>` 加 props(两处:错误早返回那处不用改,因为 items 空;只改主渲染那处):
```jsx
        <WechatHotList items={items} query={search} reason={reason}
          readIds={readIds} onMarkRead={markWechatHotRead} />
```

- [ ] **Step 6: 跑测试确认无回归**

Run: `npx vitest run tests/renderer/wechat-hot-list-read.test.jsx tests/renderer/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/wechat-hot/components/WechatHotList.jsx src/renderer/wechat-hot/components/WechatHotLayout.jsx tests/renderer/wechat-hot-list-read.test.jsx
git commit -m "feat(i6v2): WechatHotList 行级已读 + Layout 透传

点行 = onMarkRead(title) + openExternal (零额外点击).
已读行 is-read 变灰 (仿 ithome NewsArticleRow).
Layout 透传 readIds signal + markWechatHotRead."
```

---

## Task 6: SideNav navBadges + CSS (TDD)

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `styles.css`
- Test: `tests/renderer/sidenav-wechat-hot-badge.test.jsx` (新建)

- [ ] **Step 1: 新建 SideNav 集成测试**

新建 `tests/renderer/sidenav-wechat-hot-badge.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

const ithomeUnreadBadge = signal(0);
const wechatHotUnreadBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "wechat-hot" },
    navCollapsed: { value: false },
    setActiveNav: vi.fn(),
    toggleNavCollapsed: vi.fn(),
  };
});

vi.mock("../../src/renderer/store.js", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  aiSessionsConfig: { value: null },
  aiKeyStatus: { value: {} },
}));

vi.mock("../../src/renderer/nav-refresh.js", () => ({
  refreshActiveNav: vi.fn(),
  REFRESHABLE_NAV_KEYS: new Set(),
}));

vi.mock("../../src/renderer/trayConfigStore.js", () => ({
  trayMenuPrefs: signal({
    version: 1,
    segments: {
      updates: true, ai_usage: true, worldcup: true, metals: true,
      check_action: true, config_action: true,
    },
  }),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({ ithomeUnreadBadge }));
vi.mock("../../src/renderer/wechat-hot/store.js", () => ({ wechatHotUnreadBadge }));

beforeEach(() => {
  localStorage.clear();
  ithomeUnreadBadge.value = 0;
  wechatHotUnreadBadge.value = 0;
  document.body.innerHTML = "";
});

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

function badgeText(navKey) {
  const li = document.body.querySelector(`.side-nav-item[data-nav="${navKey}"]`);
  if (!li) return null;
  const badge = li.querySelector(".side-nav-badge");
  return badge ? badge.textContent : null;
}

describe("SideNav — wechat-hot badge (I6 v2)", () => {
  it("wechatHotUnreadBadge=0 → 无 badge", () => {
    render(<SideNav />);
    expect(badgeText("wechat-hot")).toBeNull();
  });

  it("wechatHotUnreadBadge=7 → wechat-hot item badge 显示 7", () => {
    wechatHotUnreadBadge.value = 7;
    render(<SideNav />);
    expect(badgeText("wechat-hot")).toBe("7");
  });

  it("两个面板同时有未读 → 各自 badge 独立", () => {
    ithomeUnreadBadge.value = 3;
    wechatHotUnreadBadge.value = 5;
    render(<SideNav />);
    expect(badgeText("ithome")).toBe("3");
    expect(badgeText("wechat-hot")).toBe("5");
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/renderer/sidenav-wechat-hot-badge.test.jsx`
Expected: FAIL — wechat-hot badge 不渲染 (SideNav 还没 import wechatHotUnreadBadge)

- [ ] **Step 3: 改 SideNav.jsx**

**(a)** import 加 wechatHotUnreadBadge。找到现有 ithome import:
```js
import { ithomeUnreadBadge } from '../ithome/store.js';
```
后面加:
```js
import { wechatHotUnreadBadge } from '../wechat-hot/store.js';
```

**(b)** navBadges 加 wechat-hot 键。找到:
```js
  void ithomeUnreadBadge.value;
  const navBadges = { ithome: ithomeUnreadBadge.value };
```
改为:
```js
  void ithomeUnreadBadge.value;
  void wechatHotUnreadBadge.value;
  const navBadges = {
    ithome: ithomeUnreadBadge.value,
    'wechat-hot': wechatHotUnreadBadge.value,
  };
```

- [ ] **Step 4: 改 styles.css 加 is-read 样式**

在 `.wechat-hot-list-row` 规则附近(搜索现有 wechat-hot-list-row 定义)追加:
```css
.wechat-hot-list-row.is-read {
  opacity: 0.5;
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/sidenav-wechat-hot-badge.test.jsx`
Expected: PASS (3 case 全绿)

- [ ] **Step 6: 跑现有 SideNav 测试确认无回归**

Run: `npx vitest run tests/renderer/sidenav-prefs.test.jsx tests/renderer/sidenav-collapsed-buttons.test.jsx tests/renderer/sidenav-ithome-badge.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/SideNav.jsx styles.css tests/renderer/sidenav-wechat-hot-badge.test.jsx
git commit -m "feat(i6v2): SideNav navBadges 加 wechat-hot + is-read CSS

navBadges 两面板独立 badge (ithome + wechat-hot).
wechat-hot-list-row.is-read 半透明变灰 (仿 ithome)."
```

---

## Task 7: 全量验证 + 手测清单

**Files:** 无 (验证任务)

- [ ] **Step 1: 跑全量 vitest**

Run: `npx vitest run`
Expected: 全绿 (含新增 ~22 case: Task1 5 + Task2 3 + Task3 4 + Task4 5 + Task5 3 + Task6 3)

- [ ] **Step 2: 重新构建 renderer bundle**

Run: `npm run build:renderer`
Expected: 成功

- [ ] **Step 3: 填写手测清单**

```
用户本地验证:
1. npx electron .
2. 切到微博热搜, bootstrap 拉列表 → SideNav 🔥 item 右上有红数字
3. 点开一个热搜词 → 行变灰 + badge -1 + 浏览器打开微博
4. 重启 → 行仍变灰 (readIds 持久化), badge 归 0 (newIds session 级)
5. refresh 拉到新词 → badge 增量
6. 同时 ithome + wechat-hot 都有未读 → 两个 badge 独立显示
```

- [ ] **Step 4: 更新 roadmap §13 wechat-hot badge 状态**

(合并后做,见 Task 8)

- [ ] **Step 5: Commit (若改了 roadmap)**

```bash
git add docs/superpowers/specs/2026-06-19-product-roadmap-design.md
git commit -m "docs(roadmap): I6 v2 wechat-hot badge 已落地"
```

---

## Self-Review

**Spec 覆盖检查:**

| Spec § | 要求 | Task |
| ------ | ---- | ---- |
| §3.1 | read-store.js loadReadIds/markItemRead | Task 1 |
| §3.2 | state-store load/save + PRESERVE_FIELDS | Task 2 |
| §3.3 | IPC load-read/mark-read + preload | Task 3 |
| §3.4 | renderer readIds/newIds/unreadBadge + applyPayload diff + markItemRead + bootstrap | Task 4 |
| §3.5 | WechatHotList 点行标记 + is-read | Task 5 |
| §3.6 | SideNav navBadges 加 wechat-hot | Task 6 |
| §3.7 | .wechat-hot-list-row.is-read CSS | Task 6 Step 4 |

无遗漏。

**Placeholder 扫描:** 每个 step 都有完整代码或精确 grep 定位。无 TBD。

**命名一致性:**
- `loadReadIds` / `markItemRead` — read-store (Task1) / IPC (Task3) ✓
- `loadWechatHotRead` / `saveWechatHotRead` — state-store (Task2) ✓
- `wechatHotReadIds` / `wechatHotNewIds` / `wechatHotUnreadBadge` — store (Task4) / SideNav mock (Task6) ✓
- `markWechatHotRead` — store (Task4) / Layout (Task5) ✓
- `wechat-hot:load-read` / `wechat-hot:mark-read` — IPC channel (Task3) ✓
- `wechatHotLoadRead` / `wechatHotMarkRead` — preload (Task3) / store api (Task4 mock) ✓
- `wechat_hot` (state.json key, 带 underscore) — read-store (Task1) / state-store (Task2) ✓
- `is-read` class — WechatHotList (Task5) / CSS (Task6) ✓

**回归风险:**
- Task 3 改 register-wechat-hot.js 用 require.cache stub 模式 (跟现有 IPC 测试一致),Task 6 改 SideNav 不影响现有测试 (sidenav-prefs/collapsed 不 mock wechat-hot/store 但 import 安全 — store.js 只 import api.js)。
- Task 5 改 WechatHotList 加默认值 props (`readIds = {}`, `onMarkRead`),现有调用点(若不传)不破。

**bootstrap 时序:** spec §5 提到"bootstrap 先拉 readIds 再 load 增加一次 IPC 往返"。Task 4 Step 3 (e) 是串行 `await`,但 bootstrap 本就是 async + 非关键路径,一次额外往返可接受(若需并行优化留 v2)。
