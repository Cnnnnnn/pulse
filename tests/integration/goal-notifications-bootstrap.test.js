import { describe, it, expect } from "vitest";

describe("goal-notifications: integration smoke", () => {
  it("main: goal-watcher 模块可 require, 公开 API 完整", () => {
    const gw = require("../../src/main/worldcup/goal-watcher");
    expect(typeof gw._goalKeyOfScorer).toBe("function");
    expect(typeof gw._diffNewGoals).toBe("function");
    expect(typeof gw._formatGoalNotification).toBe("function");
    expect(typeof gw._sweepOnce).toBe("function");
    expect(typeof gw.startGoalWatcher).toBe("function");
    expect(typeof gw.stopGoalWatcher).toBe("function");
    expect(typeof gw.isGoalWatcherRunning).toBe("function");
  });

  it("bootstrap/schedulers 暴露 startWorldcupGoalWatcher", () => {
    const sched = require("../../src/main/bootstrap/schedulers");
    expect(typeof sched.startWorldcupGoalWatcher).toBe("function");
  });

  it("state-store PRESERVE_FIELDS 含 worldcupGoalNotified", () => {
    const stateStore = require("../../src/main/state-store");
    // 通过 patchState 验证 (静态 PRESERVE_FIELDS 不 export)
    // 写一个带 worldcupGoalNotified 的 state, 然后调 saveLastOpened, 验证保留
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-goal-int-"));
    const p = path.join(dir, "state.json");
    fs.writeFileSync(p, JSON.stringify({
      v: 1, ts: 0, apps: {}, mutes: {},
      worldcupGoalNotified: { "k": { notified: ["a"], updatedAt: 1 } },
    }));
    stateStore.saveLastOpened({ x: { ms: 1, source: "t" } }, p);
    const s = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(s.worldcupGoalNotified).toEqual({ "k": { notified: ["a"], updatedAt: 1 } });
  });
});
