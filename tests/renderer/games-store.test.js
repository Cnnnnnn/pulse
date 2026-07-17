// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: vi.fn() },
}));

import {
  PLATFORMS,
  MODES,
  activePlatform,
  items,
  fx,
  wishlist,
  gamesHasNewDrop,
  gamesNotifyOnDrop,
  hasGamerPowerAttribution,
  loadGameDeals,
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  isInWishlist,
  getWishlistKey,
  loadSeenDropKeys,
  saveSeenDropKeys,
  clearGamesNewDrop,
  setGamesNotifyOnDrop,
  loadGamesSettings,
} from "../../src/renderer/games/gamesStore.js";
import { api } from "../../src/renderer/api.js";

afterEach(() => {
  items.value = [];
  fx.value = { rates: {}, date: null, fetchedAt: null, stale: true };
});

describe("gamesStore 平台默认值", () => {
  it("不提供全部平台标签并默认选择 Steam", () => {
    expect(PLATFORMS.map((platform) => platform.key)).toEqual([
      "steam",
      "epic",
      "xbox",
      "playstation",
      "switch",
    ]);
    expect(activePlatform.value).toBe("steam");
  });
});

describe("gamesStore 免费活动", () => {
  it("免费模式标签为免费活动", () => {
    expect(MODES.find((mode) => mode.key === "free")?.label).toBe("免费活动");
  });

  it("hasGamerPowerAttribution 当前 items 含 gamerpower 时为 true", () => {
    items.value = [{ id: "1", provider: "gamerpower" }];
    expect(hasGamerPowerAttribution()).toBe(true);
  });

  it("hasGamerPowerAttribution 无 gamerpower 条目时为 false", () => {
    items.value = [{ id: "1", provider: "epic" }];
    expect(hasGamerPowerAttribution()).toBe(false);
  });
});

describe("gamesStore fx 状态", () => {
  it("成功响应保存 fx 快照", async () => {
    api.getGameDeals.mockResolvedValueOnce({
      ok: true,
      mode: "deals",
      items: [{ id: "s1", title: "Deal" }],
      sources: { steam: "live" },
      fetchedAt: "2026-07-17T08:00:00.000Z",
      fx: {
        rates: { USD: 7.2 },
        date: "2026-07-17",
        fetchedAt: "2026-07-17T00:00:00.000Z",
        stale: false,
      },
    });

    await loadGameDeals();

    expect(fx.value.rates.USD).toBe(7.2);
    expect(fx.value.date).toBe("2026-07-17");
    expect(fx.value.stale).toBe(false);
  });

  it("失败、异常或无 fx 时重置空 stale 快照", async () => {
    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };

    api.getGameDeals.mockResolvedValueOnce({
      ok: false,
      error: "fail",
      items: [],
    });
    await loadGameDeals();
    expect(fx.value).toEqual({ rates: {}, date: null, fetchedAt: null, stale: true });

    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };
    api.getGameDeals.mockResolvedValueOnce({
      ok: true,
      mode: "deals",
      items: [],
      sources: {},
    });
    await loadGameDeals();
    expect(fx.value).toEqual({ rates: {}, date: null, fetchedAt: null, stale: true });

    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };
    api.getGameDeals.mockRejectedValueOnce(new Error("offline"));
    await loadGameDeals();
    expect(fx.value).toEqual({ rates: {}, date: null, fetchedAt: null, stale: true });
  });
});

describe("gamesStore 心愿单", () => {
  beforeEach(() => {
    localStorage.clear();
    wishlist.value = [];
  });

  it("MODES 含心愿单 tab", () => {
    expect(MODES.find((m) => m.key === "wishlist")?.label).toBe("心愿单");
  });

  it("getWishlistKey 拼接 platform:id", () => {
    expect(getWishlistKey({ platform: "steam", id: "123" })).toBe("steam:123");
  });

  it("addToWishlist 写入条目并持久化", () => {
    addToWishlist({
      platform: "steam",
      id: "s1",
      title: "Test Game",
      thumb: "https://img.test/cover.jpg",
      salePrice: 19.99,
      currency: "USD",
    });
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0]).toMatchObject({
      key: "steam:s1",
      platform: "steam",
      id: "s1",
      title: "Test Game",
      addedPrice: 19.99,
      currency: "USD",
    });
    expect(wishlist.value[0].addedAt).toBeTruthy();
    expect(isInWishlist("steam:s1")).toBe(true);
  });

  it("addToWishlist 同 key 去重不重复添加", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    expect(wishlist.value).toHaveLength(1);
  });

  it("removeFromWishlist 按 key 移除", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    removeFromWishlist("steam:s1");
    expect(wishlist.value).toHaveLength(0);
    expect(isInWishlist("steam:s1")).toBe(false);
  });

  it("loadWishlist 从 localStorage 还原，损坏数据回退空数组", () => {
    localStorage.setItem("pulse.games.wishlist.v1", JSON.stringify([
      { key: "epic:e1", platform: "epic", id: "e1", title: "E", addedPrice: 5, currency: "USD", addedAt: "2026-07-18T00:00:00.000Z" },
    ]));
    loadWishlist();
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0].title).toBe("E");

    localStorage.setItem("pulse.games.wishlist.v1", "{not json");
    loadWishlist();
    expect(wishlist.value).toHaveLength(0);
  });
});

describe("gamesStore seenDrop 集合", () => {
  beforeEach(() => localStorage.clear());

  it("loadSeenDropKeys 空时返回空 Set", () => {
    expect(loadSeenDropKeys().size).toBe(0);
  });

  it("saveSeenDropKeys / loadSeenDropKeys 往返", () => {
    const set = new Set(["steam:s1:14.99", "epic:e1:0"]);
    saveSeenDropKeys(set);
    expect(loadSeenDropKeys()).toEqual(set);
  });

  it("损坏数据返回空 Set", () => {
    localStorage.setItem("pulse.games.seenDrop.v1", "{bad");
    expect(loadSeenDropKeys().size).toBe(0);
  });
});

describe("gamesStore 降价设置", () => {
  beforeEach(() => {
    localStorage.clear();
    gamesHasNewDrop.value = false;
    gamesNotifyOnDrop.value = true;
  });

  it("gamesHasNewDrop 默认 false，clearGamesNewDrop 置 false", () => {
    expect(gamesHasNewDrop.value).toBe(false);
    gamesHasNewDrop.value = true;
    clearGamesNewDrop();
    expect(gamesHasNewDrop.value).toBe(false);
  });

  it("setGamesNotifyOnDrop 持久化到 settings", () => {
    setGamesNotifyOnDrop(false);
    const raw = JSON.parse(localStorage.getItem("pulse.games.settings.v1"));
    expect(raw.notifyOnDrop).toBe(false);
  });

  it("loadGamesSettings 还原 notifyOnDrop，缺失字段默认 true", () => {
    localStorage.setItem("pulse.games.settings.v1", JSON.stringify({
      autoCheck: true,
      autoCheckIntervalMin: 360,
      notifyOnFree: true,
    }));
    loadGamesSettings();
    expect(gamesNotifyOnDrop.value).toBe(true);
  });
});