// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { GameCard } from "../../src/renderer/games/GameCard.jsx";
import { fx } from "../../src/renderer/games/gamesStore.js";

afterEach(() => {
  cleanup();
  fx.value = { rates: {}, date: null, fetchedAt: null, stale: true };
});

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

describe("GameCard CNY 参考价", () => {
  it("sale price 旁显示人民币参考价", () => {
    fx.value = {
      rates: { USD: 7.2 },
      date: "2026-07-17",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      stale: false,
    };
    render(<GameCard game={baseGame} />);
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.getByText("约 ¥72.00")).toBeTruthy();
  });

  it("CNY 原币不显示参考价", () => {
    fx.value = { rates: { USD: 7.2 }, date: "2026-07-17", stale: false };
    render(<GameCard game={{ ...baseGame, currency: "CNY", salePrice: 68 }} />);
    expect(screen.getByText("¥68.00")).toBeTruthy();
    expect(screen.queryByText(/约 ¥/)).toBeNull();
  });

  it("无 fx rate 时不显示参考价", () => {
    fx.value = { rates: {}, stale: true };
    render(<GameCard game={baseGame} />);
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.queryByText(/约 ¥/)).toBeNull();
  });
});
