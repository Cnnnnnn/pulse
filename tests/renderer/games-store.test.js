import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: vi.fn() },
}));

import {
  PLATFORMS,
  MODES,
  activePlatform,
  items,
  fx,
  hasGamerPowerAttribution,
  loadGameDeals,
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