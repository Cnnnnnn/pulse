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
    const fetchMock = vi.fn(async () => ({
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
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [item] = await fetchSteamFree();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("platform=steam&type=game"),
      expect.any(Object),
    );
    expect(item).toMatchObject({
      id: "steam-free-42",
      platform: "steam",
      isFree: true,
      promotionType: "key",
      provider: "gamerpower",
      normalPrice: 9.99,
      dealUrl: "https://example.test/claim",
      requirements: "Earn points, then reveal the key.",
    });
    expect(item.freeUntil).toBe("2026-07-20T12:00:00.000Z");
  });

  it.each(["N/A", "not-a-date", null])(
    "end_date 为 %s 时 freeUntil 为 null",
    async (endDate) => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [{
          id: 43,
          title: "Example Giveaway",
          open_giveaway_url: "https://example.test/claim",
          end_date: endDate,
        }],
      })));

      const [item] = await fetchSteamFree();
      expect(item.freeUntil).toBeNull();
    },
  );

  it("丢弃畸形数组元素", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        null,
        "invalid",
        { title: "Missing ID", open_giveaway_url: "https://example.test/1" },
        { id: 2, title: "  ", open_giveaway_url: "https://example.test/2" },
        { id: 3, title: "Missing URL" },
        {
          id: 4,
          title: "Valid Giveaway",
          open_giveaway: "https://example.test/valid",
        },
      ],
    })));

    await expect(fetchSteamFree()).resolves.toMatchObject([
      {
        id: "steam-free-4",
        title: "Valid Giveaway",
        dealUrl: "https://example.test/valid",
      },
    ]);
  });

  it("过滤无效 ID，并 trim 字符串 ID", async () => {
    const validFields = {
      title: "Example Giveaway",
      open_giveaway_url: "https://example.test/claim",
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { ...validFields, id: {} },
        { ...validFields, id: [] },
        { ...validFields, id: "   " },
        { ...validFields, id: NaN },
        { ...validFields, id: Infinity },
        { ...validFields, id: "  abc-42  " },
      ],
    })));

    await expect(fetchSteamFree()).resolves.toMatchObject([
      { id: "steam-free-abc-42" },
    ]);
  });

  it("规范化领取条件和领取 URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 1,
          title: "Steam Key Giveaway",
          instructions: "   ",
          open_giveaway_url: "  https://example.test/key  ",
        },
        {
          id: 2,
          title: "Play for free this weekend",
          open_giveaway_url: "https://example.test/weekend",
        },
        {
          id: 3,
          title: "Regular Giveaway",
          open_giveaway_url: "https://example.test/giveaway",
        },
      ],
    })));

    const [key, weekend, giveaway] = await fetchSteamFree();
    expect(key).toMatchObject({
      dealUrl: "https://example.test/key",
      requirements: "需按活动页说明领取，Key 数量可能有限",
    });
    expect(weekend.requirements).toBe("限时免费游玩，不会永久入库");
    expect(giveaway.requirements).toBe("活动期间可免费入库");
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
