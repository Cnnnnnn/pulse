import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const stateStore = require("../../src/main/state-store.ts");

function tmpStatePath() {
  const dir = mkdtempSync(join(tmpdir(), "pulse-goal-state-"));
  return join(dir, "state.json");
}

describe("state-store: worldcupGoalNotified preservation", () => {
  let p;
  beforeEach(() => { p = tmpStatePath(); });
  afterEach(() => { try { rmSync(join(p, ".."), { recursive: true, force: true }); } catch {} });

  it("saveLastOpened preserves existing worldcupGoalNotified (via PRESERVE_FIELDS)", () => {
    // 1) 预写一份带 worldcupGoalNotified 的 state.json
    writeFileSync(p, JSON.stringify({
      v: 1, ts: 1000, apps: {}, mutes: {},
      worldcupGoalNotified: { "2026-06-15|22:00|ARG|FRA": { notified: ["77'|Messi|team1"], updatedAt: 1000 } },
    }));
    // 2) 走 patchState 写 last_opened
    stateStore.saveLastOpened({ Cursor: { ms: 1, source: "test" } }, p);
    // 3) 验证 worldcupGoalNotified 还在
    const s = JSON.parse(readFileSync(p, "utf-8"));
    expect(s.worldcupGoalNotified).toEqual({
      "2026-06-15|22:00|ARG|FRA": { notified: ["77'|Messi|team1"], updatedAt: 1000 },
    });
    expect(s.last_opened).toEqual({ Cursor: { ms: 1, source: "test" } });
  });

  it("preserves worldcupGoalNotified across multiple patchState calls", () => {
    stateStore.patchState((next) => {
      next.worldcupGoalNotified = { "k1": { notified: ["a"], updatedAt: 1 } };
    }, p);
    stateStore.saveLastOpened({ X: { ms: 2, source: "test" } }, p);
    const s = JSON.parse(readFileSync(p, "utf-8"));
    expect(s.worldcupGoalNotified).toEqual({ "k1": { notified: ["a"], updatedAt: 1 } });
  });
});