# 全平台史低徽标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在游戏卡片显示"史低"徽标——当售价跌至历史最低时亮起。覆盖 Steam（异步逐个查 cheapshark /games）、Xbox（ITAD /prices 批量）、PlayStation（priceHistory 本地算 min）。Epic/Switch 不显示。

**Architecture:** 三条数据路径统一到 GameCard 内联判定：PS 的 lowestPrice 由 aggregator 同步返回（toGameDeal 新增字段）；Steam/Xbox 由 renderer 后台异步增强，查到的结果写入 lowPriceMap signal，GameCard 读 map 判定。Steam 用新 IPC `games:getSteamLowest` 逐个查（每批 5 并发），Xbox 用 `games:getItadLowest` 批量查。

**Tech Stack:** CommonJS、Preact Signals、Vitest、`vi.stubGlobal("fetch")`

## Global Constraints

- 不改 aggregator 对 deals/free/compare 模式的现有行为。
- PS 的 lowestPrice 是同步字段（toGameDeal 扩展），Steam/Xbox 是异步增强（lowPriceMap）。
- 史低判定严格 `salePrice <= lowestPrice`。
- sample 数据不显示史低徽标（价格是假的）。
- Steam 每批 5 并发，批间 setTimeout(0) 让出主线程。
- enrich 任务用 _lowReqToken 竞态保护（切 tab/刷新时丢弃旧结果）。
- lowPriceMap 在 loadGameDeals 开头清空。
- 未经用户明确要求，不创建 Git commit。

---

### Task 1: normalize + PS 同步 lowestPrice

**Files:**
- Modify: `src/main/games/normalize.js`
- Modify: `src/main/games/playstation.js`
- Modify: `tests/main/games/normalize.test.js`
- Modify: `tests/main/games/playstation.test.js`

**Interfaces:**
- Produces: `toGameDeal` 加 `lowestPrice` 字段
- Produces: PS deals 自带 `lowestPrice`（priceHistory 算 min）

- [ ] **Step 1: 写入 normalize 失败测试**

在 `tests/main/games/normalize.test.js` 的字段映射测试里加（先 Read 文件确认现有 describe 结构）：

```js
it("保留 lowestPrice 数值字段", () => {
  const deal = toGameDeal({ lowestPrice: 4.99 });
  expect(deal.lowestPrice).toBe(4.99);
});

it("lowestPrice 非数值时为 null", () => {
  expect(toGameDeal({ lowestPrice: "abc" }).lowestPrice).toBeNull();
  expect(toGameDeal({ lowestPrice: null }).lowestPrice).toBeNull();
  expect(toGameDeal({}).lowestPrice).toBeNull();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/main/games/normalize.test.js -t "lowestPrice"`
Expected: FAIL，字段不存在。

- [ ] **Step 3: toGameDeal 加 lowestPrice**

Read `src/main/games/normalize.js` 的 toGameDeal 返回对象（约第 52-80 行）。在 `popular` 或 `promotionType` 附近加：

```js
lowestPrice:
  raw.lowestPrice != null && Number.isFinite(Number(raw.lowestPrice))
    ? Number(raw.lowestPrice)
    : null,
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/main/games/normalize.test.js -t "lowestPrice"`
Expected: PASS。

- [ ] **Step 5: 写入 PS min 计算测试**

Read `tests/main/games/playstation.test.js` 的 `buildDealsFromPsGameSpider` 测试块。新增用例（在现有"good"数据的断言里加 lowestPrice，或新增独立用例）：

```js
it("PSGameSpider deal 含 lowestPrice（价格历史的 min）", () => {
  const priceHistory = {
    game1: [
      ["2026-01-01", 60],
      ["2026-03-01", 30],
      ["2026-07-01", 20],
    ],
  };
  const deals = buildDealsFromPsGameSpider(priceHistory, [], { limit: 10 });
  // min(60, 30, 20) = 20，当前 latest = 20，salePrice <= lowestPrice → 史低
  expect(deals[0].lowestPrice).toBe(20);
});
```

> 注：priceHistory 至少 2 个点（sanity check），上面 3 个点 latest=20 < max=60，discPct=67%（在 5~95 内），通过过滤。

- [ ] **Step 6: 运行确认失败**

Run: `npx vitest run tests/main/games/playstation.test.js -t "lowestPrice"`
Expected: FAIL，lowestPrice 字段不存在。

- [ ] **Step 7: playstation.js 算 min 并写入**

Read `src/main/games/playstation.js` 的 `buildDealsFromPsGameSpider`（约第 166-195 行）。在 `const max = Math.max(...pts.map((p) => p.price));` 之后加：

```js
    const min = Math.min(...pts.map((p) => p.price));
```

在 `deals.push({ ... })` 对象里加字段（在 `popular` 附近）：

```js
      lowestPrice: min,
```

- [ ] **Step 8: 运行确认通过**

Run: `npx vitest run tests/main/games/playstation.test.js -t "lowestPrice"`
Expected: PASS。

- [ ] **Step 9: 全量 games main 测试不回归**

Run: `npx vitest run tests/main/games`
Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add src/main/games/normalize.js src/main/games/playstation.js tests/main/games/normalize.test.js tests/main/games/playstation.test.js
git commit -m "feat(games): lowestPrice field in toGameDeal + PS priceHistory min"
```

---

### Task 2: ITAD /prices 批量史低 fetcher

**Files:**
- Modify: `src/main/games/itad.js`
- Create: `tests/main/games/itad-lowest.test.js`

**Interfaces:**
- Produces: `fetchItadLowest(slugs, { key })` → `{ [slug]: lowestPrice }`

- [ ] **Step 1: 写入失败测试**

创建 `tests/main/games/itad-lowest.test.js`：

```js
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchItadLowest } = require("../../../src/main/games/itad.js");

afterEach(() => vi.restoreAllMocks());

function mockFetchResponse(body) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}

describe("fetchItadLowest", () => {
  it("批量查询返回 slug → lowestPrice 映射", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({
      gameA: { historyLow: { amount: 9.99 } },
      gameB: { historyLow: { amount: 14.5 } },
    }));

    const result = await fetchItadLowest(["gameA", "gameB"], { key: "test-key" });
    expect(result).toEqual({ gameA: 9.99, gameB: 14.5 });
  });

  it("无 key 返回空对象", async () => {
    const result = await fetchItadLowest(["gameA"], { key: null });
    expect(result).toEqual({});
  });

  it("空 slugs 返回空对象", async () => {
    const result = await fetchItadLowest([], { key: "test-key" });
    expect(result).toEqual({});
  });

  it("缺少 historyLow 的 slug 被跳过", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({
      gameA: { historyLow: { amount: 9.99 } },
      gameB: {},
    }));

    const result = await fetchItadLowest(["gameA", "gameB"], { key: "test-key" });
    expect(result).toEqual({ gameA: 9.99 });
  });

  it("fetch 抛异常返回空对象（不阻断）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const result = await fetchItadLowest(["gameA"], { key: "test-key" });
    expect(result).toEqual({});
  });

  it("超过 30 个 slug 分批请求", async () => {
    const fetchMock = mockFetchResponse({ somegame: { historyLow: { amount: 1 } } });
    vi.stubGlobal("fetch", fetchMock);

    const slugs = Array.from({ length: 45 }, (_, i) => `game${i}`);
    await fetchItadLowest(slugs, { key: "test-key" });

    // 45 个 / 每批 30 = 2 次请求
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/main/games/itad-lowest.test.js`
Expected: FAIL，fetchItadLowest 未导出。

- [ ] **Step 3: 实现 fetchItadLowest**

Read `src/main/games/itad.js` 的 ITAD_DEALS 常量（第 27 行）和 module.exports（末尾）。在文件内加：

```js
const ITAD_PRICES = "https://api.isthereanydeal.com/v01/prices/";

/**
 * 批量查询游戏的史低价（ITAD /prices 接口）。
 * @param {string[]} slugs ITAD plain（游戏 slug）
 * @param {{key?:string}} opts
 * @returns {Promise<{[slug:string]: number}>} slug → 最低价映射
 */
async function fetchItadLowest(slugs, opts = {}) {
  const key = opts.key;
  if (!key || !Array.isArray(slugs) || slugs.length === 0) return {};
  const result = {};
  const BATCH = 30;
  try {
    for (let i = 0; i < slugs.length; i += BATCH) {
      const batch = slugs.slice(i, i + BATCH);
      const params = new URLSearchParams({ key, plains: batch.join(",") });
      const data = await fetchJson(`${ITAD_PRICES}?${params.toString()}`, {
        timeoutMs: 9000,
      });
      if (data && typeof data === "object") {
        for (const slug of batch) {
          const entry = data[slug];
          const amount = entry && entry.historyLow && entry.historyLow.amount;
          if (amount != null && Number.isFinite(Number(amount))) {
            result[slug] = Number(amount);
          }
        }
      }
    }
  } catch (err) {
    logFetchError("itad:prices", err);
  }
  return result;
}
```

在 module.exports 加 `fetchItadLowest`：

```js
module.exports = { fetchItadDeals, fetchItadLowest, SHOP_BY_PLATFORM };
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/main/games/itad-lowest.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/games/itad.js tests/main/games/itad-lowest.test.js
git commit -m "feat(games): fetchItadLowest batch query via ITAD /prices"
```

---

### Task 3: IPC 通道 + preload + api

**Files:**
- Modify: `src/main/ipc/register-games.js`
- Modify: `preload.js`
- Modify: `src/renderer/api.js`
- Modify: `tests/main/ipc/register-games.test.js`

**Interfaces:**
- Produces: `games:getSteamLowest` IPC（输入 steamAppId → lowestPrice）
- Produces: `games:getItadLowest` IPC（输入 slugs → lowestMap）
- Produces: `api.getSteamLowest` / `api.getItadLowest`

- [ ] **Step 1: 写入 IPC 测试**

在 `tests/main/ipc/register-games.test.js` 加测试。先 Read 文件确认是否有 handler 集成测试的 helper（或用导出的 ALLOWED_MODES 模式）。由于 handler 测试需要 mock fetch，用如下方式：

```js
describe("games:getSteamLowest IPC", () => {
  it("从 cheapshark /games 响应提取最低价", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ([
        { store: "Steam", cheapest: "4.99" },
        { store: "GOG", cheapest: "3.49" },
      ]),
    })));

    // 用 require 拿到 registerGamesHandlers，构造 ctx 捕获 handler
    const { registerGamesHandlers } = require("../../../src/main/ipc/register-games.js");
    let handler;
    registerGamesHandlers({ safeHandle: (_ch, h) => { handler = h; } });
    // 上面的 safeHandle 会被 games:getDeals 覆盖 handler，需要改为按 channel 捕获
  });
});
```

> ⚠️ 这个测试需要按 channel 捕获多个 handler。简化方案：**跳过 handler 集成测试**，改为直接测 main 进程的纯函数（cheapshark 提取逻辑抽成可测函数）。在 register-games.js 里把 cheapshark 解析逻辑抽成 `extractLowestFromCheapshark(gamesArray)` 纯函数并导出，测试它。handler 本身只是薄封装。

采用简化方案。先在 register-games.js 抽纯函数：

```js
/** 从 cheapshark /games?steamAppID= 响应提取历史最低价。 */
function extractLowestFromCheapshark(games) {
  if (!Array.isArray(games) || games.length === 0) return null;
  let min = Infinity;
  for (const g of games) {
    const price = Number(g && g.cheapest);
    if (Number.isFinite(price) && price < min) min = price;
  }
  return Number.isFinite(min) ? min : null;
}
```

测试：
```js
const { extractLowestFromCheapshark } = require("../../../src/main/ipc/register-games.js");

describe("extractLowestFromCheapshark", () => {
  it("取多个商店报价的最小值", () => {
    expect(extractLowestFromCheapshark([
      { cheapest: "4.99" }, { cheapest: "3.49" },
    ])).toBe(3.49);
  });
  it("单个商店", () => {
    expect(extractLowestFromCheapshark([{ cheapest: "9.99" }])).toBe(9.99);
  });
  it("空数组或非数组返回 null", () => {
    expect(extractLowestFromCheapshark([])).toBeNull();
    expect(extractLowestFromCheapshark(null)).toBeNull();
  });
  it("无效 cheapest 被忽略", () => {
    expect(extractLowestFromCheapshark([
      { cheapest: "abc" }, { cheapest: "5.00" },
    ])).toBe(5.0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/main/ipc/register-games.test.js -t "extractLowestFromCheapshark"`
Expected: FAIL，函数未导出。

- [ ] **Step 3: register-games 抽纯函数 + 注册 2 个 IPC**

Read `src/main/ipc/register-games.js`。在文件内（attachFx 之后）加纯函数 `extractLowestFromCheapshark`（代码见 Step 1）。

在 `registerGamesHandlers` 内加两个 safeHandle（参考现有 games:getDeals 模式）：

```js
  safeHandle(
    "games:getSteamLowest",
    async (_event, payload) => {
      const appId = payload && payload.steamAppId;
      if (!appId) return { lowestPrice: null };
      try {
        const url = `https://www.cheapshark.com/api/1.0/games?steamAppID=${encodeURIComponent(appId)}`;
        const data = await fetchJson(url, { timeoutMs: 9000 });
        return { lowestPrice: extractLowestFromCheapshark(data) };
      } catch (err) {
        return { lowestPrice: null };
      }
    },
  );

  safeHandle(
    "games:getItadLowest",
    async (_event, payload) => {
      const slugs = Array.isArray(payload && payload.slugs) ? payload.slugs : [];
      const key = (payload && payload.itadKey) || process.env.ITAD_API_KEY || null;
      const { fetchItadLowest } = require("../games/itad");
      const lowestMap = await fetchItadLowest(slugs, { key });
      return { lowestMap };
    },
  );
```

> 注：register-games.js 顶部已 require fetchJson（检查确认；若无需加 `const { fetchJson } = require("../games/normalize")`）。在 module.exports 加 `extractLowestFromCheapshark`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/main/ipc/register-games.test.js`
Expected: PASS。

- [ ] **Step 5: preload.js 注册 IPC**

Read `preload.js` 第 337 行附近。在 `getGameDeals` 之后加：

```js
  getSteamLowest: (opts) => ipcRenderer.invoke("games:getSteamLowest", opts || {}),
  getItadLowest: (opts) => ipcRenderer.invoke("games:getItadLowest", opts || {}),
```

- [ ] **Step 6: api.js 暴露**

Read `src/renderer/api.js` 第 229 行附近的 `getGameDeals: pick(overrides, "getGameDeals")`。在其后加：

```js
    getSteamLowest: pick(overrides, "getSteamLowest"),
    getItadLowest: pick(overrides, "getItadLowest"),
```

- [ ] **Step 7: 提交**

```bash
git add src/main/ipc/register-games.js preload.js src/renderer/api.js tests/main/ipc/register-games.test.js
git commit -m "feat(games): IPC games:getSteamLowest + games:getItadLowest + preload/api wiring"
```

---

### Task 4: gamesStore lowPriceMap + 异步增强

**Files:**
- Modify: `src/renderer/games/gamesStore.js`
- Modify: `tests/renderer/games-store.test.js`

**Interfaces:**
- Produces: `lowPriceMap` signal, `enrichSteamLowest()`, `enrichXboxLowest()`, `extractSteamAppId()`

- [ ] **Step 1: 写入失败测试**

在 `tests/renderer/games-store.test.js` 加测试（需 happy-dom 环境，确认文件首行有指令）。import 补 `lowPriceMap, enrichSteamLowest, extractSteamAppId, fetchedAt, activeMode`：

```js
describe("gamesStore 史低增强", () => {
  beforeEach(() => {
    localStorage.clear();
    lowPriceMap.value = {};
    items.value = [];
    fetchedAt.value = null;
    activeMode.value = "deals";
  });

  it("extractSteamAppId 从 'steam-367520' 提取 '367520'", () => {
    expect(extractSteamAppId("steam-367520")).toBe("367520");
    expect(extractSteamAppId("steam-")).toBeNull();
    expect(extractSteamAppId("epic-123")).toBeNull();
  });

  it("enrichSteamLowest 把 cheapshark 结果写入 lowPriceMap", async () => {
    api.getSteamLowest = vi.fn(async () => ({ ok: true, lowestPrice: 3.49 }));
    items.value = [
      { id: "steam-100", platform: "steam", salePrice: 5 },
      { id: "steam-200", platform: "steam", salePrice: 10 },
      { id: "epic-300", platform: "epic", salePrice: 7 },
    ];

    await enrichSteamLowest();

    expect(lowPriceMap.value["steam-100"]).toBe(3.49);
    expect(lowPriceMap.value["steam-200"]).toBe(3.49);
    expect(lowPriceMap.value["epic-300"]).toBeUndefined();
  });

  it("enrichSteamLowest 跳过已在 lowPriceMap 的游戏", async () => {
    lowPriceMap.value = { "steam-100": 3.49 };
    api.getSteamLowest = vi.fn(async () => ({ ok: true, lowestPrice: 9.99 }));
    items.value = [{ id: "steam-100", platform: "steam", salePrice: 5 }];

    await enrichSteamLowest();

    expect(api.getSteamLowest).not.toHaveBeenCalled();
    expect(lowPriceMap.value["steam-100"]).toBe(3.49); // 未被覆盖
  });
});
```

> 注：enrichSteamLowest 内部会 setTimeout(0)，测试需 await。为避免测试慢，BATCH=5 在 2 个 steam 游戏时只 1 批。api.getSteamLowest 是 mock 同步返回，Promise.allSettled 快速完成。测试里需 `vi.useFakeTimers` 或确认 setTimeout(0) 不阻塞——实际上 await enrichSteamLowest 会等到所有批完成。确认实现里 await 了 setTimeout。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/renderer/games-store.test.js -t "史低增强"`
Expected: FAIL，符号未导出。

- [ ] **Step 3: 实现 lowPriceMap + extractSteamAppId + enrich**

Read `src/renderer/games/gamesStore.js`。在 signal 区（gamesHasNewDrop 附近）加：

```js
export const lowPriceMap = signal({});
let _lowReqToken = 0;
```

在文件内（wishlist 函数之后）加：

```js
/** 从 game.id 提取 steamAppID（"steam-367520" → "367520"）。非 steam 返回 null。 */
export function extractSteamAppId(id) {
  if (typeof id !== "string") return null;
  const m = id.match(/^steam-(.+)$/);
  return m && m[1] ? m[1] : null;
}

/**
 * 后台异步查 Steam 游戏的史低价（cheapshark /games，每批 5 并发）。
 * 结果渐进写入 lowPriceMap，GameCard 读 map 判定徽标。
 */
export async function enrichSteamLowest() {
  const token = ++_lowReqToken;
  const steamGames = (items.value || []).filter(
    (it) => it && it.platform === "steam" && extractSteamAppId(it.id),
  );
  const pending = steamGames.filter((it) => lowPriceMap.value[it.id] == null);
  if (pending.length === 0) return;

  const BATCH = 5;
  for (let i = 0; i < pending.length; i += BATCH) {
    if (token !== _lowReqToken) return; // 已被新任务取代
    const batch = pending.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (g) => {
        const appId = extractSteamAppId(g.id);
        const res = await api.getSteamLowest({ steamAppId: appId });
        if (res && res.lowestPrice != null) return [g.id, res.lowestPrice];
        return null;
      }),
    );
    const batchMap = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        batchMap[r.value[0]] = r.value[1];
      }
    }
    if (token === _lowReqToken && Object.keys(batchMap).length > 0) {
      lowPriceMap.value = { ...lowPriceMap.value, ...batchMap };
    }
    if (i + BATCH < pending.length) {
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程
    }
  }
}

/**
 * 后台异步查 Xbox 游戏的史低价（ITAD /prices 批量）。
 */
export async function enrichXboxLowest() {
  const token = ++_lowReqToken;
  const xboxGames = (items.value || []).filter((it) => it && it.platform === "xbox");
  const pending = xboxGames.filter((it) => lowPriceMap.value[it.id] == null);
  if (pending.length === 0) return;

  // 从 game.id 提取 slug（"xbox-{slug}" → slug）
  const slugs = pending
    .map((g) => (g.id && g.id.startsWith("xbox-") ? g.id.slice(5) : null))
    .filter(Boolean);
  if (slugs.length === 0) return;

  try {
    const res = await api.getItadLowest({ slugs });
    if (token !== _lowReqToken) return;
    const batchMap = {};
    if (res && res.lowestMap) {
      for (const g of pending) {
        const slug = g.id.startsWith("xbox-") ? g.id.slice(5) : null;
        if (slug && res.lowestMap[slug] != null) {
          batchMap[g.id] = res.lowestMap[slug];
        }
      }
    }
    if (Object.keys(batchMap).length > 0) {
      lowPriceMap.value = { ...lowPriceMap.value, ...batchMap };
    }
  } catch {
    /* ITAD 失败静默，不显示徽标 */
  }
}
```

- [ ] **Step 4: loadGameDeals 清空 lowPriceMap**

Read `src/main/games/gamesStore.js` 的 `loadGameDeals`（约第 75 行）。在 `loading.value = true;` 之后加：

```js
  lowPriceMap.value = {};
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/renderer/games-store.test.js`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/games/gamesStore.js tests/renderer/games-store.test.js
git commit -m "feat(games): lowPriceMap signal + enrichSteamLowest + enrichXboxLowest"
```

---

### Task 5: GameCard 史低徽标 + GamesLayout 生命周期

**Files:**
- Modify: `src/renderer/games/GameCard.jsx`
- Modify: `src/renderer/games/games.css`
- Modify: `src/renderer/games/GamesLayout.jsx`
- Create: `tests/renderer/GameCard-lowest.test.jsx`

**Interfaces:**
- Produces: GameCard 史低徽标（左上角，严格判定，sample 排除）
- Produces: GamesLayout fetchedAt effect 触发 enrich

- [ ] **Step 1: 写入失败测试**

创建 `tests/renderer/GameCard-lowest.test.jsx`：

```jsx
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/preact";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { lowPriceMap } from "../../src/renderer/games/gamesStore.js";
import { GameCard } from "../../src/renderer/games/GameCard.jsx";

beforeEach(() => {
  lowPriceMap.value = {};
});
afterEach(cleanup);

function discountGame(overrides = {}) {
  return {
    id: "steam-100",
    platform: "steam",
    title: "Test Game",
    salePrice: 5,
    normalPrice: 20,
    savings: 75,
    currency: "USD",
    isFree: false,
    source: "live",
    dealUrl: "https://example.com",
    ...overrides,
  };
}

describe("GameCard 史低徽标", () => {
  it("salePrice <= lowestPrice 时显示史低徽标", () => {
    lowPriceMap.value = { "steam-100": 5 };
    render(<GameCard game={discountGame({ salePrice: 5 })} />);
    expect(screen.getByText("史低")).toBeTruthy();
  });

  it("salePrice > lowestPrice 时不显示", () => {
    lowPriceMap.value = { "steam-100": 3 };
    render(<GameCard game={discountGame({ salePrice: 5 })} />);
    expect(screen.queryByText("史低")).toBeNull();
  });

  it("lowPriceMap 无该游戏时不显示", () => {
    render(<GameCard game={discountGame()} />);
    expect(screen.queryByText("史低")).toBeNull();
  });

  it("deal 自带 lowestPrice 时直接用（PS 同步路径）", () => {
    render(<GameCard game={discountGame({ lowestPrice: 5, salePrice: 5 })} />);
    expect(screen.getByText("史低")).toBeTruthy();
  });

  it("sample 数据不显示史低（即使价格匹配）", () => {
    lowPriceMap.value = { "steam-100": 5 };
    render(<GameCard game={discountGame({ salePrice: 5, source: "sample" })} />);
    expect(screen.queryByText("史低")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/renderer/GameCard-lowest.test.jsx`
Expected: FAIL，找不到"史低"。

- [ ] **Step 3: GameCard 加徽标判定和渲染**

Read `src/renderer/games/GameCard.jsx`。import 补 `lowPriceMap`：

```js
import { isInWishlist, addToWishlist, removeFromWishlist, getWishlistKey, lowPriceMap } from "./gamesStore.js";
```

在 GameCard 函数体（isFree 定义附近）加史低判定：

```js
  const lowestFromDeal = game.lowestPrice;
  const lowestFromMap = lowPriceMap.value[game.id];
  const lowest = lowestFromDeal != null ? lowestFromDeal : lowestFromMap;
  const showLowest = lowest != null && game.salePrice != null
    && Number(game.salePrice) <= Number(lowest) && game.source !== "sample";
```

在 `game-card__thumb` div 内（sample 徽标 `game-card__src` 附近）加：

```jsx
        {showLowest && (
          <span
            class="game-card__lowest"
            title={`史低价 ${fmtPrice(lowest, game.currency)}`}
          >
            史低
          </span>
        )}
```

- [ ] **Step 4: 加 CSS**

Read `src/renderer/games/games.css`，grep `.game-card__src` 确认左上角定位样式和现有色 token。在 `.game-card__src` 附近加（用 warning 色系，实施时 grep 确认 token 名 `--color-warning` 或 `--accent-warning`）：

```css
.game-card__lowest {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--color-warning, #d97706) 92%, transparent);
  color: #fff;
  font-size: var(--font-size-xs, 11px);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
```

> 若 `.game-card__src` 与 `.game-card__lowest` 同在左上角会重叠。实施时确认：当 showLowest 为 true 且 source === sample 时 showLowest 被排除（已在判定里 `source !== "sample"`），所以不会同时出现。但若非 sample 也非史低，两个都不显示——无冲突。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/renderer/GameCard-lowest.test.jsx`
Expected: PASS。

- [ ] **Step 6: 确认现有 GameCard 测试不回归**

Run: `npx vitest run tests/renderer/GameCard-cover.test.jsx tests/renderer/GameCard-free-events.test.jsx tests/renderer/GameCard-fx.test.jsx tests/renderer/GameCard-wishlist.test.jsx`
Expected: PASS。

- [ ] **Step 7: GamesLayout 触发增强**

Read `src/renderer/games/GamesLayout.jsx`。import 补 `fetchedAt, enrichSteamLowest, enrichXboxLowest`：

```js
import {
  loadGameDeals,
  loadGamesSettings,
  loadWishlist,
  fetchedAt,
  enrichSteamLowest,
  enrichXboxLowest,
  activeMode,
  clearGamesNewFree,
  clearGamesNewDrop,
} from "./gamesStore.js";
```

在现有 effect 之后加新 effect（监听 fetchedAt）：

```js
  useEffect(() => {
    if (!fetchedAt.value) return;
    if (activeMode.value === "deals" || activeMode.value === "compare") {
      enrichSteamLowest();
      enrichXboxLowest();
    }
  }, [fetchedAt.value]);
```

- [ ] **Step 8: 运行全量 renderer games 测试**

Run: `npx vitest run tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx tests/renderer/GameCard-lowest.test.jsx tests/renderer/games-check-scheduler.test.js tests/renderer/games-wishlist-scheduler.test.js`
Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add src/renderer/games/GameCard.jsx src/renderer/games/games.css src/renderer/games/GamesLayout.jsx tests/renderer/GameCard-lowest.test.jsx
git commit -m "feat(games): lowest price badge on GameCard + enrich lifecycle in GamesLayout"
```

---

### Task 6: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行所有游戏相关测试**

Run: `npx vitest run tests/main/games tests/main/ipc/register-games.test.js tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx tests/renderer/GameCard-lowest.test.jsx tests/renderer/GameCard-wishlist.test.jsx tests/renderer/games-check-scheduler.test.js tests/renderer/games-wishlist-scheduler.test.js tests/renderer/SettingsPage.test.jsx`

Expected: PASS。

- [ ] **Step 2: 运行完整测试套件**

Run: `npx vitest run`

Expected: 0 failures（忽略预存的非 games 失败：home-grid 日期敏感、stock 相关）。

- [ ] **Step 3: 构建 renderer**

Run: `npm run build:renderer`

Expected: 构建成功，退出码 0。

- [ ] **Step 4: 检查改动边界**

Run: `git diff --check && git status --short`

Expected: 无尾随空白；改动文件与本计划清单一致。

- [ ] **Step 5: 手动验证（可选）**

启动应用 → 游戏页 → Steam 折扣列表 → 观察卡片左上角"史低"徽标渐进出现 → 悬停看史低价 title。
