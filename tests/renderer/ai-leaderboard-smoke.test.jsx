// @vitest-environment happy-dom
/**
 * AI 榜单重设计（P0+P1）渲染/逻辑冒烟测试。
 * 覆盖：三视角表格渲染、奖牌、内联条形、可点选排序头、示例行色条 class、
 * 以及 store 的 columnValue / toggleSort / sortModels 逻辑。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { LeaderboardTable } from "../../src/renderer/ai-leaderboard/LeaderboardTable.jsx";
import { TopPodium } from "../../src/renderer/ai-leaderboard/TopPodium.jsx";
import {
  columnValue,
  toggleSort,
  sortModels,
  sortKey,
  sortDir,
  activeView,
  activeBoard,
} from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.js";

const aaModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    aa: {
      intelligenceIndex: 80,
      codingIndex: 70,
      agenticIndex: 60,
      outputTokensPerSec: 120,
      priceOutputPer1M: 2,
    },
  },
  {
    id: "b",
    name: "Beta",
    vendor: "oa",
    isSample: true,
    aa: {
      intelligenceIndex: 40,
      codingIndex: 30,
      agenticIndex: 20,
      outputTokensPerSec: 50,
      priceOutputPer1M: 8,
    },
  },
];

const arenaModels = [
  { id: "a", name: "Alpha", vendor: "oa", isSample: false, arena: { text: { score: 1300, ci: 12 } } },
  { id: "b", name: "Beta", vendor: "oa", isSample: true, arena: { text: { score: 1100, ci: 20 } } },
];

const lbModels = [
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    livebench: {
      overall: 50,
      byCategory: { Coding: 55, Language: 48, IF: 44 },
      cost: { perSuccessfulTask: 0.5 },
    },
  },
  {
    id: "b",
    name: "Beta",
    vendor: "oa",
    isSample: true,
    livebench: {
      overall: 40,
      byCategory: { Coding: 45, Language: 38, IF: 34 },
      cost: { perSuccessfulTask: 1.2 },
    },
  },
];

describe("LeaderboardTable 渲染", () => {
  afterEach(() => cleanup());

  it("AA 视角：奖牌 + 内联条形 + 6 个可排序列头 + 示例行", () => {
    const { container } = render(<LeaderboardTable rows={aaModels} view="aa" />);
    const table = container.querySelector(".ai-lb-table");
    expect(table.querySelectorAll(".ai-lb-medal.g1").length).toBe(1);
    expect(table.querySelectorAll(".ai-lb-bar").length).toBeGreaterThan(0);
    expect(table.querySelectorAll(".ai-lb-th--sortable").length).toBe(6);
    expect(table.querySelectorAll(".ai-lb-row--sample").length).toBe(1);
  });

  it("Arena / LiveBench 视角渲染无崩溃", () => {
    const r1 = render(<LeaderboardTable rows={arenaModels} view="arena" />);
    const t1 = r1.container.querySelector(".ai-lb-table");
    expect(t1.querySelectorAll(".ai-lb-medal").length).toBe(2);
    expect(t1.querySelectorAll(".ai-lb-th--sortable").length).toBe(2);

    const r2 = render(<LeaderboardTable rows={lbModels} view="livebench" />);
    const t2 = r2.container.querySelector(".ai-lb-table");
    expect(t2.querySelectorAll(".ai-lb-th--sortable").length).toBe(5);
  });

  it("TopPodium 渲染前三名", () => {
    const { container } = render(<TopPodium rows={aaModels} view="aa" />);
    expect(container.querySelectorAll(".ai-lb-podium__card").length).toBe(2);
    expect(container.querySelectorAll(".ai-lb-medal").length).toBe(2);
  });

  it("点选列头触发排序（sortKey 写入）", () => {
    const { container } = render(<LeaderboardTable rows={aaModels} view="aa" />);
    const th = container.querySelector(".ai-lb-th--sortable");
    fireEvent.click(th);
    expect(sortKey.value).toBe("intelligence");
  });
});

describe("store 排序逻辑", () => {
  beforeEach(() => {
    sortKey.value = null;
    sortDir.value = "desc";
    activeView.value = "aa";
    activeBoard.value = "text";
  });

  it("columnValue 覆盖所有可排序列（含 valueRatio）", () => {
    expect(columnValue(aaModels[0], "aa", "intelligence")).toBe(80);
    expect(columnValue(aaModels[0], "aa", "valueRatio")).toBeCloseTo(40);
    expect(columnValue(arenaModels[0], "arena", "elo")).toBe(1300);
    expect(columnValue(arenaModels[0], "arena", "ci")).toBe(12);
    expect(columnValue(lbModels[0], "livebench", "lb_overall")).toBe(50);
    expect(columnValue(lbModels[0], "livebench", "lb_coding")).toBe(55);
    expect(columnValue(lbModels[0], "livebench", "lb_cost")).toBe(0.5);
  });

  it("toggleSort：同列切换方向，新列按 better 给默认序", () => {
    toggleSort("price"); // 低优 → 默认 asc
    expect(sortKey.value).toBe("price");
    expect(sortDir.value).toBe("asc");

    toggleSort("price"); // 再点同列 → 切到 desc
    expect(sortDir.value).toBe("desc");

    toggleSort("intelligence"); // 高优 → 默认 desc
    expect(sortKey.value).toBe("intelligence");
    expect(sortDir.value).toBe("desc");
  });

  it("sortModels 按当前 sortKey 排序（降序）", () => {
    sortKey.value = "intelligence";
    sortDir.value = "desc";
    const sorted = sortModels(aaModels.slice());
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });
});
