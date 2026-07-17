// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { GameCard } from "../../src/renderer/games/GameCard.jsx";

afterEach(cleanup);

const baseGame = {
  id: "ps-1",
  title: "FX Test",
  platform: "playstation",
  isFree: false,
  salePrice: 10,
  normalPrice: 20,
  savings: 50,
  currency: "USD",
};

const fx = {
  rates: { USD: 7.2 },
  date: "2026-07-17",
  fetchedAt: "2026-07-17T00:00:00.000Z",
  stale: false,
};

describe("GameCard CNY 参考价", () => {
  it("sale price 旁显示人民币参考价", () => {
    render(<GameCard game={baseGame} fx={fx} />);
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.getByText("约 ¥72.00")).toBeTruthy();
  });

  it("CNY 原币不显示参考价", () => {
    render(
      <GameCard game={{ ...baseGame, currency: "CNY", salePrice: 68 }} fx={fx} />,
    );
    expect(screen.getByText("¥68.00")).toBeTruthy();
    expect(screen.queryByText(/约 ¥/)).toBeNull();
  });

  it("无 fx rate 时不显示参考价", () => {
    render(<GameCard game={baseGame} fx={{ rates: {}, stale: true }} />);
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.queryByText(/约 ¥/)).toBeNull();
  });
});
