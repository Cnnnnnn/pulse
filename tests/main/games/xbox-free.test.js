import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchXboxFree } = require("../../../src/main/games/xbox-free.js");

afterEach(() => vi.restoreAllMocks());

function listResponse(items) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ Items: items }),
  };
}

function catalogResponse(products) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ Products: products }),
  };
}

function validProduct(overrides = {}) {
  return {
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
    ...overrides,
  };
}

describe("fetchXboxFree", () => {
  it("把 Free Play Days 商品映射为限时试玩", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(listResponse([{ Id: "9TEST" }]))
      .mockResolvedValueOnce(catalogResponse([validProduct()])));

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

  it("HTTP 错误时返回空列表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("列表无有效 ID 时返回空列表且不请求 catalog", async () => {
    const fetchMock = vi.fn(async () => listResponse([
      null,
      { Id: null },
      { Id: "" },
      { Id: "   " },
      { notId: "9SKIP" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchXboxFree()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null],
    [undefined],
    ["not-an-array"],
    [{ Items: null }],
    [{ Items: "not-an-array" }],
  ])("畸形列表响应 %# 返回空列表", async (payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    })));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("过滤无 ProductId 的商品，不生成 xbox-free-undefined", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(listResponse([{ Id: "9TEST" }, { Id: "9VALID" }]))
      .mockResolvedValueOnce(catalogResponse([
        null,
        validProduct({ ProductId: null }),
        validProduct({ ProductId: undefined }),
        validProduct({ ProductId: "" }),
        validProduct({ ProductId: "9VALID", LocalizedProperties: [{ ProductTitle: "Valid Game" }] }),
      ])));

    const items = await fetchXboxFree();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("xbox-free-9VALID");
    expect(items.every((item) => !item.id.includes("undefined"))).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ["not-an-array"],
    [{ Products: null }],
    [{ Products: "not-an-array" }],
  ])("畸形 catalog 响应 %# 返回空列表", async (payload) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(listResponse([{ Id: "9TEST" }]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => payload,
      }));
    await expect(fetchXboxFree()).resolves.toEqual([]);
  });

  it("缺失嵌套字段时使用安全默认值", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(listResponse([{ Id: "9MIN" }]))
      .mockResolvedValueOnce(catalogResponse([{
        ProductId: "9MIN",
        LocalizedProperties: null,
        DisplaySkuAvailabilities: null,
      }])));

    const [item] = await fetchXboxFree();
    expect(item).toMatchObject({
      id: "xbox-free-9MIN",
      title: "Xbox 免费试玩",
      thumb: null,
      normalPrice: null,
      freeUntil: null,
    });
  });
});
