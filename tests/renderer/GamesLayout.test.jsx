// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock gamesStore：只拦截 loader 函数，signal 保留真实实现（effect 依赖 .value）
vi.mock("../../src/renderer/games/gamesStore.js", async () => {
  const actual = await vi.importActual(
    "../../src/renderer/games/gamesStore.js",
  );
  return {
    ...actual,
    loadGameDeals: vi.fn(() => Promise.resolve()),
    loadGamesSettings: vi.fn(() => Promise.resolve()),
    loadWishlist: vi.fn(() => Promise.resolve()),
    loadFx: vi.fn(() => Promise.resolve()),
    enrichSteamLowest: vi.fn(() => Promise.resolve()),
    enrichXboxLowest: vi.fn(() => Promise.resolve()),
    clearGamesNewFree: vi.fn(),
    clearGamesNewDrop: vi.fn(),
  };
});

// mock scheduler：追踪 start/stop/restart 调用
const schedulerMocks = {
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  checkOnce: vi.fn(),
};
vi.mock("../../src/renderer/games/games-check-scheduler.js", () => ({
  createGamesCheckScheduler: vi.fn(() => schedulerMocks),
}));

import { GamesLayout } from "../../src/renderer/games/GamesLayout.jsx";
import { createGamesCheckScheduler } from "../../src/renderer/games/games-check-scheduler.js";
import {
  loadGameDeals,
  loadGamesSettings,
  loadWishlist,
  loadFx,
  enrichSteamLowest,
  enrichXboxLowest,
  fetchedAt,
  activeMode,
} from "../../src/renderer/games/gamesStore.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fetchedAt.value = null;
  activeMode.value = "deals";
});

describe("GamesLayout mount 生命周期", () => {
  it("mount 时调全部 loader（deals/settings/wishlist/fx）", () => {
    render(<GamesLayout />);

    expect(loadGameDeals).toHaveBeenCalledTimes(1);
    expect(loadGamesSettings).toHaveBeenCalledTimes(1);
    expect(loadWishlist).toHaveBeenCalledTimes(1);
    expect(loadFx).toHaveBeenCalledTimes(1);
  });

  it("mount 时启动调度器", () => {
    render(<GamesLayout />);

    expect(createGamesCheckScheduler).toHaveBeenCalledTimes(1);
    expect(schedulerMocks.start).toHaveBeenCalledTimes(1);
  });

  it("unmount 时停止调度器", () => {
    const { unmount } = render(<GamesLayout />);
    expect(schedulerMocks.stop).not.toHaveBeenCalled();

    unmount();

    expect(schedulerMocks.stop).toHaveBeenCalledTimes(1);
  });

  it("games-settings-changed 事件触发 scheduler.restart", () => {
    render(<GamesLayout />);
    expect(schedulerMocks.restart).not.toHaveBeenCalled();

    globalThis.dispatchEvent(new Event("games-settings-changed"));

    expect(schedulerMocks.restart).toHaveBeenCalledTimes(1);
  });
});

describe("GamesLayout 史低 enrich 副作用", () => {
  beforeEach(() => {
    fetchedAt.value = null;
    activeMode.value = "deals";
  });

  it("fetchedAt 变化 + deals 模式时触发 enrich", async () => {
    render(<GamesLayout />);
    expect(enrichSteamLowest).not.toHaveBeenCalled();

    await act(async () => {
      fetchedAt.value = "2026-07-18T00:00:00.000Z";
    });

    expect(enrichSteamLowest).toHaveBeenCalledTimes(1);
    expect(enrichXboxLowest).toHaveBeenCalledTimes(1);
  });

  it("compare 模式也触发 enrich", async () => {
    render(<GamesLayout />);
    await act(async () => {
      activeMode.value = "compare";
      fetchedAt.value = "2026-07-18T00:00:00.000Z";
    });

    expect(enrichSteamLowest).toHaveBeenCalledTimes(1);
  });

  it("free 模式不触发 enrich（无需史低价）", async () => {
    render(<GamesLayout />);
    await act(async () => {
      activeMode.value = "free";
      fetchedAt.value = "2026-07-18T00:00:00.000Z";
    });

    expect(enrichSteamLowest).not.toHaveBeenCalled();
  });

  it("fetchedAt 未设置时不触发 enrich", () => {
    render(<GamesLayout />);

    expect(enrichSteamLowest).not.toHaveBeenCalled();
  });
});
