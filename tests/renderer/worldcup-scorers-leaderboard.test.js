/**
 * tests/renderer/worldcup-scorers-leaderboard.test.js
 */

import { describe, it, expect } from "vitest";
import {
  buildScorersLeaderboard,
  filterScorersLeaderboard,
  normalizeScorersMatch,
  flattenBracketMatches,
} from "../../src/renderer/worldcup/scorers-leaderboard.js";

describe("scorers-leaderboard", () => {
  it("汇总进球并排序", () => {
    const matches = [
      {
        team1: "Mexico",
        team2: "South Africa",
        score: {
          scorers: [
            { player: "Julián Quiñones", teamSide: "team1", minute: "9'" },
            { player: "Raúl Jiménez", teamSide: "team1", minute: "67'" },
          ],
        },
      },
      {
        team1: "South Korea",
        team2: "Czech Republic",
        score: {
          scorers: [
            { player: "Hwang In-Beom", teamSide: "team1", minute: "67'" },
          ],
        },
      },
    ];
    const list = buildScorersLeaderboard(matches);
    expect(list).toHaveLength(3);
    expect(list.every((r) => r.goals === 1)).toBe(true);
    expect(list.find((r) => r.player === "Julián Quiñones")?.teamName).toBe(
      "Mexico",
    );
    expect(list.find((r) => r.player === "Hwang In-Beom")?.teamName).toBe(
      "Korea Republic",
    );
    expect(list.find((r) => r.player === "Hwang In-Beom")?.teamCn).toBe("韩国");
    expect(list.find((r) => r.player === "Hwang In-Beom")?.flag).toBe('KR');
  });

  it("乌龙不计入射手", () => {
    const matches = [
      {
        team1: "A",
        team2: "B",
        score: {
          scorers: [
            { player: "Own Goal Guy", teamSide: "team1", ownGoal: true },
          ],
        },
      },
    ];
    expect(buildScorersLeaderboard(matches)).toHaveLength(0);
  });

  it("搜索过滤", () => {
    const list = [
      {
        player: "A",
        playerCn: "甲",
        teamName: "X",
        teamCn: "艾克斯",
        goals: 2,
        rank: 1,
      },
    ];
    expect(filterScorersLeaderboard(list, "甲")).toHaveLength(1);
    expect(filterScorersLeaderboard(list, "zzz")).toHaveLength(0);
  });
});

describe("scorers-leaderboard (v2.65 淘汰赛支持)", () => {
  it("normalizeScorersMatch: 小组赛扁平 shape", () => {
    const norm = normalizeScorersMatch({
      team1: "Mexico",
      team2: "South Africa",
      score: { scorers: [{ player: "X", teamSide: "team1" }] },
    });
    expect(norm.team1).toBe("Mexico");
    expect(norm.team2).toBe("South Africa");
    expect(norm.scorers).toHaveLength(1);
  });

  it("normalizeScorersMatch: 淘汰赛嵌套 shape (slot.team.name)", () => {
    const norm = normalizeScorersMatch({
      matchNum: 73,
      slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
      slot2: { team: { name: "Canada" }, source: "group:B:runnerUp" },
      score: { ft: [0, 1], status: "final", scorers: [{ player: "Y", teamSide: "team2" }] },
    });
    expect(norm.team1).toBe("South Africa");
    expect(norm.team2).toBe("Canada");
    expect(norm.scorers).toHaveLength(1);
  });

  it("normalizeScorersMatch: 无 scorers 返 null", () => {
    expect(normalizeScorersMatch({ team1: "A", team2: "B" })).toBeNull();
    expect(normalizeScorersMatch(null)).toBeNull();
  });

  it("flattenBracketMatches: r32/r16/qf/sf/final/third 拍平", () => {
    const snap = {
      r32: [{ matchNum: 73 }, { matchNum: 74 }],
      r16: [{ matchNum: 89 }],
      qf: [],
      sf: [],
      final: { matchNum: 104 },
      third: { matchNum: 103 },
    };
    const flat = flattenBracketMatches(snap);
    expect(flat).toHaveLength(5);
    expect(flat.map((m) => m.matchNum).sort((a, b) => a - b)).toEqual([73, 74, 89, 103, 104]);
  });

  it("flattenBracketMatches: null snapshot → []", () => {
    expect(flattenBracketMatches(null)).toEqual([]);
  });

  it("buildScorersLeaderboard 读 bracket 嵌套 shape 的 scorers", () => {
    const snap = {
      r32: [
        {
          matchNum: 73,
          slot1: { team: { name: "South Africa" } },
          slot2: { team: { name: "Canada" } },
          score: {
            ft: [0, 1],
            status: "final",
            scorers: [{ player: "Alphonso Davies", teamSide: "team2", minute: "12'" }],
          },
        },
      ],
    };
    const list = buildScorersLeaderboard(flattenBracketMatches(snap));
    expect(list).toHaveLength(1);
    expect(list[0].player).toBe("Alphonso Davies");
    expect(list[0].teamName).toBe("Canada");
    expect(list[0].goals).toBe(1);
  });
});
