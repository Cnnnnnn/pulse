// @vitest-environment happy-dom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/preact";

const sampleSnapshot = {
  version: 1,
  computedAt: 12345,
  inputsHash: "sha256:abc",
  projected: true,
  completeGroupCount: 4,
  r32: [
    { matchNum: 73, slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" }, slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" }, status: "pending" },
    { matchNum: 74, slot1: { team: { name: "Germany" }, source: "group:E:winner" }, slot2: { team: null, source: "best-third-pool", pool: ["A","B","C","D","F"] }, status: "projected" },
  ],
  r16: [
    { matchNum: 90, slot1: { team: null, source: "r32:73" }, slot2: { team: null, source: "r32:75" }, status: "projected" },
  ],
  qf: [],
  sf: [],
  final: null,
  third: null,
  thirdPlacedAdvancing: ["E","I","J","K","L","D","F","G"],
  annexCIndex: 0,
  warnings: ["simplified_annex_c_default_row"],
};

// ponytail: 当前 BracketTree 始终走 v1 fallback (5 段垂直堆叠),
// 不再尝试 horizontal tree / 双行卡 / 中央奖杯卡.
describe("BracketTree (fallback only)", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: 'XX', cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    Object.defineProperty(global.window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => {
    delete global.window;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("renders 5 stage sections (r32, r16, qf, sf, finals)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    const sections = container.querySelectorAll(".bracket-tree-fallback .bracket-stage");
    expect(sections.length).toBe(5);
  });

  test("each stage section renders the correct label", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.textContent).toContain("1/16 决赛");
    expect(container.textContent).toContain("1/8 决赛");
    expect(container.textContent).toContain("1/4 决赛");
    expect(container.textContent).toContain("半决赛");
    expect(container.textContent).toContain("决赛");
    expect(container.textContent).toContain("季军赛");
  });

  test("R32 section shows 2 match cards from sample", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const r32Section = container.querySelector(".bracket-stage--r32");
    expect(r32Section).toBeTruthy();
    expect(r32Section.querySelectorAll(".bracket-card")).toHaveLength(2);
  });

  test("renders MatchCards with team1 (left) + vs + team2 (right)", () => {
    // ponytail: fallback 用单行布局, 队1 在左, vs 居中, 队2 在右.
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card).toBeTruthy();
    const teams = card.querySelectorAll(".bracket-card-team");
    expect(teams).toHaveLength(2);
    const vs = card.querySelector(".bracket-card-vs");
    expect(vs).toBeTruthy();
    expect(vs.textContent).toContain("vs");
  });

  test("R16 large-stage splits into two halves (≥8 cards uses bracket-fallback-split)", () => {
    const bigR32 = Array.from({ length: 16 }, (_, i) => ({
      matchNum: 73 + i,
      slot1: { team: { name: `T${i}A` }, source: `group:A:winner` },
      slot2: { team: { name: `T${i}B` }, source: `group:B:winner` },
      status: "pending",
    }));
    const { container } = render(<BracketTree snapshot={{ ...sampleSnapshot, r32: bigR32 }} onMatchClick={() => {}} />);
    const r32Section = container.querySelector(".bracket-stage--r32");
    // ponytail: 16 张拆上下半 (2 个 .bracket-fallback-half)
    expect(r32Section.querySelectorAll(".bracket-fallback-half")).toHaveLength(2);
    const halves = r32Section.querySelectorAll(".bracket-fallback-half");
    expect(halves[0].querySelectorAll(".bracket-card")).toHaveLength(8);
    expect(halves[1].querySelectorAll(".bracket-card")).toHaveLength(8);
  });

  test("empty stages show '小组赛尚未确定对阵' message", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const qfSection = container.querySelector(".bracket-stage--qf");
    expect(qfSection).toBeTruthy();
    expect(qfSection.classList.contains("bracket-stage--empty")).toBe(true);
    expect(qfSection.textContent).toContain("小组赛尚未确定对阵");
  });

  test("matchNum rendered in 'Match 73' format", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const cardNums = container.querySelectorAll(".bracket-card-num");
    expect(cardNums[0].textContent).toContain("Match 73");
  });

  test("placeholder for slots without team shows 'A 组第 1' format", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    // M74 slot2 是 best-third-pool placeholder
    expect(container.textContent).toContain("第 3 名");
    expect(container.textContent).toContain("A/B/C/D/F");
  });

  test("renders Final and Third in a single 'finals' section when both present", () => {
    const snapshot = {
      ...sampleSnapshot,
      final: { matchNum: 104, slot1: { team: { name: "Brazil" }, source: "sf:101" }, slot2: { team: { name: "France" }, source: "sf:102" }, status: "pending" },
      third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
    };
    const { container } = render(<BracketTree snapshot={snapshot} onMatchClick={() => {}} />);
    const finalsSection = container.querySelector(".bracket-stage--finals");
    expect(finalsSection).toBeTruthy();
    expect(finalsSection.querySelectorAll(".bracket-card")).toHaveLength(2);
  });

  test("clicking a card calls onMatchClick", () => {
    const onMatchClick = vi.fn();
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={onMatchClick} />);
    const firstCard = container.querySelector(".bracket-card");
    firstCard.click();
    expect(onMatchClick).toHaveBeenCalledTimes(1);
    expect(onMatchClick.mock.calls[0][0].matchNum).toBe(73);
  });

  test("v2.65 card shows score (ft[0] : ft[1]) when status=final and score.ft is set", () => {
    const finalSnap = {
      ...sampleSnapshot,
      r32: [
        {
          matchNum: 73,
          slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
          slot2: { team: { name: "Canada" }, source: "group:B:runnerUp" },
          status: "final",
          score: { ft: [0, 1], ht: [0, 0], status: "final" },
        },
      ],
    };
    const { container } = render(<BracketTree snapshot={finalSnap} onMatchClick={() => {}} />);
    const score = container.querySelector(".bracket-card-score");
    expect(score).toBeTruthy();
    expect(score.textContent).toContain("0");
    expect(score.textContent).toContain("1");
    // winner (away=1) gets leader styling
    const nums = score.querySelectorAll(".bracket-card-score-num");
    expect(nums[0].classList.contains("is-leader")).toBe(false);
    expect(nums[1].classList.contains("is-leader")).toBe(true);
  });

  test("v2.64 card shows 'vs' when no score (status=pending)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card.querySelector(".bracket-card-vs")).toBeTruthy();
    expect(card.querySelector(".bracket-card-score")).toBeNull();
  });

  test("v2.64 card header shows match num + status badge", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const head = container.querySelector(".bracket-card-head");
    expect(head).toBeTruthy();
    expect(head.querySelector(".bracket-card-num").textContent).toContain("Match 73");
    expect(head.querySelector(".bracket-badge")).toBeTruthy();
  });

  test("v2.64 kickoff meta line: time + venue (single row)", () => {
    const snap = {
      ...sampleSnapshot,
      r32: [{
        matchNum: 73,
        slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
        slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
        status: "pending",
        kickoff: { date: "06-28", time: "20:00", timezone: "GMT+8", venue: "洛杉矶体育场" },
      }],
    };
    const { container } = render(<BracketTree snapshot={snap} onMatchClick={() => {}} />);
    const meta = container.querySelector(".bracket-card-meta");
    expect(meta).toBeTruthy();
    expect(meta.textContent).toContain("06-28");
    expect(meta.textContent).toContain("20:00");
    expect(meta.textContent).toContain("洛杉矶体育场");
  });
});

describe("splitBracketByHalf (保留 API, 不被 fallback 调用)", () => {
  let splitBracketByHalf;
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: 'XX', cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    Object.defineProperty(global.window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    splitBracketByHalf = mod.splitBracketByHalf;
  });
  afterEach(() => {
    delete global.window;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("splits R32 into upper[0..7] and lower[8..15]", () => {
    const halves = splitBracketByHalf({
      ...sampleSnapshot,
      r32: Array.from({ length: 16 }, (_, i) => ({ matchNum: 73 + i, slot1: {}, slot2: {}, status: "pending" })),
    });
    expect(halves.upperR32).toHaveLength(8);
    expect(halves.lowerR32).toHaveLength(8);
    expect(halves.upperR32[0].matchNum).toBe(73);
    expect(halves.lowerR32[0].matchNum).toBe(81);
  });

  test("returns null for null snapshot", () => {
    expect(splitBracketByHalf(null)).toBeNull();
  });
});