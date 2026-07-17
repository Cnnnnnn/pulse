/**
 * tests/main/games/aggregator.test.js
 *
 * 覆盖 getGameDeals() 的聚合逻辑：去重（id + 跨平台标题）、兜底分支、sort 三分支。
 *
 * 策略：vi.stubGlobal("fetch") 拦截所有外部 API（CheapShark / Epic /
 * Algolia / ITAD / raw.githubusercontent），按 URL 返回固定假数据，
 * 让各 fetcher 正常跑解析逻辑，只隔离网络。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { getGameDeals } = require("../../../src/main/games/aggregator.js");

// ── 假数据：各平台 fetcher 期望的原始返回形状 ──────────────────────

// CheapShark /deals（Steam storeID=1 / Epic storeID=25）返回数组
const cheapsharkSteam = [
  { dealID: "s1", storeID: "1", title: "Hollow Knight", salePrice: 7.49, normalPrice: 14.99, savings: 50, dealRating: 90, steamAppID: "367520", steamRatingPercent: 90 },
  { dealID: "s2", storeID: "1", title: "Hollow Knight", salePrice: 9.99, normalPrice: 14.99, savings: 33, dealRating: 80, steamAppID: "367520" }, // 同名同平台，测 id 去重（dealID 不同但 steamAppID 同 → id 同）
  { dealID: "s3", storeID: "1", title: "Celeste", salePrice: 4.99, normalPrice: 19.99, savings: 75, dealRating: 95, steamAppID: "504230", steamRatingPercent: 95 },
  { dealID: "s4", storeID: "1", title: "Death Stranding", salePrice: 19.99, normalPrice: 39.99, savings: 50, dealRating: 88, steamAppID: "1190460" },
];
const cheapsharkEpic = [
  { dealID: "e1", storeID: "25", title: "Hollow Knight", salePrice: 7.49, normalPrice: 14.99, savings: 50, dealRating: 70 }, // 跨平台同名，测标题去重
  { dealID: "e2", storeID: "25", title: "Control", salePrice: 9.99, normalPrice: 39.99, savings: 75, dealRating: 85 },
];

// GamerPower Steam 免费活动
const gamerPowerSteam = [
  {
    id: 101,
    title: "Death Stranding",
    worth: "$39.99",
    thumbnail: "https://img/steam-ds.jpg",
    open_giveaway_url: "https://example.test/steam-ds",
    end_date: "2026-07-20 12:00:00",
    users: 500,
  },
];

// Xbox Free Play Days 列表 + Catalog
const xboxFreeList = { Items: [{ Id: "XBOX-FP" }, { Id: "XBOX-NO-END" }] };
const xboxFreeCatalog = {
  Products: [
    {
      ProductId: "XBOX-FP",
      LocalizedProperties: [{
        ProductTitle: "Forza Horizon 5",
        Images: [{ ImagePurpose: "Poster", Uri: "//img/forza.jpg" }],
      }],
      DisplaySkuAvailabilities: [{
        Availabilities: [{
          Conditions: { EndDate: "2026-07-25T00:00:00Z" },
          OrderManagementData: { Price: { MSRP: 59.99, CurrencyCode: "USD" } },
        }],
      }],
    },
    {
      ProductId: "XBOX-NO-END",
      LocalizedProperties: [{ ProductTitle: "Xbox No End Date" }],
      DisplaySkuAvailabilities: [{
        Availabilities: [{
          Conditions: {},
          OrderManagementData: { Price: { MSRP: 19.99, CurrencyCode: "USD" } },
        }],
      }],
    },
  ],
};

// Epic freeGamesPromotions 返回结构
const epicFree = {
  data: {
    Catalog: {
      searchStore: {
        elements: [
          {
            title: "Epic Invalid End Date",
            id: "invalid-end",
            catalogNs: { mappings: [{ pageSlug: "invalid-end" }] },
            promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "not-a-date" }] }] },
            price: { totalPrice: { originalPrice: 999, discountPrice: 0, currencyCode: "USD" } },
          },
          {
            title: "Death Stranding",
            id: "ds1",
            keyImages: [{ type: "Thumbnail", url: "https://img/ds.jpg" }],
            catalogNs: { mappings: [{ pageSlug: "death-stranding" }] },
            promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "2026-07-31T00:00:00Z" }] }] },
            price: { totalPrice: { originalPrice: 3999, discountPrice: 0, currencyCode: "USD" } },
          },
        ],
      },
    },
  },
};

// Switch Algolia 返回结构
const switchAlgolia = {
  hits: [
    { nsuid: "70010000001", objectID: "1", title: "Zelda", price: { finalPrice: 40, regPrice: 60, percentOff: 33 }, productImageSquare: "https://img/zelda.jpg", url: "/games/zelda" },
    { nsuid: "70010000002", objectID: "2", title: "Mario", price: { finalPrice: 30, regPrice: 60, percentOff: 50 }, productImageSquare: "https://img/mario.jpg", url: "/games/mario" },
    {
      nsuid: "70010000003",
      objectID: "3",
      title: "Free Weekend Game",
      price: { finalPrice: 0, regPrice: 20, percentOff: 100 },
      productImageSquare: "https://img/free.jpg",
      url: "/games/free-weekend-game",
    },
    {
      nsuid: "70010000004",
      objectID: "4",
      title: "Death Stranding",
      price: { finalPrice: 0, regPrice: 40, percentOff: 100 },
      productImageSquare: "https://img/death-stranding-free.jpg",
      url: "/games/death-stranding",
    },
  ],
  nbPages: 1,
};

// PSGameSpider priceHistory（raw.githubusercontent.com/.../en-us-priceHistory.json）
const psgsPriceHistory = {
  godofwar: [["2026-01-01", 60], ["2026-07-01", 20]],
  spiderman: [["2026-01-01", 50], ["2026-07-01", 25]],
};
const psgsMetaData = [
  { name: "godofwar", fullname: "God of War", path: "/product/gow" },
  { name: "spiderman", fullname: "Spider-Man", path: "/product/sm" },
];

// ── fetch stub：按 URL 分派 ────────────────────────────────────────

function makeFetchStub() {
  return vi.fn(async (url, opts) => {
    const u = String(url);
    const method = opts && opts.method ? opts.method : "GET";

    // CheapShark：按 storeID 区分 Steam(1)/Epic(25)
    if (u.includes("cheapshark.com")) {
      const isEpic = u.includes("storeID=25");
      return jsonOk(isEpic ? cheapsharkEpic : cheapsharkSteam);
    }
    // GamerPower Steam 免费活动
    if (u.includes("gamerpower.com")) {
      return jsonOk(gamerPowerSteam);
    }
    // Xbox Free Play Days 列表
    if (u.includes("reco-public.rec.mp.microsoft.com")) {
      return jsonOk(xboxFreeList);
    }
    // Xbox Display Catalog
    if (u.includes("displaycatalog.mp.microsoft.com")) {
      return jsonOk(xboxFreeCatalog);
    }
    // Epic freeGamesPromotions
    if (u.includes("epicgames.com/freeGamesPromotions")) {
      return jsonOk(epicFree);
    }
    // Switch Algolia（POST）
    if (u.includes("algolia.net") && method === "POST") {
      return jsonOk(switchAlgolia);
    }
    // PSGameSpider raw JSON
    if (u.includes("raw.githubusercontent.com") && u.includes("priceHistory.json")) {
      return textOk(JSON.stringify(psgsPriceHistory));
    }
    if (u.includes("raw.githubusercontent.com") && u.includes("metaData.json")) {
      return textOk(JSON.stringify(psgsMetaData));
    }
    // PS 官方商店 SSR 兜底（不应被触发，因为 PSGS 主源有数据）
    if (u.includes("store.playstation.com")) {
      return textOk("<div></div>");
    }
    // ITAD（未配 key，fetchItadDeals 返回 null 不会走到 fetch）
    if (u.includes("isthereanydeal.com")) {
      return jsonOk({ list: [] });
    }
    return jsonOk({});
  });
}

function jsonOk(data) {
  return Promise.resolve({ ok: true, status: 200, json: async () => data });
}
function textOk(text) {
  return Promise.resolve({ ok: true, status: 200, text: async () => text });
}

beforeEach(() => {
  vi.stubGlobal("fetch", makeFetchStub());
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ── 测试用例 ───────────────────────────────────────────────────────

describe("getGameDeals — 跨平台标题去重", () => {
  it("同款游戏在 Steam 和 Epic 都上架时，合并为一条（保留优惠最大的）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const hollows = res.items.filter((it) => it.title === "Hollow Knight");
    // Steam 50% + Epic 50%，savings 相同看 price，都是 7.49 → 合并成 1 条
    expect(hollows).toHaveLength(1);
  });

  it("同名免费项不应在去重时吞掉付费折扣", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const items = res.items.filter((it) => it.title === "Death Stranding");

    expect(items).toHaveLength(1);
    expect(items[0].platform).toBe("steam");
    expect(items[0].isFree).toBe(false);
  });

  it("同平台内重复（相同 steamAppID 不同 dealID）也被去重", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals" });
    const hollows = res.items.filter((it) => it.title === "Hollow Knight");
    expect(hollows).toHaveLength(1);
  });

  it("不同游戏不被错误合并", async () => {
    // 各平台独有的游戏应都在结果中
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const titles = res.items.map((it) => it.title);
    expect(titles).toContain("Celeste"); // Steam 独有
    expect(titles).toContain("Control"); // Epic 独有
    expect(titles).toContain("Zelda");   // Switch 独有
  });

  it("跨平台同名合并后，每个标题在结果中只出现一次", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
    const seen = new Set();
    for (const it of res.items) {
      const k = norm(it.title);
      // 不应出现重复 key（允许不同游戏，但同一标题归一化后不应撞）
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe("getGameDeals — mode=free 免费活动", () => {
  it("只返回 isFree 的条目", async () => {
    const res = await getGameDeals({ platform: "all", mode: "free" });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((it) => it.isFree)).toBe(true);
    expect(res.items.some((it) => it.title === "Death Stranding")).toBe(true);
  });
  it("Epic 免费活动包含统一活动元数据", async () => {
    const res = await getGameDeals({ platform: "epic", mode: "free" });
    const deathStranding = res.items.find((it) => it.title === "Death Stranding");
    expect(deathStranding).toMatchObject({
      promotionType: "giveaway",
      requirements: "活动期间可免费入库",
      provider: "epic",
    });
    const fetchCalls = globalThis.fetch.mock.calls.map(([url]) => String(url));
    expect(fetchCalls.some((url) => url.includes("cheapshark.com") && url.includes("storeID=25"))).toBe(false);
  });

  it("聚合 Epic、Steam、Xbox，且 PS/Switch 不返回示例活动", async () => {
    const all = await getGameDeals({ platform: "all", mode: "free" });
    expect(new Set(all.items.map((item) => item.platform))).toEqual(
      new Set(["steam", "epic", "xbox"]),
    );
    expect(all.items.every((item) => item.source === "live")).toBe(true);
    expect(all.sources.switch).toBe("live");
    expect(all.sources.playstation).toBe("live");
    expect(all.sources.xbox).toBe("live");
    expect(all.sources.steam).toBe("live");
    expect(Object.values(all.sources)).not.toContain("sample");
  });

  it("同名跨平台免费活动分别保留，非法或无结束日期均排在有效日期后", async () => {
    const all = await getGameDeals({ platform: "all", mode: "free" });
    const sameTitle = all.items.filter((item) => item.title === "Death Stranding");
    expect(sameTitle).toHaveLength(2);
    const sortTimes = all.items.map((item) => {
      const parsed = item.freeUntil ? Date.parse(item.freeUntil) : NaN;
      return Number.isFinite(parsed) ? parsed : Infinity;
    });
    expect(sortTimes).toEqual([...sortTimes].sort((a, b) => a - b));
    expect(all.items.slice(-2).map((item) => item.title)).toEqual(
      expect.arrayContaining(["Epic Invalid End Date", "Xbox No End Date"]),
    );
  });

  it("Steam 单源失败时不触发 sample 且其它平台仍可用", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const u = String(url);
      if (u.includes("gamerpower.com")) throw new Error("offline");
      return makeFetchStub()(url, opts);
    }));

    const all = await getGameDeals({ platform: "all", mode: "free" });
    expect(all.sources.steam).toBe("live");
    expect(all.sources.switch).toBe("live");
    expect(all.sources.playstation).toBe("live");
    expect(all.items.filter((it) => it.platform === "steam")).toHaveLength(0);
    expect(all.items.some((it) => it.platform === "epic")).toBe(true);
    expect(all.items.some((it) => it.platform === "xbox")).toBe(true);
    expect(all.items.every((it) => it.source === "live")).toBe(true);
    expect(Object.values(all.sources)).not.toContain("sample");
  });

  it("Xbox 单源失败时不触发 sample 且其它平台仍可用", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const u = String(url);
      if (u.includes("reco-public.rec.mp.microsoft.com")) {
        throw new Error("offline");
      }
      return makeFetchStub()(url, opts);
    }));

    const all = await getGameDeals({ platform: "all", mode: "free" });
    expect(all.sources.xbox).toBe("live");
    expect(all.sources.switch).toBe("live");
    expect(all.sources.playstation).toBe("live");
    expect(all.items.filter((it) => it.platform === "xbox")).toHaveLength(0);
    expect(all.items.some((it) => it.platform === "steam")).toBe(true);
    expect(all.items.some((it) => it.platform === "epic")).toBe(true);
    expect(all.items.every((it) => it.source === "live")).toBe(true);
    expect(Object.values(all.sources)).not.toContain("sample");
  });
});

describe("getGameDeals — mode=deals sort 三分支", () => {
  it("sort=savings 按折扣力度降序", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals", sort: "savings" });
    const savings = res.items.map((it) => it.savings);
    for (let i = 1; i < savings.length; i++) {
      expect(savings[i - 1]).toBeGreaterThanOrEqual(savings[i]);
    }
  });

  it("sort=price 按售价升序", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals", sort: "price" });
    const prices = res.items.map((it) => it.salePrice);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i - 1]).toBeLessThanOrEqual(prices[i]);
    }
  });

  it("sort=rating 按评分降序", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals", sort: "rating" });
    const ratings = res.items.map((it) => it.rating ?? -1);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i - 1]).toBeGreaterThanOrEqual(ratings[i]);
    }
  });

  it("排除 isFree 的免费活动条目", async () => {
    const res = await getGameDeals({
      platform: "switch",
      mode: "deals",
    });

    expect(res.items.some((item) => item.title === "Free Weekend Game")).toBe(false);
    expect(res.items.every((item) => item.isFree === false)).toBe(true);
  });
});

describe("getGameDeals — minSavings 门槛", () => {
  it("只保留 savings >= minSavings 的条目", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals", minSavings: 60 });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((it) => it.savings >= 60)).toBe(true);
  });
});

describe("getGameDeals — 返回结构", () => {
  it("包含 sources / psDriver / count / fetchedAt", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    expect(res.ok).toBe(true);
    expect(res.sources).toBeDefined();
    expect(typeof res.sources.steam).toBe("string");
    expect(res.count).toBe(res.items.length);
    expect(res.fetchedAt).toBeTruthy();
  });

  it("platform=all 时 sources 覆盖所有平台", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    expect(res.sources).toHaveProperty("steam");
    expect(res.sources).toHaveProperty("epic");
    expect(res.sources).toHaveProperty("switch");
    expect(res.sources).toHaveProperty("playstation");
  });
});