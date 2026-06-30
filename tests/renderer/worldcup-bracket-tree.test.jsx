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

// 32 场完整 snapshot (16 R32, 8 R16, 4 QF, 2 SF, 1 final, 1 third)
function buildFullSnapshot() {
  return {
    ...sampleSnapshot,
    r32: Array.from({ length: 16 }, (_, i) => ({
      matchNum: 73 + i,
      slot1: { team: null, source: `group:${String.fromCharCode(65 + (i % 8))}:${i % 2 === 0 ? "winner" : "runnerUp"}` },
      slot2: { team: null, source: `group:${String.fromCharCode(65 + ((i + 4) % 8))}:${i % 2 === 0 ? "runnerUp" : "winner"}` },
      status: "projected",
    })),
    r16: Array.from({ length: 8 }, (_, i) => ({
      matchNum: 89 + i,
      slot1: { team: null, source: `r32:${73 + i * 2}` },
      slot2: { team: null, source: `r32:${74 + i * 2}` },
      status: "projected",
    })),
    qf: Array.from({ length: 4 }, (_, i) => ({
      matchNum: 97 + i,
      slot1: { team: null, source: `r16:${89 + i * 2}` },
      slot2: { team: null, source: `r16:${90 + i * 2}` },
      status: "projected",
    })),
    sf: Array.from({ length: 2 }, (_, i) => ({
      matchNum: 101 + i,
      slot1: { team: null, source: `qf:${97 + i * 2}` },
      slot2: { team: null, source: `qf:${98 + i * 2}` },
      status: "projected",
    })),
    final: { matchNum: 104, slot1: { team: null, source: "sf:101" }, slot2: { team: null, source: "sf:102" }, status: "projected" },
    third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
  };
}

describe("BracketTree", () => {
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

  test("v3 bracket tree: renders --tree container with 2 half-grid + center", () => {
    // ponytail: 新设计只渲染整张 bracket tree (上半 + 下半 + 中央), 没有 stage tab.
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree--tree")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-grid")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-half--upper")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-half--lower")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-center")).toBeTruthy();
  });

  test("renders upper half: R32[0..7], R16[0..3], QF[0..1], SF[0]", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const upper = container.querySelector(".bracket-tree-half--upper");
    const cols = upper.querySelectorAll(".bracket-tree-column");
    // 4 列: sf, qf, r16, r32 (顺序: 离 Final 最近的在上, 离 Final 最远的在下)
    expect(cols).toHaveLength(4);
    expect(cols[0].classList.contains("bracket-tree-column--sf")).toBe(true);
    expect(cols[1].classList.contains("bracket-tree-column--qf")).toBe(true);
    expect(cols[2].classList.contains("bracket-tree-column--r16")).toBe(true);
    expect(cols[3].classList.contains("bracket-tree-column--r32")).toBe(true);
    // R32 上半 = M73..M80 (8 张)
    const r32Cards = cols[3].querySelectorAll(".bracket-card");
    expect(r32Cards).toHaveLength(8);
    expect(r32Cards[0].textContent).toContain("M73");
    expect(r32Cards[7].textContent).toContain("M80");
    // R16 上半 = M89, M91, M93, M95 (4 张)
    const r16Cards = cols[2].querySelectorAll(".bracket-card");
    expect(r16Cards).toHaveLength(4);
    // QF 上半 = M97, M99 (2 张)
    const qfCards = cols[1].querySelectorAll(".bracket-card");
    expect(qfCards).toHaveLength(2);
    // SF 上半 = M101 (1 张)
    const sfCards = cols[0].querySelectorAll(".bracket-card");
    expect(sfCards).toHaveLength(1);
    expect(sfCards[0].textContent).toContain("M101");
  });

  test("renders lower half: R32[8..15], R16[4..7], QF[2..3], SF[1]", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const lower = container.querySelector(".bracket-tree-half--lower");
    const cols = lower.querySelectorAll(".bracket-tree-column");
    // 下半列顺序与上半镜像: r32, r16, qf, sf
    expect(cols).toHaveLength(4);
    expect(cols[0].classList.contains("bracket-tree-column--r32")).toBe(true);
    expect(cols[1].classList.contains("bracket-tree-column--r16")).toBe(true);
    expect(cols[2].classList.contains("bracket-tree-column--qf")).toBe(true);
    expect(cols[3].classList.contains("bracket-tree-column--sf")).toBe(true);
    // R32 下半 = M81..M88 (8 张)
    const r32Cards = cols[0].querySelectorAll(".bracket-card");
    expect(r32Cards).toHaveLength(8);
    expect(r32Cards[0].textContent).toContain("M81");
    expect(r32Cards[7].textContent).toContain("M88");
    // SF 下半 = M102 (1 张)
    const sfCards = cols[3].querySelectorAll(".bracket-card");
    expect(sfCards).toHaveLength(1);
    expect(sfCards[0].textContent).toContain("M102");
  });

  test("renders final card with trophy styling when final exists", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const finalCard = container.querySelector(".bracket-final-card");
    expect(finalCard).toBeTruthy();
    expect(finalCard.textContent).toContain("决");
    expect(finalCard.textContent).toContain("赛");
    expect(finalCard.textContent).toContain("M104");
  });

  test("renders third-place card when third exists", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const thirdCard = container.querySelector(".bracket-third-card");
    expect(thirdCard).toBeTruthy();
    expect(thirdCard.textContent).toContain("季军");
    expect(thirdCard.textContent).toContain("M103");
  });

  test("final/third placeholder when missing", () => {
    const noFinal = { ...sampleSnapshot };
    const { container } = render(<BracketTree snapshot={noFinal} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-final-card")).toBeNull();
    expect(container.querySelector(".bracket-third-card")).toBeNull();
    expect(container.querySelector(".bracket-tree-center-placeholder")).toBeTruthy();
  });

  test("MatchCard double-row layout: team1 top, team2 bottom, score right", () => {
    // ponytail: 双行布局 — 队1 (.bracket-card-team--top) 在上, 队2 (.bracket-card-team--bottom) 在下,
    // 比分 (.bracket-card-score) 在右, 中间分隔靠 row flex 布局.
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card.querySelector(".bracket-card-row--double")).toBeTruthy();
    const teams = card.querySelectorAll(".bracket-card-team");
    expect(teams).toHaveLength(2);
    expect(teams[0].classList.contains("bracket-card-team--top")).toBe(true);
    expect(teams[1].classList.contains("bracket-card-team--bottom")).toBe(true);
  });

  test("MatchCard displays score as 2 numbers split by dash when final", () => {
    const scoreSnapshot = {
      ...sampleSnapshot,
      r32: [
        { matchNum: 73, slot1: { team: { name: "Brazil" }, source: "group:A:winner" }, slot2: { team: { name: "Germany" }, source: "group:B:winner" }, status: "final", score: { ft: [2, 1] } },
      ],
      r16: [], // ponytail: 清空 R16 避免 querySelector 拿到 R16 projected card 而非 R32 final card
    };
    const { container } = render(<BracketTree snapshot={scoreSnapshot} onMatchClick={() => {}} />);
    // 用 bracket-card--final 选择器精准定位 R32 那张 final 卡
    const card = container.querySelector(".bracket-card--final");
    expect(card).toBeTruthy();
    const score = card.querySelector(".bracket-card-score");
    expect(score).toBeTruthy();
    const nums = score.querySelectorAll(".bracket-card-score-num");
    expect(nums).toHaveLength(2);
    expect(nums[0].textContent).toBe("2");
    expect(nums[1].textContent).toBe("1");
    // 胜方加粗 class
    const winnerTeam = card.querySelector(".bracket-card-team--winner");
    expect(winnerTeam).toBeTruthy();
    expect(winnerTeam.classList.contains("bracket-card-team--top")).toBe(true);
  });

  test("MatchCard shows 'vs' when no score", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    expect(card.querySelector(".bracket-card-vs")).toBeTruthy();
  });

  test("renders SVG center connectors for SF→Final + SF→Third", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    const svg = container.querySelector(".bracket-tree-center-connectors");
    expect(svg).toBeTruthy();
  });
});

describe("BracketConnectors (center)", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80, x: 0, y: 0, toJSON() { return this; } };
    };
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
    delete global.ResizeObserver;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("renders center connectors with both Final paths and dashed Third paths", () => {
    const { container } = render(<BracketTree snapshot={buildFullSnapshot()} onMatchClick={() => {}} />);
    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      const paths = container.querySelectorAll(".bracket-tree-center-connectors path");
      // 2 条 Final 折线 + 2 条 Third 虚线 = 4 条
      expect(paths.length).toBe(4);
      const dashed = container.querySelectorAll(".bracket-tree-center-connector--dashed");
      expect(dashed.length).toBe(2);
    });
  });
});

describe("Responsive fallback", () => {
  let BracketTree;
  let originalInnerWidth;

  beforeEach(async () => {
    vi.resetModules();
    originalInnerWidth = (typeof window !== "undefined" && window.innerWidth) || 1024;
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80, x: 0, y: 0, toJSON() { return this; } };
    };
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: 'XX', cn: name } : null,
    }));
    global.window = global.window || {};
    Object.defineProperty(global.window, "innerWidth", { value: 1200, configurable: true, writable: true });
    Object.defineProperty(global.window, "api", {
      value: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) },
      configurable: true, writable: true,
    });
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => {
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true, writable: true });
    }
    delete global.window;
    delete global.ResizeObserver;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("renders horizontal tree when window width >= 700px", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-fallback")).toBeNull();
  });

  test("renders vertical fallback when window width < 700px", () => {
    Object.defineProperty(window, "innerWidth", { value: 600, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    expect(container.querySelector(".bracket-tree")).toBeNull();
  });

  test("fallback renders all 5 stage sections (r32, r16, qf, sf, final+third)", () => {
    Object.defineProperty(window, "innerWidth", { value: 600, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const sections = container.querySelectorAll(".bracket-tree-fallback .bracket-stage");
    expect(sections.length).toBe(5);
  });
});

describe("splitBracketByHalf (mirror split)", () => {
  let splitBracketByHalf;
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
    splitBracketByHalf = mod.splitBracketByHalf;
  });
  afterEach(() => {
    delete global.window;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("upperR32 = r32[0..7], lowerR32 = r32[8..15]", () => {
    const halves = splitBracketByHalf(buildFullSnapshot());
    expect(halves.upperR32).toHaveLength(8);
    expect(halves.upperR32[0].matchNum).toBe(73);
    expect(halves.upperR32[7].matchNum).toBe(80);
    expect(halves.lowerR32).toHaveLength(8);
    expect(halves.lowerR32[0].matchNum).toBe(81);
    expect(halves.lowerR32[7].matchNum).toBe(88);
  });

  test("upperR16 = r16[0..3], lowerR16 = r16[4..7]", () => {
    const halves = splitBracketByHalf(buildFullSnapshot());
    expect(halves.upperR16).toHaveLength(4);
    expect(halves.lowerR16).toHaveLength(4);
  });

  test("upperQF = qf[0..1], lowerQF = qf[2..3]", () => {
    const halves = splitBracketByHalf(buildFullSnapshot());
    expect(halves.upperQF).toHaveLength(2);
    expect(halves.lowerQF).toHaveLength(2);
  });

  test("upperSF = sf[0], lowerSF = sf[1]", () => {
    const halves = splitBracketByHalf(buildFullSnapshot());
    expect(halves.upperSF).toHaveLength(1);
    expect(halves.upperSF[0].matchNum).toBe(101);
    expect(halves.lowerSF).toHaveLength(1);
    expect(halves.lowerSF[0].matchNum).toBe(102);
  });

  test("preserves final and third", () => {
    const halves = splitBracketByHalf(buildFullSnapshot());
    expect(halves.final.matchNum).toBe(104);
    expect(halves.third.matchNum).toBe(103);
  });

  test("returns null for null snapshot", () => {
    expect(splitBracketByHalf(null)).toBeNull();
  });

  test("handles partial snapshot (e.g. empty qf/sf)", () => {
    const halves = splitBracketByHalf(sampleSnapshot);
    expect(halves.upperR32).toHaveLength(2);
    expect(halves.upperQF).toHaveLength(0);
    expect(halves.upperSF).toHaveLength(0);
    expect(halves.lowerSF).toHaveLength(0);
    expect(halves.final).toBeNull();
  });
});