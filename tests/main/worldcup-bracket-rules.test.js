import { describe, test, expect } from "vitest";
const {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  resolveR32Matchups,
  propagateWinner,
  computeBracket,
} = require("../../src/main/worldcup/bracket-rules");

describe("sortThirdPlaced", () => {
  test("sorts 12 third-placed teams by pts/gd/gf DESC", () => {
    const standings = {
      A: { pts: 6, gd: 2, gf: 5, ga: 3 },
      B: { pts: 6, gd: 2, gf: 7, ga: 5 },
      C: { pts: 4, gd: 0, gf: 3, ga: 3 },
      D: { pts: 6, gd: 4, gf: 8, ga: 4 },
      E: { pts: 3, gd: -1, gf: 2, ga: 3 },
      F: { pts: 6, gd: 2, gf: 4, ga: 2 },
      G: { pts: 4, gd: 1, gf: 5, ga: 4 },
      H: { pts: 1, gd: -3, gf: 1, ga: 4 },
      I: { pts: 6, gd: 3, gf: 6, ga: 3 },
      J: { pts: 4, gd: -1, gf: 4, ga: 5 },
      K: { pts: 3, gd: 0, gf: 3, ga: 3 },
      L: { pts: 0, gd: -4, gf: 0, ga: 4 },
    };
    const sorted = sortThirdPlaced(standings);
    // Deviation from plan: plan's expected had "E","K" but K (gd=0) > E (gd=-1)
    // under the FIFA criteria stated in the same plan (gd DESC). Implementation
    // follows the stated criteria; expectation below reflects that.
    expect(sorted.map((s) => s.group)).toEqual([
      "D", "I", "B", "A", "F", "G", "C", "J", "K", "E", "H", "L",
    ]);
  });

  test("ties broken by gd then gf", () => {
    const standings = {
      A: { pts: 3, gd: 0, gf: 2, ga: 2 },
      B: { pts: 3, gd: 0, gf: 3, ga: 3 },
    };
    expect(sortThirdPlaced(standings).map((s) => s.group)).toEqual(["B", "A"]);
  });

  test("returns empty array when standings empty", () => {
    expect(sortThirdPlaced({})).toEqual([]);
  });

  test("returns empty array when standings null/undefined", () => {
    expect(sortThirdPlaced(null)).toEqual([]);
    expect(sortThirdPlaced(undefined)).toEqual([]);
  });

  test("missing pts/gd/gf defaults to 0", () => {
    const standings = { A: {}, B: { pts: 3 } };
    const sorted = sortThirdPlaced(standings);
    expect(sorted[0].group).toBe("B");
    expect(sorted[1].group).toBe("A");
  });
});

describe("selectThirdPlaced", () => {
  test("returns top 8 group letters by pts/gd/gf", () => {
    const sorted = [
      { group: "D", pts: 6, gd: 4, gf: 8 },
      { group: "I", pts: 6, gd: 3, gf: 6 },
      { group: "B", pts: 6, gd: 2, gf: 7 },
      { group: "A", pts: 6, gd: 2, gf: 5 },
      { group: "F", pts: 6, gd: 2, gf: 4 },
      { group: "G", pts: 4, gd: 1, gf: 5 },
      { group: "C", pts: 4, gd: 0, gf: 3 },
      { group: "J", pts: 4, gd: -1, gf: 4 },
      { group: "E", pts: 3, gd: -1, gf: 2 },
      { group: "K", pts: 3, gd: 0, gf: 3 },
      { group: "H", pts: 1, gd: -3, gf: 1 },
      { group: "L", pts: 0, gd: -4, gf: 0 },
    ];
    expect(selectThirdPlaced(sorted)).toEqual([
      "D", "I", "B", "A", "F", "G", "C", "J",
    ]);
  });

  test("returns fewer than 8 when fewer available", () => {
    const sorted = [
      { group: "A", pts: 6, gd: 2, gf: 5 },
      { group: "B", pts: 4, gd: 0, gf: 3 },
    ];
    expect(selectThirdPlaced(sorted)).toEqual(["A", "B"]);
  });

  test("returns empty array when sorted is empty", () => {
    expect(selectThirdPlaced([])).toEqual([]);
  });

  test("respects custom n parameter", () => {
    const sorted = [
      { group: "A", pts: 6, gd: 2, gf: 5 },
      { group: "B", pts: 4, gd: 0, gf: 3 },
      { group: "C", pts: 3, gd: -1, gf: 2 },
      { group: "D", pts: 1, gd: -3, gf: 1 },
    ];
    expect(selectThirdPlaced(sorted, 2)).toEqual(["A", "B"]);
    expect(selectThirdPlaced(sorted, 4)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("matchAnnexCCase", () => {
  test("returns row 0 default with config", () => {
    const result = matchAnnexCCase(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(result.rowIndex).toBe(0);
    expect(result.config).toBeDefined();
    expect(result.config.r32Matches_73_88).toHaveLength(16);
  });

  test("always returns default row in v1 regardless of advancing groups", () => {
    expect(matchAnnexCCase([]).rowIndex).toBe(0);
    expect(matchAnnexCCase(["X", "Y", "Z"]).rowIndex).toBe(0);
  });

  test("config has all 5 stages", () => {
    const result = matchAnnexCCase([]);
    expect(result.config.r32Matches_73_88).toHaveLength(16);
    expect(result.config.r16Matches_89_96).toHaveLength(8);
    expect(result.config.qfMatches_97_100).toHaveLength(4);
    expect(result.config.sfMatches_101_102).toHaveLength(2);
    expect(result.config.finalMatch.num).toBe(104);
    expect(result.config.thirdMatch.num).toBe(103);
  });
});

describe("resolveR32Matchups", () => {
  test("resolves 16 R32 matches with real team names from group results", () => {
    const groupResults = {
      A: { winner: 'Mexico', runnerUp: 'South Africa', third: 'South Korea' },
      B: { winner: 'Canada', runnerUp: 'Switzerland', third: 'Qatar' },
      C: { winner: 'Brazil', runnerUp: 'Morocco', third: 'Scotland' },
      D: { winner: 'USA', runnerUp: 'Paraguay', third: 'Australia' },
      E: { winner: 'Germany', runnerUp: 'Curaçao', third: 'Ivory Coast' },
      F: { winner: 'Netherlands', runnerUp: 'Japan', third: 'Sweden' },
      G: { winner: 'Belgium', runnerUp: 'Egypt', third: 'Iran' },
      H: { winner: 'Spain', runnerUp: 'Cape Verde', third: 'Saudi Arabia' },
      I: { winner: 'France', runnerUp: 'Senegal', third: 'Iraq' },
      J: { winner: 'Argentina', runnerUp: 'Algeria', third: 'Austria' },
      K: { winner: 'Portugal', runnerUp: 'DR Congo', third: 'Colombia' },
      L: { winner: 'England', runnerUp: 'Croatia', third: 'Ghana' },
    };
    const annex = matchAnnexCCase(['E', 'I', 'J', 'K', 'L', 'D', 'F', 'G']);
    const r32 = resolveR32Matchups(annex.config, groupResults);
    expect(r32).toHaveLength(16);
    expect(r32[0].matchNum).toBe(73);
    expect(r32[0].slot1.team.name).toBe('South Africa');
    expect(r32[0].slot2.team.name).toBe('Switzerland');
    expect(r32[1].matchNum).toBe(74);
    expect(r32[1].slot1.team.name).toBe('Germany');
    expect(r32[1].slot2.source).toBe('best-third-pool');
  });

  test("returns slot.team=null when group result missing", () => {
    const groupResults = { A: { winner: 'Mexico', runnerUp: 'X', third: 'Y' } };
    const annex = matchAnnexCCase(['E']);
    const r32 = resolveR32Matchups(annex.config, groupResults);
    const m74 = r32.find((m) => m.matchNum === 74);
    expect(m74.slot1.team).toBeNull();
  });

  test("status is 'pending' when both teams resolved", () => {
    const groupResults = {
      A: { winner: 'A1', runnerUp: 'A2', third: 'A3' },
      B: { winner: 'B1', runnerUp: 'B2', third: 'B3' },
    };
    const r32 = resolveR32Matchups(matchAnnexCCase([]).config, groupResults);
    expect(r32[0].status).toBe('pending');
  });
});

describe("propagateWinner", () => {
  test("propagates R32 winners into R16 slots when all final", () => {
    const r32Matches = [
      { matchNum: 73, slot1: { team: { name: 'A' } }, slot2: { team: { name: 'B' } }, score: { ft: [2, 1], status: 'final' } },
      { matchNum: 74, slot1: { team: { name: 'C' } }, slot2: { team: { name: 'D' } }, score: { ft: [1, 1], et: [2, 1], status: 'final' } },
      { matchNum: 75, slot1: { team: { name: 'E' } }, slot2: { team: { name: 'F' } }, score: { ft: [0, 0], pen: [4, 3], status: 'final' } },
      { matchNum: 76, slot1: { team: { name: 'G' } }, slot2: { team: { name: 'H' } }, score: { ft: [3, 0], status: 'final' } },
      { matchNum: 77, slot1: { team: { name: 'I' } }, slot2: { team: { name: 'J' } }, score: { ft: [1, 2], status: 'final' } },
      { matchNum: 78, slot1: { team: { name: 'K' } }, slot2: { team: { name: 'L' } }, score: { ft: [2, 0], status: 'final' } },
      { matchNum: 79, slot1: { team: { name: 'M' } }, slot2: { team: { name: 'N' } }, score: { ft: [1, 1], et: [1, 2], status: 'final' } },
      { matchNum: 80, slot1: { team: { name: 'O' } }, slot2: { team: { name: 'P' } }, score: { ft: [0, 1], status: 'final' } },
    ];
    const r16Template = [
      { num: 89, sources: ['r32:74', 'r32:77'] },
      { num: 90, sources: ['r32:73', 'r32:75'] },
      { num: 91, sources: ['r32:76', 'r32:78'] },
      { num: 92, sources: ['r32:79', 'r32:80'] },
      { num: 93, sources: ['r32:83', 'r32:84'] },
      { num: 94, sources: ['r32:81', 'r32:82'] },
      { num: 95, sources: ['r32:86', 'r32:88'] },
      { num: 96, sources: ['r32:85', 'r32:87'] },
    ];
    const r16 = propagateWinner(r32Matches, r16Template);
    expect(r16).toHaveLength(8);
    expect(r16[0].slot1.team.name).toBe('C'); // 74 winner via et
    expect(r16[0].slot2.team.name).toBe('J'); // 77 winner
    expect(r16[1].slot1.team.name).toBe('A'); // 73 winner
    expect(r16[1].slot2.team.name).toBe('E'); // 75 winner via pen
  });

  test("returns null team for unplayed matches", () => {
    const r32Matches = [
      { matchNum: 73, slot1: { team: { name: 'A' } }, slot2: { team: { name: 'B' } }, score: null },
      { matchNum: 75, slot1: { team: { name: 'E' } }, slot2: { team: { name: 'F' } }, score: null },
    ];
    const r16Template = [{ num: 90, sources: ['r32:73', 'r32:75'] }];
    const r16 = propagateWinner(r32Matches, r16Template);
    expect(r16[0].slot1.team).toBeNull();
    expect(r16[0].slot2.team).toBeNull();
    expect(r16[0].slot1.source).toBe('r32:73');
  });

  test("propagates losers for third-place match", () => {
    const sfMatches = [
      { matchNum: 101, slot1: { team: { name: 'W1' } }, slot2: { team: { name: 'L1' } }, score: { ft: [2, 1], status: 'final' } },
      { matchNum: 102, slot1: { team: { name: 'W2' } }, slot2: { team: { name: 'L2' } }, score: { ft: [0, 1], status: 'final' } },
    ];
    const thirdTemplate = [{ num: 103, sources: ['sf:101-loser', 'sf:102-loser'] }];
    const third = propagateWinner(sfMatches, thirdTemplate);
    expect(third[0].slot1.team.name).toBe('L1'); // 101 loser
    expect(third[0].slot2.team.name).toBe('W2'); // 102 winner (sf:102-loser = the team that LOST 102 = slot1)
  });
});

describe("computeBracket", () => {
  const FULL_STANDINGS = {
    A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 3, gd: 0, gf: 2 }, complete: true },
    B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 3, gd: 0, gf: 2 }, complete: true },
    C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 3, gd: 0, gf: 2 }, complete: true },
    D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 3, gd: 0, gf: 2 }, complete: true },
    E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 }, complete: true },
    F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 3, gd: 0, gf: 2 }, complete: true },
    G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 3, gd: 0, gf: 2 }, complete: true },
    H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 }, complete: true },
    I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 3, gd: 0, gf: 2 }, complete: true },
    J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 3, gd: 0, gf: 2 }, complete: true },
    K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 3, gd: 0, gf: 2 }, complete: true },
    L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 3, gd: 0, gf: 2 }, complete: true },
  };

  test("returns complete bracket when all groups finished", () => {
    const snapshot = computeBracket({ groupStandings: FULL_STANDINGS, scores: {} });
    expect(snapshot).not.toBeNull();
    expect(snapshot.projected).toBe(false);
    expect(snapshot.r32).toHaveLength(16);
    expect(snapshot.r16).toHaveLength(8);
    expect(snapshot.qf).toHaveLength(4);
    expect(snapshot.sf).toHaveLength(2);
    expect(snapshot.final).toBeDefined();
    expect(snapshot.third).toBeDefined();
    expect(snapshot.thirdPlacedAdvancing).toHaveLength(8);
    expect(snapshot.version).toBe(1);
    expect(snapshot.annexCIndex).toBe(0);
    expect(snapshot.inputsHash).toMatch(/^sha256:/);
  });

  test("returns projected=true with warnings when some groups incomplete", () => {
    const partial = {
      A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 3, gd: 0, gf: 2 }, complete: true },
      B: null, // 未完
      C: { winner: "Brazil", runnerUp: "Morocco", third: null, complete: false },
      D: null,
      E: null,
      F: null,
      G: null,
      H: null,
      I: null,
      J: null,
      K: null,
      L: null,
    };
    const snapshot = computeBracket({ groupStandings: partial, scores: {} });
    expect(snapshot.projected).toBe(true);
    expect(snapshot.warnings).toContain('group_B_incomplete');
    expect(snapshot.warnings).toContain('bracket_partial');
    expect(snapshot.completeGroupCount).toBe(1);
    // A 组完赛 → Match 73 应该是 A vs B (B 组未定 → slot2 仍为 group:B:runnerUp 但 team=null)
    const m73 = snapshot.r32.find((m) => m.matchNum === 73);
    expect(m73.slot1.team.name).toBe('South Africa'); // A runnerUp
    expect(m73.slot2.team).toBeNull();
    expect(m73.slot2.source).toBe('group:B:runnerUp');
  });

  test("groups with played=0 still produce best-effort standings (projected bracket)", () => {
    // 模拟: 小组赛未开始 → 所有组 played=0 但已有 4 队名单
    // rankGroup 会返回 winner/runnerUp/third (按字母序), complete=false
    const noData = {
      A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 0, gd: 0, gf: 0 }, complete: false },
      B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 0, gd: 0, gf: 0 }, complete: false },
      C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 0, gd: 0, gf: 0 }, complete: false },
      D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 0, gd: 0, gf: 0 }, complete: false },
      E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 0, gd: 0, gf: 0 }, complete: false },
      F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 0, gd: 0, gf: 0 }, complete: false },
      G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 0, gd: 0, gf: 0 }, complete: false },
      H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 0, gd: 0, gf: 0 }, complete: false },
      I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 0, gd: 0, gf: 0 }, complete: false },
      J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 0, gd: 0, gf: 0 }, complete: false },
      K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 0, gd: 0, gf: 0 }, complete: false },
      L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 0, gd: 0, gf: 0 }, complete: false },
    };
    const snapshot = computeBracket({ groupStandings: noData, scores: {} });
    expect(snapshot).not.toBeNull();
    expect(snapshot.projected).toBe(true);
    expect(snapshot.completeGroupCount).toBe(0);
    expect(snapshot.warnings).toContain('bracket_partial');
    // 关键: 即使所有组都未完赛, R32 slot 仍能 fill (按 winner/runnerUp 名称) → renderer 会显示 "A 组第 1" 占位
    const m73 = snapshot.r32.find((m) => m.matchNum === 73);
    expect(m73.slot1.team.name).toBe('South Africa');
    expect(m73.slot2.team.name).toBe('Switzerland');
  });

  test("mixed: some groups complete, some best-effort → projected with correct count", () => {
    // 模拟: 4 组完赛, 8 组未完 (但有 standings)
    const mixed = {
      A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 6, gd: 2, gf: 5 }, complete: true },
      B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 6, gd: 2, gf: 5 }, complete: true },
      C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 6, gd: 2, gf: 5 }, complete: true },
      D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 6, gd: 2, gf: 5 }, complete: true },
      E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 0, gd: 0, gf: 0 }, complete: false },
      F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 0, gd: 0, gf: 0 }, complete: false },
      G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 0, gd: 0, gf: 0 }, complete: false },
      H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 0, gd: 0, gf: 0 }, complete: false },
      I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 0, gd: 0, gf: 0 }, complete: false },
      J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 0, gd: 0, gf: 0 }, complete: false },
      K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 0, gd: 0, gf: 0 }, complete: false },
      L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 0, gd: 0, gf: 0 }, complete: false },
    };
    const snapshot = computeBracket({ groupStandings: mixed, scores: {} });
    expect(snapshot.projected).toBe(true);
    expect(snapshot.completeGroupCount).toBe(4);
  });

  test("all groups null → completeGroupCount=0 still produces bracket (placeholder UI)", () => {
    // 极端: 所有组都 null → 不应返回 null, 应返回 placeholder bracket
    const allNull = {
      A: null, B: null, C: null, D: null,
      E: null, F: null, G: null, H: null,
      I: null, J: null, K: null, L: null,
    };
    const snapshot = computeBracket({ groupStandings: allNull, scores: {} });
    expect(snapshot).not.toBeNull();
    expect(snapshot.completeGroupCount).toBe(0);
    expect(snapshot.projected).toBe(true);
    // 12 个 group_X_incomplete warnings
    const groupWarnings = snapshot.warnings.filter((w) => w.startsWith('group_') && w.endsWith('_incomplete'));
    expect(groupWarnings).toHaveLength(12);
    // R32 全部 slot 是 null team → 仍渲染 placeholder
    expect(snapshot.r32).toHaveLength(16);
    expect(snapshot.r32[0].slot1.team).toBeNull();
  });

  test("returns null when groupStandings is empty/null", () => {
    expect(computeBracket({ groupStandings: {}, scores: {} })).toBeNull();
    expect(computeBracket({ groupStandings: null, scores: {} })).toBeNull();
    expect(computeBracket({})).toBeNull();
  });

  test("final match number is 104 and third is 103", () => {
    const snapshot = computeBracket({ groupStandings: FULL_STANDINGS, scores: {} });
    expect(snapshot.final.matchNum).toBe(104);
    expect(snapshot.third.matchNum).toBe(103);
  });
});
