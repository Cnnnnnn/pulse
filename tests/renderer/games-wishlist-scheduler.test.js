// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGameDealsMock, notificationMock } = vi.hoisted(() => ({
  getGameDealsMock: vi.fn(),
  notificationMock: vi.fn(),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: getGameDealsMock },
}));

globalThis.Notification = notificationMock;
Notification.requestPermission = vi.fn(async () => "granted");

import {
  wishlist,
  gamesHasNewDrop,
  gamesNotifyOnDrop,
  gamesAutoCheck,
  gamesAutoCheckIntervalMin,
  gamesHasNewFree,
  gamesNotifyOnFree,
  activeMode,
  activePlatform,
  addToWishlist,
  loadSeenDropKeys,
  loadWishlist,
} from "../../src/renderer/games/gamesStore.js";
import { createGamesCheckScheduler } from "../../src/renderer/games/games-check-scheduler.js";
import { activeNav } from "../../src/renderer/worldcup/navStore.js";

function setNotificationPermission(value) {
  Object.defineProperty(Notification, "permission", {
    configurable: true,
    writable: true,
    value,
  });
}

beforeEach(() => {
  localStorage.clear();
  getGameDealsMock.mockReset();
  notificationMock.mockReset();
  notificationMock.mockImplementation(() => ({}));
  Notification.requestPermission = vi.fn(async () => "granted");
  setNotificationPermission("granted");
  gamesAutoCheck.value = true;
  gamesAutoCheckIntervalMin.value = 360;
  gamesNotifyOnFree.value = true;
  gamesNotifyOnDrop.value = true;
  gamesHasNewFree.value = false;
  gamesHasNewDrop.value = false;
  activeNav.value = "home";
  activeMode.value = "deals";
  activePlatform.value = "steam";
  loadWishlist();
});

describe("checkWishlistDrops 降价检查", () => {
  it("检测到降价时置红点并发通知", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(true);
    expect(notificationMock).toHaveBeenCalled();
    expect(notificationMock.mock.calls[0][0]).toContain("降价");
    expect(notificationMock.mock.calls[0][1].body).toContain("Drop Game");
  });

  it("未降价（currentPrice >= addedPrice）不通知", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Stable Game",
      salePrice: 19.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Stable Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(false);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("同价降价只通知一次（seenDrop 去重）", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    const scheduler = createGamesCheckScheduler();
    await scheduler.checkOnce();
    await scheduler.checkOnce();

    expect(loadSeenDropKeys().has("steam:steam-1:19.99")).toBe(true);
    expect(notificationMock).toHaveBeenCalledTimes(1);
  });

  it("心愿单条目不在当前 deals 中时跳过（保留不动）", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-gone",
      title: "Gone Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return { ok: true, items: [] };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(false);
    expect(wishlist.value).toHaveLength(1);
  });

  it("空心愿单时 early return 不发请求给 deals", async () => {
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return { ok: true, items: [] };
    });

    await createGamesCheckScheduler().checkOnce();

    const dealsCalls = getGameDealsMock.mock.calls.filter(
      (c) => c[0].mode === "deals",
    );
    expect(dealsCalls).toHaveLength(0);
  });

  it("gamesNotifyOnDrop=false 时不通知但仍置红点", async () => {
    gamesNotifyOnDrop.value = false;
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(true);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("点击降价通知跳转到心愿单 tab", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });
    const notice = {};
    notificationMock.mockImplementation(() => notice);

    await createGamesCheckScheduler().checkOnce();
    notice.onclick();

    expect(activeNav.value).toBe("games");
    expect(activeMode.value).toBe("wishlist");
  });
});
