// @vitest-environment happy-dom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import { WorldcupScorersView } from "../../src/renderer/worldcup/WorldcupScorersView.jsx";
import { worldcupMatches } from "../../src/renderer/worldcup/store.js";
import { worldcupBracket } from "../../src/renderer/worldcup/bracketStore.js";

const groupMatchWithScorer = (player, team1, team2, teamSide) => ({
  team1, team2,
  score: { ft: [1, 0], status: "final", scorers: [{ player, teamSide, minute: "10'" }] },
});

const bracketMatchWithScorer = (player, t1, t2, teamSide) => ({
  matchNum: 73,
  slot1: { team: { name: t1 } },
  slot2: { team: { name: t2 } },
  score: { ft: [1, 0], status: "final", scorers: [{ player, teamSide, minute: "30'" }] },
});

describe("WorldcupScorersView v2.65 stage filter", () => {
  beforeEach(() => {
    worldcupMatches.value = {
      name: "2026 世界杯",
      matches: [
        groupMatchWithScorer("Group Scorer", "Mexico", "South Africa", "team1"),
      ],
    };
    worldcupBracket.value = {
      r32: [
        bracketMatchWithScorer("Knockout Scorer", "South Africa", "Canada", "team2"),
      ],
    };
  });

  afterEach(() => {
    worldcupMatches.value = null;
    worldcupBracket.value = null;
  });

  test("默认显示 小组赛 过滤 tab + 1 个 group scorer", () => {
    const { container } = render(<WorldcupScorersView />);
    const tabs = container.querySelectorAll(".worldcup-scorers-filter-tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].classList.contains("is-active")).toBe(true);
    // group 1 个
    expect(container.textContent).toContain("Group Scorer");
    expect(container.textContent).not.toContain("Knockout Scorer");
  });

  test("点 淘汰赛 tab 切换显示 knockout scorer", () => {
    const { container } = render(<WorldcupScorersView />);
    const tabs = container.querySelectorAll(".worldcup-scorers-filter-tab");
    fireEvent.click(tabs[1]); // 淘汰赛
    return waitFor(() => {
      expect(container.textContent).toContain("Knockout Scorer");
      expect(container.textContent).not.toContain("Group Scorer");
    });
  });

  test("点 全部 tab 显示 group + knockout", () => {
    const { container } = render(<WorldcupScorersView />);
    const tabs = container.querySelectorAll(".worldcup-scorers-filter-tab");
    fireEvent.click(tabs[2]); // 全部
    return waitFor(() => {
      expect(container.textContent).toContain("Group Scorer");
      expect(container.textContent).toContain("Knockout Scorer");
    });
  });

  test("tab 标签显示当前阶段 count (e.g. 小组赛 (1))", () => {
    const { container } = render(<WorldcupScorersView />);
    const tabs = container.querySelectorAll(".worldcup-scorers-filter-tab");
    expect(tabs[0].textContent).toContain("小组赛");
    expect(tabs[0].textContent).toContain("(1)");
    expect(tabs[1].textContent).toContain("淘汰赛");
    expect(tabs[1].textContent).toContain("(1)");
    expect(tabs[2].textContent).toContain("全部");
    expect(tabs[2].textContent).toContain("(2)");
  });

  test("空 stage 显示 '暂无进球数据'", () => {
    worldcupMatches.value = { name: "2026 世界杯", matches: [] };
    worldcupBracket.value = null;
    const { container } = render(<WorldcupScorersView />);
    expect(container.textContent).toContain("暂无进球数据");
    // 过滤 tab 仍然渲染
    expect(container.querySelectorAll(".worldcup-scorers-filter-tab")).toHaveLength(3);
  });
});
