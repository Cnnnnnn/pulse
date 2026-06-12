/**
 * tests/renderer/worldcup-scorers-leaderboard.test.js
 */

import { describe, it, expect } from "vitest";
import {
  buildScorersLeaderboard,
  filterScorersLeaderboard,
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
    expect(
      list.find((r) => r.player === "Hwang In-Beom")?.flag.length,
    ).toBeGreaterThan(0);
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
