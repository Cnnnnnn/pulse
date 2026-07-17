// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import { GameCard } from "../../src/renderer/games/GameCard.jsx";

afterEach(cleanup);

describe("GameCard 免费活动", () => {
  it("展示活动类型与领取条件", () => {
    render(<GameCard game={{
      id: "x",
      title: "Test",
      platform: "xbox",
      isFree: true,
      promotionType: "free-play-days",
      requirements: "需 Game Pass，活动期间限时试玩",
    }} />);

    expect(screen.getByText("限时试玩")).toBeTruthy();
    expect(screen.getByText("需 Game Pass，活动期间限时试玩")).toBeTruthy();
  });

  it("非免费卡片不展示领取条件", () => {
    render(<GameCard game={{
      id: "paid",
      title: "Paid Test",
      platform: "steam",
      isFree: false,
      requirements: "不应显示的领取条件",
    }} />);

    expect(screen.queryByText("不应显示的领取条件")).toBeNull();
  });

  it("免费卡片领取条件为空时不渲染条件块", () => {
    const { container } = render(<GameCard game={{
      id: "free",
      title: "Free Test",
      platform: "epic",
      isFree: true,
      promotionType: "giveaway",
      requirements: "",
    }} />);

    expect(container.querySelectorAll(".game-card__free-until")).toHaveLength(0);
  });
});
