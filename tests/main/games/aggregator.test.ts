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
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");

const { getGameDeals, sortDeals } = requireMain("games/aggregator");

// ── 假数据：各平台 fetcher 期望的原始返回形状 ──────────────────────

// CheapShark /deals（Steam storeID=1）返回数组。Epic 不再走 CheapShark，改用官方 freeGamesPromotions。
const cheapsharkSteam = [
  { dealID: "s1", storeID: "1", title: "Hollow Knight", salePrice: 7.49, normalPrice: 14.99, savings: 50, dealRating: 90, steamAppID: "367520", steamRatingPercent: 90 },
  { dealID: "s2", storeID: "1", title: "Hollow Knight", salePrice: 9.99, normalPrice: 14.99, savings: 33, dealRating: 80, steamAppID: "367520" }, // 同名同平台，测 id 去重（dealID 不同但 steamAppID 同 → id 同）
  { dealID: "s3", storeID: "1", title: "Celeste", salePrice: 4.99, normalPrice: 19.99, savings: 75, dealRating: 95, steamAppID: "504230", steamRatingPercent: 95 },
  { dealID: "s4", storeID: "1", title: "Death Stranding", salePrice: 19.99, normalPrice: 39.99, savings: 50, dealRating: 88, steamAppID: "1190460" },
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

// Xbox Free Play Days：news.xbox.com RSS（XML）+ displaycatalog（JSON）
//   RSS 首篇 item 正文里嵌 store 链接，URL 末段为 12 位 productId
const xboxFpdRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title><![CDATA[Free Play Days – Forza, No End Game]]></title>
      <pubDate>Thu, 16 Jul 2026 15:00:00 +0000</pubDate>
      <content:encoded><![CDATA[
        <a href="https://www.xbox.com/en-US/games/store/forza-horizon-5/XBOXFP000001">Forza</a>
        <a href="https://www.xbox.com/en-US/games/store/xbox-no-end-date/XBOXNOEND001">No End</a>
      ]]></content:encoded>
    </item>
  </channel>
</rss>`;
const xboxFreeCatalog = {
  Products: [
    {
      ProductId: "XBOXFP000001",
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
      ProductId: "XBOXNOEND001",
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

// Epic freeGamesPromotions 返回结构（同一端点同时提供 deals + free）
//   - discountPrice>0 && <originalPrice  → fetchEpicDeals
//   - discountPrice===0 && originalPrice>0 → fetchEpicFree
const epicPromotions = {
  data: {
    Catalog: {
      searchStore: {
        elements: [
          // 折扣项：跨平台同名，测 deals 模式标题去重
          {
            title: "Hollow Knight",
            id: "epic-hk",
            keyImages: [{ type: "Thumbnail", url: "https://img/epic-hk.jpg" }],
            catalogNs: { mappings: [{ pageSlug: "hollow-knight" }] },
            promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "2026-07-30T00:00:00Z", discountSetting: { discountType: "PERCENTAGE", discountPercentage: 50 } }] }] },
            price: { totalPrice: { originalPrice: 1499, discountPrice: 749, currencyCode: "USD" } },
          },
          // 折扣项：Epic 独有，验证不被跨平台合并误吞
          {
            title: "Control",
            id: "epic-ctrl",
            keyImages: [{ type: "Thumbnail", url: "https://img/control.jpg" }],
            catalogNs: { mappings: [{ pageSlug: "control" }] },
            promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "2026-07-30T00:00:00Z", discountSetting: { discountType: "PERCENTAGE", discountPercentage: 75 } }] }] },
            price: { totalPrice: { originalPrice: 3999, discountPrice: 999, currencyCode: "USD" } },
          },
          // 免费项：非法结束日期，测排序兜底
          {
            title: "Epic Invalid End Date",
            id: "invalid-end",
            catalogNs: { mappings: [{ pageSlug: "invalid-end" }] },
            promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "not-a-date" }] }] },
            price: { totalPrice: { originalPrice: 999, discountPrice: 0, currencyCode: "USD" } },
          },
          // 免费项：有效结束日期
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

    // CheapShark：仅 Steam（storeID=1）使用
    if (u.includes("cheapshark.com")) {
      return jsonOk(cheapsharkSteam);
    }
    // GamerPower Steam 免费活动
    if (u.includes("gamerpower.com")) {
      return jsonOk(gamerPowerSteam);
    }
    // Xbox Free Play Days RSS（news.xbox.com，返回 XML）
    if (u.includes("news.xbox.com")) {
      return textOk(xboxFpdRss);
    }
    // Xbox Display Catalog
    if (u.includes("displaycatalog.mp.microsoft.com")) {
      return jsonOk(xboxFreeCatalog);
    }
    // Epic freeGamesPromotions（同时服务 deals + free）
    if (u.includes("epicgames.com/freeGamesPromotions")) {
      return jsonOk(epicPromotions);
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    // 失败应记日志（可观测性），否则跟"今天没数据"无法区分
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("aggregator:steam"),
    );
    warnSpy.mockRestore();
  });

  it("Xbox 单源失败时不触发 sample 且其它平台仍可用", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const u = String(url);
      if (u.includes("news.xbox.com")) {
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

describe("getGameDeals — mode=compare 跨平台比价", () => {
  it("保留同名跨平台条目（不合并）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    const hk = res.items.filter((it) => it.title === "Hollow Knight");
    expect(hk.length).toBe(2);
  });

  it("排除免费项（比价针对付费游戏）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    expect(res.items.every((it) => !it.isFree)).toBe(true);
  });

  it("同标题条目相邻，组内按 salePrice 升序", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    const titles = res.items.map((it) => it.title);
    const firstHkIdx = titles.indexOf("Hollow Knight");
    expect(titles[firstHkIdx + 1]).toBe("Hollow Knight");
    const priceA = res.items[firstHkIdx].salePrice;
    const priceB = res.items[firstHkIdx + 1].salePrice;
    expect(priceA).toBeLessThanOrEqual(priceB);
  });

  it("组内按 salePrice 升序（用不同价格真正验证 tiebreaker）", async () => {
    // 专用比价 mock：同一标题在不同平台有不同价格，避免污染共享 mock
    //   Steam: "TestGame" salePrice 15  /  "TestGame2" salePrice 20
    //   Epic:   "TestGame" salePrice 10
    // 期望：TestGame 组在 TestGame2 组前（字典序），组内 Epic(10) 先于 Steam(15)
    const localSteam = [
      { dealID: "tg-s", storeID: "1", title: "TestGame", salePrice: 15, normalPrice: 30, savings: 50, dealRating: 80, steamAppID: "1000001" },
      { dealID: "tg2-s", storeID: "1", title: "TestGame2", salePrice: 20, normalPrice: 40, savings: 50, dealRating: 80, steamAppID: "1000002" },
    ];
    // Epic TestGame 折扣（salePrice 10），通过 freeGamesPromotions 返回
    const localEpicPromotions = {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              {
                title: "TestGame",
                id: "epic-tg",
                catalogNs: { mappings: [{ pageSlug: "testgame" }] },
                promotions: { promotionalOffers: [{ promotionalOffers: [{ endDate: "2026-07-30T00:00:00Z", discountSetting: { discountType: "PERCENTAGE", discountPercentage: 66 } }] }] },
                price: { totalPrice: { originalPrice: 3000, discountPrice: 1000, currencyCode: "USD" } },
              },
            ],
          },
        },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const u = String(url);
      if (u.includes("cheapshark.com")) {
        return jsonOk(localSteam);
      }
      if (u.includes("epicgames.com/freeGamesPromotions")) {
        return jsonOk(localEpicPromotions);
      }
      // 其它平台返回空，专注 TestGame 排序验证
      return jsonOk({});
    }));

    const res = await getGameDeals({ platform: "all", mode: "compare" });
    const testGame = res.items.filter((it) => it.title === "TestGame");
    expect(testGame.length).toBe(2);
    // 字典序：TestGame 组在 TestGame2 前
    const firstTgIdx = res.items.findIndex((it) => it.title === "TestGame");
    const firstTg2Idx = res.items.findIndex((it) => it.title === "TestGame2");
    expect(firstTgIdx).toBeLessThan(firstTg2Idx);
    // 组内：Epic(10) 在 Steam(15) 前，严格升序
    expect(testGame[0].salePrice).toBe(10);
    expect(testGame[0].platform).toBe("epic");
    expect(testGame[1].salePrice).toBe(15);
    expect(testGame[1].platform).toBe("steam");
  });

  it("deals 模式仍合并同名（回归保护）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const hk = res.items.filter((it) => it.title === "Hollow Knight");
    expect(hk.length).toBe(1);
  });
});

describe("getGameDeals — mode=deals 返回全量（sort/minSavings 由 IPC 层应用）", () => {
  it("deals 模式返回全量条目，不按 sort 排序（IPC 层本地排）", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals" });
    // 应返回多条（含 Celeste/Hollow Knight/Death Stranding 等）
    expect(res.items.length).toBeGreaterThan(0);
    // 不应预先排序：原始数据按上游返回顺序，savings 非降序
    const savings = res.items.map((it) => it.savings);
    const isSortedDesc = savings.every((s, i) => i === 0 || savings[i - 1] >= s);
    expect(isSortedDesc).toBe(false);
  });

  it("不应用 minSavings 过滤（IPC 层本地过滤）", async () => {
    const res = await getGameDeals({ platform: "steam", mode: "deals", minSavings: 60 });
    // 全量返回，含 savings < 60 的条目（过滤交给 IPC 层）
    expect(res.items.some((it) => it.savings < 60)).toBe(true);
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

describe("sortDeals（导出的纯函数，供 IPC 层复用）", () => {
  const items = [
    { id: "a", salePrice: 30, savings: 20, rating: 80 },
    { id: "b", salePrice: 10, savings: 60, rating: 95 },
    { id: "c", salePrice: 20, savings: 40, rating: 70 },
  ];

  it("sort=savings 按折扣力度降序", () => {
    const out = sortDeals(items, "savings");
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=price 按售价升序", () => {
    const out = sortDeals(items, "price");
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=rating 按评分降序", () => {
    const out = sortDeals(items, "rating");
    expect(out.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("不修改原数组", () => {
    const copy = items.slice();
    sortDeals(items, "savings");
    expect(items.map((i) => i.id)).toEqual(copy.map((i) => i.id));
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