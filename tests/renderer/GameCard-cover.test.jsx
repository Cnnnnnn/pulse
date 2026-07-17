// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { GameCard } from "../../src/renderer/games/GameCard.jsx";

afterEach(cleanup);

const baseGame = {
  id: "ps-1",
  title: "Cover Test",
  platform: "playstation",
  isFree: false,
  salePrice: 10,
  normalPrice: 20,
  savings: 50,
  currency: "USD",
};

describe("GameCard 封面占位", () => {
  it("无 thumb 时显示平台 emoji 占位", () => {
    render(<GameCard game={{ ...baseGame, thumb: null }} />);
    expect(screen.getByText("🔵")).toBeTruthy();
    expect(document.querySelector(".game-card__thumb img")).toBeNull();
  });

  it("图片 load error 后显示平台 emoji 占位", () => {
    render(<GameCard game={{ ...baseGame, thumb: "https://bad.example/x.jpg" }} />);
    const img = document.querySelector(".game-card__thumb img");
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(screen.getByText("🔵")).toBeTruthy();
    expect(document.querySelector(".game-card__thumb img")).toBeNull();
  });

  it("thumb 变更后重置 error 状态并重新尝试加载", () => {
    const { rerender } = render(
      <GameCard game={{ ...baseGame, id: "ps-1", thumb: "https://bad.example/a.jpg" }} />,
    );
    fireEvent.error(document.querySelector(".game-card__thumb img"));
    expect(document.querySelector(".game-card__thumb img")).toBeNull();

    rerender(
      <GameCard game={{ ...baseGame, id: "ps-1", thumb: "https://good.example/b.jpg" }} />,
    );
    const img = document.querySelector(".game-card__thumb img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://good.example/b.jpg");
  });

  it("不同 game.id 重置 error 状态", () => {
    const { rerender } = render(
      <GameCard game={{ ...baseGame, id: "ps-1", thumb: "https://bad.example/a.jpg" }} />,
    );
    fireEvent.error(document.querySelector(".game-card__thumb img"));

    rerender(
      <GameCard
        game={{
          ...baseGame,
          id: "ps-2",
          thumb: "https://bad.example/a.jpg",
          platform: "switch",
        }}
      />,
    );
    expect(document.querySelector(".game-card__thumb img")).toBeTruthy();
  });
});
