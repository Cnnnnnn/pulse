import { describe, it, expect } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

const goalWatcher = requireMain("worldcup/goal-watcher");

describe("goal-watcher: _formatGoalNotification", () => {
  it("基础: scorer + fixture, title 含「进球」body 含比分", () => {
    const notif = goalWatcher._formatGoalNotification(
      { minute: "77'", player: "Messi", teamSide: "team1" },
      { team1: "Argentina", team2: "France", score: { ft: [1, 0] } }
    );
    expect(notif.title).toContain("进球");
    expect(notif.title).toContain("77'");
    expect(notif.title).toContain("Messi");
    expect(notif.body).toContain("Argentina");
    expect(notif.body).toContain("France");
    expect(notif.body).toContain("1-0");
  });

  it("乌龙前缀: ownGoal=true, title 含「乌龙球」", () => {
    const notif = goalWatcher._formatGoalNotification(
      { minute: "60'", player: "X", teamSide: "team1", ownGoal: true },
      { team1: "Argentina", team2: "France" }
    );
    expect(notif.title).toContain("乌龙球");
  });
});