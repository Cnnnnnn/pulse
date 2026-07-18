import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchEpicDeals, fetchEpicFree } = require("../../../src/main/games/epic.js");

afterEach(() => vi.restoreAllMocks());

/**
 * 构造一个 freeGamesPromotions 接口的响应 body。
 * 每个 element 形如真实 Epic GraphQL 返回（价格单位为分，promotions 嵌套 promotionalOffers）。
 */
function buildResponse(elements) {
  return {
    data: {
      Catalog: { searchStore: { elements, paging: { count: elements.length } } },
    },
  };
}

/** 通用 mock fetch 返回给定 body。 */
function mockFetchBody(body) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    })),
  );
}

const KEY_IMAGES = [
  { type: "Thumbnail", url: "https://cdn.epic.test/thumb.jpg" },
  { type: "DieselStoreFrontWide", url: "https://cdn.epic.test/wide.jpg" },
];

/** 折扣项 fixture（非免费）。 */
const DISCOUNT_ITEM = {
  title: "Foretales",
  id: "ns1-offer1",
  catalogNs: { mappings: [{ pageSlug: "foretales", pageType: "productHome" }] },
  productSlug: "foretales",
  keyImages: KEY_IMAGES,
  price: {
    totalPrice: {
      originalPrice: 1999,
      discountPrice: 1699,
      voucherDiscount: 0,
      discount: 300,
      currencyCode: "USD",
    },
  },
  promotions: {
    promotionalOffers: [
      {
        promotionalOffers: [
          {
            startDate: "2026-07-16T15:00:00.000Z",
            endDate: "2026-07-30T15:00:00.000Z",
            discountSetting: { discountType: "PERCENTAGE", discountPercentage: 15 },
          },
        ],
      },
    ],
    upcomingPromotionalOffers: [],
  },
};

/** 50% 折扣项 fixture（用于 minSavings 过滤测试）。 */
const DEEP_DISCOUNT_ITEM = {
  ...DISCOUNT_ITEM,
  title: "Lost Castle",
  id: "ns2-offer2",
  catalogNs: { mappings: [{ pageSlug: "lost-castle", pageType: "productHome" }] },
  productSlug: "lost-castle",
  price: {
    totalPrice: {
      originalPrice: 399,
      discountPrice: 199,
      voucherDiscount: 0,
      discount: 200,
      currencyCode: "USD",
    },
  },
  promotions: {
    promotionalOffers: [
      {
        promotionalOffers: [
          {
            startDate: "2026-07-16T15:00:00.000Z",
            endDate: "2026-07-30T15:00:00.000Z",
            discountSetting: { discountType: "PERCENTAGE", discountPercentage: 50 },
          },
        ],
      },
    ],
  },
};

/** 喜+1 免费项 fixture（discountPrice=0）。 */
const FREE_ITEM = {
  ...DISCOUNT_ITEM,
  title: "Luto",
  id: "ns3-offer3",
  catalogNs: { mappings: [{ pageSlug: "luto", pageType: "productHome" }] },
  productSlug: "luto",
  price: {
    totalPrice: {
      originalPrice: 1999,
      discountPrice: 0,
      voucherDiscount: 0,
      discount: 1999,
      currencyCode: "USD",
    },
  },
  promotions: {
    promotionalOffers: [
      {
        promotionalOffers: [
          {
            startDate: "2026-07-16T15:00:00.000Z",
            endDate: "2026-07-23T15:00:00.000Z",
            discountSetting: { discountType: "PERCENTAGE", discountPercentage: 0 },
          },
        ],
      },
    ],
  },
};

/** 原价无促销项 fixture（应被排除）。 */
const FULLPRICE_ITEM = {
  ...DISCOUNT_ITEM,
  title: "Them's Fightin' Herds",
  id: "ns4-offer4",
  catalogNs: { mappings: [{ pageSlug: "tfh", pageType: "productHome" }] },
  productSlug: "tfh",
  price: {
    totalPrice: {
      originalPrice: 1999,
      discountPrice: 1999,
      voucherDiscount: 0,
      discount: 0,
      currencyCode: "USD",
    },
  },
  promotions: null,
};

describe("fetchEpicDeals", () => {
  it("字段映射正确（折扣项）", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM]));

    const [item] = await fetchEpicDeals();

    expect(item).toMatchObject({
      id: "epic-foretales",
      platform: "epic",
      title: "Foretales",
      salePrice: 16.99,
      normalPrice: 19.99,
      savings: 15,
      currency: "USD",
      thumb: "https://cdn.epic.test/thumb.jpg",
      dealUrl: expect.stringMatching(/^https:\/\/store\.epicgames\.com\/.+\/p\/foretales$/),
      isFree: false,
      source: "live",
      store: "Epic Games Store",
    });
    expect(item.dealUrl).toContain("/p/foretales");
  });

  it("过滤掉喜+1 免费项（discountPrice=0）", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, FREE_ITEM]));

    const items = await fetchEpicDeals();
    const titles = items.map((i) => i.title);
    expect(titles).toContain("Foretales");
    expect(titles).not.toContain("Luto");
  });

  it("过滤掉原价无促销项", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, FULLPRICE_ITEM]));

    const items = await fetchEpicDeals();
    const titles = items.map((i) => i.title);
    expect(titles).toContain("Foretales");
    expect(titles).not.toContain("Them's Fightin' Herds");
  });

  it("应用 minSavings 过滤", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, DEEP_DISCOUNT_ITEM]));

    const items = await fetchEpicDeals({ minSavings: 30 });
    expect(items.map((i) => i.title)).toEqual(["Lost Castle"]);
  });

  it("minSavings=0 默认不过滤", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, DEEP_DISCOUNT_ITEM]));

    const items = await fetchEpicDeals();
    expect(items.map((i) => i.title).sort()).toEqual(["Foretales", "Lost Castle"]);
  });

  it("catalogNs.mappings 缺失时回退到 productSlug", async () => {
    const noMappings = { ...DISCOUNT_ITEM, catalogNs: {} };
    mockFetchBody(buildResponse([noMappings]));

    const [item] = await fetchEpicDeals();
    expect(item.id).toBe("epic-foretales");
    expect(item.dealUrl).toContain("/p/foretales");
  });

  it("空响应返回空数组", async () => {
    mockFetchBody(buildResponse([]));

    await expect(fetchEpicDeals()).resolves.toEqual([]);
  });

  it("fetchJson 抛错时透传", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })),
    );

    await expect(fetchEpicDeals()).rejects.toThrow(/HTTP 502/);
  });
});

describe("fetchEpicFree", () => {
  it("返回喜+1 免费项，含 freeUntil 与正确 dealUrl", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, FREE_ITEM]));

    const items = await fetchEpicFree();
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item).toMatchObject({
      id: "epic-free-luto",
      platform: "epic",
      title: "Luto",
      salePrice: 0,
      normalPrice: 19.99,
      savings: 100,
      isFree: true,
      promotionType: "giveaway",
      provider: "epic",
      requirements: "活动期间可免费入库",
    });
    expect(item.freeUntil).toBe("2026-07-23T15:00:00.000Z");
    expect(item.dealUrl).toContain("/p/luto");
  });

  it("过滤掉折扣项（discountPrice>0）", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM, FREE_ITEM]));

    const items = await fetchEpicFree();
    expect(items.map((i) => i.title)).toEqual(["Luto"]);
  });

  it("无免费项时返回空数组", async () => {
    mockFetchBody(buildResponse([DISCOUNT_ITEM]));

    await expect(fetchEpicFree()).resolves.toEqual([]);
  });
});
