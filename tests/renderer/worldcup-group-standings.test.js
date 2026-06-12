/**
 * tests/renderer/worldcup-group-standings.test.js
 */

import { describe, it, expect } from "vitest";
import {
  computeGroupStandings,
  sortTeamsInGroup,
} from "../../src/renderer/worldcup/group-standings.js";

const GROUP_A_TEAMS = [
  { name: "Mexico", cn: "墨西哥", group: "A" },
  { name: "South Africa", cn: "南非", group: "A" },
  { name: "Korea Republic", cn: "韩国", group: "A" },
  { name: "Czechia", cn: "捷克", group: "A" },
];

describe("group-standings", () => {
  it("按完赛比分累计积分与净胜球", () => {
    const matches = [
      {
        stage: "Group A",
        team1: "Mexico",
        team2: "South Africa",
        score: { ft: [2, 0], status: "final" },
      },
      {
        stage: "Group A",
        team1: "South Korea",
        team2: "Czech Republic",
        score: { ft: [1, 1], status: "final" },
      },
    ];
    const standings = computeGroupStandings(matches, GROUP_A_TEAMS);
    expect(standings.A.Mexico.pts).toBe(3);
    expect(standings.A.Mexico.gd).toBe(2);
    expect(standings.A["South Africa"].pts).toBe(0);
    expect(standings.A["South Africa"].gd).toBe(-2);
    expect(standings.A["Korea Republic"].pts).toBe(1);
    expect(standings.A.Czechia.pts).toBe(1);
  });

  it("同积分按净胜球排序", () => {
    const standings = {
      A: {
        Mexico: { pts: 3, gd: 2, gf: 2, ga: 0 },
        "South Africa": { pts: 3, gd: 1, gf: 2, ga: 1 },
        "Korea Republic": { pts: 0, gd: 0, gf: 0, ga: 0 },
        Czechia: { pts: 0, gd: 0, gf: 0, ga: 0 },
      },
    };
    const sorted = sortTeamsInGroup(GROUP_A_TEAMS, standings, "A");
    expect(sorted[0].name).toBe("Mexico");
    expect(sorted[1].name).toBe("South Africa");
  });

  it("进行中比赛不计入积分榜", () => {
    const matches = [
      {
        stage: "Group A",
        team1: "Mexico",
        team2: "South Africa",
        score: { ft: [1, 0], status: "live" },
      },
    ];
    const standings = computeGroupStandings(matches, GROUP_A_TEAMS);
    expect(standings.A.Mexico.pts).toBe(0);
    expect(standings.A.Mexico.played).toBe(0);
  });
});
