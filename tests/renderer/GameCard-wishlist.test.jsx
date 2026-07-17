// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import {
  wishlist,
  addToWishlist,
  removeFromWishlist,
  loadWishlist,
} from "../../src/renderer/games/gamesStore.js";
import { GameCard } from "../../src/renderer/games/GameCard.jsx";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  loadWishlist();
});

function discountGame(overrides = {}) {
  return {
    id: "s1",
    platform: "steam",
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

describe("GameCard 关注按钮", () => {
  it("折扣卡片显示心形关注按钮", () => {
    render(<GameCard game={discountGame()} />);
    expect(screen.getByLabelText("关注降价")).toBeTruthy();
  });

  it("点击未关注按钮加入心愿单", () => {
    render(<GameCard game={discountGame()} />);
    fireEvent.click(screen.getByLabelText("关注降价"));
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0].key).toBe("steam:s1");
  });

  it("已关注时显示取消关注并点击移除", () => {
    addToWishlist(discountGame());
    render(<GameCard game={discountGame()} />);
    fireEvent.click(screen.getByLabelText("取消关注"));
    expect(wishlist.value).toHaveLength(0);
  });

  it("免费游戏不显示关注按钮", () => {
    render(<GameCard game={discountGame({ isFree: true, promotionType: "giveaway" })} />);
    expect(screen.queryByLabelText("关注降价")).toBeNull();
    expect(screen.queryByLabelText("取消关注")).toBeNull();
  });
});
