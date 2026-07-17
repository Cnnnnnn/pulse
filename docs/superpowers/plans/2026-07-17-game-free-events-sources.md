# 游戏免费活动多数据源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将游戏页的“喜+1”扩展为 Epic、Steam、Xbox 多来源“免费活动”，准确区分永久入库、Key、免费周末和 Xbox 限时试玩，并扩展后台通知。

**Architecture:** 每个平台保留独立 fetcher，统一映射到扩展后的 `GameDeal`。聚合层只负责按平台分派、失败隔离和结束时间排序；渲染层通过统一活动类型显示标签，调度器请求 `platform=all, mode=free`。

**Tech Stack:** CommonJS、JavaScript、Preact Signals、Vitest、现有 `fetchJson`

## Global Constraints

- 不新增运行时依赖或第三方托管服务。
- Epic 使用现有官方 `freeGamesPromotions`。
- Steam 使用 GamerPower，并展示数据署名。
- Xbox Free Play Days 明确标记“限时试玩 / 需 Game Pass”。
- PlayStation、Switch 的免费活动本轮返回空列表，不使用示例数据。
- 免费活动只按稳定 ID 去重，同一游戏在不同平台分别保留。
- 热门 Top10 行为不变。
- 未经用户明确要求，不创建 Git commit。

---

### Task 1: 扩展统一活动数据模型

**Files:**
- Modify: `tests/main/games/normalize.test.js`
- Modify: `tests/main/games/aggregator.test.js`
- Modify: `src/main/games/normalize.js`
- Modify: `src/main/games/epic.js`

**Interfaces:**
- Produces: `GameDeal.promotionType`, `GameDeal.requirements`, `GameDeal.provider`
- Valid promotion types: `giveaway | key | free-weekend | free-play-days`

- [ ] **Step 1: 写入失败测试**

在 `tests/main/games/normalize.test.js` 的字段映射分组中加入：

```js
it("保留合法免费活动元数据并拒绝未知类型", () => {
  const deal = toGameDeal({
    promotionType: "key",
    requirements: "领取后激活",
    provider: "gamerpower",
  });

  expect(deal.promotionType).toBe("key");
  expect(deal.requirements).toBe("领取后激活");
  expect(deal.provider).toBe("gamerpower");
  expect(toGameDeal({ promotionType: "unknown" }).promotionType).toBeNull();
});
```

在 `tests/main/games/aggregator.test.js` 的 free 分组中加入：

```js
it("Epic 免费活动包含统一活动元数据", async () => {
  const res = await getGameDeals({ platform: "epic", mode: "free" });
  expect(res.items[0]).toMatchObject({
    promotionType: "giveaway",
    requirements: "活动期间可免费入库",
    provider: "epic",
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/normalize.test.js tests/main/games/aggregator.test.js -t "免费活动元数据|Epic 免费活动"`

Expected: FAIL，新增字段为 `undefined`。

- [ ] **Step 3: 实现字段校验与默认值**

在 `src/main/games/normalize.js` 顶层加入：

```js
const PROMOTION_TYPES = new Set([
  "giveaway",
  "key",
  "free-weekend",
  "free-play-days",
]);
```

在 `toGameDeal()` 返回值中加入：

```js
promotionType: PROMOTION_TYPES.has(raw.promotionType)
  ? raw.promotionType
  : null,
requirements:
  typeof raw.requirements === "string" && raw.requirements.trim()
    ? raw.requirements.trim()
    : null,
provider:
  typeof raw.provider === "string" && raw.provider.trim()
    ? raw.provider.trim()
    : null,
```

将 Epic 免费活动的 `toGameDeal()` 参数补充为：

```js
promotionType: "giveaway",
requirements: "活动期间可免费入库",
provider: "epic",
```

- [ ] **Step 4: 运行规范化与聚合测试**

Run: `npx vitest run tests/main/games/normalize.test.js tests/main/games/aggregator.test.js`

Expected: PASS。

---

### Task 2: 接入 Steam GamerPower 免费活动

**Files:**
- Create: `src/main/games/steam-free.js`
- Create: `tests/main/games/steam-free.test.js`

**Interfaces:**
- Produces: `fetchSteamFree(): Promise<GameDeal[]>`
- Produces: `classifySteamPromotion(item): promotionType`

- [ ] **Step 1: 写入 fetcher 失败测试**

创建 `tests/main/games/steam-free.test.js`，覆盖三种分类、日期和无效响应：

```js
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  classifySteamPromotion,
  fetchSteamFree,
} = require("../../../src/main/games/steam-free.js");

afterEach(() => vi.restoreAllMocks());

describe("classifySteamPromotion", () => {
  it.each([
    [{ title: "Game Steam Key Giveaway" }, "key"],
    [{ description: "Play for free this weekend" }, "free-weekend"],
    [{ title: "Game (Steam) Giveaway" }, "giveaway"],
  ])("分类 %#", (item, expected) => {
    expect(classifySteamPromotion(item)).toBe(expected);
  });
});

describe("fetchSteamFree", () => {
  it("映射 GamerPower 活动", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        id: 42,
        title: "Example Steam Key Giveaway",
        worth: "$9.99",
        thumbnail: "https://img/example.jpg",
        open_giveaway_url: "https://example.test/claim",
        instructions: "Earn points, then reveal the key.",
        end_date: "2026-07-20 12:00:00",
        users: 123,
      }],
    })));

    const [item] = await fetchSteamFree();
    expect(item).toMatchObject({
      id: "steam-free-42",
      platform: "steam",
      isFree: true,
      promotionType: "key",
      provider: "gamerpower",
      normalPrice: 9.99,
      dealUrl: "https://example.test/claim",
    });
    expect(item.freeUntil).toBe("2026-07-20T12:00:00.000Z");
  });

  it("非数组响应返回空列表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ status: 201 }),
    })));
    await expect(fetchSteamFree()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/steam-free.test.js`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现最小 Steam fetcher**

创建 `src/main/games/steam-free.js`：

```js
const { fetchJson, toGameDeal } = require("./normalize");

const GAMERPOWER_URL =
  "https://www.gamerpower.com/api/giveaways?platform=steam&type=game";

function classifySteamPromotion(item) {
  const text = [
    item && item.title,
    item && item.description,
    item && item.instructions,
  ].filter(Boolean).join(" ").toLowerCase();
  // ponytail: 上游没有结构化活动类型；文案启发式的升级路径是直接映射未来字段。
  if (/\bkey\b|activate a product|reveal the key/.test(text)) return "key";
  if (/free weekend|play for free|free access/.test(text)) return "free-weekend";
  return "giveaway";
}

function parseEndDate(value) {
  if (!value || value === "N/A") return null;
  const ms = Date.parse(String(value).replace(" ", "T") + "Z");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function requirementsFor(type, item) {
  if (type === "key") {
    return item.instructions || "需按活动页说明领取，Key 数量可能有限";
  }
  if (type === "free-weekend") return "限时免费游玩，不会永久入库";
  return "活动期间可免费入库";
}

async function fetchSteamFree() {
  const data = await fetchJson(GAMERPOWER_URL, { timeoutMs: 9000 });
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const promotionType = classifySteamPromotion(item);
    return toGameDeal({
      id: `steam-free-${item.id}`,
      platform: "steam",
      title: item.title,
      thumb: item.thumbnail || item.image || null,
      salePrice: 0,
      normalPrice: Number(String(item.worth || "").replace(/[^0-9.]/g, "")) || null,
      savings: 100,
      currency: "USD",
      dealUrl: item.open_giveaway_url || item.open_giveaway || null,
      isFree: true,
      freeUntil: parseEndDate(item.end_date),
      store: "Steam",
      source: "live",
      popular: Number(item.users) || 0,
      promotionType,
      requirements: requirementsFor(promotionType, item),
      provider: "gamerpower",
    });
  });
}

module.exports = { classifySteamPromotion, fetchSteamFree };
```

- [ ] **Step 4: 运行 Steam fetcher 测试**

Run: `npx vitest run tests/main/games/steam-free.test.js`

Expected: PASS。

---

### Task 3: 接入 Xbox Free Play Days

**Files:**
- Create: `src/main/games/xbox-free.js`
- Create: `tests/main/games/xbox-free.test.js`

**Interfaces:**
- Produces: `fetchXboxFree({market?, language?}): Promise<GameDeal[]>`

- [ ] **Step 1: 写入 Xbox 映射与失败回退测试**

创建 `tests/main/games/xbox-free.test.js`：

```js
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchXboxFree } = require("../../../src/main/games/xbox-free.js");

afterEach(() => vi.restoreAllMocks());

describe("fetchXboxFree", () => {
  it("把 Free Play Days 商品映射为限时试玩", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Items: [{ Id: "9TEST" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Products: [{
            ProductId: "9TEST",
            LocalizedProperties: [{
              ProductTitle: "Xbox Test Game",
              Images: [{ ImagePurpose: "Poster", Uri: "//img/test.jpg" }],
            }],
            DisplaySkuAvailabilities: [{
              Availabilities: [{
                Conditions: { EndDate: "2026-07-20T00:00:00Z" },
                OrderManagementData: { Price: { MSRP: 59.99 } },
              }],
            }],
          }],
        }),
      }));

    const [item] = await fetchXboxFree();
    expect(item).toMatchObject({
      id: "xbox-free-9TEST",
      platform: "xbox",
      isFree: true,
      promotionType: "free-play-days",
      requirements: "需 Game Pass，活动期间限时试玩",
      provider: "microsoft",
    });
    expect(item.thumb).toBe("https://img/test.jpg");
  });

  it("上游失败时返回空列表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/xbox-free.test.js`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现 Xbox 两段式请求**

创建 `src/main/games/xbox-free.js`：

```js
const { fetchJson, toGameDeal } = require("./normalize");

const LIST_BASE =
  "https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/collection/FreePlayDays";
const CATALOG_BASE = "https://displaycatalog.mp.microsoft.com/v7.0/products";

function imageUrl(images) {
  const image = Array.isArray(images)
    ? images.find((item) => item.ImagePurpose === "Poster") || images[0]
    : null;
  if (!image || !image.Uri) return null;
  return image.Uri.startsWith("//") ? `https:${image.Uri}` : image.Uri;
}

async function fetchXboxFree(opts = {}) {
  const market = opts.market || "US";
  const language = opts.language || "en-US";
  try {
    const listUrl = new URL(LIST_BASE);
    listUrl.search = new URLSearchParams({
      market,
      language,
      itemTypes: "Game",
      deviceFamily: "Windows.Xbox",
      count: "50",
      skipItems: "0",
    });
    const list = await fetchJson(listUrl.toString(), {
      timeoutMs: 9000,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    const ids = Array.isArray(list && list.Items)
      ? list.Items.map((item) => item.Id).filter(Boolean)
      : [];
    if (ids.length === 0) return [];

    const catalogUrl = new URL(CATALOG_BASE);
    catalogUrl.search = new URLSearchParams({
      bigIds: ids.join(","),
      market,
      languages: language,
    });
    const catalog = await fetchJson(catalogUrl.toString(), {
      timeoutMs: 9000,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    const products = Array.isArray(catalog && catalog.Products)
      ? catalog.Products
      : [];

    return products.map((product) => {
      const localized = product.LocalizedProperties && product.LocalizedProperties[0] || {};
      const availability =
        product.DisplaySkuAvailabilities &&
        product.DisplaySkuAvailabilities[0] &&
        product.DisplaySkuAvailabilities[0].Availabilities &&
        product.DisplaySkuAvailabilities[0].Availabilities[0] || {};
      const price = availability.OrderManagementData &&
        availability.OrderManagementData.Price || {};
      return toGameDeal({
        id: `xbox-free-${product.ProductId}`,
        platform: "xbox",
        title: localized.ProductTitle || localized.ShortTitle || "Xbox 免费试玩",
        thumb: imageUrl(localized.Images),
        salePrice: 0,
        normalPrice: Number(price.MSRP) || null,
        savings: 100,
        currency: price.CurrencyCode || "USD",
        dealUrl: `https://www.microsoft.com/store/productId/${product.ProductId}`,
        isFree: true,
        freeUntil: availability.Conditions && availability.Conditions.EndDate || null,
        store: "Microsoft Store",
        source: "live",
        promotionType: "free-play-days",
        requirements: "需 Game Pass，活动期间限时试玩",
        provider: "microsoft",
      });
    });
  } catch {
    return [];
  }
}

module.exports = { fetchXboxFree };
```

- [ ] **Step 4: 运行 Xbox 测试**

Run: `npx vitest run tests/main/games/xbox-free.test.js`

Expected: PASS。

---

### Task 4: 聚合免费活动并隔离失败

**Files:**
- Modify: `src/main/games/aggregator.js`
- Modify: `tests/main/games/aggregator.test.js`

**Interfaces:**
- Consumes: `fetchSteamFree()`, `fetchXboxFree()`
- Produces: `getGameDeals({platform, mode:"free"})`

- [ ] **Step 1: 扩展聚合测试 fetch stub 与断言**

在 `tests/main/games/aggregator.test.js` 中为 GamerPower、Xbox 列表和 Catalog 加固定响应，并将 free 分组扩展为：

```js
it("聚合 Epic、Steam、Xbox，且 PS/Switch 不返回示例活动", async () => {
  const all = await getGameDeals({ platform: "all", mode: "free" });
  expect(new Set(all.items.map((item) => item.platform))).toEqual(
    new Set(["steam", "epic", "xbox"]),
  );
  expect(all.items.every((item) => item.source === "live")).toBe(true);
});

it("同名跨平台免费活动分别保留，并按结束时间排序", async () => {
  const all = await getGameDeals({ platform: "all", mode: "free" });
  const sameTitle = all.items.filter((item) => item.title === "Death Stranding");
  expect(sameTitle).toHaveLength(2);
  const times = all.items.map((item) =>
    item.freeUntil ? Date.parse(item.freeUntil) : Infinity,
  );
  expect(times).toEqual([...times].sort((a, b) => a - b));
});
```

- [ ] **Step 2: 运行聚合测试确认失败**

Run: `npx vitest run tests/main/games/aggregator.test.js -t "聚合 Epic|同名跨平台"`

Expected: FAIL，Steam/Xbox 尚未接入且免费活动仍按标题去重。

- [ ] **Step 3: 修改平台分派**

在 `src/main/games/aggregator.js` 顶部导入：

```js
const { fetchSteamFree } = require("./steam-free");
const { fetchXboxFree } = require("./xbox-free");
```

将 Steam 分支改为：

```js
if (platform === "steam") {
  const items = mode === "free"
    ? await fetchSteamFree()
    : await fetchSteamDeals({ sort, pageSize: 40, minSavings });
  return { items, source: "live" };
}
```

在主机分派前加入：

```js
if (platform === "xbox" && mode === "free") {
  const items = await fetchXboxFree({ market: "US", language: "en-US" });
  return { items, source: "live" };
}
if (mode === "free" && (platform === "playstation" || platform === "switch")) {
  return { items: [], source: "live" };
}
```

在 `fetchPlatform()` 的 `catch` 开头加入：

```js
if (mode === "free") return { items: [], source: "live" };
```

- [ ] **Step 4: 免费模式跳过标题去重并按结束时间排序**

将跨平台标题去重改为仅非免费模式执行：

```js
if (mode === "free") {
  items = deduped;
} else {
  const byTitle = new Map();
  for (const it of deduped) {
    const key = normalizeTitle(it.title);
    const prev = byTitle.get(key);
    if (!prev || betterDeal(it, prev)) byTitle.set(key, it);
  }
  items = [...byTitle.values()];
}
```

将 free 分支改为：

```js
if (mode === "free") {
  items = items
    .filter((it) => it.isFree)
    .sort((a, b) => {
      const aEnd = a.freeUntil ? Date.parse(a.freeUntil) : Infinity;
      const bEnd = b.freeUntil ? Date.parse(b.freeUntil) : Infinity;
      return aEnd - bEnd;
    });
}
```

- [ ] **Step 5: 运行全部 games main 测试**

Run: `npx vitest run tests/main/games`

Expected: PASS。

---

### Task 5: 更新免费活动界面与 GamerPower 署名

**Files:**
- Modify: `src/renderer/games/gamesStore.js`
- Modify: `src/renderer/games/format.js`
- Modify: `src/renderer/games/GameCard.jsx`
- Modify: `src/renderer/games/TopRanking.jsx`
- Modify: `src/renderer/games/GamesPage.jsx`
- Modify: `src/renderer/games/GamesFilterBar.jsx`
- Modify: `src/renderer/components/HomeGrid.jsx`
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `tests/renderer/games-store.test.js`
- Create: `tests/renderer/GameCard-free-events.test.jsx`

**Interfaces:**
- Produces: `promotionTypeLabel(type)`
- Produces: `hasGamerPowerAttribution()`

- [ ] **Step 1: 写入 store 与卡片失败测试**

在 `tests/renderer/games-store.test.js` 中断言：

```js
// 在文件顶部现有 gamesStore.js import 列表中加入 MODES。

expect(MODES.find((mode) => mode.key === "free")?.label).toBe("免费活动");
```

创建 `tests/renderer/GameCard-free-events.test.jsx`：

```jsx
// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { GameCard } from "../../src/renderer/games/GameCard.jsx";

describe("GameCard 免费活动", () => {
  it("展示活动类型与领取条件", () => {
    render(<GameCard game={{
      id: "x",
      title: "Test",
      platform: "xbox",
      isFree: true,
      promotionType: "free-play-days",
      requirements: "需 Game Pass，活动期间限时试玩",
    }} />);

    expect(screen.getByText("限时试玩")).toBeTruthy();
    expect(screen.getByText("需 Game Pass，活动期间限时试玩")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/games-store.test.js tests/renderer/GameCard-free-events.test.jsx`

Expected: FAIL，旧标签和旧卡片文案仍存在。

- [ ] **Step 3: 增加统一展示标签与署名判断**

在 `src/renderer/games/format.js` 加入：

```js
const PROMOTION_LABELS = {
  giveaway: "免费入库",
  key: "Key 赠送",
  "free-weekend": "免费周末",
  "free-play-days": "限时试玩",
};

export function promotionTypeLabel(type) {
  return PROMOTION_LABELS[type] || "免费活动";
}
```

在 `gamesStore.js` 中把 mode 标签改为：

```js
{ key: "free", label: "免费活动" },
```

并新增：

```js
export function hasGamerPowerAttribution() {
  return items.value.some((item) => item.provider === "gamerpower");
}
```

- [ ] **Step 4: 更新卡片和页面署名**

`GameCard.jsx` 导入 `promotionTypeLabel`，将免费标签改为：

```jsx
<span class="game-card__free-tag">
  {promotionTypeLabel(game.promotionType)}
</span>
```

在结束时间后加入：

```jsx
{isFree && game.requirements && (
  <div class="game-card__free-until">{game.requirements}</div>
)}
```

`GamesPage.jsx` 引入 `hasGamerPowerAttribution()` 并加入：

```jsx
{hasGamerPowerAttribution() && (
  <footer class="games-attrib">
    Steam 活动数据由{" "}
    <a
      href="https://www.gamerpower.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      GamerPower
    </a>{" "}
    提供
  </footer>
)}
```

将 `TopRanking.jsx` 中免费标签改为“免费活动”。

- [ ] **Step 5: 更新所有用户可见旧文案**

将以下文件中的“喜+1”文案替换为“免费活动”，但不改变量名和 localStorage key：

- `src/renderer/games/GamesPage.jsx`
- `src/renderer/games/GamesFilterBar.jsx`
- `src/renderer/components/HomeGrid.jsx`
- `src/renderer/components/SideNav.jsx`
- `src/renderer/games/GamesLayout.jsx`
- `src/renderer/api.js`

- [ ] **Step 6: 运行 renderer 聚焦测试**

Run: `npx vitest run tests/renderer/games-store.test.js tests/renderer/GameCard-free-events.test.jsx`

Expected: PASS。

---

### Task 6: 扩展后台检查与通知

**Files:**
- Modify: `src/renderer/games/games-check-scheduler.js`
- Modify: `src/renderer/games/gamesStore.js`
- Modify: `src/renderer/games/GamesLayout.jsx`
- Modify: `src/renderer/components/SettingsPage.jsx`
- Create: `tests/renderer/games-check-scheduler.test.js`

**Interfaces:**
- Consumes: `api.getGameDeals({platform:"all", mode:"free"})`
- Produces: 跨平台免费活动通知与免费标签跳转

- [ ] **Step 1: 写入调度器失败测试**

创建 `tests/renderer/games-check-scheduler.test.js`，至少覆盖：

```js
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGameDealsMock, notificationMock } = vi.hoisted(() => ({
  getGameDealsMock: vi.fn(),
  notificationMock: vi.fn(),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: getGameDealsMock },
}));

globalThis.Notification = notificationMock;
Notification.permission = "granted";
Notification.requestPermission = vi.fn(async () => "granted");

import {
  activeMode,
  gamesNotifyOnFree,
} from "../../src/renderer/games/gamesStore.js";
import { createGamesCheckScheduler } from "../../src/renderer/games/games-check-scheduler.js";

beforeEach(() => {
  localStorage.clear();
  getGameDealsMock.mockReset();
  notificationMock.mockReset();
  gamesNotifyOnFree.value = true;
  activeMode.value = "deals";
});

describe("games check scheduler", () => {
  it("检查全部平台并按稳定 ID 去重通知", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "steam-free-1",
        title: "Steam Test",
        platform: "steam",
        promotionType: "key",
      }],
    });
    const scheduler = createGamesCheckScheduler();
    await scheduler.checkOnce();
    await scheduler.checkOnce();

    expect(getGameDealsMock).toHaveBeenCalledWith({
      platform: "all",
      mode: "free",
    });
    expect(notificationMock).toHaveBeenCalledTimes(1);
    expect(notificationMock.mock.calls[0][0]).toBe("游戏免费活动 · 发现新活动");
  });

  it("点击通知切到游戏页免费活动标签", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "xbox-free-1",
        title: "Xbox Test",
        platform: "xbox",
        promotionType: "free-play-days",
      }],
    });
    const notice = {};
    notificationMock.mockImplementation(() => notice);
    await createGamesCheckScheduler().checkOnce();
    notice.onclick();
    expect(activeMode.value).toBe("free");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/games-check-scheduler.test.js`

Expected: FAIL，调度器仍只请求 Epic 且点击不切 mode。

- [ ] **Step 3: 修改请求、通知与点击跳转**

调度器请求改为：

```js
const res = await api.getGameDeals({ platform: "all", mode: "free" });
```

从 `gamesStore.js` 导入 `setMode`，并在通知点击中调用：

```js
setActiveNav("games");
setMode("free");
```

通知标题改为：

```js
new Notification("游戏免费活动 · 发现新活动", {
  body,
  silent: false,
});
```

单条通知正文使用平台和活动类型：

```js
const body =
  count === 1
    ? `${PLATFORM_LABEL[fresh[0].platform] || fresh[0].platform} · ${
        promotionTypeLabel(fresh[0].promotionType)
      }：${fresh[0].title}`
    : `发现 ${count} 个游戏免费活动（${titles.join("、")} 等）`;
```

- [ ] **Step 4: 更新设置页和内部注释**

将 `SettingsPage.jsx` 的游戏设置文案改为：

```jsx
<h3 class="settings-card__title">免费活动自动检查</h3>
<p class="settings-row__hint" style="margin:0 0 12px">
  在应用运行时定时检查 Epic、Steam 和 Xbox 免费活动，发现新活动时弹桌面通知。
  <b>仅在应用开着时检查</b>，关闭应用不会后台运行。
</p>
```

并把相关标签改为“自动检查免费活动”“各平台活动更新时间不同”“发现新免费活动时桌面通知”。同步更新 `gamesStore.js`、`GamesLayout.jsx` 和调度器注释中的旧 Epic/喜+1描述。

- [ ] **Step 5: 运行调度器与设置页测试**

Run: `npx vitest run tests/renderer/games-check-scheduler.test.js tests/renderer/SettingsPage.test.jsx`

Expected: PASS。

---

### Task 7: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行所有游戏相关测试**

Run: `npx vitest run tests/main/games tests/renderer/games-store.test.js tests/renderer/GameCard-free-events.test.jsx tests/renderer/games-check-scheduler.test.js`

Expected: PASS。

- [ ] **Step 2: 运行完整测试**

Run: `npx vitest run`

Expected: PASS，0 failures。

- [ ] **Step 3: 构建 renderer**

Run: `npm run build:renderer`

Expected: 构建成功，退出码 0。

- [ ] **Step 4: 检查改动边界**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；状态只包含本计划列出的源文件、测试和文档。
