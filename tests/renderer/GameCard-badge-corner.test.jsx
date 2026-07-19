// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/preact";

import { loadWishlist } from "../../src/renderer/games/gamesStore.js";
import { GameCard } from "../../src/renderer/games/GameCard.jsx";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  loadWishlist();
});

function wlGame(overrides = {}) {
  return {
    id: "s1",
    platform: "steam",
    key: "steam:s1",
    title: "Test Game",
    salePrice: 19.99,
    normalPrice: 39.99,
    savings: 50,
    currency: "USD",
    isFree: false,
    dealUrl: "https://store.steampowered.com/app/1",
    ...overrides,
  };
}

describe("GameCard 徽章角标（P1b 可选增强）", () => {
  it("普通收藏卡不显示徽章角标", () => {
    render(<GameCard game={wlGame()} context="wishlist" />);
    expect(screen.queryByLabelText(/已获徽章/)).toBeNull();
  });

  it("非 wishlist 卡片即使有稀有度也不显示角标", () => {
    render(<GameCard game={wlGame({ rarity: "legendary" })} />);
    expect(screen.queryByLabelText(/已获徽章/)).toBeNull();
  });

  it("传说稀有度卡片显示「传说收藏」奖章", () => {
    render(<GameCard game={wlGame({ rarity: "legendary" })} context="wishlist" />);
    const rack = screen.getByLabelText(/已获徽章/);
    expect(rack.textContent).toContain("💎");
    expect(rack.getAttribute("aria-label")).toContain("传说收藏");
  });

  it("合并主记录（≥3 平台）显示「跨界收藏家」与「全家桶」", () => {
    const g = wlGame({
      mergedMembers: [{ platform: "steam" }, { platform: "epic" }, { platform: "xbox" }],
    });
    render(<GameCard game={g} context="wishlist" />);
    const rack = screen.getByLabelText(/已获徽章/);
    expect(rack.textContent).toContain("🔗");
    expect(rack.textContent).toContain("🎮");
  });

  it("已评分卡片显示「评分达人」奖章", () => {
    render(<GameCard game={wlGame({ rating: 5 })} context="wishlist" />);
    const rack = screen.getByLabelText(/已获徽章/);
    expect(rack.textContent).toContain("⭐");
  });
});
