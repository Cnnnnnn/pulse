// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn(), getGameDeals: vi.fn() },
}));

import { GamesPage } from "../../src/renderer/games/GamesPage.jsx";
import {
  items,
  loading,
  error,
  fx,
  activePlatform,
  activeMode,
  wishlist,
  loadWishlist,
} from "../../src/renderer/games/gamesStore.js";

afterEach(cleanup);

beforeEach(() => {
  loading.value = false;
  error.value = null;
  items.value = [];
  fx.value = { rates: {}, date: null, fetchedAt: null, stale: true };
  activePlatform.value = "steam";
  activeMode.value = "deals";
});

describe("GamesPage fx footer", () => {
  it("有 fx.date 时显示汇率日期", () => {
    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };
    items.value = [{
      id: "s1",
      title: "Deal Game",
      platform: "steam",
      isFree: false,
      salePrice: 10,
      normalPrice: 20,
      savings: 50,
      currency: "USD",
    }];

    render(<GamesPage />);

    expect(screen.getByText(/汇率日期：2026-07-17/)).toBeTruthy();
    expect(screen.queryByText("（缓存汇率）")).toBeNull();
  });

  it("fx.stale 时显示缓存汇率提示", () => {
    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-16",
      fetchedAt: "2026-07-16T00:00:00.000Z",
      stale: true,
    };
    items.value = [{
      id: "s1",
      title: "Deal Game",
      platform: "steam",
      isFree: false,
      salePrice: 10,
      normalPrice: 20,
      savings: 50,
      currency: "USD",
    }];

    render(<GamesPage />);

    expect(screen.getByText(/汇率日期：2026-07-16/)).toBeTruthy();
    expect(screen.getByText(/缓存汇率/)).toBeTruthy();
  });

  it("无 date 时不显示误导性汇率日期", () => {
    fx.value = { rates: { USD: 7.2 }, date: null, fetchedAt: null, stale: true };
    items.value = [{
      id: "s1",
      title: "Deal Game",
      platform: "steam",
      isFree: false,
      salePrice: 10,
      normalPrice: 20,
      savings: 50,
      currency: "USD",
    }];

    render(<GamesPage />);

    expect(screen.queryByText(/汇率日期/)).toBeNull();
  });
});

describe("GamesPage 空态文案", () => {
  it("PS + free 模式 + 空列表显示平台差异化文案", () => {
    activePlatform.value = "playstation";
    activeMode.value = "free";
    items.value = [];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(
      screen.getByText("该平台暂无公开免费活动数据源"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Epic \/ Steam \/ Xbox 的免费活动更稳定/),
    ).toBeTruthy();
  });

  it("Switch + free 模式与 PS 对称，也显示差异化文案", () => {
    activePlatform.value = "switch";
    activeMode.value = "free";
    items.value = [];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(
      screen.getByText("该平台暂无公开免费活动数据源"),
    ).toBeTruthy();
  });

  it("Steam + free 模式 + 空列表显示通用空态文案", () => {
    activePlatform.value = "steam";
    activeMode.value = "free";
    items.value = [];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(screen.getByText("该筛选条件下暂无优惠数据")).toBeTruthy();
    expect(
      screen.queryByText("该平台暂无公开免费活动数据源"),
    ).toBeNull();
  });
});

describe("GamesPage 心愿单视图", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
  });

  it("wishlist 模式隐藏平台 tab 和筛选栏", () => {
    activeMode.value = "wishlist";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { container } = render(<GamesPage />);

    expect(container.querySelector(".games-toolbar")).toBeNull();
  });

  it("心愿单为空时显示引导文案", () => {
    activeMode.value = "wishlist";
    items.value = [];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(screen.getByText(/还没有关注任何游戏/)).toBeTruthy();
  });

  it("心愿单有条目时渲染卡片", () => {
    activeMode.value = "wishlist";
    wishlist.value = [{
      key: "steam:s1",
      platform: "steam",
      id: "s1",
      title: "Wishlisted Game",
      thumb: null,
      addedPrice: 19.99,
      currency: "USD",
      addedAt: "2026-07-18T00:00:00.000Z",
    }];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(screen.getByText("Wishlisted Game")).toBeTruthy();
  });
});
