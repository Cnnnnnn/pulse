// @vitest-environment happy-dom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/preact";
// imports will be added in implementation phase

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

describe("BracketTree", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    // mock teams-data so displayTeam returns predictable flag/cn
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: "🏳", cn: name } : null,
    }));
    // mock window.api to prevent compute on mount errors
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => { delete global.window; vi.doUnmock("../../../src/renderer/worldcup/teams-data.js"); });

  test("renders 5 stage columns (r32, r16, qf, sf, final)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelectorAll(".bracket-tree-column")).toHaveLength(5);
  });

  test("renders MatchCards within R32 column", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const r32Col = container.querySelectorAll(".bracket-tree-column")[0];
    expect(r32Col.querySelectorAll(".bracket-card")).toHaveLength(2);
  });

  test("MatchCard displays team1 above team2 (vertical layout)", () => {
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    const card = container.querySelector(".bracket-card");
    const teams = card.querySelectorAll(".bracket-card-team");
    expect(teams).toHaveLength(2);
    // team1 (top) should come before team2 (bottom) in document order
    expect(teams[0].classList.contains("bracket-card-team--top")).toBe(true);
    expect(teams[1].classList.contains("bracket-card-team--bottom")).toBe(true);
  });
});

describe("BracketConnectors", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    // Mock ResizeObserver as a no-op (happy-dom's ResizeObserver stub may
    // not be defined, which would crash the useConnectors effect)
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    // Provide non-zero getBoundingClientRect for every element so the
    // useConnectors hook can compute paths without relying on real layout.
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80, x: 0, y: 0, toJSON() { return this; } };
    };
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: "🏳", cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => {
    delete global.window;
    delete global.ResizeObserver;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("renders 32 SVG paths (16 R32→R16 + 8 R16→QF + 4 QF→SF + 2 SF→Final + 2 SF→Third)", () => {
    const fullSnapshot = {
      ...sampleSnapshot,
      r32: Array.from({ length: 16 }, (_, i) => ({ matchNum: 73 + i, slot1: { team: null, source: `r32:${73+i}` }, slot2: { team: null, source: `r32:${73+i}` }, status: "projected" })),
      r16: Array.from({ length: 8 }, (_, i) => ({ matchNum: 89 + i, slot1: { team: null, source: `r16:${89+i}` }, slot2: { team: null, source: `r16:${89+i}` }, status: "projected" })),
      qf: Array.from({ length: 4 }, (_, i) => ({ matchNum: 97 + i, slot1: { team: null, source: `qf:${97+i}` }, slot2: { team: null, source: `qf:${97+i}` }, status: "projected" })),
      sf: Array.from({ length: 2 }, (_, i) => ({ matchNum: 101 + i, slot1: { team: null, source: `sf:${101+i}` }, slot2: { team: null, source: `sf:${101+i}` }, status: "projected" })),
      final: { matchNum: 104, slot1: { team: null, source: "sf:101" }, slot2: { team: null, source: "sf:102" }, status: "projected" },
      third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
    };
    const { container } = render(<BracketTree snapshot={fullSnapshot} onMatchClick={() => {}} />);
    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      const svg = container.querySelector(".bracket-tree-connectors");
      expect(svg).toBeTruthy();
      const paths = container.querySelectorAll(".bracket-tree-connectors path");
      // 16+8+4+2+2 = 32
      expect(paths.length).toBe(32);
    });
  });
});

describe("FinalColumn styling", () => {
  let BracketTree;
  beforeEach(async () => {
    vi.resetModules();
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80, x: 0, y: 0, toJSON() { return this; } };
    };
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: "🏳", cn: name } : null,
    }));
    global.window = { api: { worldcupComputeBracket: async () => ({ ok: true, snapshot: null }), worldcupLoadBracket: async () => ({ ok: true, snapshot: null }) } };
    const mod = await import("../../src/renderer/worldcup/BracketTree.jsx");
    BracketTree = mod.BracketTree;
  });
  afterEach(() => {
    delete global.window;
    delete global.ResizeObserver;
    vi.doUnmock("../../../src/renderer/worldcup/teams-data.js");
  });

  test("FinalColumn renders a Final card with .bracket-card--final-prominent class", () => {
    const snapshot = {
      ...sampleSnapshot,
      final: { matchNum: 104, slot1: { team: { name: "Brazil" }, source: "sf:101" }, slot2: { team: { name: "France" }, source: "sf:102" }, status: "pending" },
      third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
    };
    const { container } = render(<BracketTree snapshot={snapshot} onMatchClick={() => {}} />);
    const finalCard = container.querySelector(".bracket-card--final-prominent");
    expect(finalCard).toBeTruthy();
  });

  test("FinalColumn renders a Third card with .bracket-card--third-prominent class", () => {
    const snapshot = {
      ...sampleSnapshot,
      final: { matchNum: 104, slot1: { team: null, source: "sf:101" }, slot2: { team: null, source: "sf:102" }, status: "projected" },
      third: { matchNum: 103, slot1: { team: null, source: "sf:101-loser" }, slot2: { team: null, source: "sf:102-loser" }, status: "projected" },
    };
    const { container } = render(<BracketTree snapshot={snapshot} onMatchClick={() => {}} />);
    const thirdCard = container.querySelector(".bracket-card--third-prominent");
    expect(thirdCard).toBeTruthy();
  });

  test("Final card shows FINAL badge in its head", () => {
    const snapshot = {
      ...sampleSnapshot,
      final: { matchNum: 104, slot1: { team: { name: "Brazil" }, source: "sf:101" }, slot2: { team: { name: "France" }, source: "sf:102" }, status: "pending" },
      third: null,
    };
    const { container } = render(<BracketTree snapshot={snapshot} onMatchClick={() => {}} />);
    const finalCard = container.querySelector(".bracket-card--final-prominent");
    expect(finalCard.textContent).toContain("FINAL");
  });
});

describe("Responsive fallback", () => {
  let BracketTree;
  let originalInnerWidth;

  beforeEach(async () => {
    vi.resetModules();
    // happy-dom provides `window`; grab original innerWidth defensively via
    // globalThis in case a prior test's afterEach left the bare identifier
    // temporarily unhooked. Once we set up `global.window` below, the
    // component under test will see our mock.
    originalInnerWidth = (typeof window !== "undefined" && window.innerWidth) || 1024;
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80, x: 0, y: 0, toJSON() { return this; } };
    };
    vi.doMock("../../../src/renderer/worldcup/teams-data.js", () => ({
      displayTeam: (name) => name ? { flag: "🏳", cn: name } : null,
    }));
    // Establish window global with innerWidth so the new useNarrowViewport
    // hook can read window.innerWidth on first render.
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

  test("renders horizontal tree when window width >= 900px", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree")).toBeTruthy();
    expect(container.querySelector(".bracket-tree-fallback")).toBeNull();
  });

  test("renders vertical fallback when window width < 900px", () => {
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    expect(container.querySelector(".bracket-tree-fallback")).toBeTruthy();
    expect(container.querySelector(".bracket-tree")).toBeNull();
  });

  test("fallback renders all 5 stage sections (r32, r16, qf, sf, final+third)", () => {
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true, writable: true });
    const { container } = render(<BracketTree snapshot={sampleSnapshot} onMatchClick={() => {}} />);
    // v1 used .bracket-stage class for each section
    const sections = container.querySelectorAll(".bracket-tree-fallback .bracket-stage");
    expect(sections.length).toBe(5);
  });
});
