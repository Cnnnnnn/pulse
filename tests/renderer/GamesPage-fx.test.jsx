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
  searchQuery,
  loadWishlist,
  addToWishlist,
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

  it("wishlist 模式隐藏平台 tab 但保留筛选栏（mode chips 可切回）", () => {
    activeMode.value = "wishlist";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { container } = render(<GamesPage />);

    // PlatformTabs 隐藏（心愿单不分平台）
    expect(container.querySelector(".games-platform-tabs")).toBeNull();
    // GamesFilterBar 保留（含 mode chips，用户能切回 deals/free/compare）
    expect(container.querySelector(".games-filter-bar")).toBeTruthy();
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

describe("GamesPage 比价视图", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
  });

  it("compare 模式展示平台多选 Tab（不再隐藏）且保留 GamesFilterBar", () => {
    activeMode.value = "compare";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { container } = render(<GamesPage />);

    const tabs = container.querySelector(".games-platform-tabs");
    expect(tabs).toBeTruthy();
    // 比价模式下平台 Tab 为多选 toggle：role=button + aria-pressed
    const first = tabs.querySelector(".games-platform-tab");
    expect(first.getAttribute("role")).toBe("button");
    expect(first.getAttribute("aria-pressed")).not.toBeNull();
    expect(container.querySelector(".games-filter-bar")).toBeTruthy();
  });
});

describe("GamesPage 标题搜索", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
    searchQuery.value = "";
    activeMode.value = "deals";
    activePlatform.value = "steam";
    loading.value = false;
    error.value = null;
    items.value = [
      {
        id: "s1", title: "The Legend of Zelda", platform: "steam",
        isFree: false, salePrice: 10, normalPrice: 20, savings: 50, currency: "USD",
        dealUrl: "https://store/zelda",
      },
      {
        id: "s2", title: "Hollow Knight", platform: "steam",
        isFree: false, salePrice: 8, normalPrice: 15, savings: 47, currency: "USD",
        dealUrl: "https://store/hollow",
      },
    ];
  });

  it("搜索关键词只保留匹配卡片并更新计数", () => {
    searchQuery.value = "zelda";
    render(<GamesPage />);
    expect(screen.getByText("The Legend of Zelda")).toBeTruthy();
    expect(screen.queryByText("Hollow Knight")).toBeNull();
    expect(screen.getByText("共 1 款")).toBeTruthy();
  });

  it("搜索无结果时显示「没有匹配」空态 + 清除按钮", () => {
    searchQuery.value = "不存在xyz";
    render(<GamesPage />);
    expect(screen.getByText(/没有匹配「不存在xyz」的游戏/)).toBeTruthy();
    // 空态清除按钮（搜索框内的 × 清除按钮同名 aria-label，故用文本精确匹配）
    expect(screen.getByText("清除搜索")).toBeTruthy();
  });

  it("清空搜索后恢复全部结果", () => {
    searchQuery.value = "zelda";
    const { rerender } = render(<GamesPage />);
    expect(screen.queryByText("Hollow Knight")).toBeNull();
    searchQuery.value = "";
    rerender(<GamesPage />);
    expect(screen.getByText("Hollow Knight")).toBeTruthy();
    expect(screen.getByText("共 2 款")).toBeTruthy();
  });
});

describe("GamesPage 降价角标", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
    searchQuery.value = "";
    activeMode.value = "deals";
    activePlatform.value = "steam";
    loading.value = false;
    error.value = null;
  });

  it("deals 模式：关注游戏降价时在卡片渲染降价角标", () => {
    addToWishlist({
      platform: "steam", id: "s1", title: "Zelda",
      salePrice: 20, currency: "USD",
    });
    items.value = [{
      id: "s1", title: "Zelda", platform: "steam",
      isFree: false, salePrice: 14, normalPrice: 40, savings: 65, currency: "USD",
      dealUrl: "https://store/zelda",
    }];

    const { container } = render(<GamesPage />);
    const drop = container.querySelector(".game-card__drop");
    expect(drop).toBeTruthy();
    expect(drop.getAttribute("role")).toBe("status");
    expect(drop.textContent).toMatch(/降/);
  });

  it("关注游戏未降价时不渲染降价角标", () => {
    addToWishlist({
      platform: "steam", id: "s1", title: "Zelda",
      salePrice: 20, currency: "USD",
    });
    items.value = [{
      id: "s1", title: "Zelda", platform: "steam",
      isFree: false, salePrice: 25, normalPrice: 40, savings: 37, currency: "USD",
      dealUrl: "https://store/zelda",
    }];

    const { container } = render(<GamesPage />);
    expect(container.querySelector(".game-card__drop")).toBeNull();
  });
});

describe("GamesPage 加载骨架屏", () => {
  beforeEach(() => {
    loading.value = true;
    error.value = null;
    items.value = [];
    searchQuery.value = "";
  });

  it("加载态渲染结构镜像真实卡片（thumb + 4 行占位），用于 CLS≈0", () => {
    const { container } = render(<GamesPage />);
    const cards = container.querySelectorAll(".games-skeleton-card");
    expect(cards.length).toBe(8);
    // 每张骨架卡含 1 个 thumb + 4 个占位行（与真实 .game-card 结构对齐，骨架→内容高度一致）
    expect(container.querySelectorAll(".games-skeleton-card__thumb").length).toBe(8);
    expect(container.querySelectorAll(".games-skeleton-line").length).toBe(32);
    expect(container.querySelectorAll(".games-skeleton-line--title").length).toBe(8);
    expect(container.querySelectorAll(".games-skeleton-line--price").length).toBe(8);
    // 加载态与真实网格互斥
    expect(container.querySelector(".games-grid")).toBeNull();
  });
});

describe("GamesPage 滚动性能优化", () => {
  beforeEach(() => {
    loading.value = false;
    error.value = null;
    items.value = [];
    searchQuery.value = "";
  });

  it("滚动内容区时给 .games-body 挂 is-scrolling（临时关闭徽标 blur）", () => {
    const { container } = render(<GamesPage />);
    const body = container.querySelector(".games-body");
    expect(body).toBeTruthy();
    expect(body.classList.contains("is-scrolling")).toBe(false);
    // 派发 scroll 事件（passive 监听），应立即挂上 class
    body.dispatchEvent(new Event("scroll"));
    expect(body.classList.contains("is-scrolling")).toBe(true);
  });
});
