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
