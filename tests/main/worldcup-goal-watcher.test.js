import { describe, it, expect } from "vitest";

const goalWatcher = require("../../src/main/worldcup/goal-watcher");

describe("goal-watcher: _goalKeyOfScorer", () => {
  it("基础: 拼出 minute|player|teamSide", () => {
    expect(
      goalWatcher._goalKeyOfScorer({
        minute: "77'",
        player: "Messi",
        teamSide: "team1",
      })
    ).toBe("77'|Messi|team1");
  });

  it("补时: 含 + 号的分钟", () => {
    expect(
      goalWatcher._goalKeyOfScorer({
        minute: "90+3'",
        player: "X",
        teamSide: "team2",
      })
    ).toBe("90+3'|X|team2");
  });

  it("ownGoal/penalty 不影响 key (只看 minute/player/teamSide)", () => {
    expect(
      goalWatcher._goalKeyOfScorer({
        minute: "60'",
        player: undefined,
        teamSide: "team1",
        ownGoal: true,
        penalty: true,
      })
    ).toBe("60'|undefined|team1");
  });
});