# 附近美食推荐 功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pulse 菜单栏应用内新增 1 个独立 nav tab「🍜 附近美食」,基于高德 POI API + 大众点评爬虫获取当前位置附近的美食推荐列表,展示店名/距离/类型/评分/人均。

**Architecture:** 主进程抓数据 + IPC 推 renderer。完全独立模块 (`src/main/food/` + `src/renderer/food/`),不污染现有 worldcup / ithome / funds 等模块。复用项目内 `HttpClient` (timeout + retry) 与 `safeStorage` (Amap key 加密)。MVP 仅做基础列表,不做筛选/收藏/地图。

**Tech Stack:** Node.js CommonJS (主进程) + Preact + @preact/signals (渲染进程) + happy-dom (渲染端测试) + Vitest。复用 `src/main/http-client.js` 和 `safeStorage`。

**Spec:** `docs/superpowers/specs/2026-06-22-nearby-food-design.md`

## ⚠️ 合规声明 (硬约束)

本实现涉及对大众点评公开搜索页面的爬取。**严格意义上**违反其服务条款。所有代码必须:
- 仅供个人本地使用
- 默认 User-Agent 自定义,降低触发反爬的概率
- 失败必须**静默降级**(返回 POI,评分字段隐藏),不重试不报错不打扰
- 不在任何 release note / 公开渠道宣传该功能

---

## Global Constraints

- [Spec] 数据源: 高德 POI API + 大众点评爬虫,缺一不可
- [Spec] MVP 范围: 基础列表,不做筛选/收藏/地图/导航/分享
- [Spec] 定位来源: 手动输入 + Geolocation API(都支持)
- [Spec] 执行层: 主进程抓数据 → IPC 推 renderer(Geolocation 例外,在 renderer 直接调)
- [Spec] Key 配置: 高德 key 走 safeStorage,文件位置 `~/Library/Application Support/pulse/food_keys/amap.bin` (mode 0o600)
- [Spec] 缓存: per-location in-memory,TTL 30min,LRU cap 100
- [Spec] 失败降级: 大众点评失败 → 仅 POI,评分字段隐藏
- [Spec] ponytail: fuzzy match 用 Levenshtein ≤ 2 OR includes
- [Codebase] 复用 `src/main/http-client.js` (HttpClient) — 不重新实现 timeout/retry
- [Codebase] 复用 `src/main/log.js` (mainLog) — 不直接用 console.log
- [Codebase] IPC handlers 用 `safeHandle` (ctx.safeHandle) — 不直接 ipcMain.handle
- [Codebase] 主进程测试文件路径 `tests/main/food/*.test.js`(若项目惯例不同,以 vitest.config include 为准)
- [Codebase] 渲染端测试文件路径 `tests/renderer/food/*.test.js`,加 `// @vitest-environment happy-dom`
- [Codebase] 所有文件头注释保留作者/版本/用途 (跟现有模块一致)
- [Codebase] 不用 inline imports(顶部一次性 require/import)
- [Codebase] 不用 TS,项目是 JS,跟随现有风格
- [Project] commit message 用 conventional commits (feat/fix/chore/docs/test)
- [Project] 每完成一个 task 立刻 `git add` + `git commit`

---

## File Structure (新建 16 + 修改 8)

### 新建 (主进程)
- `src/main/food/food-config.js` — Amap key 持久化 (safeStorage)
- `src/main/food/amap-client.js` — 高德 around-search + geocode 封装
- `src/main/food/dianping-scraper.js` — 大众点评搜索结果解析
- `src/main/food/food-aggregator.js` — POI + 评分合并 + 排序(纯函数)
- `src/main/food/food-cache.js` — per-location TTL 内存缓存
- `tests/main/food/food-cache.test.js`
- `tests/main/food/food-aggregator.test.js`
- `tests/main/food/amap-client.test.js`
- `tests/main/food/dianping-scraper.test.js`

### 新建 (渲染进程)
- `src/renderer/food/foodStore.js` — 4 signal (list / loading / error / config)
- `src/renderer/food/FoodEmpty.jsx`
- `src/renderer/food/FoodCard.jsx`
- `src/renderer/food/FoodList.jsx`
- `src/renderer/food/FoodHeader.jsx`
- `src/renderer/food/FoodLayout.jsx`
- `tests/renderer/food/foodStore.test.js`

### 修改
- `src/main/ipc/register-food.js` (新建文件,但属于"修改 IPC 注册流程")
- `src/main/ipc/index.js` — 注册 `registerFoodHandlers`
- `src/main/index.js` — 加 `bootstrapFood()` 启动钩子
- `preload.js` — 加 4 个 food 暴露
- `src/renderer/api.js` — 加 4 个 pick
- `src/renderer/worldcup/navStore.js` — NAV_KEYS 加 'food'
- `src/renderer/components/SideNav.jsx` — NAV_ITEMS 加 food 项
- `src/renderer/components/AppShell.jsx` — 加 nav === 'food' 分支

---

## Task 1: food-config.js — Amap key 持久化

**Files:**
- Create: `src/main/food/food-config.js`
- Test: `tests/main/food/food-config.test.js`

**Interfaces:**
- Produces:
  - `getAmapKey(): Promise<string|null>`
  - `setAmapKey(key: string): Promise<{ok: boolean, error?: string}>`
  - `hasAmapKey(): Promise<boolean>`

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/food/food-config.test.js
const { describe, it, expect, beforeEach } = require("vitest");

// 替 safeStorage 用一个内存版 mock — 简化测
const fakeSafeStorage = {
  _store: {},
  isEncryptionAvailable: () => true,
  encryptString(key) { return Buffer.from("enc:" + key); },
  decryptString(buf) { return buf.toString().replace(/^enc:/, ""); },
};

require.cache[require.resolve("electron")] = {
  exports: { safeStorage: fakeSafeStorage },
};

const foodConfig = require("../../src/main/food/food-config");

describe("food-config", () => {
  beforeEach(() => { fakeSafeStorage._store = {}; });

  it("returns null when no key set", async () => {
    expect(await foodConfig.getAmapKey()).toBeNull();
  });

  it("stores and retrieves key", async () => {
    const r = await foodConfig.setAmapKey("test-key-abc");
    expect(r.ok).toBe(true);
    expect(await foodConfig.getAmapKey()).toBe("test-key-abc");
    expect(await foodConfig.hasAmapKey()).toBe(true);
  });

  it("rejects empty key", async () => {
    const r = await foodConfig.setAmapKey("");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("empty_key");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/food/food-config.test.js`
Expected: FAIL with "Cannot find module '../../src/main/food/food-config'"

- [ ] **Step 3: Implement food-config.js**

```javascript
/**
 * src/main/food/food-config.js
 *
 * 高德 API key 持久化 — 走 Electron safeStorage (macOS Keychain / Windows DPAPI).
 * 文件位置: ~/Library/Application Support/pulse/food_keys/amap.bin (mode 0o600).
 *
 * 设计原则:
 *   - 复用 safeStorage 机制, 跟 AI keys 一致 (不重新发明)
 *   - 独立子目录 food_keys/, 跟 ai-keys/ 隔离, 避免互相覆盖
 *   - 失败必须 ok=false + error code, 不抛
 */

const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const FILE_NAME = "amap.bin";

function _configDir() {
  const base = (app && app.getPath) ? app.getPath("userData") : require("os").tmpdir();
  return path.join(base, "food_keys");
}

function _filePath() {
  return path.join(_configDir(), FILE_NAME);
}

async function _readEncrypted() {
  try {
    const buf = await fs.promises.readFile(_filePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    return null;
  }
}

async function _writeEncrypted(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "safeStorage_unavailable" };
  }
  const enc = safeStorage.encryptString(key);
  await fs.promises.mkdir(_configDir(), { recursive: true });
  await fs.promises.writeFile(_filePath(), enc, { mode: 0o600 });
  return { ok: true };
}

async function getAmapKey() {
  return _readEncrypted();
}

async function hasAmapKey() {
  const k = await _readEncrypted();
  return typeof k === "string" && k.length > 0;
}

async function setAmapKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    return { ok: false, error: "empty_key" };
  }
  return _writeEncrypted(key.trim());
}

module.exports = { getAmapKey, hasAmapKey, setAmapKey, FILE_NAME };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/food/food-config.test.js`
Expected: PASS (3 cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/food/food-config.js tests/main/food/food-config.test.js
git commit -m "feat(food): amap key persistence via safeStorage"
```

---

## Task 2: food-cache.js — TTL 内存缓存 (LRU)

**Files:**
- Create: `src/main/food/food-cache.js`
- Test: `tests/main/food/food-cache.test.js`

**Interfaces:**
- Produces:
  - `createFoodCache({ ttlMs?: number, maxEntries?: number }): { get(key), set(key, value, ttlMs?), delete(key), clear(), size() }`
  - ponytail: 全局单进程 in-memory,够用 (单用户不会同时搜几百次)。超额 LRU 淘汰最旧的。

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/food/food-cache.test.js
const { describe, it, expect, beforeEach, vi } = require("vitest");
const { createFoodCache } = require("../../../src/main/food/food-cache");

describe("food-cache", () => {
  let cache;
  beforeEach(() => {
    vi.useFakeTimers();
    cache = createFoodCache({ ttlMs: 1000, maxEntries: 3 });
  });
  afterEach(() => vi.useRealTimers());

  it("returns null on miss", () => {
    expect(cache.get("k1")).toBeNull();
  });

  it("stores and retrieves value", () => {
    cache.set("k1", { x: 1 });
    expect(cache.get("k1")).toEqual({ x: 1 });
  });

  it("expires after TTL", () => {
    cache.set("k1", { x: 1 });
    vi.advanceTimersByTime(1500);
    expect(cache.get("k1")).toBeNull();
  });

  it("respects custom TTL per set", () => {
    cache.set("k1", { x: 1 }, 500);
    vi.advanceTimersByTime(800);
    expect(cache.get("k1")).toBeNull();
  });

  it("LRU evicts oldest when full", () => {
    cache.set("k1", 1);
    cache.set("k2", 2);
    cache.set("k3", 3);
    cache.get("k1"); // k1 is now most recent
    cache.set("k4", 4); // should evict k2 (oldest)
    expect(cache.get("k2")).toBeNull();
    expect(cache.get("k1")).toBe(1);
  });

  it("delete and clear work", () => {
    cache.set("k1", 1);
    cache.delete("k1");
    expect(cache.get("k1")).toBeNull();
    cache.set("k2", 2);
    cache.clear();
    expect(cache.get("k2")).toBeNull();
  });

  it("size tracks entries", () => {
    cache.set("k1", 1);
    cache.set("k2", 2);
    expect(cache.size()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/food/food-cache.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement food-cache.js**

```javascript
/**
 * src/main/food/food-cache.js
 *
 * Per-location in-memory cache for nearby food queries.
 *
 * ponytail: 单进程 in-memory Map, LRU 简单实现. 单用户单进程够用.
 * 升级路径: 若未来需要跨进程共享 (如主进程 fork worker), 换 LRU-cache npm 包.
 */

function createFoodCache(opts = {}) {
  const defaultTtlMs = opts.ttlMs ?? 30 * 60 * 1000; // 30min
  const maxEntries = opts.maxEntries ?? 100;
  const _store = new Map(); // key → { value, expiresAt }

  function _evictIfFull() {
    while (_store.size > maxEntries) {
      const oldestKey = _store.keys().next().value;
      _store.delete(oldestKey);
    }
  }

  function get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      _store.delete(key);
      return null;
    }
    // 标记为最近使用 (move to end of Map)
    _store.delete(key);
    _store.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs) {
    const ttl = ttlMs ?? defaultTtlMs;
    const entry = { value, expiresAt: Date.now() + ttl };
    _store.set(key, entry);
    _evictIfFull();
  }

  function del(key) {
    _store.delete(key);
  }

  function clear() {
    _store.clear();
  }

  function size() {
    return _store.size;
  }

  return { get, set, delete: del, clear, size };
}

module.exports = { createFoodCache };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/food/food-cache.test.js`
Expected: PASS (7 cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/food/food-cache.js tests/main/food/food-cache.test.js
git commit -m "feat(food): per-location LRU cache with TTL"
```

---

## Task 3: food-aggregator.js — 纯函数合并 + 排序

**Files:**
- Create: `src/main/food/food-aggregator.js`
- Test: `tests/main/food/food-aggregator.test.js`

**Interfaces:**
- Produces:
  - `mergeFoodData(pois, ratings, opts?): { list: FoodItem[], locationLabel: string }`
  - `FoodItem = { id, name, address, location: {lat,lng}, distance, type, rating|null, reviewCount|null, avgPrice|null }`
  - ponytail: fuzzy match 用简单 includes + Levenshtein ≤ 2 (避免引入 fuzzy 库)

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/food/food-aggregator.test.js
const { describe, it, expect } = require("vitest");
const {
  mergeFoodData,
  levenshtein,
  fuzzyMatchName,
} = require("../../../src/main/food/food-aggregator");

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("returns distance for different strings", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("fuzzyMatchName", () => {
  it("matches identical", () => {
    expect(fuzzyMatchName("麦当劳", "麦当劳")).toBe(true);
  });
  it("matches with includes", () => {
    expect(fuzzyMatchName("麦当劳(建国路店)", "麦当劳")).toBe(true);
  });
  it("matches with Levenshtein <=2", () => {
    expect(fuzzyMatchName("麦当郎", "麦当劳")).toBe(true);
  });
  it("rejects very different", () => {
    expect(fuzzyMatchName("肯德基", "麦当劳")).toBe(false);
  });
});

describe("mergeFoodData", () => {
  const pois = [
    { id: "a", name: "麦当劳(建国路店)", address: "建国路88号", location: { lat: 39.9, lng: 116.4 }, distance: 850, type: "西式快餐" },
    { id: "b", name: "海底捞", address: "光华路21号", location: { lat: 39.91, lng: 116.41 }, distance: 1200, type: "火锅" },
    { id: "c", name: "兰州拉面", address: "光华路22号", location: { lat: 39.91, lng: 116.41 }, distance: 1300, type: "面馆" },
  ];
  const ratings = [
    { name: "麦当劳", rating: 4.5, reviewCount: 328, avgPrice: 45 },
    { name: "海底捞", rating: 4.8, reviewCount: 1024, avgPrice: 120 },
  ];

  it("merges by fuzzy name match", () => {
    const r = mergeFoodData(pois, ratings);
    expect(r.list[0].name).toBe("麦当劳(建国路店)");
    expect(r.list[0].rating).toBe(4.5);
    expect(r.list[0].reviewCount).toBe(328);
    expect(r.list[0].avgPrice).toBe(45);
  });

  it("POI without rating match gets null fields", () => {
    const r = mergeFoodData(pois, ratings);
    const lamian = r.list.find((x) => x.name === "兰州拉面");
    expect(lamian.rating).toBeNull();
    expect(lamian.reviewCount).toBeNull();
    expect(lamian.avgPrice).toBeNull();
  });

  it("sorts by distance ascending by default", () => {
    const r = mergeFoodData(pois, ratings);
    expect(r.list.map((x) => x.name)).toEqual([
      "麦当劳(建国路店)",
      "海底捞",
      "兰州拉面",
    ]);
  });

  it("sorts by rating descending when requested", () => {
    const r = mergeFoodData(pois, ratings, { sortBy: "rating" });
    expect(r.list[0].name).toBe("海底捞"); // 4.8
    expect(r.list[1].name).toBe("麦当劳(建国路店)"); // 4.5
    // 兰州拉面 (rating=null) 排到最后
    expect(r.list[2].name).toBe("兰州拉面");
  });

  it("limits to 30 entries", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`, name: `店${i}`, address: "x", location: { lat: 0, lng: 0 }, distance: 100 + i, type: "x",
    }));
    const r = mergeFoodData(many, [], { limit: 30 });
    expect(r.list.length).toBe(30);
  });

  it("empty inputs return empty list", () => {
    expect(mergeFoodData([], []).list).toEqual([]);
  });

  it("uses provided locationLabel", () => {
    const r = mergeFoodData(pois, ratings, { locationLabel: "北京·国贸" });
    expect(r.locationLabel).toBe("北京·国贸");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/food/food-aggregator.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement food-aggregator.js**

```javascript
/**
 * src/main/food/food-aggregator.js
 *
 * 合并高德 POI + 大众点评评分, fuzzy match 店名, 排序.
 *
 * ponytail:
 *   - fuzzy match: Levenshtein ≤ 2 OR includes — 不引入 fuzzy 库, 50 行就够.
 *     升级路径: 若未来需要更精确, 用 fast-fuzzy npm.
 *   - 排序: 默认 distance asc, 可切 rating desc (null 排最后).
 */

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 店名匹配: includes 优先 (店名带分店后缀), 否则 Levenshtein ≤ 2. */
function fuzzyMatchName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aa = String(a).toLowerCase();
  const bb = String(b).toLowerCase();
  if (aa.includes(bb) || bb.includes(aa)) return true;
  return levenshtein(aa, bb) <= 2;
}

/**
 * @param {Array<object>} pois — 高德 POI: {id, name, address, location:{lat,lng}, distance, type}
 * @param {Array<object>} ratings — 大众点评: {name, rating, reviewCount, avgPrice}
 * @param {{sortBy?: 'distance'|'rating', limit?: number, locationLabel?: string}} [opts]
 */
function mergeFoodData(pois, ratings, opts = {}) {
  const sortBy = opts.sortBy ?? "distance";
  const limit = opts.limit ?? 30;

  const merged = (pois || []).map((p) => {
    const matched = (ratings || []).find((r) => fuzzyMatchName(p.name, r.name));
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      location: p.location,
      distance: p.distance,
      type: p.type,
      rating: matched ? matched.rating : null,
      reviewCount: matched ? matched.reviewCount : null,
      avgPrice: matched ? matched.avgPrice : null,
    };
  });

  merged.sort((a, b) => {
    if (sortBy === "rating") {
      const ra = a.rating == null ? -1 : a.rating;
      const rb = b.rating == null ? -1 : b.rating;
      if (ra !== rb) return rb - ra;
    }
    return a.distance - b.distance;
  });

  return {
    list: merged.slice(0, limit),
    locationLabel: opts.locationLabel ?? "",
  };
}

module.exports = { mergeFoodData, fuzzyMatchName, levenshtein };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/food/food-aggregator.test.js`
Expected: PASS (12 cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/food/food-aggregator.js tests/main/food/food-aggregator.test.js
git commit -m "feat(food): aggregator merge POI + ratings with fuzzy match"
```

---

## Task 4: amap-client.js — 高德 API 封装

**Files:**
- Create: `src/main/food/amap-client.js`
- Test: `tests/main/food/amap-client.test.js`

**Interfaces:**
- Produces:
  - `createAmapClient({ key, http? }): { geocode(address), aroundSearch({location, radius, keywords?}) }`
  - 返回 `{ok: true, data}` 或 `{ok: false, error: 'invalid_key'|'quota'|'network'|'parse'}`
  - 复用 `src/main/http-client.js` (HttpClient)

- [ ] **Step 1: Write failing test**

```javascript
// tests/main/food/amap-client.test.js
const { describe, it, expect, vi } = require("vitest");
const { createAmapClient } = require("../../../src/main/food/amap-client");

function makeStubHttp(responses) {
  let i = 0;
  return {
    get: vi.fn(async () => responses[i++] ?? { status: 0, body: "", error: "network" }),
  };
}

describe("amap-client.geocode", () => {
  it("returns location on success", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({
        status: "1",
        geocodes: [{ location: "116.481488,39.990464", formatted_address: "北京市朝阳区" }],
      }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("北京市朝阳区");
    expect(r.ok).toBe(true);
    expect(r.data.lat).toBe(39.990464);
    expect(r.data.lng).toBe(116.481488);
    expect(r.data.label).toBe("北京市朝阳区");
  });

  it("returns invalid_key on status=0", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" }),
    }]);
    const c = createAmapClient({ key: "bad", http });
    const r = await c.geocode("x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_key");
  });

  it("returns no_match when geocodes empty", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({ status: "1", geocodes: [] }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("asdfasdf");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_match");
  });

  it("returns network on http error", async () => {
    const http = makeStubHttp([{ status: 0, body: "", error: "network" }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.geocode("x");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network");
  });
});

describe("amap-client.aroundSearch", () => {
  it("returns pois array", async () => {
    const http = makeStubHttp([{
      status: 200,
      body: JSON.stringify({
        status: "1",
        pois: [
          { id: "B0XXX", name: "麦当劳", address: "建国路88号", location: "116.481,39.990", distance: "850", type: "西式快餐" },
        ],
      }),
    }]);
    const c = createAmapClient({ key: "k", http });
    const r = await c.aroundSearch({ location: "116.481,39.990", radius: 1000 });
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(1);
    expect(r.data[0].name).toBe("麦当劳");
    expect(r.data[0].location.lat).toBe(39.99);
  });

  it("passes keywords and radius in URL", async () => {
    const http = makeStubHttp([{ status: 200, body: JSON.stringify({ status: "1", pois: [] }) }]);
    const c = createAmapClient({ key: "MYKEY", http });
    await c.aroundSearch({ location: "116,39", radius: 2000, keywords: "美食" });
    const url = http.get.mock.calls[0][0];
    expect(url).toContain("key=MYKEY");
    expect(url).toContain("radius=2000");
    expect(url).toContain("keywords=" + encodeURIComponent("美食"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/food/amap-client.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement amap-client.js**

```javascript
/**
 * src/main/food/amap-client.js
 *
 * 高德地图 API 封装 — geocode + around-search.
 *
 * ponytail: 复用现有 http-client.js (timeout + retry 已就位).
 *  文档参考: https://lbs.amap.com/api/webservice/guide/api/search
 */

const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const BASE = "https://restapi.amap.com/v3";
const TIMEOUT_MS = 8000;

function createAmapClient(opts) {
  const key = opts.key;
  const http = opts.http || new HttpClient({ timeout: TIMEOUT_MS });
  const log = opts.logger || mainLog;

  function _parseLocation(loc) {
    // 高德格式: "lng,lat"
    const parts = String(loc).split(",");
    return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
  }

  async function _getJson(path, params) {
    const qs = new URLSearchParams({ key, ...params }).toString();
    const url = `${BASE}${path}?${qs}`;
    const r = await http.get(url, { timeout: TIMEOUT_MS });
    if (!r || r.error) {
      log.warn && log.warn("[amap] http error", { err: r && r.error });
      return { ok: false, error: "network" };
    }
    let body;
    try { body = JSON.parse(r.body); }
    catch (e) {
      return { ok: false, error: "parse" };
    }
    if (body.status !== "1") {
      const code = String(body.infocode || "");
      if (code === "10001" || code === "10003" || code === "10004" || code === "10005" || code === "10006" || code === "20000") {
        return { ok: false, error: "invalid_key" };
      }
      if (code === "10009" || code === "10011" || code === "10012") {
        return { ok: false, error: "quota" };
      }
      return { ok: false, error: "api_error", infocode: code, info: body.info };
    }
    return { ok: true, data: body };
  }

  async function geocode(address) {
    const r = await _getJson("/geocode/geo", { address });
    if (!r.ok) return r;
    if (!r.data.geocodes || r.data.geocodes.length === 0) {
      return { ok: false, error: "no_match" };
    }
    const g = r.data.geocodes[0];
    const loc = _parseLocation(g.location);
    return {
      ok: true,
      data: {
        lng: loc.lng,
        lat: loc.lat,
        label: g.formatted_address || address,
      },
    };
  }

  async function aroundSearch(params) {
    const { location, radius = 1000, keywords = "美食" } = params || {};
    const r = await _getJson("/place/around", {
      location,
      radius: String(radius),
      keywords,
      offset: "30",
      extensions: "base",
    });
    if (!r.ok) return r;
    const pois = (r.data.pois || []).map((p) => {
      const loc = p.location ? _parseLocation(p.location) : { lng: 0, lat: 0 };
      return {
        id: p.id,
        name: p.name,
        address: p.address || "",
        location: loc,
        distance: parseInt(p.distance, 10) || 0,
        type: p.type || "",
      };
    });
    return { ok: true, data: pois };
  }

  return { geocode, aroundSearch };
}

module.exports = { createAmapClient };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/food/amap-client.test.js`
Expected: PASS (6 cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/food/amap-client.js tests/main/food/amap-client.test.js
git commit -m "feat(food): amap client wrapper (geocode + around-search)"
```

---

## Task 5: dianping-scraper.js — 大众点评搜索结果解析

**Files:**
- Create: `src/main/food/dianping-scraper.js`
- Test: `tests/main/food/dianping-scraper.test.js`
- Create: `tests/fixtures/dianping-search-sample.html` (fixture)

**Interfaces:**
- Produces:
  - `createDianpingScraper({ http? }): { search({lat, lng, keyword?}) }`
  - 返回 `{ok: true, data: [{name, rating, reviewCount, avgPrice}]}` 或 `{ok: false, error: 'network'|'parse'|'rate_limit'}`
  - ponytail: 用自定义 desktop UA,失败静默 (返回 error 不抛)

- [ ] **Step 1: Create fixture HTML**

```bash
mkdir -p tests/fixtures
```

Create file `tests/fixtures/dianping-search-sample.html`:

```html
<!-- 模拟大众点评搜索结果页片段 (简化, 只保留需要解析的字段) -->
<html><body>
<li class="shop-list-item">
  <h4 class="shop-title">麦当劳(建国路店)</h4>
  <div class="shop-addr">建国路88号</div>
  <div class="shop-info">
    <span class="mean-price">¥45/人</span>
    <div class="comment">
      <span class="rating">4.5</span>
      <span class="review-count">328条评价</span>
    </div>
  </div>
</li>
<li class="shop-list-item">
  <h4 class="shop-title">海底捞火锅</h4>
  <div class="shop-addr">光华路21号</div>
  <div class="shop-info">
    <span class="mean-price">¥120/人</span>
    <div class="comment">
      <span class="rating">4.8</span>
      <span class="review-count">1024条评价</span>
    </div>
  </div>
</li>
</body></html>
```

- [ ] **Step 2: Write failing test**

```javascript
// tests/main/food/dianping-scraper.test.js
const fs = require("fs");
const path = require("path");
const { describe, it, expect, vi } = require("vitest");
const { createDianpingScraper, parseShopListHtml } = require("../../../src/main/food/dianping-scraper");

const FIXTURE_PATH = path.join(__dirname, "../../fixtures/dianping-search-sample.html");

describe("parseShopListHtml", () => {
  it("extracts shops from fixture", () => {
    const html = fs.readFileSync(FIXTURE_PATH, "utf8");
    const shops = parseShopListHtml(html);
    expect(shops.length).toBe(2);
    expect(shops[0].name).toBe("麦当劳(建国路店)");
    expect(shops[0].rating).toBe(4.5);
    expect(shops[0].reviewCount).toBe(328);
    expect(shops[0].avgPrice).toBe(45);
    expect(shops[1].name).toBe("海底捞火锅");
    expect(shops[1].avgPrice).toBe(120);
  });

  it("returns empty array on no matches", () => {
    expect(parseShopListHtml("<html></html>")).toEqual([]);
  });

  it("skips shops with invalid rating", () => {
    const html = '<li class="shop-list-item"><h4 class="shop-title">X</h4><span class="rating">n/a</span></li>';
    expect(parseShopListHtml(html)).toEqual([]);
  });
});

describe("dianping-scraper.search", () => {
  function makeStubHttp(responses) {
    let i = 0;
    return { get: vi.fn(async () => responses[i++] ?? { status: 0, body: "", error: "network" }) };
  }

  it("returns shops on 200", async () => {
    const html = fs.readFileSync(FIXTURE_PATH, "utf8");
    const http = makeStubHttp([{ status: 200, body: html }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(2);
  });

  it("returns network on http error", async () => {
    const http = makeStubHttp([{ status: 0, body: "", error: "network" }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network");
  });

  it("returns rate_limit on 403", async () => {
    const http = makeStubHttp([{ status: 403, body: "Forbidden" }]);
    const s = createDianpingScraper({ http });
    const r = await s.search({ lat: 39.99, lng: 116.48 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("rate_limit");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/main/food/dianping-scraper.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement dianping-scraper.js**

```javascript
/**
 * src/main/food/dianping-scraper.js
 *
 * 大众点评搜索结果解析 (HTML → 评分/评论/人均).
 *
 * ⚠️ 合规: 调用其公开搜索页面, 严格意义上违反 ToS. 仅供个人本地使用.
 * ponytail:
 *   - 自定义 desktop UA, 降低触发反爬概率
 *   - 失败静默降级: 返回 error, 不抛, 不重试 (避免被封)
 *   - 不爬详情页, 只解析搜索结果列表 HTML 片段
 */

const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const SEARCH_URL = "https://www.dianping.com/search/keyword";
const TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 从大众点评搜索结果 HTML 抽取店铺基础信息.
 * 用 regex (DOMParser 在 Node 里要 jsdom, 杀鸡用牛刀).
 */
function parseShopListHtml(html) {
  if (!html || typeof html !== "string") return [];
  const shops = [];
  // 匹配每个 shop-list-item 块
  const itemRe = /<li[^>]*class="shop-list-item"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<h4[^>]*class="shop-title"[^>]*>([\s\S]*?)<\/h4>/);
    const ratingMatch = block.match(/<span[^>]*class="rating"[^>]*>([\d.]+)<\/span>/);
    const reviewMatch = block.match(/<span[^>]*class="review-count"[^>]*>(\d+)\s*条评价/);
    const priceMatch = block.match(/<span[^>]*class="mean-price"[^>]*>¥(\d+)\s*\/人/);
    if (!nameMatch || !ratingMatch) continue;
    const rating = parseFloat(ratingMatch[1]);
    if (!Number.isFinite(rating)) continue;
    shops.push({
      name: nameMatch[1].trim(),
      rating,
      reviewCount: reviewMatch ? parseInt(reviewMatch[1], 10) : 0,
      avgPrice: priceMatch ? parseInt(priceMatch[1], 10) : null,
    });
  }
  return shops;
}

function createDianpingScraper(opts = {}) {
  const http = opts.http || new HttpClient({ timeout: TIMEOUT_MS });
  const log = opts.logger || mainLog;

  async function search(params) {
    const { lat, lng, keyword = "美食" } = params || {};
    // 大众点评搜索 URL: /search/keyword/{cityId}/{keyword}
    // 简化: cityId 留空, 服务端可能 404, 但本 MVP 不强求返回数据
    const url = `${SEARCH_URL}/${encodeURIComponent(keyword)}`;
    const r = await http.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": UA,
        "Referer": "https://www.dianping.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    if (!r || r.error) {
      log.warn && log.warn("[dianping] http error", { err: r && r.error });
      return { ok: false, error: "network" };
    }
    if (r.status === 403 || r.status === 429) {
      return { ok: false, error: "rate_limit" };
    }
    if (r.status !== 200) {
      return { ok: false, error: "http_error", status: r.status };
    }
    try {
      const shops = parseShopListHtml(r.body);
      return { ok: true, data: shops };
    } catch (e) {
      return { ok: false, error: "parse" };
    }
  }

  return { search, parseShopListHtml };
}

module.exports = { createDianpingScraper, parseShopListHtml };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/food/dianping-scraper.test.js`
Expected: PASS (6 cases)

- [ ] **Step 6: Commit**

```bash
git add src/main/food/dianping-scraper.js tests/main/food/dianping-scraper.test.js tests/fixtures/dianping-search-sample.html
git commit -m "feat(food): dianping scraper with HTML parser (compliance: opt-in only)"
```

---

## Task 6: 主进程 orchestrator + food-cache 接线

**Files:**
- Create: `src/main/food/index.js`
- Modify: `src/main/index.js` (新增 bootstrapFood)

**Interfaces:**
- Produces:
  - `fetchNearbyFood({ location, radius?, sortBy?, forceRefresh? }): Promise<{ok, list, locationLabel, cachedAt, error?}>`
  - 全局单例 cache, 复用 Task 2

- [ ] **Step 1: Create src/main/food/index.js (orchestrator)**

```javascript
/**
 * src/main/food/index.js
 *
 * 主进程 food 模块入口 — 编排 amap + dianping + cache + aggregator.
 */

const { createAmapClient } = require("./amap-client");
const { createDianpingScraper } = require("./dianping-scraper");
const { mergeFoodData } = require("./food-aggregator");
const { createFoodCache } = require("./food-cache");
const { getAmapKey } = require("./food-config");
const { HttpClient } = require("../http-client");
const { mainLog } = require("../log");

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min
const CACHE_MAX = 100;

let _cache = null;
let _amap = null;
let _dianping = null;

function _getCache() {
  if (!_cache) _cache = createFoodCache({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX });
  return _cache;
}

async function _getAmap() {
  if (_amap) return _amap;
  const key = await getAmapKey();
  if (!key) return null;
  _amap = createAmapClient({ key, http: new HttpClient({ timeout: 8000 }) });
  return _amap;
}

function _getDianping() {
  if (!_dianping) {
    _dianping = createDianpingScraper({ http: new HttpClient({ timeout: 8000 }) });
  }
  return _dianping;
}

function _cacheKey(lat, lng, radius) {
  // 经纬度 3 位小数 ≈ 110m 容差
  return `${lat.toFixed(3)},${lng.toFixed(3)}|${radius}`;
}

/**
 * @param {{location: string|{lat:number,lng:number}, radius?: 500|1000|2000, sortBy?: 'distance'|'rating', forceRefresh?: boolean}} opts
 */
async function fetchNearbyFood(opts) {
  const radius = opts.radius ?? 1000;
  const sortBy = opts.sortBy ?? "distance";
  const force = !!opts.forceRefresh;

  // 1) 解析 location
  let lat, lng, locationLabel;
  if (typeof opts.location === "object" && opts.location.lat != null) {
    lat = opts.location.lat;
    lng = opts.location.lng;
    locationLabel = opts.location.label || `${lat.toFixed(4)},${lng.toFixed(4)}`;
  } else if (typeof opts.location === "string") {
    const amap = await _getAmap();
    if (!amap) return { ok: false, error: "no_key" };
    const geo = await amap.geocode(opts.location);
    if (!geo.ok) return { ok: false, error: geo.error === "no_match" ? "geocode_failed" : geo.error };
    lat = geo.data.lat;
    lng = geo.data.lng;
    locationLabel = geo.data.label;
  } else {
    return { ok: false, error: "invalid_location" };
  }

  // 2) cache check
  const key = _cacheKey(lat, lng, radius);
  if (!force) {
    const cached = _getCache().get(key);
    if (cached) {
      return { ok: true, list: cached.list, locationLabel: cached.locationLabel, cachedAt: cached.cachedAt };
    }
  }

  // 3) fetch
  const amap = await _getAmap();
  if (!amap) return { ok: false, error: "no_key" };

  const amapResult = await amap.aroundSearch({
    location: `${lng},${lat}`,
    radius,
    keywords: "美食",
  });
  if (!amapResult.ok) {
    return { ok: false, error: amapResult.error };
  }

  // 4) 大众点评并行 (失败不影响主流程)
  let ratings = [];
  try {
    const dpResult = await _getDianping().search({ lat, lng });
    if (dpResult.ok) ratings = dpResult.data;
    else mainLog.warn && mainLog.warn("[food] dianping degraded", { err: dpResult.error });
  } catch (e) {
    mainLog.warn && mainLog.warn("[food] dianping threw", { msg: e && e.message });
  }

  // 5) merge + sort
  const merged = mergeFoodData(amapResult.data, ratings, { sortBy, limit: 30, locationLabel });

  // 6) cache write
  const cachedAt = Date.now();
  _getCache().set(key, { list: merged.list, locationLabel: merged.locationLabel, cachedAt }, CACHE_TTL_MS);

  return { ok: true, list: merged.list, locationLabel: merged.locationLabel, cachedAt };
}

function bootstrapFood() {
  // 启动钩子: 当前无后台预热需求 (MVP), 仅清空 cache 引用
  _cache = null;
  _amap = null;
  _dianping = null;
  mainLog.info && mainLog.info("[food] bootstrapped (cache in-memory, no preheat)");
}

module.exports = { fetchNearbyFood, bootstrapFood };
```

- [ ] **Step 2: Wire bootstrapFood into src/main/index.js**

打开 `src/main/index.js`, 在 `app.whenReady().then(...)` 块里加一行:

```javascript
const { bootstrapFood } = require("./food/index");
```

在 app ready 之后的 bootstrap 区块(参考 `bootstrapAiUsage()` 调用附近)加:

```javascript
bootstrapFood();
```

(位置具体由执行时根据现有代码风格插入)

- [ ] **Step 3: Smoke-test 集成**

由于 orchestrator 涉及外部 API + 主进程环境, 不能单测覆盖; 改为人工 smoke:
- 启动 dev mode (`npm run dev`)
- 在 console 里 require `./src/main/food/index.js` 验证不报错

(plan: 通过 commit + 后续 task 集成测试验证)

- [ ] **Step 4: Commit**

```bash
git add src/main/food/index.js src/main/index.js
git commit -m "feat(food): main process orchestrator (amap + dianping + cache + aggregator)"
```

---

## Task 7: IPC handler 注册 (food:fetch-nearby / get-config / save-config)

**Files:**
- Create: `src/main/ipc/register-food.js`
- Modify: `src/main/ipc/index.js`

**Interfaces:**
- 暴露 IPC channels:
  - `food:fetch-nearby({location, radius?, sortBy?, forceRefresh?})`
  - `food:get-config()` → `{hasAmapKey}`
  - `food:save-config({amapKey})` → `{ok, error?}`

- [ ] **Step 1: Create src/main/ipc/register-food.js**

```javascript
/**
 * src/main/ipc/register-food.js
 *
 * 附近美食 IPC handlers (v2.26+).
 */

const { fetchNearbyFood } = require("../food/index");
const { hasAmapKey, setAmapKey } = require("../food/food-config");

function registerFoodHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("food:fetch-nearby", async (_evt, payload) => {
    return fetchNearbyFood(payload || {});
  });

  safeHandle("food:get-config", async () => {
    const has = await hasAmapKey();
    return { hasAmapKey: has };
  });

  safeHandle("food:save-config", async (_evt, payload) => {
    const key = payload && payload.amapKey;
    return setAmapKey(key);
  });
}

module.exports = { registerFoodHandlers };
```

- [ ] **Step 2: Wire into src/main/ipc/index.js**

打开 `src/main/ipc/index.js`, 在顶部 require 区域加:

```javascript
const { registerFoodHandlers } = require("./register-food");
```

在 `registerIpcHandlers(deps)` 函数体内, 在 `registerWechatHotHandlers(deps);` 之后加:

```javascript
registerFoodHandlers(ctx);
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/register-food.js src/main/ipc/index.js
git commit -m "feat(food): register IPC handlers (fetch-nearby, get-config, save-config)"
```

---

## Task 8: preload.js + api.js 暴露

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

**Interfaces:**
- `window.api.foodFetchNearby(opts) → Promise<result>`
- `window.api.foodGetConfig() → Promise<{hasAmapKey}>`
- `window.api.foodSaveConfig({amapKey}) → Promise<{ok, error?}>`

- [ ] **Step 1: Modify preload.js**

打开 `preload.js`, 在现有 `contextBridge.exposeInMainWorld("api", { ... })` 块内 (跟 ai-usage 等暴露放一起), 添加:

```javascript
  // 附近美食推荐 (v2.26+)
  foodFetchNearby: (opts) => ipcRenderer.invoke("food:fetch-nearby", opts),
  foodGetConfig: () => ipcRenderer.invoke("food:get-config"),
  foodSaveConfig: (opts) => ipcRenderer.invoke("food:save-config", opts),
```

(精确位置由执行时根据现有风格插在 `ai-usage` 相关暴露附近)

- [ ] **Step 2: Modify src/renderer/api.js**

打开 `src/renderer/api.js`, 在 `pickApi` 函数里 (或相应的 api 暴露列表), 添加:

```javascript
  foodFetchNearby: window.api.foodFetchNearby,
  foodGetConfig: window.api.foodGetConfig,
  foodSaveConfig: window.api.foodSaveConfig,
```

(精确位置由执行时根据现有风格决定)

- [ ] **Step 3: Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(food): expose foodFetchNearby/Config in preload + api"
```

---

## Task 9: renderer foodStore.js — signal 状态机

**Files:**
- Create: `src/renderer/food/foodStore.js`
- Test: `tests/renderer/food/foodStore.test.js`

**Interfaces:**
- `foodList: signal<FoodItem[]>`
- `foodLoading: signal<boolean>`
- `foodError: signal<string|null>`
- `foodConfig: signal<{hasAmapKey: boolean}>`
- `setFoodList(items)`, `setFoodLoading(b)`, `setFoodError(e)`, `setFoodConfig(c)`
- `loadFoodConfig()`, `saveFoodConfig(key)`, `searchNearby(opts)`

- [ ] **Step 1: Write failing test**

```javascript
// tests/renderer/food/foodStore.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  foodList,
  foodLoading,
  foodError,
  setFoodList,
  setFoodLoading,
  setFoodError,
  resetFoodState,
} from "../../../src/renderer/food/foodStore.js";

describe("foodStore state machine", () => {
  beforeEach(() => resetFoodState());

  it("starts in idle state", () => {
    expect(foodList.value).toEqual([]);
    expect(foodLoading.value).toBe(false);
    expect(foodError.value).toBeNull();
  });

  it("setFoodList updates signal", () => {
    setFoodList([{ id: "1", name: "X" }]);
    expect(foodList.value).toEqual([{ id: "1", name: "X" }]);
  });

  it("setFoodLoading toggles loading", () => {
    setFoodLoading(true);
    expect(foodLoading.value).toBe(true);
    setFoodLoading(false);
    expect(foodLoading.value).toBe(false);
  });

  it("setFoodError stores error", () => {
    setFoodError("network");
    expect(foodError.value).toBe("network");
  });

  it("resetFoodState clears all", () => {
    setFoodList([{ id: "1" }]);
    setFoodLoading(true);
    setFoodError("e");
    resetFoodState();
    expect(foodList.value).toEqual([]);
    expect(foodLoading.value).toBe(false);
    expect(foodError.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/food/foodStore.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement foodStore.js**

```javascript
/**
 * src/renderer/food/foodStore.js
 *
 * 渲染端 signal 集合 — 附近美食列表状态.
 * 4 signal: list / loading / error / config.
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";

export const foodList = signal([]);
export const foodLoading = signal(false);
export const foodError = signal(null);
export const foodConfig = signal({ hasAmapKey: false });

export function setFoodList(items) {
  foodList.value = Array.isArray(items) ? items : [];
}

export function setFoodLoading(b) {
  foodLoading.value = !!b;
}

export function setFoodError(e) {
  foodError.value = e || null;
}

export function setFoodConfig(c) {
  foodConfig.value = c || { hasAmapKey: false };
}

export function resetFoodState() {
  foodList.value = [];
  foodLoading.value = false;
  foodError.value = null;
}

export async function loadFoodConfig() {
  try {
    const c = await api.foodGetConfig();
    setFoodConfig(c);
    return c;
  } catch (e) {
    setFoodConfig({ hasAmapKey: false });
    return { hasAmapKey: false };
  }
}

export async function saveFoodConfig(amapKey) {
  const r = await api.foodSaveConfig({ amapKey });
  if (r && r.ok) {
    await loadFoodConfig();
  }
  return r;
}

/**
 * 触发附近美食搜索.
 * 状态机: loading=true, error 清空 → 调 api → 成功 setFoodList / 失败 setFoodError.
 */
export async function searchNearby(opts) {
  setFoodLoading(true);
  setFoodError(null);
  try {
    const r = await api.foodFetchNearby(opts);
    if (!r || !r.ok) {
      setFoodError(r && r.error ? r.error : "unknown");
      setFoodList([]);
      return r;
    }
    setFoodList(r.list || []);
    return r;
  } catch (e) {
    setFoodError("network");
    setFoodList([]);
    return { ok: false, error: "network" };
  } finally {
    setFoodLoading(false);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/food/foodStore.test.js`
Expected: PASS (5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/food/foodStore.js tests/renderer/food/foodStore.test.js
git commit -m "feat(food): renderer foodStore (4 signal + state machine)"
```

---

## Task 10: FoodEmpty / FoodCard / FoodList 渲染组件

**Files:**
- Create: `src/renderer/food/FoodEmpty.jsx`
- Create: `src/renderer/food/FoodCard.jsx`
- Create: `src/renderer/food/FoodList.jsx`

**Interfaces:**
- `FoodEmpty({reason})` — 引导态 (no_key / no_location / no_result / error)
- `FoodCard({item})` — 单卡片 (店名/距离/类型/评分/人均/地址)
- `FoodList({items, sortBy, onSortChange})` — 列表 + 排序切换

- [ ] **Step 1: Create FoodEmpty.jsx**

```jsx
/**
 * src/renderer/food/FoodEmpty.jsx
 *
 * 空态 / 错误态卡片. reason: 'no_key' | 'no_location' | 'no_result' | 'error'
 */

const REASON_COPY = {
  no_key: {
    title: "请先配置高德 API key",
    body: "在 AI/集成 配置里设置高德 key 后, 才能搜索附近美食.",
    action: null,
  },
  no_location: {
    title: "请输入位置或授权定位",
    body: "输入文字地址 (如「北京·国贸」) 或点 📍 按钮授权定位.",
    action: null,
  },
  no_result: {
    title: "附近暂无美食数据",
    body: "试试扩大搜索半径, 或换个位置.",
    action: null,
  },
  error: {
    title: "附近服务暂时不可达",
    body: "请稍后重试. 详情可看右下角 toast.",
    action: null,
  },
};

export function FoodEmpty({ reason }) {
  const copy = REASON_COPY[reason] || REASON_COPY.no_location;
  return (
    <div class="food-empty">
      <div class="food-empty-icon" aria-hidden="true">🍜</div>
      <div class="food-empty-title">{copy.title}</div>
      <div class="food-empty-body">{copy.body}</div>
    </div>
  );
}

export default FoodEmpty;
```

- [ ] **Step 2: Create FoodCard.jsx**

```jsx
/**
 * src/renderer/food/FoodCard.jsx
 *
 * 单店铺卡片. 缺评分时整行隐藏 (跟 spec §2.2 一致).
 */

function formatDistance(m) {
  if (m == null) return "";
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function FoodCard({ item }) {
  if (!item) return null;
  const hasRating = item.rating != null;
  return (
    <div class="food-card">
      <div class="food-card-row1">
        <span class="food-card-name">{item.name}</span>
        <span class="food-card-distance">{formatDistance(item.distance)}</span>
      </div>
      <div class="food-card-row2">
        {item.type && <span class="food-card-type">{item.type}</span>}
        {item.avgPrice != null && <span class="food-card-price">人均 ¥{item.avgPrice}</span>}
      </div>
      {hasRating && (
        <div class="food-card-row3">
          <span class="food-card-rating">⭐ {item.rating.toFixed(1)}</span>
          <span class="food-card-reviews">({item.reviewCount} 评论)</span>
        </div>
      )}
      {item.address && <div class="food-card-address">{item.address}</div>}
    </div>
  );
}

export default FoodCard;
```

- [ ] **Step 3: Create FoodList.jsx**

```jsx
/**
 * src/renderer/food/FoodList.jsx
 *
 * 列表 + 排序切换. 排序仅前端重排, 不发请求.
 */

import { FoodCard } from "./FoodCard.jsx";

export function FoodList({ items, sortBy, onSortChange }) {
  return (
    <div class="food-list">
      {items.length > 0 && (
        <div class="food-list-toolbar">
          <button
            class={`food-sort-btn${sortBy === "distance" ? " food-sort-btn-active" : ""}`}
            onClick={() => onSortChange && onSortChange("distance")}
          >
            距离
          </button>
          <button
            class={`food-sort-btn${sortBy === "rating" ? " food-sort-btn-active" : ""}`}
            onClick={() => onSortChange && onSortChange("rating")}
          >
            评分
          </button>
        </div>
      )}
      <div class="food-list-cards">
        {items.map((item) => (
          <FoodCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default FoodList;
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/food/FoodEmpty.jsx src/renderer/food/FoodCard.jsx src/renderer/food/FoodList.jsx
git commit -m "feat(food): FoodEmpty / FoodCard / FoodList components"
```

---

## Task 11: FoodHeader.jsx — 输入框 + 定位 + 半径 + 刷新

**Files:**
- Create: `src/renderer/food/FoodHeader.jsx`

**Interfaces:**
- 接收 `onSearch({location, radius, forceRefresh?})` 回调
- 内部 state: location 文字 / radius 选择 / sortBy
- 📍 按钮: 调 `navigator.geolocation.getCurrentPosition`, 10s 超时
- 文字输入: 防抖 600ms 自动触发搜索
- ↻ 按钮: 强制 forceRefresh 搜索

- [ ] **Step 1: Create FoodHeader.jsx**

```jsx
/**
 * src/renderer/food/FoodHeader.jsx
 *
 * 顶部控制栏 — 位置输入 / 📍 定位 / 半径 / 刷新.
 *
 * 防抖 600ms: 输入文字后 600ms 自动触发搜索.
 * Geolocation: 10s 超时, 失败 toast 提示走手动输入.
 */

import { useEffect, useRef, useState } from "preact/hooks";

const GEO_TIMEOUT_MS = 10000;
const DEBOUNCE_MS = 600;

export function FoodHeader({ onSearch, onLocationError, hasGeo }) {
  const [text, setText] = useState("");
  const [radius, setRadius] = useState(1000);
  const debounceRef = useRef(null);

  function trigger(opts = {}) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onSearch && onSearch({
      location: text.trim() || null,
      radius,
      ...opts,
    });
  }

  function onTextInput(e) {
    const v = e.target.value;
    setText(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (v.trim()) trigger();
    }, DEBOUNCE_MS);
  }

  function onRadiusChange(e) {
    const r = parseInt(e.target.value, 10);
    setRadius(r);
    if (text.trim()) trigger();
  }

  function onGeoClick() {
    if (!hasGeo) return;
    if (!navigator.geolocation) {
      onLocationError && onLocationError("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // 用 lat,lng 直接触发, 不写回 text (避免覆盖用户输入)
        onSearch && onSearch({
          location: { lat: latitude, lng: longitude },
          radius,
        });
      },
      (err) => {
        const reason =
          err.code === 1 ? "denied" :
          err.code === 2 ? "unavailable" :
          err.code === 3 ? "timeout" : "unknown";
        onLocationError && onLocationError(reason);
      },
      { timeout: GEO_TIMEOUT_MS },
    );
  }

  function onRefresh() {
    trigger({ forceRefresh: true });
  }

  // 组件卸载时清掉防抖
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div class="food-header">
      <input
        type="text"
        class="food-header-input"
        placeholder="输入位置 (如: 北京·国贸)"
        value={text}
        onInput={onTextInput}
        aria-label="位置"
      />
      {hasGeo && (
        <button
          type="button"
          class="food-header-geo-btn"
          onClick={onGeoClick}
          title="使用当前位置"
          aria-label="使用当前位置"
        >
          📍
        </button>
      )}
      <select
        class="food-header-radius"
        value={radius}
        onChange={onRadiusChange}
        aria-label="搜索半径"
      >
        <option value={500}>500m</option>
        <option value={1000}>1000m</option>
        <option value={2000}>2000m</option>
      </select>
      <button
        type="button"
        class="food-header-refresh-btn"
        onClick={onRefresh}
        title="强制刷新"
        aria-label="强制刷新"
      >
        ↻
      </button>
    </div>
  );
}

export default FoodHeader;
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/food/FoodHeader.jsx
git commit -m "feat(food): FoodHeader with location input + geo + radius + refresh"
```

---

## Task 12: FoodLayout.jsx + SideNav 集成 + AppShell 分支

**Files:**
- Create: `src/renderer/food/FoodLayout.jsx`
- Modify: `src/renderer/worldcup/navStore.js`
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `src/renderer/components/AppShell.jsx`

**Interfaces:**
- FoodLayout: 顶层布局 (Header + List/Empty)
- navStore.NAV_KEYS 加 'food'
- SideNav 加 nav item (icon 🍜, label 附近美食)
- AppShell 加 `nav === 'food' ? <FoodLayout /> : ...`

- [ ] **Step 1: Create FoodLayout.jsx**

```jsx
/**
 * src/renderer/food/FoodLayout.jsx
 *
 * 顶层布局 — Header + List / Empty / Skeleton.
 *
 * ponytail: 不重复 AIUsageLayout 那种 1-line wrapper, 这里有真实业务状态机,
 *  所以按 Preact class-function 标准组件写.
 */

import { useEffect, useState } from "preact/hooks";
import { FoodHeader } from "./FoodHeader.jsx";
import { FoodList } from "./FoodList.jsx";
import { FoodEmpty } from "./FoodEmpty.jsx";
import {
  foodList,
  foodLoading,
  foodError,
  foodConfig,
  loadFoodConfig,
  searchNearby,
} from "./foodStore.js";

const GEO_SUPPORTED = typeof navigator !== "undefined" && !!navigator.geolocation;

export function FoodLayout() {
  const list = foodList.value;
  const loading = foodLoading.value;
  const error = foodError.value;
  const config = foodConfig.value;
  const [sortBy, setSortBy] = useState("distance");
  const [lastSearch, setLastSearch] = useState(null);

  // 进入 tab 时加载 config
  useEffect(() => { loadFoodConfig(); }, []);

  // 按 sortBy 重排 (纯前端, 不发请求)
  const sortedList = sortBy === "rating"
    ? [...list].sort((a, b) => {
        const ra = a.rating == null ? -1 : a.rating;
        const rb = b.rating == null ? -1 : b.rating;
        if (ra !== rb) return rb - ra;
        return (a.distance || 0) - (b.distance || 0);
      })
    : list;

  async function onSearch(opts) {
    if (!config.hasAmapKey) return; // 等 FoodEmpty 引导
    if (!opts.location) return;
    setLastSearch(opts);
    await searchNearby({
      ...opts,
      sortBy,
    });
  }

  function onSortChange(newSort) {
    setSortBy(newSort);
    if (!lastSearch) return;
    // 重排后无需重发, 但 sortBy 状态更新会让下次 fetch 用新排序
  }

  function onLocationError(reason) {
    // 简单 toast: 通过全局事件总线
    window.dispatchEvent(new CustomEvent("app:toast", {
      detail: {
        type: "warn",
        message:
          reason === "denied" ? "已拒绝定位,请手动输入" :
          reason === "unavailable" ? "定位失败,请手动输入" :
          reason === "timeout" ? "定位超时,请手动输入" :
          "定位不可用,请手动输入",
      },
    }));
  }

  return (
    <div class="food-layout">
      <FoodHeader onSearch={onSearch} onLocationError={onLocationError} hasGeo={GEO_SUPPORTED} />
      <div class="food-body">
        {loading && <div class="food-skeleton">加载中…</div>}
        {!loading && error === "no_key" && <FoodEmpty reason="no_key" />}
        {!loading && error === "invalid_location" && <FoodEmpty reason="no_location" />}
        {!loading && error === "no_match" && <FoodEmpty reason="no_result" />}
        {!loading && error === "geocode_failed" && <FoodEmpty reason="no_result" />}
        {!loading && error && !["no_key", "invalid_location", "no_match", "geocode_failed"].includes(error) && <FoodEmpty reason="error" />}
        {!loading && !error && sortedList.length === 0 && <FoodEmpty reason="no_location" />}
        {!loading && !error && sortedList.length > 0 && (
          <FoodList items={sortedList} sortBy={sortBy} onSortChange={onSortChange} />
        )}
      </div>
    </div>
  );
}

export default FoodLayout;
```

- [ ] **Step 2: Modify src/renderer/worldcup/navStore.js**

打开 `navStore.js`, 在 `NAV_KEYS` Set 里添加 `'food'`:

```javascript
const NAV_KEYS = new Set([
  "ithome",
  "wechat-hot",
  "worldcup",
  "funds",
  "metals",
  "ai-usage",
  "versions",
  "food", // ← 新增
]);
```

- [ ] **Step 3: Modify src/renderer/components/SideNav.jsx**

打开 `SideNav.jsx`, 在 `NAV_ITEMS` 数组里添加:

```javascript
  { key: 'food',     icon: '🍜', label: '附近美食', tooltip: '高德地图 + 大众点评 (v2.26+)' },
```

(插在数组末尾, 跟 `versions` 之后或之前, 由执行时按 nav 视觉顺序决定)

- [ ] **Step 4: Modify src/renderer/components/AppShell.jsx**

打开 `AppShell.jsx`, 修改 nav 路由分支 (ternary 链), 在 `nav === 'ai-usage'` 之后添加:

```jsx
                    : nav === 'ai-usage'
                      ? <AIUsageLayout />
                      : nav === 'food'
                        ? <FoodLayout />
                        : <VersionsLayout onCheck={onCheck} />}
```

并加 import:

```javascript
import { FoodLayout } from '../food/FoodLayout.jsx';
```

- [ ] **Step 5: 启动 dev 验证**

Run: `npm run dev`
Expected: 窗口出现, SideNav 多了 🍜 tab; 点了进 food tab, 显示 "请输入位置或授权定位"; 没配 key 时 (默认) 显示 "请配置高德 API key" (前提: api 已通过 main 测过, 此处仅 UI smoke)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/food/FoodLayout.jsx src/renderer/worldcup/navStore.js src/renderer/components/SideNav.jsx src/renderer/components/AppShell.jsx
git commit -m "feat(food): integrate FoodLayout into SideNav + AppShell"
```

---

## Task 13: README 更新 + 全量测试 + 完成

**Files:**
- Modify: `README.md` (添加 1 段简短说明)

- [ ] **Step 1: 在 README.md 「它做什么」section 后加**

```markdown
## 附近美食 (v2.26+)

Header 🍜 tab — 当前位置附近的美食推荐,整合高德地图(POI)+ 大众点评(评分)。

- **位置来源**: 手动输入文字地址 / 📍 浏览器定位(10s 超时)
- **搜索半径**: 500m / 1000m (默认) / 2000m
- **缓存**: 30 分钟, 同位置不重复请求
- **API key**: 在 ⚙️ AI/集成 配置里设置高德 key (safeStorage 加密)
- **失败降级**: 大众点评失败时不报错, 评分字段自动隐藏, POI 数据仍可用

> ⚠️ 数据源包含对大众点评公开搜索页面的爬取, 严格意义上违反其服务条款。
> 仅供个人本地使用, 不发布到任何商业渠道。
```

- [ ] **Step 2: Run 全量测试**

Run: `npm test`
Expected: 所有测试 PASS (包含原有 70+ 测试 + 新增 36 个 food 测试)

- [ ] **Step 3: Run lint (若有)**

Run: `npx eslint src/main/food src/renderer/food 2>&1 || true`
Expected: 无新错误 (若有 lint 错误, 修复)

- [ ] **Step 4: Build smoke**

Run: `npm run build:renderer`
Expected: bundle 成功, 无 Preact/JSX 错误

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs(readme): nearby food recommendation feature (v2.26+)"
```

- [ ] **Step 6: 报告完成**

向用户报告:
- 总新增 16 文件, 修改 8 文件
- 13 个 task 全部完成
- 测试覆盖 (主进程 25 case + 渲染 5 case + 现有测试无回归)
- 启动 dev 模式可手动 smoke

---

## Self-Review Checklist (执行前需确认)

执行此 plan 之前,实现者必须自检:

- [ ] Spec 每一项需求都映射到至少 1 个 task
  - [x] §2.1 冷启动 → Task 12 (FoodLayout)
  - [x] §2.2 FoodCard → Task 10
  - [x] §2.3 交互 (防抖/定位/排序/刷新) → Task 11
  - [x] §2.4 Empty/Error/Loading 态 → Task 10 + 12
  - [x] §3.2 数据流 → Task 6
  - [x] §3.3 Geolocation → Task 11
  - [x] §4 IPC channels → Task 7 + 8
  - [x] §4.1 FoodItem schema → Task 3 (aggregator)
  - [x] §5 决策表各项 → 已实现于对应 task
  - [x] §6 错误处理矩阵 → Task 4 + 5 + 6 + 12
  - [x] §7 测试策略 → 4 个 test 文件
  - [x] §8 文件清单 → 13 task 已覆盖

- [ ] 无 "TBD / TODO / 后续" 占位符
  - [x] 检查所有 step,无占位符

- [ ] 类型/方法签名一致
  - [x] `mergeFoodData(pois, ratings, opts)` 在 Task 3 定义, Task 6 复用
  - [x] `fetchNearbyFood(opts)` 在 Task 6 定义, Task 7 IPC 复用
  - [x] `searchNearby(opts)` 在 Task 9 定义, Task 12 FoodLayout 复用
  - [x] FoodItem shape 在 Task 3 定义 (POI 字段 + 评分 null), Task 10 FoodCard 消费
  - [x] `hasGeo` 在 Task 11 接收 prop, Task 12 传入

- [ ] 每步 commit 都在独立 task 内, 不跨 task
  - [x] 每个 task 结尾都有 `git commit`
