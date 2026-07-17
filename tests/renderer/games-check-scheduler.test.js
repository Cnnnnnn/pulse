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
  activeMode,
  activePlatform,
  gamesAutoCheck,
  gamesAutoCheckIntervalMin,
  gamesHasNewFree,
  gamesNotifyOnFree,
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
  gamesHasNewFree.value = false;
  activeNav.value = "home";
  activeMode.value = "deals";
  activePlatform.value = "steam";
});

afterEach(() => {
  setNotificationPermission("granted");
});

describe("games check scheduler", () => {
  it("检查全部平台并按稳定 ID 去重通知", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "steam-free-1",
        title: "Steam Test",
        platform: "steam",
        promotionType: "key",
      }],
    });
    const scheduler = createGamesCheckScheduler();
    await scheduler.checkOnce();
    await scheduler.checkOnce();

    expect(getGameDealsMock).toHaveBeenCalledWith({
      platform: "all",
      mode: "free",
    });
    expect(notificationMock).toHaveBeenCalledTimes(1);
    expect(notificationMock.mock.calls[0][0]).toBe("游戏免费活动 · 发现新活动");
    expect(notificationMock.mock.calls[0][1].body).toContain("Steam");
    expect(notificationMock.mock.calls[0][1].body).toContain("Key 赠送");
    expect(notificationMock.mock.calls[0][1].body).toContain("Steam Test");
    expect(gamesHasNewFree.value).toBe(true);
  });

  it("多条通知正文显示活动数量", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [
        {
          id: "steam-free-1",
          title: "Steam Test",
          platform: "steam",
          promotionType: "key",
        },
        {
          id: "xbox-free-1",
          title: "Xbox Test",
          platform: "xbox",
          promotionType: "free-play-days",
        },
      ],
    });

    await createGamesCheckScheduler().checkOnce();

    expect(notificationMock.mock.calls[0][1].body).toContain("2");
  });

  it("关闭通知时不通知但仍置红点", async () => {
    gamesNotifyOnFree.value = false;
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "steam-free-1",
        title: "Steam Test",
        platform: "steam",
        promotionType: "key",
      }],
    });

    await createGamesCheckScheduler().checkOnce();

    expect(notificationMock).not.toHaveBeenCalled();
    expect(gamesHasNewFree.value).toBe(true);
  });

  it("通知权限被拒时不通知但仍置红点", async () => {
    setNotificationPermission("denied");
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "xbox-free-1",
        title: "Xbox Test",
        platform: "xbox",
        promotionType: "free-play-days",
      }],
    });

    await createGamesCheckScheduler().checkOnce();

    expect(notificationMock).not.toHaveBeenCalled();
    expect(gamesHasNewFree.value).toBe(true);
  });

  it("点击通知切到游戏页免费活动标签", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "xbox-free-1",
        title: "Xbox Test",
        platform: "xbox",
        promotionType: "free-play-days",
      }],
    });
    const notice = {};
    notificationMock.mockImplementation(() => notice);
    await createGamesCheckScheduler().checkOnce();
    getGameDealsMock.mockClear();
    notice.onclick();
    expect(activeNav.value).toBe("games");
    expect(activePlatform.value).toBe("xbox");
    expect(activeMode.value).toBe("free");
    expect(getGameDealsMock).toHaveBeenCalledTimes(1);
    expect(getGameDealsMock).toHaveBeenCalledWith({
      platform: "xbox",
      mode: "free",
      sort: "savings",
      minSavings: 0,
    });
  });

  it("点击无效平台通知时保留当前平台并切到免费活动", async () => {
    getGameDealsMock.mockResolvedValue({
      ok: true,
      items: [{
        id: "unknown-free-1",
        title: "Unknown Test",
        platform: "unknown",
        promotionType: "giveaway",
      }],
    });
    const notice = {};
    notificationMock.mockImplementation(() => notice);
    await createGamesCheckScheduler().checkOnce();
    getGameDealsMock.mockClear();

    notice.onclick();

    expect(activeNav.value).toBe("games");
    expect(activePlatform.value).toBe("steam");
    expect(activeMode.value).toBe("free");
    expect(getGameDealsMock).toHaveBeenCalledTimes(1);
    expect(getGameDealsMock).toHaveBeenCalledWith({
      platform: "steam",
      mode: "free",
      sort: "savings",
      minSavings: 0,
    });
  });
});
