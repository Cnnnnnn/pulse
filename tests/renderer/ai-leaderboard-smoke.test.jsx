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
import { ArenaBubbleChart } from "../../src/renderer/ai-leaderboard/ArenaBubbleChart.jsx";
import { normalizeBoardResult, normalizeAiModel } from "../../src/renderer/ai-leaderboard/types.js";
import {
  columnValue,
  toggleSort,
  sortModels,
  filterByLicense,
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
  {
    id: "a",
    name: "Alpha",
    vendor: "oa",
    isSample: false,
    arena: {
      text: { score: 1300, ci: 12, votes: 5000 },
      vision: { score: 1250, ci: 15, votes: 2100 },
      code: { score: 1280, ci: 10, votes: 3400 },
    },
    rankSeries: [
      { date: "2026-07-10", rank: 5 },
      { date: "2026-07-11", rank: 4 },
      { date: "2026-07-12", rank: 3 },
    ],
  },
  { id: "b", name: "Beta", vendor: "oa", isSample: true, arena: { text: { score: 1100, ci: 20, votes: 3000 } } },
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
    // ELO + 置信区间 + 票数 = 3 个可排序列头
    expect(t1.querySelectorAll(".ai-lb-th--sortable").length).toBe(3);
    expect(t1.querySelectorAll('[data-sort="votes"]').length).toBe(1);
    // 跨 board 迷你条（模型 a 多 board）+ 排名趋势 sparkline（模型 a 有 rankSeries）
    expect(t1.querySelectorAll(".ai-lb-boardbars").length).toBeGreaterThan(0);
    expect(t1.querySelectorAll(".ai-lb-spark").length).toBeGreaterThan(0);
    // 跨 board 条至少渲染一个 board 行（文本/多模态/代码）
    expect(t1.querySelectorAll(".ai-lb-boardbars__row").length).toBeGreaterThan(0);

    const r2 = render(<LeaderboardTable rows={lbModels} view="livebench" />);
    const t2 = r2.container.querySelector(".ai-lb-table");
    expect(t2.querySelectorAll(".ai-lb-th--sortable").length).toBe(5);
  });

  it("TopPodium 渲染前三名", () => {
    const { container } = render(<TopPodium rows={aaModels} view="aa" />);
    expect(container.querySelectorAll(".ai-lb-podium__card").length).toBe(2);
    expect(container.querySelectorAll(".ai-lb-medal").length).toBe(2);
  });

  it("ArenaBubbleChart：默认 text board 渲染气泡图与数据点", () => {
    const { container } = render(<ArenaBubbleChart items={arenaModels} board="text" />);
    expect(container.querySelectorAll(".ai-lb-bubble").length).toBe(1);
    // 文本榜两模型均有 score/votes/ci → 2 个气泡
    expect(container.querySelectorAll("circle").length).toBe(2);
    // 含坐标轴与强势区标记
    expect(container.querySelector(".ai-lb-bubble__axis")).toBeTruthy();
    expect(container.querySelector(".ai-lb-bubble__zone")).toBeTruthy();
  });

  it("ArenaBubbleChart：仅含部分 board 数据的模型会被过滤", () => {
    // vision board：仅 Alpha 有 vision 切片，Beta 仅 text → 只渲染 1 个气泡
    const { container } = render(<ArenaBubbleChart items={arenaModels} board="vision" />);
    expect(container.querySelectorAll("circle").length).toBe(1);
    // 无任何匹配数据时不渲染容器
    const empty = render(<ArenaBubbleChart items={lbModels} board="text" />);
    expect(empty.container.querySelector(".ai-lb-bubble")).toBeNull();
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
    expect(columnValue(arenaModels[0], "arena", "votes")).toBe(5000);
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

  it("filterByLicense：按 open/proprietary 过滤，unknown 不计入任一", () => {
    const list = [
      { id: "a", name: "A", license: "open" },
      { id: "b", name: "B", license: "proprietary" },
      { id: "c", name: "C", license: "Apache 2.0" },
      { id: "d", name: "D", license: null },
    ];
    expect(filterByLicense(list, "all").length).toBe(4);
    expect(filterByLicense(list, "open").map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(filterByLicense(list, "proprietary").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("数据透传（A/B）：lastUpdated 与 rankSeries", () => {
  it("normalizeBoardResult 透传 lastUpdated", () => {
    const r = normalizeBoardResult({ ok: true, items: [], lastUpdated: "Jul 16, 2026" });
    expect(r.lastUpdated).toBe("Jul 16, 2026");
  });

  it("normalizeAiModel 透传 rankSeries（缺失时为 null）", () => {
    const withSeries = normalizeAiModel({
      id: "a",
      name: "Alpha",
      arena: { text: { score: 1 } },
      rankSeries: [{ date: "2026-07-12", rank: 3 }],
    });
    expect(Array.isArray(withSeries.rankSeries)).toBe(true);
    const without = normalizeAiModel({ id: "b", name: "Beta" });
    expect(without.rankSeries).toBeNull();
  });
});
