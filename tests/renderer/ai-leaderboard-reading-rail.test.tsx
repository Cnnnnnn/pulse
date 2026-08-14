// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { LeaderboardReadingRail } from "../../src/renderer/ai-leaderboard/LeaderboardReadingRail.tsx";
import {
  activeBoard,
  activeDim,
  activeLB,
  activeView,
  compareList,
} from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";

beforeEach(() => {
  activeView.value = "aa";
  activeBoard.value = "text";
  activeDim.value = "coding";
  activeLB.value = "lb_overall";
  compareList.value = [];
});

afterEach(cleanup);

describe("LeaderboardReadingRail", () => {
  it("把来源和当前维度放到左侧阅读轨道，默认不占用 AI 分析入口", () => {
    const { container, getByRole } = render(<LeaderboardReadingRail onAnalyze={vi.fn()} />);

    expect(container.querySelector(".ai-lb-reading-rail")).toBeTruthy();
    expect(container.querySelector(".ai-lb-rail__source.is-active")?.textContent).toContain("Artificial Analysis");
    expect(container.querySelector(".ai-lb-rail__dimension.is-active")?.textContent).toContain("Coding");
    expect(getByRole("button", { name: /AI 分析/ })).toHaveProperty("disabled", true);
  });

  it("选中模型后才启用 AI 分析，并把选择数量显示在轨道按钮中", () => {
    compareList.value = ["model-a", "model-b"];
    const onAnalyze = vi.fn();
    const { getByRole } = render(<LeaderboardReadingRail onAnalyze={onAnalyze} />);
    const button = getByRole("button", { name: /AI 分析/ });

    expect(button).toHaveProperty("disabled", false);
    expect(button.textContent).toContain("2");
    fireEvent.click(button);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });
});
