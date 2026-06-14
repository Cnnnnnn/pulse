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
