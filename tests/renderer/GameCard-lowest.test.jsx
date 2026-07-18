// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/preact";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { lowPriceMap } from "../../src/renderer/games/gamesStore.js";
import { GameCard } from "../../src/renderer/games/GameCard.jsx";

beforeEach(() => {
  lowPriceMap.value = {};
});
afterEach(cleanup);

function discountGame(overrides = {}) {
  return {
    id: "steam-100",
    platform: "steam",
    title: "Test Game",
    salePrice: 5,
    normalPrice: 20,
    savings: 75,
    currency: "USD",
    isFree: false,
    source: "live",
    dealUrl: "https://example.com",
    ...overrides,
  };
}

describe("GameCard 史低徽标", () => {
  it("salePrice <= lowestPrice 时显示史低徽标", () => {
    lowPriceMap.value = { "steam-100": 5 };
    render(<GameCard game={discountGame({ salePrice: 5 })} />);
    expect(screen.getByText("史低")).toBeTruthy();
  });

  it("salePrice > lowestPrice 时不显示", () => {
    lowPriceMap.value = { "steam-100": 3 };
    render(<GameCard game={discountGame({ salePrice: 5 })} />);
    expect(screen.queryByText("史低")).toBeNull();
  });

  it("lowPriceMap 无该游戏时不显示", () => {
    render(<GameCard game={discountGame()} />);
    expect(screen.queryByText("史低")).toBeNull();
  });

  it("deal 自带 lowestPrice 时直接用（PS 同步路径）", () => {
    render(<GameCard game={discountGame({ lowestPrice: 5, salePrice: 5 })} />);
    expect(screen.getByText("史低")).toBeTruthy();
  });

  it("sample 数据不显示史低（即使价格匹配）", () => {
    lowPriceMap.value = { "steam-100": 5 };
    render(<GameCard game={discountGame({ salePrice: 5, source: "sample" })} />);
    expect(screen.queryByText("史低")).toBeNull();
  });

  it("史低徽标 title 固定 USD（数据源 CheapShark/ITAD 永远是美元）", () => {
    // 即便 game.currency 是 JPY，史低数字也应显示 USD 符号，避免 ¥1999 误导
    lowPriceMap.value = { "steam-100": 5 };
    const { container } = render(
      <GameCard game={discountGame({ salePrice: 5, currency: "JPY" })} />,
    );
    const badge = container.querySelector(".game-card__lowest");
    expect(badge).toBeTruthy();
    // title 应含 USD 符号（$），不含 JPY 符号（¥）
    expect(badge.getAttribute("title")).toContain("$");
    expect(badge.getAttribute("title")).not.toMatch(/¥|JPY/);
  });
});
