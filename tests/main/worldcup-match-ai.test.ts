/**
 * tests/main/worldcup-match-ai.test.js
 */

import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  buildPreMatchPrompt,
  buildPostMatchPrompt,
} = requireMain("worldcup/match-ai");
describe("worldcup match-ai prompts", () => {
  const match = {
    team1: "South Korea",
    team2: "Czech Republic",
    stage: "Group F",
    date: "2026-06-11",
    time: "20:00",
    timezone: "UTC-6",
    venue: "Guadalajara",
  };

  it("赛前预测 prompt 含对阵信息", () => {
    const msgs = buildPreMatchPrompt(match);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("South Korea vs Czech Republic");
    expect(msgs[1].content).toContain("赛前预测");
  });

  it("赛后总结 prompt 含比分与进球", () => {
    const scoreEntry = {
      ft: [1, 1],
      status: "final",
      scorers: [
        { minute: "59'", player: "Krejcí", teamSide: "team2" },
        { minute: "67'", player: "Hwang In-Beom", teamSide: "team1" },
      ],
    };
    const msgs = buildPostMatchPrompt(match, scoreEntry);
    expect(msgs[1].content).toContain("1 - 1");
    expect(msgs[1].content).toContain("Hwang In-Beom");
  });
});
