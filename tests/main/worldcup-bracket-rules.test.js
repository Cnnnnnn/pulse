import { describe, test, expect } from "vitest";
const {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
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
