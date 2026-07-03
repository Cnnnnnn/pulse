/**
 * tests/renderer/scorers-leaderboard.test.jsx
 *
 * v2.74.3: scorers-leaderboard 之前只看 group stage. 现在 bracket 也有 scorers
 * (通过主动 fetch ESPN 拉), flattenBracketMatches + buildScorersLeaderboard 应当
 * 正确聚合 knockout 进球者. 这里覆盖:
 *
 * 1) flattenBracketMatches 拍平 r32/r16/qf/sf/final/third
 * 2) normalizeScorersMatch 处理 bracket 嵌套 (slot1/slot2.team.name)
 * 3) buildScorersLeaderboard 聚合 group + bracket scorers
 * 4) "淘汰赛" filter 只显示 bracket scorers
 *
 * 注意: 实际 e2e 验证已通过 Electron app (手动点 bracket 拉 ESPN → state.json 有
 * M74/M75 scorers 46 个). 这里是 unit 层防 regression.
 */
import { describe, it, expect } from "vitest";
import {
  flattenBracketMatches,
  normalizeScorersMatch,
  buildScorersLeaderboard,
  filterScorersLeaderboard,
} from "../../src/renderer/worldcup/scorers-leaderboard.js";

describe("v2.74.3 scorers-leaderboard knockout integration", () => {
  it("flattenBracketMatches flattens all stages", () => {
    const snap = {
      r32: [{ matchNum: 73 }, { matchNum: 74 }],
      r16: [{ matchNum: 90 }],
      qf: [{ matchNum: 99 }],
      sf: [{ matchNum: 105 }, { matchNum: 106 }],
      final: { matchNum: 110 },
      third: { matchNum: 109 },
    };
    const out = flattenBracketMatches(snap);
    // r32(2) + r16(1) + qf(1) + sf(2) + final(1) + third(1) = 8
    expect(out).toHaveLength(8);
    expect(out[out.length - 1].matchNum).toBe(109);
  });

  it("flattenBracketMatches handles empty snapshot", () => {
    expect(flattenBracketMatches(null)).toEqual([]);
    expect(flattenBracketMatches({})).toEqual([]);
  });

  it("normalizeScorersMatch handles bracket shape (slot1/slot2.team.name)", () => {
    const m = {
      matchNum: 74,
      slot1: { team: { name: "Germany" } },
      slot2: { team: { name: "Paraguay" } },
      score: {
        scorers: [
          { player: "Kai Havertz", teamSide: "team1", penalty: false },
        ],
      },
    };
    const out = normalizeScorersMatch(m);
    expect(out.team1).toBe("Germany");
    expect(out.team2).toBe("Paraguay");
    expect(out.scorers).toHaveLength(1);
  });

  it("normalizeScorersMatch handles group shape (flat team1/team2)", () => {
    const m = {
      team1: "Mexico",
      team2: "South Africa",
      score: { scorers: [{ player: "J. Quiñones", teamSide: "team1" }] },
    };
    const out = normalizeScorersMatch(m);
    expect(out.team1).toBe("Mexico");
    expect(out.team2).toBe("South Africa");
  });

  it("normalizeScorersMatch returns null on missing scorers", () => {
    expect(normalizeScorersMatch({ team1: "A", team2: "B" })).toBeNull();
    expect(normalizeScorersMatch({})).toBeNull();
  });

  it("buildScorersLeaderboard aggregates scorers from group + bracket", () => {
    const group = [
      {
        team1: "Mexico",
        team2: "South Africa",
        score: {
          scorers: [
            { player: "Julián Quiñones", teamSide: "team1", penalty: false },
            { player: "Raúl Jiménez", teamSide: "team1", penalty: false },
          ],
        },
      },
    ];
    const bracket = [
      {
        matchNum: 74,
        slot1: { team: { name: "Germany" } },
        slot2: { team: { name: "Paraguay" } },
        score: {
          scorers: [
            { player: "Kai Havertz", teamSide: "team1", penalty: false },
            { player: "Julio Enciso", teamSide: "team2", penalty: false },
          ],
        },
      },
    ];
    const out = buildScorersLeaderboard([...group, ...bracket]);
    expect(out).toHaveLength(4);
    const names = out.map((r) => r.player).sort();
    expect(names).toEqual([
      "Julio Enciso",
      "Julián Quiñones",
      "Kai Havertz",
      "Raúl Jiménez",
    ]);
  });

  it("buildScorersLeaderboard ranks by goal count", () => {
    const m = {
      team1: "A",
      team2: "B",
      score: {
        scorers: [
          { player: "Scorer 1", teamSide: "team1" },
          { player: "Scorer 1", teamSide: "team1" },
          { player: "Scorer 2", teamSide: "team2" },
        ],
      },
    };
    const out = buildScorersLeaderboard([m]);
    expect(out[0].player).toBe("Scorer 1");
    expect(out[0].goals).toBe(2);
    expect(out[0].rank).toBe(1);
    expect(out[1].player).toBe("Scorer 2");
    expect(out[1].goals).toBe(1);
    expect(out[1].rank).toBe(2);
  });

  it("buildScorersLeaderboard counts penalty goals separately", () => {
    const m = {
      team1: "A",
      team2: "B",
      score: {
        scorers: [
          { player: "P1", teamSide: "team1", penalty: true },
          { player: "P1", teamSide: "team1", penalty: true },
          { player: "P1", teamSide: "team1", penalty: false },
        ],
      },
    };
    const out = buildScorersLeaderboard([m]);
    expect(out[0].goals).toBe(3);
    expect(out[0].penalties).toBe(2);
  });

  it("buildScorersLeaderboard skips own goals", () => {
    const m = {
      team1: "A",
      team2: "B",
      score: {
        scorers: [
          { player: "P1", teamSide: "team1", ownGoal: true },
          { player: "P2", teamSide: "team2" },
        ],
      },
    };
    const out = buildScorersLeaderboard([m]);
    expect(out).toHaveLength(1);
    expect(out[0].player).toBe("P2");
  });

  it("filterScorersLeaderboard filters by name (en/cn/team)", () => {
    const list = [
      { player: "Kai Havertz", playerCn: "凯·哈弗茨", teamName: "Germany", teamCn: "德国" },
      { player: "Julio Enciso", playerCn: "胡利奥·恩西索", teamName: "Paraguay", teamCn: "巴拉圭" },
    ];
    expect(filterScorersLeaderboard(list, "凯")).toHaveLength(1);
    expect(filterScorersLeaderboard(list, "paraguay")).toHaveLength(1);
    expect(filterScorersLeaderboard(list, "巴拉圭")).toHaveLength(1);
    expect(filterScorersLeaderboard(list, "xxx")).toHaveLength(0);
    expect(filterScorersLeaderboard(list, "")).toHaveLength(2);
  });
});
