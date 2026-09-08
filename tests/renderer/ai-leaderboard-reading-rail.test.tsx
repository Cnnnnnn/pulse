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
  items,
} from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";

beforeEach(() => {
  activeView.value = "aa";
  activeBoard.value = "text";
  activeDim.value = "coding";
  activeLB.value = "lb_overall";
  compareList.value = [];
  items.value = [];
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

  it("Arena 单 board 大类（Code）不渲染冗余『子榜』下拉，多 board 大类（Chat）渲染", () => {
    activeView.value = "arena";
    // Code 大类：唯一 board 的标签（WebDev）与子维度默认值撞名 → 子榜下拉应隐藏
    activeBoard.value = "code";
    const { container: codeContainer } = render(<LeaderboardReadingRail onAnalyze={vi.fn()} />);
    const codeLabels = [...codeContainer.querySelectorAll(".ai-lb-rail__select > span:first-child")]
      .map((s) => s.textContent);
    expect(codeLabels).not.toContain("子榜");
    expect(codeLabels).toContain("Code 子维度");
    cleanup();

    // Chat 大类：Text/Search/Vision/Document 多 board → 子榜下拉保留
    activeBoard.value = "text";
    const { container: chatContainer } = render(<LeaderboardReadingRail onAnalyze={vi.fn()} />);
    const chatLabels = [...chatContainer.querySelectorAll(".ai-lb-rail__select > span:first-child")]
      .map((s) => s.textContent);
    expect(chatLabels).toContain("子榜");
  });

  it("Text 榜快照兜底数据（无 categories）→ 隐藏子维度切换，显示提示", () => {
    activeView.value = "arena";
    activeBoard.value = "text";
    items.value = [
      { id: "a", name: "Alpha", vendor: "other", arena: { text: { rank: 1, score: 1500, ci: 5, votes: 100 } } },
    ];
    const { container } = render(<LeaderboardReadingRail onAnalyze={vi.fn()} />);
    const labels = [...container.querySelectorAll(".ai-lb-rail__select > span:first-child")]
      .map((s) => s.textContent);
    expect(labels).not.toContain("Text 子维度");
    expect(container.querySelector(".ai-lb-rail__hint")?.textContent).toContain("快照");
  });
});
