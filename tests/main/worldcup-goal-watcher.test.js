import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const goalWatcher = require("../../src/main/worldcup/goal-watcher");
const stateStore = require("../../src/main/state-store.ts");

function tmpStatePath() {
  const dir = mkdtempSync(join(tmpdir(), "pulse-goal-watcher-"));
  return join(dir, "state.json");
}

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

// 注: 下面 _sweepOnce 测试的 fixturesTxt 走真实的 parseWorldcupTxt, 因此用 openfootball 格式
// (`▪ Group A` + 周行 + `HH:MM UTC+N team1 v team2 @ venue`). 任务描述里的简写格式不会被
// parseWorldcupTxt 识别, 已替换.
const FIXTURES_TXT_OPENFOOTBALL = `= World Cup 2026
Group A | Argentina  France  Brazil  Germany

▪ Group A
Mon June 15
  22:00 UTC+0  ARG v FRA  @ NYC`;

describe("goal-watcher: _sweepOnce (end-to-end mock)", () => {
  it("mock refreshScores 返回 1 个新进球, onGoal 调 1 次, state 写入新 key", async () => {
    // 1) 预写 fixtures 缓存
    const p = tmpStatePath();
    writeFileSync(p, JSON.stringify({
      v: 1, ts: 1000, apps: {}, mutes: {},
      worldcup_txt: { txt: FIXTURES_TXT_OPENFOOTBALL, ts: 1000 },
    }));

    // 2) mock refreshScores 返回新进球
    const newMatchKey = "2026-06-15|22:00|ARG|FRA";
    const mockRefreshScores = async () => ({
      ok: true,
      scores: {
        [newMatchKey]: {
          ft: [1, 0],
          status: "live",
          scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
        },
      },
    });

    // 3) mock onGoal
    const onGoalCalls = [];
    const mockOnGoal = (notif, meta) => { onGoalCalls.push({ notif, meta }); };

    // 4) mock log
    const mockLog = { info: () => {}, warn: () => {}, error: () => {} };

    // 5) 调 _sweepOnce
    const now = Date.parse("2026-06-15T22:30:00Z");
    const result = await goalWatcher._sweepOnce(now, {
      refreshScores: mockRefreshScores,
      loadFixtures: () => stateStore.loadWorldcupTxt(p),
      onGoal: mockOnGoal,
      log: mockLog,
      onError: () => {},
      statePath: p,
    });

    // 6) 验证: onGoal 调 1 次
    expect(result.notifiedCount).toBe(1);
    expect(onGoalCalls).toHaveLength(1);
    expect(onGoalCalls[0].meta.matchKey).toBe(newMatchKey);
    expect(onGoalCalls[0].notif.title).toContain("进球");

    // 7) 验证: state 写入了 worldcupGoalNotified
    const finalState = JSON.parse(readFileSync(p, "utf-8"));
    expect(finalState.worldcupGoalNotified[newMatchKey]).toBeDefined();
    expect(finalState.worldcupGoalNotified[newMatchKey].notified).toEqual([
      "77'|Messi|team1",
    ]);
  });

  it("重复 sweep: 第二次跑同一进球, onGoal 不调 (双重去重)", async () => {
    const p = tmpStatePath();
    writeFileSync(p, JSON.stringify({
      v: 1, ts: 1000, apps: {}, mutes: {},
      worldcup_txt: { txt: FIXTURES_TXT_OPENFOOTBALL, ts: 1000 },
    }));

    const newMatchKey = "2026-06-15|22:00|ARG|FRA";
    const mockRefreshScores = async () => ({
      ok: true,
      scores: {
        [newMatchKey]: {
          ft: [1, 0],
          status: "live",
          scorers: [{ minute: "77'", player: "Messi", teamSide: "team1" }],
        },
      },
    });

    let onGoalCalls = 0;
    const mockOnGoal = () => { onGoalCalls += 1; };
    const mockLog = { info: () => {}, warn: () => {}, error: () => {} };

    const now = Date.parse("2026-06-15T22:30:00Z");
    // 第一次 sweep
    await goalWatcher._sweepOnce(now, {
      refreshScores: mockRefreshScores,
      loadFixtures: () => stateStore.loadWorldcupTxt(p),
      onGoal: mockOnGoal,
      log: mockLog,
      onError: () => {},
      statePath: p,
    });
    expect(onGoalCalls).toBe(1);

    // 第二次 sweep (相同 now + 相同 scores) → 不重推
    await goalWatcher._sweepOnce(now, {
      refreshScores: mockRefreshScores,
      loadFixtures: () => stateStore.loadWorldcupTxt(p),
      onGoal: mockOnGoal,
      log: mockLog,
      onError: () => {},
      statePath: p,
    });
    expect(onGoalCalls).toBe(1);
  });
});

describe("goal-watcher: scheduler lifecycle", () => {
  it("startGoalWatcher + stopGoalWatcher toggle isGoalWatcherRunning", () => {
    expect(goalWatcher.isGoalWatcherRunning()).toBe(false);
    goalWatcher.startGoalWatcher({
      refreshScores: async () => ({ ok: true, scores: {} }),
      loadFixtures: () => null,
      onGoal: () => {},
      log: { info: () => {}, warn: () => {}, error: () => {} },
      onError: () => {},
    });
    expect(goalWatcher.isGoalWatcherRunning()).toBe(true);
    goalWatcher.stopGoalWatcher();
    expect(goalWatcher.isGoalWatcherRunning()).toBe(false);
  });

  it("startGoalWatcher 重复调 → 先停老的, 再起新的 (idempotent)", () => {
    goalWatcher.startGoalWatcher({
      refreshScores: async () => ({ ok: true, scores: {} }),
      loadFixtures: () => null,
      onGoal: () => {},
      log: { info: () => {}, warn: () => {}, error: () => {} },
      onError: () => {},
    });
    const t1 = goalWatcher._sweepTimer;
    goalWatcher.startGoalWatcher({
      refreshScores: async () => ({ ok: true, scores: {} }),
      loadFixtures: () => null,
      onGoal: () => {},
      log: { info: () => {}, warn: () => {}, error: () => {} },
      onError: () => {},
    });
    const t2 = goalWatcher._sweepTimer;
    expect(t1).not.toBe(t2);
    goalWatcher.stopGoalWatcher();
  });

  it("startGoalWatcher 缺 onGoal → throw", () => {
    expect(() => goalWatcher.startGoalWatcher({})).toThrow(TypeError);
  });
});

// ── v2.22 Task C2.1: onScoresChanged hook ───────────────────
//
// 事件驱动: goal-watcher 每次 sweep 完 (refreshScores 成功 + 至少 1 eligible key)
// 调 onScoresChanged(newScores) — 跟 onGoal 独立, 进球没进也 fire.
// 注: 仅 sweep 真正走了 refreshScores 才会触发; eligibleKeys.length === 0 时
// sweep 提前 return (line 144-145), onScoresChanged 不会被调.
describe("goal-watcher: onScoresChanged hook (Task C2.1)", () => {
  it("_sweepOnce with eligible live match + new scores → onScoresChanged fires with newScores map", async () => {
    const p = tmpStatePath();
    writeFileSync(p, JSON.stringify({
      v: 1, ts: 1000, apps: {}, mutes: {},
      worldcup_txt: { txt: FIXTURES_TXT_OPENFOOTBALL, ts: 1000 },
    }));

    const newMatchKey = "2026-06-15|22:00|ARG|FRA";
    const mockRefreshScores = async () => ({
      ok: true,
      scores: {
        [newMatchKey]: {
          ft: [2, 1],
          status: "live",
          scorers: [],
        },
      },
    });

    const onScoresChanged = vi.fn();
    const mockLog = { info: () => {}, warn: () => {}, error: () => {} };
    const now = Date.parse("2026-06-15T22:30:00Z");

    await goalWatcher._sweepOnce(now, {
      refreshScores: mockRefreshScores,
      loadFixtures: () => stateStore.loadWorldcupTxt(p),
      onGoal: () => {},
      onScoresChanged,
      log: mockLog,
      onError: () => {},
      statePath: p,
    });

    // onScoresChanged 调 1 次, 传入 newScores map
    expect(onScoresChanged).toHaveBeenCalledTimes(1);
    const arg = onScoresChanged.mock.calls[0][0];
    expect(arg).toBeDefined();
    expect(arg[newMatchKey]).toBeDefined();
    expect(arg[newMatchKey].ft).toEqual([2, 1]);
  });

  it("_sweepOnce with no eligible keys → onScoresChanged NOT fired (early return)", async () => {
    // 没有 fixtures → loadFixtures() 返 null, sweep 在 line 120 提前 return
    const p = tmpStatePath();
    writeFileSync(p, JSON.stringify({ v: 1, ts: 1000, apps: {}, mutes: {} }));

    const onScoresChanged = vi.fn();
    const mockLog = { info: () => {}, warn: () => {}, error: () => {} };
    const now = Date.now();

    await goalWatcher._sweepOnce(now, {
      refreshScores: async () => ({ ok: true, scores: {} }),
      loadFixtures: () => stateStore.loadWorldcupTxt(p), // 返 null (state 没 worldcup_txt)
      onGoal: () => {},
      onScoresChanged,
      log: mockLog,
      onError: () => {},
      statePath: p,
    });

    expect(onScoresChanged).not.toHaveBeenCalled();
  });

  it("startGoalWatcher accepts onScoresChanged + fires after initial sweep", async () => {
    const p = tmpStatePath();
    writeFileSync(p, JSON.stringify({
      v: 1, ts: 1000, apps: {}, mutes: {},
      worldcup_txt: { txt: FIXTURES_TXT_OPENFOOTBALL, ts: 1000 },
    }));

    const newMatchKey = "2026-06-15|22:00|ARG|FRA";
    const onScoresChanged = vi.fn();
    const now = Date.parse("2026-06-15T22:30:00Z");

    // 先 stop 任何遗留 timer
    goalWatcher.stopGoalWatcher();
    goalWatcher.startGoalWatcher({
      refreshScores: async () => ({
        ok: true,
        scores: { [newMatchKey]: { ft: [0, 0], status: "live", scorers: [] } },
      }),
      loadFixtures: () => stateStore.loadWorldcupTxt(p),
      onGoal: () => {},
      onScoresChanged,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      onError: () => {},
      now,                     // 注入 now → 启动 sweep 也会走到 refreshScores
      statePath: p,
    });

    // 启动时 sweep 是 fire-and-forget; 等 microtask + setImmediate 链
    await new Promise((r) => setTimeout(r, 50));

    expect(onScoresChanged).toHaveBeenCalled();
    expect(onScoresChanged.mock.calls[0][0][newMatchKey]).toBeDefined();
    goalWatcher.stopGoalWatcher();
  });
});