/**
 * tests/renderer/worldcup-match-utils.test.js
 */

import { describe, it, expect } from "vitest";
import {
  matchKey,
  isScoreRefreshEligible,
  mergeScoresIntoMatches,
} from "../../src/renderer/worldcup/match-utils.js";

const SAMPLE = {
  date: "2026-06-11",
  time: "13:00",
  timezone: "UTC-6",
  team1: "Mexico",
  team2: "South Africa",
  venue: "Mexico City",
};

describe("matchKey", () => {
  it("date|time|team1|team2", () => {
    expect(matchKey(SAMPLE)).toBe("2026-06-11|13:00|Mexico|South Africa");
  });
});

describe("isScoreRefreshEligible", () => {
  const beforeKickoff = Date.UTC(2026, 5, 11, 18, 0);
  const afterKickoff = Date.UTC(2026, 5, 11, 20, 0);

  it("未开球 → false", () => {
    expect(isScoreRefreshEligible(SAMPLE, null, beforeKickoff)).toBe(false);
  });

  it("已开球且无缓存 → true", () => {
    expect(isScoreRefreshEligible(SAMPLE, null, afterKickoff)).toBe(true);
  });

  it("已完赛且有进球者 → false", () => {
    expect(
      isScoreRefreshEligible(
        SAMPLE,
        {
          status: "final",
          ft: [2, 0],
          scorers: [{ minute: "9'", player: "A" }],
        },
        afterKickoff,
      ),
    ).toBe(false);
  });

  it("已完赛但缺进球者 → true（补拉 ESPN）", () => {
    expect(
      isScoreRefreshEligible(
        SAMPLE,
        { status: "final", ft: [2, 0] },
        afterKickoff,
      ),
    ).toBe(true);
  });
});

describe("mergeScoresIntoMatches", () => {
  it("按 key 合并 ft", () => {
    const key = matchKey(SAMPLE);
    const merged = mergeScoresIntoMatches([SAMPLE], {
      [key]: { ft: [2, 1], status: "final" },
    });
    expect(merged[0].score.ft).toEqual([2, 1]);
  });
});
