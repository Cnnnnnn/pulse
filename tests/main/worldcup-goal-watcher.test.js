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

describe("goal-watcher: _diffNewGoals", () => {
  it("空 → 空: prevScores={} newScores={}", () => {
    expect(goalWatcher._diffNewGoals({}, {}, {})).toEqual([]);
  });

  it("新增 1 进球: prevScores 没这 matchKey, newScores 有 1 个 scorer", () => {
    const newScores = {
      "2026-06-15|22:00|ARG|FRA": {
        ft: [1, 0],
        status: "live",
        scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
      },
    };
    const out = goalWatcher._diffNewGoals({}, newScores, {});
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      matchKey: "2026-06-15|22:00|ARG|FRA",
      key: "77'|Messi|team1",
    });
    expect(out[0].scorer.player).toBe("Messi");
  });

  it("已知不重推: prevScorers 含同一 key, 返回空", () => {
    const prevScores = {
      "2026-06-15|22:00|ARG|FRA": {
        scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
      },
    };
    const newScores = {
      "2026-06-15|22:00|ARG|FRA": {
        ft: [1, 0],
        status: "live",
        scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
      },
    };
    expect(goalWatcher._diffNewGoals(prevScores, newScores, {})).toEqual([]);
  });

  it("多进球: 2 个 scorer, prevScorers 空, 返回 2 个 goalKey", () => {
    const newScores = {
      "2026-06-15|22:00|ARG|FRA": {
        ft: [2, 0],
        status: "live",
        scorers: [
          { minute: "10'", player: "A", teamSide: "team1" },
          { minute: "77'", player: "B", teamSide: "team1" },
        ],
      },
    };
    const out = goalWatcher._diffNewGoals({}, newScores, {});
    expect(out).toHaveLength(2);
    expect(out.map((g) => g.key).sort()).toEqual(["10'|A|team1", "77'|B|team1"]);
  });

  it("完赛不再推: newScores entry.status=final + scorers 非空, 返回空", () => {
    const newScores = {
      "2026-06-15|22:00|ARG|FRA": {
        ft: [1, 0],
        status: "final",
        scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
      },
    };
    expect(goalWatcher._diffNewGoals({}, newScores, {})).toEqual([]);
  });

  it("notified 重复推兜底: prevNotified 含 key, 即使 prevScorers 无, 仍过滤", () => {
    const newScores = {
      "k1": {
        ft: [1, 0],
        status: "live",
        scorers: [{ minute: "60'", player: "X", teamSide: "team1" }],
      },
    };
    const prevNotified = { k1: { notified: ["60'|X|team1"], updatedAt: 1 } };
    expect(goalWatcher._diffNewGoals({}, newScores, prevNotified)).toEqual([]);
  });
});