/**
 * tests/integration/backfill-e2e.test.js
 *
 * Phase B7c.2 (AI Sessions Daily Digest):端到端 backfill e2e.
 *
 *场景:首次启动, daily_digests 空 + config.aiSessions.enabled=true →
 * DailyDigestRunner.bootstrap() 自动跑7 天 backfill → state.json daily_digests 有7 条
 *
 * Mock detector (不真读 Cursor SQLite) + Mock summarizer (返固定 markdown)
 *跑 in-memory + tmp state.json (不走 main进程)
 *
 *跟 tests/ai-sessions/digest.test.js互补:
 * - digest.test.js测 DailyDigestRunner class 的方法
 * - backfill-e2e测 bootstrap()端到端 (含 storage IO + summary写盘)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { DailyDigestRunner } from "../../src/ai-sessions/digest.js";

// mock detector —返固定 sessions
class MockCursorDetector {
  constructor() {
    this.appName = "cursor";
  }
  async isInstalled() {
    return true;
  }
  async listSessions() {
    //5 sessions per day,7 days ×5 =35 sessions
    return Array.from({ length: 7 }, (_, i) => ({ id: `sess-day${i}` }));
  }
  async readSession(id) {
    return {
      id,
      appName: "cursor",
      startedAt: Date.now() - 86400_000,
      endedAt: Date.now() - 80000_000,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };
  }
  filterByLocalDay(sessions, dateKey, now) {
    // match exact day for simplicity
    return sessions;
  }
}

// mock summarizer —返固定 markdown
class MockSummarizer {
  constructor() {
    this.provider = "mock";
    this.model = "mock-model";
  }
  async summarize() {
    return "# Mock Summary\n- Did some work";
  }
  async healthcheck() {
    return { ok: true };
  }
}

describe("backfill e2e — bootstrap()", () => {
  let tmpDir;
  let statePath;
  let storage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-e2e-"));
    statePath = path.join(tmpDir, "state.json");
    // empty state.json
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, mutes: {} }));
    // storage wrapper (跟 src/ai-sessions/wiring.js makeStateStoreStorage一样)
    const stateStore = require("../../src/main/state-store.js");
    storage = {
      loadDigests: () => stateStore.loadDailyDigests(statePath),
      hasDigest: (dk) => stateStore.hasDailyDigest(dk, statePath),
      saveDigest: (d) => stateStore.saveDailyDigest(d, statePath),
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  it("首次启动 (daily_digests 空) → 自动 backfill7 天 → state.json写满7 条", async () => {
    const onProgress = vi.fn();
    const logs = [];
    const detector = new MockCursorDetector();
    const summarizer = new MockSummarizer();
    const runner = new DailyDigestRunner({
      detectors: [detector],
      summarizer,
      storage,
      config: { enabled: true, backfillDays: 7, locale: "zh-CN" },
      log: {
        info: (...a) => logs.push(["info", ...a]),
        warn: (...a) => logs.push(["warn", ...a]),
        error: (...a) => logs.push(["error", ...a]),
      },
      backfillSleepMs: 0, // 测试不 sleep
    });

    const result = await runner.bootstrap({ onProgress });

    // bootstrap返 { yesterday: object|null, backfill: object|null }
    expect(result.yesterday).not.toBeNull();
    expect(result.backfill).not.toBeNull();
    expect(result.backfill.done).toBe(7);
    expect(result.backfill.total).toBe(7);
    expect(result.yesterday).not.toBeNull();
    expect(result.backfill).not.toBeNull();
    expect(result.backfill.done).toBe(7);
    expect(result.backfill.total).toBe(7);

    // state.json 里 daily_digests 有7 条 (含 yesterday)
    const stateStore = require("../../src/main/state-store.js");
    const digests = stateStore.loadDailyDigests(statePath);
    expect(Object.keys(digests).length).toBe(7);

    // 每条 digest shape正确
    const keys = Object.keys(digests).sort();
    for (const k of keys) {
      const d = digests[k];
      expect(d.dateKey).toBe(k);
      expect(d.provider).toBe("mock");
      expect(d.model).toBe("mock-model");
      expect(d.sessionCount).toBeGreaterThanOrEqual(1);
      expect(typeof d.summary).toBe("string");
      expect(d.summary.length).toBeGreaterThan(0);
      expect(d.sessionIds).toBeInstanceOf(Array);
    }

    // onProgress 被调7 次 (1 次 per day)
    expect(onProgress).toHaveBeenCalledTimes(7);
    // 最后1 次 done=total
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(7);
    expect(lastCall[1]).toBe(7);
  });

  it("config.enabled=false → skip bootstrap, state.json 不写", async () => {
    const detector = new MockCursorDetector();
    const summarizer = new MockSummarizer();
    const runner = new DailyDigestRunner({
      detectors: [detector],
      summarizer,
      storage,
      config: { enabled: false, backfillDays: 7 },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      backfillSleepMs: 0,
    });

    const result = await runner.bootstrap();
    expect(result.yesterday).toBeNull();
    expect(result.backfill).toBeNull();

    const stateStore = require("../../src/main/state-store.js");
    const digests = stateStore.loadDailyDigests(statePath);
    expect(Object.keys(digests).length).toBe(0);
  });

  it("daily_digests 有现有条目 → 不 backfill (idempotent bootstrap)", async () => {
    // 先 seed1 条
    const stateStore = require("../../src/main/state-store.js");
    stateStore.saveDailyDigest(
      {
        dateKey: "2026-01-01",
        provider: "mock",
        model: "mock-model",
        sessionCount: 5,
        summary: "seeded",
        sessionIds: ["s1", "s2", "s3", "s4", "s5"],
        generatedAt: Date.now() - 86400_000,
      },
      statePath,
    );

    const detector = new MockCursorDetector();
    const summarizer = new MockSummarizer();
    const runner = new DailyDigestRunner({
      detectors: [detector],
      summarizer,
      storage,
      config: { enabled: true, backfillDays: 7 },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      backfillSleepMs: 0,
    });

    const result = await runner.bootstrap();
    // 有 seed → backfill 应被 skip
    expect(result.backfill).toBeNull();
    // 但 yesterday digest (新一天)仍应跑
    expect(result.yesterday).not.toBeNull();

    // state.json: seed + yesterday =2 条 (其余天没跑 backfill)
    const digests = stateStore.loadDailyDigests(statePath);
    expect(Object.keys(digests).length).toBe(2);
  });

  it("用户调 backfillDigest IPC path (单 day rerun) → idempotent", async () => {
    // 第一轮:bootstrap跑完
    const detector = new MockCursorDetector();
    const summarizer = new MockSummarizer();
    const runner = new DailyDigestRunner({
      detectors: [detector],
      summarizer,
      storage,
      config: { enabled: true, backfillDays: 7 },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      backfillSleepMs: 0,
    });
    await runner.bootstrap();

    const stateStore = require("../../src/main/state-store.js");
    const before = stateStore.loadDailyDigests(statePath);
    expect(Object.keys(before).length).toBe(7);

    // 重跑同一天 (force=true) → storage 又写一次
    const yesterday = runner._dateKeyDaysAgo(1, Date.now());
    const r = await runner.runOne(yesterday, { force: true });
    expect(r).not.toBeNull();

    const after = stateStore.loadDailyDigests(statePath);
    expect(Object.keys(after).length).toBe(7); //仍是7 条 (覆盖同一天)
    expect(after[yesterday].sessionCount).toBeGreaterThanOrEqual(1);
  });
});
