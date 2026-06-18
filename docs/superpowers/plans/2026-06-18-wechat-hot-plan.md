# 微信热搜栏目 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pulse 新增「📈 微信热搜」栏目（SideNav 第 2 项），主进程通过 tenhot 聚合 API 实时拉取微信热搜榜，renderer 端展示"排名 + 标题"列表，前三名颜色强调，用户可手动 ↻ 刷新（15s 冷却），点击跳系统浏览器到原始 URL。

**Architecture:** 跟 IT 新闻 / 贵金属完全同构：main 进程 `wechat-hot/{fetcher,list-parser,cache}.js` + `ipc/register-wechat-hot.js`；renderer 进程 `wechat-hot/{store,WechatHotLayout,WechatHotHeader,WechatHotList,WechatHotRow,utils}.{js,jsx}`。无 scheduler，无 state.json 持久化。Main 进程在 in-flight 期间拒并发；renderer 端 15s 冷却。SideNav 改 1 行；AppShell 改 1 行。

**Tech Stack:** Electron 35, Preact 10, @preact/signals 1.x, vitest 1.x, @testing-library/preact 3.x, happy-dom（renderer 测）。HttpClient（`src/main/http-client.js`）已存在，注入式。

---

## File Structure

| Path | Type | 责任 |
|---|---|---|
| `src/main/wechat-hot/list-parser.js` | 新增 | pure: tenhot payload → standardized items |
| `src/main/wechat-hot/fetcher.js` | 新增 | IO: HttpClient + 调用 parser |
| `src/main/wechat-hot/cache.js` | 新增 | 内存 cache + in-flight guard |
| `src/main/ipc/register-wechat-hot.js` | 新增 | 唯一 electron 边界，注册 2 个 channel |
| `src/renderer/wechat-hot/utils.js` | 新增 | `formatTime / formatHeat` |
| `src/renderer/wechat-hot/store.js` | 新增 | signals + bootstrap + 15s 冷却 |
| `src/renderer/wechat-hot/WechatHotLayout.jsx` | 新增 | layout 容器 (useEffect → bootstrap) |
| `src/renderer/wechat-hot/WechatHotHeader.jsx` | 新增 | 顶栏 (品牌+副标题+↻+搜索) |
| `src/renderer/wechat-hot/WechatHotList.jsx` | 新增 | 主体 (空态/错误态/列表) |
| `src/renderer/wechat-hot/WechatHotRow.jsx` | 新增 | 单行 (排名颜色+标题+chip) |
| `tests/main/wechat-hot/list-parser.test.js` | 新增 | parser 单测 |
| `tests/main/wechat-hot/fetcher.test.js` | 新增 | fetcher 单测（mock HttpClient） |
| `tests/main/wechat-hot/cache.test.js` | 新增 | cache 单测（in-flight guard） |
| `tests/renderer/wechat-hot/store.test.js` | 新增 | renderer store 单测 |
| `tests/renderer/wechat-hot/wechat-hot-list.test.jsx` | 新增 | List 组件测 |
| `tests/renderer/wechat-hot/wechat-hot-header.test.jsx` | 新增 | Header 组件测 |
| `src/main/ipc/index.js` | 改 | 注册 wechat-hot handlers |
| `preload.js` | 改 | 暴露 3 个方法到 window.api |
| `src/renderer/api.js` | 改 | 包装 3 个方法 |
| `src/renderer/components/SideNav.jsx` | 改 | NAV_ITEMS 加 wechat-hot |
| `src/renderer/components/AppShell.jsx` | 改 | nav 分支加 wechat-hot |
| `src/renderer/worldcup/navStore.js` | 改 | NAV_KEYS + setActiveNav 加 wechat-hot |
| `package.json` | 改 | version 2.23.0 → 2.24.0 |
| `RELEASE-NOTES.md` | 改 | 新增 v2.24.0 段落 |
| `styles.css` | 改 | 新增 .wechat-hot-* 样式 |

---

## Task 1: list-parser 单元测试 + 实现（TDD）

**Files:**
- Create: `src/main/wechat-hot/list-parser.js`
- Create: `tests/main/wechat-hot/list-parser.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/main/wechat-hot/list-parser.test.js
 */
import { describe, it, expect } from "vitest";
const { parseWechatHotPayload } = require("../../../src/main/wechat-hot/list-parser.js");

const RAW_OK = {
  code: 0,
  data: {
    list: [
      { id: "a", title: "微信支付上线新功能", url: "https://a", hot: { value: "12.3万" }, label: { name: "沸" } },
      { id: "b", title: "苹果发布会定档", url: "https://b", hot: { value: "8.1万" }, label: { name: "爆" } },
      { id: "c", title: "某明星工作室声明", url: "https://c" }, // 无 hot / label
      { id: "d", title: "", url: "https://d" }, // 空 title, 应被过滤
    ],
  },
};

describe("wechat-hot list-parser", () => {
  it("parses successful payload, drops empty titles, assigns rank by index", () => {
    const items = parseWechatHotPayload(RAW_OK);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      rank: 1, title: "微信支付上线新功能", url: "https://a", heat: "12.3万", tag: "沸",
    });
    expect(items[1].tag).toBe("爆");
    expect(items[2].heat).toBeUndefined();
    expect(items[2].tag).toBeUndefined();
  });

  it("throws parse_failed on code != 0", () => {
    expect(() => parseWechatHotPayload({ code: 1, data: { list: [] } })).toThrow("parse_failed");
  });

  it("throws parse_failed on missing data.list", () => {
    expect(() => parseWechatHotPayload({ code: 0, data: null })).toThrow("parse_failed");
    expect(() => parseWechatHotPayload({ code: 0, data: {} })).toThrow("parse_failed");
  });

  it("returns [] for empty list", () => {
    const items = parseWechatHotPayload({ code: 0, data: { list: [] } });
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/wechat-hot/list-parser.test.js`
Expected: FAIL with "Cannot find module" or similar

- [ ] **Step 3: 写实现**

```javascript
/**
 * src/main/wechat-hot/list-parser.js
 *
 * Pure: tenhot 聚合 API payload → 标准化 items.
 * 不依赖 electron / node:http / HttpClient — 方便 vitest 直接 require.
 */

/**
 * @typedef {Object} WechatHotItem
 * @property {number} rank
 * @property {string} title
 * @property {string} url
 * @property {string} [heat]
 * @property {string} [tag]
 */

/**
 * @param {unknown} raw — tenhot 原始 payload
 * @returns {WechatHotItem[]}
 * @throws {Error} reason 为 'parse_failed'
 */
function parseWechatHotPayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw withReason("parse_failed", "payload not object");
  }
  if (raw.code !== 0) {
    throw withReason("parse_failed", `code=${raw.code}`);
  }
  if (!raw.data || !Array.isArray(raw.data.list)) {
    throw withReason("parse_failed", "data.list missing");
  }
  const items = [];
  let rank = 1;
  for (const entry of raw.data.list) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.title !== "string" || entry.title.length === 0) continue;
    if (typeof entry.url !== "string" || entry.url.length === 0) continue;
    const item = {
      rank: rank++,
      title: entry.title,
      url: entry.url,
    };
    if (entry.hot && typeof entry.hot === "object" && typeof entry.hot.value === "string") {
      item.heat = entry.hot.value;
    }
    if (entry.label && typeof entry.label === "object" && typeof entry.label.name === "string") {
      item.tag = entry.label.name;
    }
    items.push(item);
  }
  return items;
}

function withReason(reason, msg) {
  const err = new Error(`${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { parseWechatHotPayload };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/wechat-hot/list-parser.test.js`
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/wechat-hot/list-parser.js tests/main/wechat-hot/list-parser.test.js
git commit -m "feat(wechat-hot): add list-parser with TDD coverage"
```

---

## Task 2: fetcher 单元测试 + 实现（TDD）

**Files:**
- Create: `src/main/wechat-hot/fetcher.js`
- Create: `tests/main/wechat-hot/fetcher.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/main/wechat-hot/fetcher.test.js
 */
import { describe, it, expect, vi } from "vitest";
const { fetchWechatHot } = require("../../../src/main/wechat-hot/fetcher.js");

function makeClient({ status = 200, body = "{}", error = null } = {}) {
  return {
    get: vi.fn().mockResolvedValue({ status, body, headers: {}, error }),
  };
}

const RAW_OK = JSON.stringify({
  code: 0,
  data: { list: [{ id: "a", title: "X", url: "https://x" }] },
});

describe("wechat-hot fetcher", () => {
  it("returns parsed payload on 200 + valid JSON", async () => {
    const client = makeClient({ body: RAW_OK });
    const r = await fetchWechatHot({ httpClient: client });
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].title).toBe("X");
    expect(r.source).toBe("tenhot");
    expect(typeof r.fetchedAt).toBe("number");
  });

  it("throws fetch_failed on HTTP 5xx", async () => {
    const client = makeClient({ status: 502, body: "" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "fetch_failed",
    });
  });

  it("throws parse_failed on non-JSON body", async () => {
    const client = makeClient({ status: 200, body: "<html>not json</html>" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });

  it("throws parse_failed when code != 0", async () => {
    const body = JSON.stringify({ code: 1, data: { list: [] } });
    const client = makeClient({ body });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "parse_failed",
    });
  });

  it("throws http_timeout when HttpClient reports timeout", async () => {
    const client = makeClient({ body: "", error: "timeout" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });

  it("throws http_timeout on network error", async () => {
    const client = makeClient({ body: "", error: "network" });
    await expect(fetchWechatHot({ httpClient: client })).rejects.toMatchObject({
      reason: "http_timeout",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/wechat-hot/fetcher.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写实现**

```javascript
/**
 * src/main/wechat-hot/fetcher.js
 *
 * IO: 通过注入的 HttpClient 拉取 tenhot 微信热搜 API,
 *      调 list-parser 归一化, 返回 WechatHotPayload.
 *
 * 不导入 electron / node:http — 边界在 cache.js / register-wechat-hot.js.
 */

const { parseWechatHotPayload } = require("./list-parser.js");

const SOURCE = "tenhot";
const URL = "https://tenhot-api.vercel.app/api/hotsearch/wxrank";
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {object} args
 * @param {{ get: Function }} args.httpClient  — Pulse 的 HttpClient
 * @param {number} [args.timeoutMs=10000]
 * @returns {Promise<{items: object[], fetchedAt: number, source: string}>}
 */
async function fetchWechatHot({ httpClient, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const res = await httpClient.get(URL, { timeout: timeoutMs });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", res.error);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `status=${res && res.status}`);
  }
  let raw;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "json parse threw");
  }
  const items = parseWechatHotPayload(raw); // throws parse_failed
  return { items, fetchedAt: Date.now(), source: SOURCE };
}

function withReason(reason, msg) {
  const err = new Error(`wechat-hot: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { fetchWechatHot, SOURCE, URL };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/wechat-hot/fetcher.test.js`
Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/wechat-hot/fetcher.js tests/main/wechat-hot/fetcher.test.js
git commit -m "feat(wechat-hot): add fetcher with HttpClient injection + TDD"
```

---

## Task 3: cache 单元测试 + 实现（TDD）

**Files:**
- Create: `src/main/wechat-hot/cache.js`
- Create: `tests/main/wechat-hot/cache.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/main/wechat-hot/cache.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
const { createWechatHotCache } = require("../../../src/main/wechat-hot/cache.js");

function makeFetcher(impl) {
  return vi.fn(impl);
}

const EMPTY = { items: [], fetchedAt: 0, source: "tenhot" };
const OK = { items: [{ rank: 1, title: "X", url: "https://x" }], fetchedAt: 1700000000000, source: "tenhot" };

describe("wechat-hot cache", () => {
  let cache;
  beforeEach(() => {
    cache = createWechatHotCache({ fetcher: makeFetcher(async () => OK) });
  });

  it("load returns empty payload initially", () => {
    expect(cache.load()).toEqual(EMPTY);
  });

  it("refresh writes cache and returns payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(OK);
    cache = createWechatHotCache({ fetcher });
    const r = await cache.refresh();
    expect(r).toEqual(OK);
    expect(cache.load()).toEqual(OK);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refresh during in-flight returns the same in-flight promise (no double fetch)", async () => {
    let resolveFetch;
    const fetcher = vi.fn(() => new Promise((res) => { resolveFetch = res; }));
    cache = createWechatHotCache({ fetcher });
    const p1 = cache.refresh();
    const p2 = cache.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch(OK);
    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toBe(r2);
    expect(r1).toEqual(OK);
  });

  it("refresh after failure does NOT cache the failure; cache stays prior state", async () => {
    const fetcher = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { reason: "fetch_failed" }));
    cache = createWechatHotCache({ fetcher });
    await expect(cache.refresh()).rejects.toMatchObject({ reason: "fetch_failed" });
    // 失败后 cache 保持 initial EMPTY (load() 不暴露 throw)
    expect(cache.load()).toEqual(EMPTY);
    // in-flight 已释放, 下次 refresh 会重新 fetch
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("onUpdate hook is called with new payload after success", async () => {
    const fetcher = vi.fn().mockResolvedValue(OK);
    const onUpdate = vi.fn();
    cache = createWechatHotCache({ fetcher, onUpdate });
    await cache.refresh();
    expect(onUpdate).toHaveBeenCalledWith(OK);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/main/wechat-hot/cache.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写实现**

```javascript
/**
 * src/main/wechat-hot/cache.js
 *
 * 内存 cache + in-flight guard.
 * 不写 state.json (spec §3 YAGNI).
 */

const EMPTY = { items: [], fetchedAt: 0, source: "tenhot" };

/**
 * @param {object} args
 * @param {(opts: object) => Promise<{items, fetchedAt, source}>} args.fetcher
 * @param {(payload) => void} [args.onUpdate]  — refresh 成功时回调
 */
function createWechatHotCache({ fetcher, onUpdate } = {}) {
  let cache = { ...EMPTY };
  let inflight = null;

  function load() {
    return { ...cache, items: [...cache.items] };
  }

  async function refresh() {
    if (inflight) return inflight;
    if (typeof fetcher !== "function") {
      throw Object.assign(new Error("fetcher missing"), { reason: "fetch_failed" });
    }
    inflight = (async () => {
      try {
        const payload = await fetcher({});
        if (!payload || !Array.isArray(payload.items)) {
          throw Object.assign(new Error("bad payload"), { reason: "parse_failed" });
        }
        cache = { items: payload.items, fetchedAt: payload.fetchedAt || Date.now(), source: payload.source || "tenhot" };
        if (typeof onUpdate === "function") {
          try { onUpdate(cache); } catch { /* noop */ }
        }
        return cache;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return { load, refresh };
}

module.exports = { createWechatHotCache, EMPTY };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/main/wechat-hot/cache.test.js`
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/wechat-hot/cache.js tests/main/wechat-hot/cache.test.js
git commit -m "feat(wechat-hot): add in-memory cache with in-flight guard"
```

---

## Task 4: IPC handler 注册

**Files:**
- Create: `src/main/ipc/register-wechat-hot.js`
- Modify: `src/main/ipc/index.js`
- Create: `tests/main/wechat-hot/register-wechat-hot-ipc.test.js` (可选)

- [ ] **Step 1: 写 handler 实现**

```javascript
/**
 * src/main/ipc/register-wechat-hot.js
 *
 * 唯一 electron 边界. 通过 ctx.safeHandle 注册 2 个 channel:
 *   wechat-hot:load     返 cache (不触网)
 *   wechat-hot:refresh  触发 fetch + 推 wechat-hot:updated
 */

const { fetchWechatHot } = require("../wechat-hot/fetcher.js");
const { createWechatHotCache } = require("../wechat-hot/cache.js");
const { HttpClient } = require("../http-client.js");
const { mainLog } = require("../log");

const UPDATED_CHANNEL = "wechat-hot:updated";
const TIMEOUT_MS = 10000;

function registerWechatHotHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  // 单例 HttpClient — 单次 GET 拉取, 跟 metal-ipc.js 同模式
  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const cache = createWechatHotCache({
    fetcher: () => fetchWechatHot({ httpClient, timeoutMs: TIMEOUT_MS }),
    onUpdate: (payload) => {
      if (typeof sendToRenderer === "function") {
        try { sendToRenderer(UPDATED_CHANNEL, payload); } catch { /* noop */ }
      }
    },
  });

  safeHandle("wechat-hot:load", async () => cache.load());

  safeHandle("wechat-hot:refresh", async () => {
    try {
      return await cache.refresh();
    } catch (err) {
      mainLog.warn(`[wechat-hot] refresh failed: ${err && err.message}`);
      return { ok: false, reason: err && err.reason ? err.reason : "threw" };
    }
  });
}

module.exports = { registerWechatHotHandlers, UPDATED_CHANNEL };
```

- [ ] **Step 2: 在 ipc/index.js 注册**

Modify `src/main/ipc/index.js`: 在 `registerIthomeHandlers(ctx);` 之后插入：

```javascript
const { registerWechatHotHandlers } = require("./register-wechat-hot");
```

并在 `registerIpcHandlers(deps)` 函数体内 `registerIthomeShareHandlers(ctx);` 之后插入：

```javascript
  registerWechatHotHandlers(ctx);
```

最终改动部分：

```javascript
  registerIpcHandlers(deps) {
    const ctx = createIpcContext(deps);
    registerCoreHandlers(ctx);
    registerRemindersRecentHandlers(ctx);
    registerAiHandlers(ctx);
    registerAiUsageHandlers(ctx);
    registerWorldcupHandlers(ctx);
    registerIthomeHandlers(ctx);
    registerIthomeShareHandlers(ctx);
    registerFundsHandlers(ctx);
    registerWechatHotHandlers(ctx); // ← 新增
  }
```

- [ ] **Step 3: 验证 ipc/index.js 加载无 syntax 错误**

Run: `node -e "require('./src/main/ipc/index.js'); console.log('ok')"`
Expected: `ok`

(可能需要先 `cd` 到项目根；不需要启动 app，单纯 require 看是否抛 syntax error。)

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-wechat-hot.js src/main/ipc/index.js
git commit -m "feat(wechat-hot): register IPC handlers (load + refresh)"
```

---

## Task 5: preload + api 暴露

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

- [ ] **Step 1: 在 preload.js 加 3 个方法**

在 `contextBridge.exposeInMainWorld("api", {` 块内、`// IT之家新闻` 注释**之前**插入：

```javascript
  // 微信热搜 (v2.24)
  wechatHotLoad: () => ipcRenderer.invoke("wechat-hot:load"),
  wechatHotRefresh: () => ipcRenderer.invoke("wechat-hot:refresh"),
  onWechatHotUpdated: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("wechat-hot:updated", handler);
    return () => ipcRenderer.removeListener("wechat-hot:updated", handler);
  },
```

- [ ] **Step 2: 在 src/renderer/api.js 包装 3 个方法**

在 `// v2.13 AI 用量 (Minimax coding plan)` 注释之前插入：

```javascript
    // 微信热搜 (v2.24)
    wechatHotLoad: pick(overrides, "wechatHotLoad"),
    wechatHotRefresh: pick(overrides, "wechatHotRefresh"),
    onWechatHotUpdated: pick(overrides, "onWechatHotUpdated"),
```

- [ ] **Step 3: 验证 renderer 构建不报 syntax 错误**

Run: `npm run build:renderer 2>&1 | tail -20`
Expected: 看到 `renderer.bundle.js` 写出，无 syntax error

- [ ] **Step 4: Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(wechat-hot): expose IPC methods to renderer (preload + api)"
```

---

## Task 6: renderer store（signals + bootstrap + 15s 冷却）

**Files:**
- Create: `src/renderer/wechat-hot/store.js`
- Create: `tests/renderer/wechat-hot/store.test.js`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/renderer/wechat-hot/store.test.js
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    wechatHotLoad: vi.fn(),
    wechatHotRefresh: vi.fn(),
    onWechatHotUpdated: vi.fn(() => () => {}),
  },
}));

vi.mock("../../src/renderer/api.js", () => ({ api: mockApi }));

const store = await import("../../src/renderer/wechat-hot/store.js");
const {
  wechatHotItems,
  wechatHotLoaded,
  wechatHotLoading,
  wechatHotError,
  wechatHotLastFetched,
  wechatHotLastRefreshAt,
  wechatHotUpdatedUnsub,
  applyPayload,
  bootstrapWechatHotTab,
  refreshWechatHot,
  subscribeWechatHotUpdates,
  cleanupWechatHotUpdates,
} = store;

const SAMPLE = {
  items: [{ rank: 1, title: "X", url: "https://x" }],
  fetchedAt: 1700000000000,
  source: "tenhot",
};

beforeEach(() => {
  // 重置 signals 到初始
  wechatHotItems.value = [];
  wechatHotLoaded.value = false;
  wechatHotLoading.value = false;
  wechatHotError.value = null;
  wechatHotLastFetched.value = 0;
  wechatHotLastRefreshAt.value = 0;
  mockApi.wechatHotLoad.mockReset();
  mockApi.wechatHotRefresh.mockReset();
  mockApi.onWechatHotUpdated.mockClear();
  vi.useRealTimers();
});

describe("wechat-hot store: applyPayload", () => {
  it("sets signals from payload", () => {
    applyPayload(SAMPLE);
    expect(wechatHotItems.value).toEqual(SAMPLE.items);
    expect(wechatHotLastFetched.value).toBe(1700000000000);
    expect(wechatHotLoaded.value).toBe(true);
    expect(wechatHotError.value).toBe(null);
  });
});

describe("wechat-hot store: bootstrap", () => {
  it("loads cache; refreshes when cache empty", async () => {
    mockApi.wechatHotLoad.mockResolvedValueOnce(SAMPLE);
    mockApi.wechatHotRefresh.mockResolvedValueOnce(SAMPLE);
    await bootstrapWechatHotTab();
    expect(mockApi.wechatHotLoad).toHaveBeenCalledTimes(1);
    expect(wechatHotItems.value).toEqual(SAMPLE.items);
  });

  it("skips refresh when cache has items", async () => {
    mockApi.wechatHotLoad.mockResolvedValueOnce(SAMPLE);
    await bootstrapWechatHotTab();
    expect(mockApi.wechatHotRefresh).not.toHaveBeenCalled();
  });
});

describe("wechat-hot store: refreshWechatHot 15s cooldown", () => {
  it("first call: invokes api.wechatHotRefresh", async () => {
    mockApi.wechatHotRefresh.mockResolvedValueOnce(SAMPLE);
    const r = await refreshWechatHot();
    expect(r).toBe(true);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(1);
  });

  it("second call within 15s: returns false silently", async () => {
    mockApi.wechatHotRefresh.mockResolvedValue(SAMPLE);
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    await refreshWechatHot();
    vi.setSystemTime(1_000_000_005_000); // +5s
    const r = await refreshWechatHot();
    expect(r).toBe(false);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(1);
  });

  it("call after 15s: refreshes again", async () => {
    mockApi.wechatHotRefresh.mockResolvedValue(SAMPLE);
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    await refreshWechatHot();
    vi.setSystemTime(1_000_000_016_000); // +16s
    const r = await refreshWechatHot();
    expect(r).toBe(true);
    expect(mockApi.wechatHotRefresh).toHaveBeenCalledTimes(2);
  });
});

describe("wechat-hot store: subscribe", () => {
  it("subscribe stores unsub; cleanup calls it", () => {
    const unsub = vi.fn();
    mockApi.onWechatHotUpdated.mockReturnValueOnce(unsub);
    subscribeWechatHotUpdates();
    expect(wechatHotUpdatedUnsub.value).toBe(unsub);
    cleanupWechatHotUpdates();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/wechat-hot/store.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写实现**

```javascript
/**
 * src/renderer/wechat-hot/store.js
 *
 * Renderer-side signals + bootstrap + 15s 冷却.
 * Mirror src/renderer/ithome/store.js 风格.
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";

const COOLDOWN_MS = 15000;

export const wechatHotItems = signal([]);
export const wechatHotLoaded = signal(false);
export const wechatHotLoading = signal(false);
export const wechatHotError = signal(null);
export const wechatHotLastFetched = signal(0);
export const wechatHotLastRefreshAt = signal(0);
export const wechatHotUpdatedUnsub = signal(null);

export function applyPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  wechatHotItems.value = Array.isArray(payload.items) ? payload.items : [];
  wechatHotLastFetched.value = payload.fetchedAt || 0;
  wechatHotLoaded.value = true;
  wechatHotError.value = null;
}

export async function bootstrapWechatHotTab() {
  try {
    const cached = await api.wechatHotLoad();
    applyPayload(cached);
    if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) {
      await refreshWechatHot();
    }
  } catch {
    /* keep signals at initial, surface error via refresh attempt */
    await refreshWechatHot();
  }
}

export async function refreshWechatHot() {
  if (wechatHotLoading.value) return false;
  const now = Date.now();
  if (now - wechatHotLastRefreshAt.value < COOLDOWN_MS) return false;
  wechatHotLastRefreshAt.value = now;
  wechatHotLoading.value = true;
  wechatHotError.value = null;
  try {
    const r = await api.wechatHotRefresh();
    if (r && r.ok === false) {
      wechatHotError.value = mapReason(r.reason);
      return false;
    }
    applyPayload(r);
    return true;
  } catch (err) {
    wechatHotError.value = (err && err.message) || "刷新失败";
    return false;
  } finally {
    wechatHotLoading.value = false;
  }
}

export function subscribeWechatHotUpdates() {
  if (wechatHotUpdatedUnsub.value) return; // 幂等
  const unsub = api.onWechatHotUpdated((payload) => {
    applyPayload(payload);
  });
  wechatHotUpdatedUnsub.value = typeof unsub === "function" ? unsub : null;
}

export function cleanupWechatHotUpdates() {
  if (wechatHotUpdatedUnsub.value) {
    try { wechatHotUpdatedUnsub.value(); } catch { /* noop */ }
    wechatHotUpdatedUnsub.value = null;
  }
}

const REASON_MAP = {
  fetch_failed: "拉取失败，请检查网络连接后重试",
  parse_failed: "热搜页面解析失败，可能是源结构变化，请稍后重试",
  http_timeout: "网络连接超时，请重试",
  threw: "拉取异常",
  ipc_unavailable: "系统通信异常，请重启应用",
};
function mapReason(reason) {
  return REASON_MAP[reason] || reason || "刷新失败";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/wechat-hot/store.test.js`
Expected: 7 tests pass (3 applyPayload+bootstrap + 3 cooldown + 1 subscribe)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wechat-hot/store.js tests/renderer/wechat-hot/store.test.js
git commit -m "feat(wechat-hot): add renderer store with 15s cooldown"
```

---

## Task 7: utils + List 组件（TDD）

**Files:**
- Create: `src/renderer/wechat-hot/utils.js`
- Create: `src/renderer/wechat-hot/WechatHotList.jsx`
- Create: `tests/renderer/wechat-hot/wechat-hot-list.test.jsx`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/renderer/wechat-hot/wechat-hot-list.test.jsx
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/preact";

const { mockItems, mockLoading, mockError, mockOpenUrl } = vi.hoisted(() => ({
  mockItems: { value: [] },
  mockLoading: { value: false },
  mockError: { value: null },
  mockOpenUrl: vi.fn(),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: mockOpenUrl },
}));

vi.mock("../../src/renderer/wechat-hot/store.js", () => ({
  wechatHotItems: mockItems,
  wechatHotLoading: mockLoading,
  wechatHotError: mockError,
}));

const { WechatHotList } = await import("../../src/renderer/wechat-hot/WechatHotList.jsx");

beforeEach(() => {
  mockItems.value = [];
  mockLoading.value = false;
  mockError.value = null;
  mockOpenUrl.mockReset();
  cleanup();
});

describe("WechatHotList", () => {
  it("shows loading state when loading and items empty", () => {
    mockLoading.value = true;
    render(<WechatHotList search="" onRefresh={() => {}} />);
    expect(screen.getByText(/正在拉取热搜/)).toBeTruthy();
  });

  it("shows error + retry when error and items empty", () => {
    mockError.value = "拉取失败，请重试";
    render(<WechatHotList search="" onRefresh={() => {}} />);
    expect(screen.getByText(/拉取失败/)).toBeTruthy();
    const btn = screen.getByText(/重新拉取/);
    fireEvent.click(btn);
    // onRefresh prop was called
  });

  it("renders rank+title rows; first 3 ranks have color class", () => {
    mockItems.value = [
      { rank: 1, title: "A", url: "https://a" },
      { rank: 2, title: "B", url: "https://b" },
      { rank: 3, title: "C", url: "https://c" },
      { rank: 4, title: "D", url: "https://d" },
    ];
    const { container } = render(<WechatHotList search="" onRefresh={() => {}} />);
    expect(container.querySelector(".wechat-hot-row-rank-rank-1")).toBeTruthy();
    expect(container.querySelector(".wechat-hot-row-rank-rank-3")).toBeTruthy();
    // 4-10 用普通 class, 不带 -rank-N suffix
    expect(container.querySelector(".wechat-hot-row-rank-rank-4")).toBeNull();
  });

  it("clicking row calls api.openUrl with item url", () => {
    mockItems.value = [
      { rank: 1, title: "A", url: "https://a" },
    ];
    const { container } = render(<WechatHotList search="" onRefresh={() => {}} />);
    const row = container.querySelector(".wechat-hot-row");
    fireEvent.click(row);
    expect(mockOpenUrl).toHaveBeenCalledWith("https://a");
  });

  it("filters items by search (case-insensitive substring)", () => {
    mockItems.value = [
      { rank: 1, title: "Hello", url: "https://a" },
      { rank: 2, title: "World", url: "https://b" },
    ];
    const { container } = render(<WechatHotList search="hello" onRefresh={() => {}} />);
    const rows = container.querySelectorAll(".wechat-hot-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Hello");
  });

  it("shows no-match state when search yields nothing", () => {
    mockItems.value = [
      { rank: 1, title: "Hello", url: "https://a" },
    ];
    render(<WechatHotList search="xyz" onRefresh={() => {}} />);
    expect(screen.getByText(/未找到/)).toBeTruthy();
  });

  it("renders heat + tag chips when present", () => {
    mockItems.value = [
      { rank: 1, title: "A", url: "https://a", heat: "12.3万", tag: "沸" },
    ];
    const { container } = render(<WechatHotList search="" onRefresh={() => {}} />);
    expect(container.querySelector(".wechat-hot-row-heat").textContent).toBe("12.3万");
    expect(container.querySelector(".wechat-hot-row-tag").textContent).toBe("沸");
  });

  it("does not render chip containers when heat/tag missing", () => {
    mockItems.value = [
      { rank: 1, title: "A", url: "https://a" },
    ];
    const { container } = render(<WechatHotList search="" onRefresh={() => {}} />);
    expect(container.querySelector(".wechat-hot-row-heat")).toBeNull();
    expect(container.querySelector(".wechat-hot-row-tag")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/wechat-hot/wechat-hot-list.test.jsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写 utils.js**

```javascript
/**
 * src/renderer/wechat-hot/utils.js
 */

function pad(n) {
  return String(n).padStart(2, "0");
}

/** epoch ms → "HH:mm"  (本地时区) */
export function formatTime(epochMs) {
  if (typeof epochMs !== "number" || epochMs <= 0) return "—";
  const d = new Date(epochMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 距 now 的相对秒数 → "冷却 {N}s" 字符串 */
export function formatCooldown(msLeft) {
  if (typeof msLeft !== "number" || msLeft <= 0) return null;
  return `冷却 ${Math.ceil(msLeft / 1000)}s`;
}

/** 给 rank 1-3 分配 CSS class 后缀 */
export function rankClass(rank) {
  if (rank >= 1 && rank <= 3) return `rank-rank-${rank}`;
  if (rank >= 4 && rank <= 10) return "rank-top10";
  return "rank-tail";
}
```

- [ ] **Step 4: 写 WechatHotList.jsx**

```jsx
/**
 * src/renderer/wechat-hot/WechatHotList.jsx
 */

import { wechatHotItems, wechatHotLoading, wechatHotError } from "./store.js";
import { rankClass } from "./utils.js";
import { api } from "../api.js";

export function WechatHotList({ search = "", onRefresh }) {
  const items = wechatHotItems.value;
  const loading = wechatHotLoading.value;
  const error = wechatHotError.value;
  const q = (search || "").trim().toLowerCase();

  const filtered = q
    ? items.filter((it) => (it.title || "").toLowerCase().includes(q))
    : items;

  if (loading && items.length === 0) {
    return (
      <div class="wechat-hot-empty">
        <p class="wechat-hot-empty-title">正在拉取热搜…</p>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div class="wechat-hot-empty is-error">
        <p class="wechat-hot-empty-title">加载失败</p>
        <p class="wechat-hot-empty-hint">{error}</p>
        {onRefresh && (
          <button type="button" class="wechat-hot-empty-btn" onClick={() => onRefresh()}>
            重新拉取
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="wechat-hot-empty">
        <p class="wechat-hot-empty-title">暂无热搜数据</p>
        {onRefresh && (
          <button type="button" class="wechat-hot-empty-btn" onClick={() => onRefresh()}>
            重新拉取
          </button>
        )}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div class="wechat-hot-empty">
        <p class="wechat-hot-empty-title">未找到「{search}」</p>
        <p class="wechat-hot-empty-hint">试试其他关键词</p>
      </div>
    );
  }

  return (
    <ul class="wechat-hot-list">
      {filtered.map((it) => (
        <li
          key={`${it.rank}-${it.url}`}
          class={`wechat-hot-row wechat-hot-row-${rankClass(it.rank)}`}
          onClick={() => api.openUrl(it.url)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              api.openUrl(it.url);
            }
          }}
        >
          <span class="wechat-hot-row-rank">{it.rank}</span>
          <span class="wechat-hot-row-title">{it.title}</span>
          {it.heat ? <span class="wechat-hot-row-heat">{it.heat}</span> : null}
          {it.tag ? <span class="wechat-hot-row-tag">{it.tag}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default WechatHotList;
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/wechat-hot/wechat-hot-list.test.jsx`
Expected: 8 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/wechat-hot/utils.js src/renderer/wechat-hot/WechatHotList.jsx tests/renderer/wechat-hot/wechat-hot-list.test.jsx
git commit -m "feat(wechat-hot): add List component with empty/error/search states"
```

---

## Task 8: Header 组件（TDD）

**Files:**
- Create: `src/renderer/wechat-hot/WechatHotHeader.jsx`
- Create: `tests/renderer/wechat-hot/wechat-hot-header.test.jsx`

- [ ] **Step 1: 写失败测试**

```javascript
/**
 * tests/renderer/wechat-hot/wechat-hot-header.test.jsx
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/preact";

const { mockLastFetched, mockLoading, mockLastRefreshAt, mockRefresh } = vi.hoisted(() => ({
  mockLastFetched: { value: 1700000000000 },
  mockLoading: { value: false },
  mockLastRefreshAt: { value: 0 },
  mockRefresh: vi.fn(),
}));

vi.mock("../../src/renderer/wechat-hot/store.js", () => ({
  wechatHotLastFetched: mockLastFetched,
  wechatHotLoading: mockLoading,
  wechatHotLastRefreshAt: mockLastRefreshAt,
  refreshWechatHot: mockRefresh,
}));

const { WechatHotHeader } = await import("../../src/renderer/wechat-hot/WechatHotHeader.jsx");

beforeEach(() => {
  mockLastFetched.value = 1700000000000; // 2023-11-14 22:13:20 UTC
  mockLoading.value = false;
  mockLastRefreshAt.value = 0;
  mockRefresh.mockReset();
  vi.useRealTimers();
  cleanup();
});

describe("WechatHotHeader", () => {
  it("renders brand + last fetched time", () => {
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    expect(screen.getByText(/微信热搜/)).toBeTruthy();
    // 时间戳格式 HH:mm (本地时区, vitest 配 TZ=UTC)
  });

  it("shows '—' when no fetched time", () => {
    mockLastFetched.value = 0;
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it("refresh button enabled when not in cooldown", () => {
    mockLastRefreshAt.value = 0;
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    const btn = screen.getByRole("button", { name: /刷新/ });
    expect(btn.disabled).toBe(false);
  });

  it("refresh button disabled + shows countdown when in cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    mockLastRefreshAt.value = 1_000_000_000_000;
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    const btn = screen.getByRole("button", { name: /冷却/ });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/冷却 \d+s/);
  });

  it("clicking refresh button when enabled calls onRefresh", () => {
    mockLastRefreshAt.value = 0;
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    const btn = screen.getByRole("button", { name: /刷新/ });
    fireEvent.click(btn);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("search input reflects prop value and onSearchChange callback", () => {
    const onSearchChange = vi.fn();
    render(<WechatHotHeader search="abc" onSearchChange={onSearchChange} onRefresh={mockRefresh} />);
    const input = screen.getByPlaceholderText(/搜索/);
    expect(input.value).toBe("abc");
    fireEvent.input(input, { target: { value: "def" } });
    expect(onSearchChange).toHaveBeenCalledWith("def");
  });

  it("input id is wechat-hot-search-input (Cmd+F target)", () => {
    render(<WechatHotHeader search="" onSearchChange={() => {}} onRefresh={mockRefresh} />);
    const input = document.getElementById("wechat-hot-search-input");
    expect(input).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/wechat-hot/wechat-hot-header.test.jsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写 WechatHotHeader.jsx**

```jsx
/**
 * src/renderer/wechat-hot/WechatHotHeader.jsx
 *
 * 顶栏 — 品牌 + 副标题 (API 源 / 条数 / 更新时间) + 刷新按钮 (带冷却) + 搜索框.
 */

import { useEffect, useState } from "preact/hooks";
import {
  wechatHotLastFetched,
  wechatHotLoading,
  wechatHotLastRefreshAt,
  refreshWechatHot,
} from "./store.js";
import { formatTime, formatCooldown } from "./utils.js";

const COOLDOWN_MS = 15000;

export function WechatHotHeader({ search, onSearchChange, onRefresh }) {
  const lastFetched = wechatHotLastFetched.value;
  const loading = wechatHotLoading.value;
  const lastRefreshAt = wechatHotLastRefreshAt.value;
  const [now, setNow] = useState(Date.now());

  // 每秒 tick, 驱动冷却倒计时刷新
  useEffect(() => {
    if (lastRefreshAt <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastRefreshAt]);

  const msLeft = lastRefreshAt > 0 ? COOLDOWN_MS - (now - lastRefreshAt) : 0;
  const inCooldown = msLeft > 0;
  const cooldownLabel = formatCooldown(msLeft);

  return (
    <div class="wechat-hot-header">
      <div class="wechat-hot-header-brand">
        <span class="wechat-hot-header-icon">📈</span>
        <h2 class="wechat-hot-header-title">微信热搜</h2>
        <span class="wechat-hot-header-sub">
          微信指数 · API: tenhot · 更新于 {formatTime(lastFetched)}
        </span>
        <button
          type="button"
          class={`wechat-hot-refresh-btn${loading ? " is-loading" : ""}${inCooldown ? " is-cooldown" : ""}`}
          onClick={() => onRefresh && onRefresh()}
          disabled={loading || inCooldown}
          title={inCooldown ? `冷却中, ${cooldownLabel}` : "刷新微信热搜"}
          aria-label={inCooldown ? cooldownLabel : "刷新微信热搜"}
        >
          {inCooldown ? cooldownLabel : "↻ 刷新"}
        </button>
      </div>
      <div class="wechat-hot-header-controls">
        <input
          id="wechat-hot-search-input"
          class="wechat-hot-search-input"
          type="search"
          placeholder="搜索标题…"
          value={search || ""}
          onInput={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default WechatHotHeader;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/wechat-hot/wechat-hot-header.test.jsx`
Expected: 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wechat-hot/WechatHotHeader.jsx tests/renderer/wechat-hot/wechat-hot-header.test.jsx
git commit -m "feat(wechat-hot): add Header with cooldown countdown"
```

---

## Task 9: Layout 容器

**Files:**
- Create: `src/renderer/wechat-hot/WechatHotLayout.jsx`

- [ ] **Step 1: 写实现**

```jsx
/**
 * src/renderer/wechat-hot/WechatHotLayout.jsx
 *
 * Layout 容器: useEffect → bootstrap + subscribe IPC updates; cleanup 释放.
 * Mirror src/renderer/ithome/NewsLayout.jsx 结构.
 */

import { useEffect, useState } from "preact/hooks";
import { WechatHotHeader } from "./WechatHotHeader.jsx";
import { WechatHotList } from "./WechatHotList.jsx";
import {
  bootstrapWechatHotTab,
  refreshWechatHot,
  subscribeWechatHotUpdates,
  cleanupWechatHotUpdates,
} from "./store.js";

export function WechatHotLayout() {
  const [search, setSearch] = useState("");

  useEffect(() => {
    bootstrapWechatHotTab();
    subscribeWechatHotUpdates();
    return () => {
      cleanupWechatHotUpdates();
    };
  }, []);

  return (
    <div class="wechat-hot-layout">
      <WechatHotHeader
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => refreshWechatHot()}
      />
      <div class="wechat-hot-body">
        <WechatHotList
          search={search}
          onRefresh={() => refreshWechatHot()}
        />
      </div>
    </div>
  );
}

export default WechatHotLayout;
```

- [ ] **Step 2: 验证 renderer 构建不报 syntax 错误**

Run: `npm run build:renderer 2>&1 | tail -10`
Expected: bundle 写出成功

- [ ] **Step 3: Commit**

```bash
git add src/renderer/wechat-hot/WechatHotLayout.jsx
git commit -m "feat(wechat-hot): add Layout container with bootstrap + cleanup"
```

---

## Task 10: SideNav + AppShell + navStore 集成

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `src/renderer/components/AppShell.jsx`
- Modify: `src/renderer/worldcup/navStore.js`

- [ ] **Step 1: 在 SideNav.jsx 的 NAV_ITEMS 加 wechat-hot (第 2 项)**

替换 NAV_ITEMS 数组为：

```javascript
const NAV_ITEMS = [
  { key: 'ithome',      icon: '📰', label: 'IT 新闻',     tooltip: 'IT之家资讯 + AI 摘要' },
  { key: 'wechat-hot',  icon: '📈', label: '微信热搜',   tooltip: '微信实时热搜 · 手动刷新' },  // ← 新增
  { key: 'worldcup',    icon: '🏆', label: '世界杯',     tooltip: '2026 世界杯赛程' },
  { key: 'funds',       icon: '💰', label: '基金管理',   tooltip: '基金持仓 + 实时盈亏 (v2.10+)' },
  { key: 'metals',      icon: '🥇', label: '贵金属',     tooltip: '黄金白银实时价格 + 持仓盈亏' },
  { key: 'ai-usage',    icon: '📊', label: 'AI coding plan 用量', tooltip: 'Minimax coding plan 配额 (v2.13)' },
  { key: 'versions',    icon: '🔄', label: '版本检查',   tooltip: 'App 版本监控 (v2.6 主体)' },
];
```

- [ ] **Step 2: 在 AppShell.jsx 加 wechat-hot 分支 + Cmd+F focus 拦截**

修改 import 块，新增 import：

```javascript
import { WechatHotLayout } from '../wechat-hot/WechatHotLayout.jsx';
```

修改 nav 三元链，最前面加 wechat-hot 分支：

```javascript
  return (
    <div class={`app-shell${collapsed ? ' app-shell-collapsed' : ''}`}>
      <SideNav />
      <div class="app-shell-view">
        {nav === 'ithome'
          ? <NewsLayout />
          : nav === 'wechat-hot'
            ? <WechatHotLayout />
            : nav === 'worldcup'
              ? <WorldcupLayout />
              : nav === 'funds'
                ? <FundLayout />
                : nav === 'metals'
                  ? <MetalLayout />
                  : nav === 'ai-usage'
                    ? <AIUsageLayout />
                    : <VersionsLayout onCheck={onCheck} />}
      </div>
    </div>
  );
```

修改 `onKey` 函数中的 Cmd+F 拦截分支，在 `else if (nav === 'ithome')` 之后加：

```javascript
        else if (nav === 'wechat-hot') inputId = 'wechat-hot-search-input';
```

- [ ] **Step 3: 在 navStore.js 加 wechat-hot 到 NAV_KEYS + setActiveNav**

修改 `NAV_KEYS`:

```javascript
const NAV_KEYS = new Set(["ithome", "wechat-hot", "worldcup", "funds", "metals", "ai-usage", "versions"]);
```

修改注释 `// activeNav: 'ithome' | 'worldcup' | ...` 为加上 `'wechat-hot'`。

setActiveNav 无需加额外分支（默认行为已 OK）。

- [ ] **Step 4: 验证 renderer 构建不报 syntax 错误**

Run: `npm run build:renderer 2>&1 | tail -10`
Expected: bundle 写出成功

- [ ] **Step 5: 跑全部 vitest 确认没破坏**

Run: `npx vitest run 2>&1 | tail -30`
Expected: 所有已有测试 + 新测试都通过；总数 = 之前总数 + 29 (新 29 个测试: 4 parser + 6 fetcher + 5 cache + 7 store + 8 list + 7 header - 8 = 已加)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SideNav.jsx src/renderer/components/AppShell.jsx src/renderer/worldcup/navStore.js
git commit -m "feat(wechat-hot): integrate tab into SideNav + AppShell + navStore"
```

---

## Task 11: styles.css 新增 wechat-hot 样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 末尾追加 wechat-hot-* 样式块**

```css
/* ===== 微信热搜 (v2.24) ===== */
.wechat-hot-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary, #1e1e1e);
}

.wechat-hot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border, #333);
}

.wechat-hot-header-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.wechat-hot-header-icon {
  font-size: 20px;
}

.wechat-hot-header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-primary, #fff);
}

.wechat-hot-header-sub {
  font-size: 12px;
  color: var(--fg-muted, #888);
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-hot-refresh-btn {
  margin-left: 12px;
  padding: 4px 12px;
  background: transparent;
  color: var(--accent, #4a9eff);
  border: 1px solid var(--accent, #4a9eff);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.wechat-hot-refresh-btn:hover:not(:disabled) {
  background: var(--accent, #4a9eff);
  color: #fff;
}

.wechat-hot-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wechat-hot-refresh-btn.is-loading {
  animation: wechat-hot-spin 1s linear infinite;
}

@keyframes wechat-hot-spin {
  to { transform: rotate(360deg); }
}

.wechat-hot-header-controls {
  display: flex;
  align-items: center;
}

.wechat-hot-search-input {
  width: 220px;
  padding: 6px 10px;
  background: var(--bg-input, #2a2a2a);
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  color: var(--fg-primary, #fff);
  font-size: 13px;
}

.wechat-hot-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.wechat-hot-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wechat-hot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
  transition: background 0.1s;
}

.wechat-hot-row:hover {
  background: var(--row-hover, rgba(255,255,255,0.04));
}

.wechat-hot-row:focus-visible {
  outline: 2px solid var(--accent, #4a9eff);
  outline-offset: -2px;
}

.wechat-hot-row-rank {
  flex: 0 0 32px;
  font-weight: 700;
  font-size: 16px;
  text-align: center;
  color: var(--fg-muted, #888);
}

.wechat-hot-row-rank-rank-1 .wechat-hot-row-rank { color: #f43f5e; }
.wechat-hot-row-rank-rank-2 .wechat-hot-row-rank { color: #f59e0b; }
.wechat-hot-row-rank-rank-3 .wechat-hot-row-rank { color: #eab308; }
.wechat-hot-row-rank-top10 .wechat-hot-row-rank { color: var(--fg-secondary, #aaa); }
.wechat-hot-row-rank-tail .wechat-hot-row-rank { color: var(--fg-muted, #666); }

.wechat-hot-row-title {
  flex: 1;
  font-size: 14px;
  color: var(--fg-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-hot-row-heat {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--accent-warm, #f97316);
  background: rgba(249, 115, 22, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.wechat-hot-row-tag {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--accent, #4a9eff);
  background: rgba(74, 158, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.wechat-hot-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--fg-muted, #888);
}

.wechat-hot-empty.is-error .wechat-hot-empty-title {
  color: var(--fg-error, #f43f5e);
}

.wechat-hot-empty-title {
  font-size: 16px;
  margin: 0 0 8px;
  color: var(--fg-secondary, #aaa);
}

.wechat-hot-empty-hint {
  font-size: 13px;
  margin: 0 0 16px;
}

.wechat-hot-empty-btn {
  padding: 6px 16px;
  background: var(--accent, #4a9eff);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
```

- [ ] **Step 2: 验证 renderer 构建不报 syntax 错误**

Run: `npm run build:renderer 2>&1 | tail -10`
Expected: bundle 写出成功 (CSS 不进 bundle, 但 esbuild 仍会跑)

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(wechat-hot): add wechat-hot-* styles"
```

---

## Task 12: 手动启动 app 跑通端到端

**Files:** (无)

- [ ] **Step 1: 启动 app, 切到 SideNav 📈 微信热搜**

Run: `npm start`
Expected: 窗口出现, SideNav 多了 📈 微信热搜 项, 点击切到此 tab.

- [ ] **Step 2: 验证初次加载拉取**

Expected:
- 顶栏显示 "更新于 HH:mm" (有真实时间戳)
- 主体显示 30 条热搜, 前三名颜色 (红/橙/黄)
- API 给出 heat/tag 的行, 右侧显示 chip
- 搜索 "x" 实时过滤

- [ ] **Step 3: 验证冷却**

Expected: 点击 ↻ 刷新后, 按钮文案变 "冷却 Ns" 且 disabled; 15s 后恢复.

- [ ] **Step 4: 验证点击跳系统浏览器**

Expected: 点击任一行, 系统默认浏览器打开 item.url.

- [ ] **Step 5: 验证错误态 (可选)**

手动 `kubectl` 改 hosts / 断网 / 改 API 源 URL 测错误显示:

```bash
# 临时修改 src/main/wechat-hot/fetcher.js URL 触发 fetch_failed
# 或用浏览器 DevTools → Network → throttle offline
```

Expected: 列表空时显示 "加载失败 / 重新拉取" 按钮.

- [ ] **Step 6: 退出 app**

Command+Q / File→Quit

---

## Task 13: 升 version + 写 release notes

**Files:**
- Modify: `package.json`
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: 升 package.json version**

修改 `"version": "2.23.0"` → `"version": "2.24.0"`.

- [ ] **Step 2: 在 RELEASE-NOTES.md 顶部插入 v2.24.0 段落**

在文件顶部 (line 5 之前) 插入:

```markdown
# Pulse v2.2.0 — Release Notes

---

## v2.24.0 (📈 微信热搜) — 2026-06-18

### 新增
- **📈 微信热搜栏目**: 实时拉取微信指数热搜榜, 用户可手动 ↻ 刷新
  - SideNav 第 2 项 (IT 新闻后), 与现有栏目并列
  - 主进程通过 tenhot 聚合 API 拉取, 内存 cache, 15s 刷新冷却
  - 列表展示: 排名 + 标题 (前三名红/橙/黄颜色强调) + 可选热度 chip + 标签 chip
  - 点击整行 → 系统浏览器打开原始 URL
  - 顶栏显式 ↻ 刷新按钮, 冷却中显示 "冷却 Ns" 倒计时
  - 错误态: inline 错误 + 重新拉取按钮
  - 搜索: 顶栏搜索框实时过滤标题 (子串匹配, 不区分大小写)

### 文件
- 新增: `src/main/wechat-hot/{fetcher,list-parser,cache}.js`
- 新增: `src/main/ipc/register-wechat-hot.js`
- 新增: `src/renderer/wechat-hot/{store,utils,WechatHotLayout,WechatHotHeader,WechatHotList}.{js,jsx}`
- 新增: `tests/main/wechat-hot/{list-parser,fetcher,cache}.test.js` (15 cases)
- 新增: `tests/renderer/wechat-hot/{store,wechat-hot-list,wechat-hot-header}.test.{js,jsx}` (22 cases)
- 改动: `preload.js` (+ wechatHotLoad + wechatHotRefresh + onWechatHotUpdated)
- 改动: `src/renderer/api.js` (包装 3 个方法)
- 改动: `src/renderer/components/SideNav.jsx` (NAV_ITEMS + wechat-hot)
- 改动: `src/renderer/components/AppShell.jsx` (nav 分支 + Cmd+F focus)
- 改动: `src/renderer/worldcup/navStore.js` (NAV_KEYS)
- 改动: `package.json` (version 2.23.0 → 2.24.0)
- 改动: `styles.css` (+ .wechat-hot-* 样式块)
- 改动: `src/main/ipc/index.js` (注册 wechat-hot handlers)

---
```

(在已有的 `## v2.23.0` 段之前插入.)

- [ ] **Step 3: 验证 package.json 有效**

Run: `node -e "console.log(require('./package.json').version)"`
Expected: `2.24.0`

- [ ] **Step 4: 跑全套测试**

Run: `npx vitest run 2>&1 | tail -10`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add package.json RELEASE-NOTES.md
git commit -m "chore(release): v2.24.0 — 微信热搜栏目"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: spec §4.1 SideNav 位置 → Task 10; §4.2 Header → Task 8; §4.3 List 主体 → Task 7; §4.4 空态/错误态 → Task 7; §4.5 状态机 → Task 6 (bootstrap) + Task 7 (list states); §4.6 搜索 → Task 7; §5 架构 → Tasks 1-3 (main) + Tasks 5-9 (renderer); §6.1 标准化 payload → Task 1 (`WechatHotItem` 在 list-parser JSDoc); §6.2 tenhot URL → Task 2 (fetcher.js `URL` const); §6.3 parser 行为 → Task 1; §6.4 IPC 行为 → Task 4; §6.5 15s 冷却 → Task 6 (renderer store); §7 错误边界 → Task 2 (fetcher reasons) + Task 4 (safeHandle threw reason) + Task 6 (REASON_MAP); §8 测试 → Tasks 1, 2, 3, 6, 7, 8; §9 文件清单 → 全部任务.

- [x] **Placeholder scan**: 无 TBD/TODO; 所有代码块完整可复制; 无 "implement later" 提示.

- [x] **Type consistency**:
  - `WechatHotItem` 在 Task 1 list-parser.js JSDoc 定义 `{ rank, title, url, heat?, tag? }` → Task 7 List 组件读 `it.rank / it.title / it.url / it.heat / it.tag` 一致
  - `WechatHotPayload` 在 Task 6 store.js 通过 `applyPayload` 接 `{ items, fetchedAt, source }`, 来自 main `cache.refresh()` 返回同形状
  - `reason` 字符串: `fetch_failed / parse_failed / http_timeout` 在 Task 2 fetcher / Task 4 IPC 抛 → Task 6 REASON_MAP 翻译中文
  - `wechatHotUpdatedUnsub` 类型 = `Function | null`, 在 Task 6 store 显式注释

- [x] **Spec requirement → task**: 全部覆盖, 见上
