// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    getGameDeals: vi.fn(),
    getSteamLowest: vi.fn(),
    getItadLowest: vi.fn(),
    getFx: vi.fn(),
  },
}));

import {
  PLATFORMS,
  MODES,
  activePlatform,
  activeMode,
  items,
  fx,
  wishlist,
  gamesHasNewDrop,
  gamesNotifyOnDrop,
  hasGamerPowerAttribution,
  loadGameDeals,
  loadFx,
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  isInWishlist,
  getWishlistKey,
  loadSeenDropKeys,
  saveSeenDropKeys,
  clearGamesNewDrop,
  setGamesNotifyOnDrop,
  setMode,
  comparePlatforms,
  toggleComparePlatform,
  loadGamesSettings,
  lowPriceMap,
  enrichSteamLowest,
  enrichXboxLowest,
  extractSteamAppId,
  fetchedAt,
  sortItems,
  filterBySavings,
  setSort,
  setMinSavings,
  activeSort,
  minSavings,
  searchQuery,
  setSearchQuery,
  clearSearchQuery,
  matchesSearch,
  getDropInfo,
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

describe("sortItems / filterBySavings（本地排序，不发 IPC）", () => {
  const sample = [
    { id: "a", salePrice: 30, savings: 20, rating: 80 },
    { id: "b", salePrice: 10, savings: 60, rating: 95 },
    { id: "c", salePrice: 20, savings: 40, rating: 70 },
  ];

  it("sort=savings 按折扣力度降序", () => {
    expect(sortItems(sample, "savings").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=price 按售价升序", () => {
    expect(sortItems(sample, "price").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=rating 按评分降序", () => {
    expect(sortItems(sample, "rating").map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("不修改原数组", () => {
    const copy = sample.map((i) => i.id);
    sortItems(sample, "savings");
    expect(sample.map((i) => i.id)).toEqual(copy);
  });

  it("filterBySavings 过滤低于门槛的条目", () => {
    expect(filterBySavings(sample, 40).map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("filterBySavings 门槛 <= 0 时原样返回", () => {
    expect(filterBySavings(sample, 0)).toBe(sample);
  });
});

describe("setSort / setMinSavings 本地化（不触发 loadGameDeals）", () => {
  it("setSort 只更新 signal，不发 IPC", () => {
    api.getGameDeals.mockClear();
    setSort("price");
    expect(activeSort.value).toBe("price");
    expect(api.getGameDeals).not.toHaveBeenCalled();
  });

  it("setMinSavings 只更新 signal，不发 IPC", () => {
    api.getGameDeals.mockClear();
    setMinSavings(50);
    expect(minSavings.value).toBe(50);
    expect(api.getGameDeals).not.toHaveBeenCalled();
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

describe("gamesStore loadFx（独立汇率加载）", () => {
  afterEach(() => {
    fx.value = { rates: {}, date: null, fetchedAt: null, stale: true };
  });

  it("成功时保存 fx 快照（固定拉 USD）", async () => {
    api.getFx.mockResolvedValueOnce({
      rates: { USD: 7.2 },
      date: "2026-07-18",
      fetchedAt: "2026-07-18T00:00:00.000Z",
      stale: false,
    });

    await loadFx();

    expect(api.getFx).toHaveBeenCalledWith(["USD"]);
    expect(fx.value.rates.USD).toBe(7.2);
    expect(fx.value.stale).toBe(false);
  });

  it("失败时保持原 fx 不变（不清空，避免 wishlist 丢失参考价）", async () => {
    fx.value = {
      rates: { USD: 7.1 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };
    api.getFx.mockRejectedValueOnce(new Error("offline"));

    await loadFx();

    // fx 保持原值，不被清空
    expect(fx.value.rates.USD).toBe(7.1);
  });

  it("空响应时清空 fx", async () => {
    api.getFx.mockResolvedValueOnce(null);

    await loadFx();

    expect(fx.value.rates).toEqual({});
    expect(fx.value.stale).toBe(true);
  });
});

describe("gamesStore loadGameDeals 短路", () => {
  it("wishlist 模式不触发上游聚合（数据来自 localStorage）", async () => {
    activeMode.value = "wishlist";
    api.getGameDeals.mockClear();

    await loadGameDeals();

    expect(api.getGameDeals).not.toHaveBeenCalled();
    // 不应改动 loading（短路前不应进入加载态）
    // 重置回默认模式避免污染后续用例
    activeMode.value = "deals";
  });

  it("deals/free/compare 模式正常发起请求", async () => {
    for (const mode of ["deals", "free", "compare"]) {
      activeMode.value = mode;
      api.getGameDeals.mockClear();
      api.getGameDeals.mockResolvedValueOnce({
        ok: true,
        mode,
        items: [],
        sources: {},
        fetchedAt: "2026-07-18T00:00:00.000Z",
        fx: { rates: {}, date: null, fetchedAt: null, stale: true },
      });

      await loadGameDeals();
      expect(api.getGameDeals).toHaveBeenCalledTimes(1);
    }
    activeMode.value = "deals";
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

describe("gamesStore 比价 mode", () => {
  beforeEach(() => {
    activePlatform.value = "steam";
    api.getGameDeals.mockResolvedValue({ ok: true, items: [], sources: {} });
  });

  it("MODES 含比价 tab", () => {
    expect(MODES.find((m) => m.key === "compare")?.label).toBe("比价");
  });

  it("setMode('compare') 保持 activePlatform 不变（比价多选由 comparePlatforms 驱动）", () => {
    activePlatform.value = "steam";
    setMode("compare");
    expect(activeMode.value).toBe("compare");
    expect(activePlatform.value).toBe("steam"); // 不再强制 'all'，避免离开比价后丢失选中平台
    expect(comparePlatforms.value).toEqual(PLATFORMS.map((p) => p.key));
  });

  it("toggleComparePlatform 多选切换且至少保留 1 个", () => {
    comparePlatforms.value = PLATFORMS.map((p) => p.key);
    toggleComparePlatform("steam");
    expect(comparePlatforms.value).not.toContain("steam");
    toggleComparePlatform("steam");
    expect(comparePlatforms.value).toContain("steam");
    // 仅剩 1 个时不可再取消
    comparePlatforms.value = ["steam"];
    toggleComparePlatform("steam");
    expect(comparePlatforms.value).toEqual(["steam"]);
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
    api.getSteamLowest = vi.fn(async () => ({ lowestPrice: 3.49 }));
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
    api.getSteamLowest = vi.fn(async () => ({ lowestPrice: 9.99 }));
    items.value = [{ id: "steam-100", platform: "steam", salePrice: 5 }];

    await enrichSteamLowest();

    expect(api.getSteamLowest).not.toHaveBeenCalled();
    expect(lowPriceMap.value["steam-100"]).toBe(3.49);
  });

  it("enrichSteamLowest 忽略 lowestPrice 为 null 的结果", async () => {
    api.getSteamLowest = vi.fn(async () => ({ lowestPrice: null }));
    items.value = [{ id: "steam-100", platform: "steam", salePrice: 5 }];

    await enrichSteamLowest();

    expect(lowPriceMap.value["steam-100"]).toBeUndefined();
  });

  it("enrichXboxLowest 把 ITAD 批量结果写入 lowPriceMap（按 game.id）", async () => {
    api.getItadLowest = vi.fn(async () => ({
      lowestMap: { "xbox-game-a": 19.99 },
    }));
    items.value = [
      { id: "xbox-xbox-game-a", platform: "xbox", salePrice: 25 },
      { id: "xbox-xbox-game-b", platform: "xbox", salePrice: 30 },
    ];

    await enrichXboxLowest();

    expect(lowPriceMap.value["xbox-xbox-game-a"]).toBe(19.99);
    expect(lowPriceMap.value["xbox-xbox-game-b"]).toBeUndefined();
  });
});

describe("gamesStore 标题搜索（本地派生，不发 IPC）", () => {
  it("matchesSearch 空查询匹配任意游戏", () => {
    expect(matchesSearch({ title: "Hollow Knight", platform: "steam" }, "")).toBe(true);
    expect(matchesSearch({ title: "Hollow Knight", platform: "steam" }, "   ")).toBe(true);
  });

  it("matchesSearch 标题不区分大小写", () => {
    expect(matchesSearch({ title: "Hollow Knight", platform: "steam" }, "hollow")).toBe(true);
    expect(matchesSearch({ title: "Hollow Knight", platform: "steam" }, "KNIGHT")).toBe(true);
  });

  it("matchesSearch 同时匹配平台 label（含别名）", () => {
    expect(matchesSearch({ title: "Some Game", platform: "steam" }, "steam")).toBe(true);
    expect(matchesSearch({ title: "Some Game", platform: "playstation" }, "PlayStation")).toBe(true);
    expect(matchesSearch({ title: "Some Game", platform: "steam" }, "nope")).toBe(false);
  });

  it("setSearchQuery 200ms 防抖后才写入 searchQuery", () => {
    vi.useFakeTimers();
    try {
      searchQuery.value = "";
      setSearchQuery("zelda");
      // 防抖期内尚未写入
      expect(searchQuery.value).toBe("");
      vi.advanceTimersByTime(200);
      expect(searchQuery.value).toBe("zelda");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearSearchQuery 立即清空", () => {
    searchQuery.value = "abc";
    clearSearchQuery();
    expect(searchQuery.value).toBe("");
  });
});

describe("gamesStore 降价信息 getDropInfo", () => {
  beforeEach(() => {
    localStorage.clear();
    wishlist.value = [];
    searchQuery.value = "";
  });

  it("未关注时返回 null", () => {
    expect(getDropInfo({ platform: "steam", id: "s1", salePrice: 5 })).toBeNull();
  });

  it("关注且当前价低于 addedPrice 时返回 delta / pct", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "G", salePrice: 20, currency: "USD" });
    const info = getDropInfo({ platform: "steam", id: "s1", salePrice: 14 });
    expect(info).not.toBeNull();
    expect(info.dropped).toBe(true);
    expect(info.delta).toBeCloseTo(6);
    expect(info.pct).toBeCloseTo(0.3);
    expect(info.currency).toBe("USD");
  });

  it("当前价 >= addedPrice 时返回 null（未降价）", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "G", salePrice: 20, currency: "USD" });
    expect(getDropInfo({ platform: "steam", id: "s1", salePrice: 20 })).toBeNull();
    expect(getDropInfo({ platform: "steam", id: "s1", salePrice: 25 })).toBeNull();
  });
});