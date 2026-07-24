import { afterEach, describe, expect, it, vi } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");

const { fetchSwitchDeals } = requireMain("games/switch");

afterEach(() => vi.restoreAllMocks());

function mockFetchResponse(body) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}

describe("fetchSwitchDeals — Algolia 响应映射", () => {
  it("把折扣游戏映射为 GameDeal（percentOff/regPrice/finalPrice）", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            objectID: "7100126981",
            nsuid: "70010000000123",
            title: "Zelda: Breath of the Wild",
            price: {
              finalPrice: 39.99,
              regPrice: 59.99,
              percentOff: 33.34,
              discounted: true,
            },
            productImageSquare: "https://assets.nintendo.com/cover.jpg",
            url: "/us/store/products/zelda-botw/",
            releaseDateDisplay: "2017-03-03",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 10, mode: "deals" });
    expect(item).toMatchObject({
      id: "switch-70010000000123",
      platform: "switch",
      title: "Zelda: Breath of the Wild",
      salePrice: 39.99,
      normalPrice: 59.99,
      savings: 33,
      currency: "USD",
      isFree: false,
      store: "Nintendo eShop",
      source: "live",
    });
    expect(item.dealUrl).toBe(
      "https://www.nintendo.com/us/store/products/zelda-botw/",
    );
  });

  it("免费游戏 (finalPrice=0) savings=100 且 isFree=true", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "70010000000456",
            title: "Fortnite",
            price: { finalPrice: 0, regPrice: 0, percentOff: 0 },
            url: "/us/store/products/fortnite/",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 10, mode: "free" });
    expect(item.isFree).toBe(true);
    expect(item.savings).toBe(100);
  });

  it("urlKey 兜底拼接 dealUrl", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "123",
            title: "Test",
            price: { finalPrice: 10, regPrice: 20, percentOff: 50 },
            urlKey: "test-game",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 5 });
    expect(item.dealUrl).toBe(
      "https://www.nintendo.com/us/store/products/test-game/",
    );
  });

  it("过滤 normalPrice=0 且非免费的条目", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "1",
            title: "BadData",
            price: { finalPrice: 5, regPrice: 0, percentOff: 50 },
          },
          {
            nsuid: "2",
            title: "GoodGame",
            price: { finalPrice: 15, regPrice: 30, percentOff: 50 },
          },
        ],
      }),
    );

    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("GoodGame");
  });

  it("请求头包含 Origin/Referer（Nintendo 站点校验来源）", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10 });

    const callArgs = fetchMock.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.headers.Origin).toBe("https://www.nintendo.com");
    expect(opts.headers.Referer).toBe("https://www.nintendo.com/");
    expect(opts.method).toBe("POST");
  });

  it("mode=free 使用 finalPrice=0 过滤条件", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10, mode: "free" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filters).toContain("price.finalPrice=0");
  });

  it("mode=deals 使用 percentOff>0 过滤条件", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10, mode: "deals" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filters).toContain("price.percentOff>0");
  });

  it("空 hits 返回空数组", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ hits: [] }));
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });

  it("非数组 hits 返回空数组", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ hits: null }));
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });

  it("fetch 抛异常返回空数组（由 aggregator 兜底）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });
});
