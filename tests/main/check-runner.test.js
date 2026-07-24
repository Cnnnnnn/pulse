/**
 * tests/main/check-runner.test.js
 *
 * Phase 27: check-runner 跳过 muted apps 的通知 dispatch.
 *
 * 覆盖:
 *   - muted app → 不进 notifyable → Notification 不发 → markNotified 不调
 *   - 非 muted app → 正常进 notifyable
 *   - mixed: 部分 muted, 只发非 muted 的
 *   - mutes 空 / state 无 mutes → 走老路径
 *   - mutes 包含过期项 → 视为非 muted (按现在时间算)
 *
 * 不发真实 Notification — 通过 deps.Notification 注入 FakeNotification 构造器
 * (Phase 27 顺便给 check-runner 加了 Notification 注入支持, 顺便方便测试).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { runCheck } = requireMain("check-runner");
const FAKE_NOW = 1750000000000;
const FAKE_DAY = 24 * 3600 * 1000;

const notificationInstances = [];

class FakeNotification {
  constructor(opts) {
    this.opts = opts;
    this.shown = false;
    notificationInstances.push(this);
  }
  show() {
    this.shown = true;
  }
}

// ── Helpers ────────────────────────────────────────────

function makeResult(name, hasUpdate = true) {
  return {
    name,
    installed_version: "1.0",
    latest_version: hasUpdate ? "1.1" : "1.0",
    has_update: hasUpdate,
    status: hasUpdate ? "update_available" : "up_to_date",
    source: "brew_formulae",
    note: "",
    bundle: `${name}.app`,
  };
}

function makePool(results) {
  return {
    enqueue: (task) => {
      if (task.type === "detect-app") {
        const r = results.find((x) => x.name === task.payload.appCfg.name);
        return Promise.resolve(r);
      }
      return Promise.resolve({ success: true, output: "ok" });
    },
  };
}

function makeDeps({
  results,
  state = {},
  notifCfg = {},
  markNotified = () => {},
  poolOverride = null,
} = {}) {
  return {
    getConfig: () => ({
      apps: results.map((r) => ({ name: r.name, detectors: [] })),
      notifications: notifCfg,
    }),
    pool: poolOverride || makePool(results),
    getWindow: () => null, // 不推到 renderer
    onCheckComplete: () => {},
    getState: () => state,
    markNotified,
    Notification: FakeNotification, // 注入: 不发真实系统通知
  };
}

beforeEach(() => {
  notificationInstances.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────

describe("runCheck notification mute filter (Phase 27)", () => {
  it("muted app → 不进 notifyable, 非 muted 正常发", async () => {
    const markNotified = vi.fn();
    const results = [makeResult("Cursor"), makeResult("Kimi")];
    const state = {
      apps: {},
      mutes: { Cursor: { until: 0, reason: "manual" } }, // 永远 muted
    };
    const deps = makeDeps({ results, state, markNotified });

    await runCheck(deps, { silent: false });

    // 通知 fire 一次, body 只有 Kimi
    expect(notificationInstances).toHaveLength(1);
    const body = notificationInstances[0].opts.body;
    expect(body).toContain("Kimi");
    expect(body).not.toContain("Cursor");
    // markNotified 应当只 mark Kimi
    expect(markNotified).toHaveBeenCalledWith(["Kimi"]);
  });

  it("非 muted → 都进通知", async () => {
    const results = [makeResult("Cursor"), makeResult("Kimi")];
    const state = { apps: {}, mutes: {} };
    const deps = makeDeps({ results, state });

    await runCheck(deps, { silent: false });

    expect(notificationInstances).toHaveLength(1);
    const body = notificationInstances[0].opts.body;
    expect(body).toContain("Cursor");
    expect(body).toContain("Kimi");
  });

  it("所有都 muted → 不发通知, 不 markNotified", async () => {
    const markNotified = vi.fn();
    const results = [makeResult("Cursor"), makeResult("Kimi")];
    const state = {
      apps: {},
      mutes: {
        Cursor: { until: 0, reason: "manual" },
        Kimi: { until: FAKE_NOW + FAKE_DAY, reason: "manual" },
      },
    };
    const deps = makeDeps({ results, state, markNotified });

    await runCheck(deps, { silent: false });

    expect(notificationInstances).toHaveLength(0);
    expect(markNotified).not.toHaveBeenCalled();
  });

  it("mute 已过期 → 视为非 muted, 正常发通知", async () => {
    const results = [makeResult("Cursor")];
    const state = {
      apps: {},
      mutes: {
        // until=now-1 已过期
        Cursor: { until: FAKE_NOW - 1, reason: "manual" },
      },
    };
    const deps = makeDeps({ results, state });

    await runCheck(deps, { silent: false });

    expect(notificationInstances).toHaveLength(1);
    expect(notificationInstances[0].opts.body).toContain("Cursor");
  });

  it("state 没 mutes 字段 → 当作空 map, 不报错", async () => {
    const results = [makeResult("Cursor")];
    const state = { apps: {} }; // 缺 mutes
    const deps = makeDeps({ results, state });

    await runCheck(deps, { silent: false });

    expect(notificationInstances).toHaveLength(1);
    expect(notificationInstances[0].opts.body).toContain("Cursor");
  });

  it("muted + cooldown 双抑制: 都跳过", async () => {
    const markNotified = vi.fn();
    const results = [makeResult("Cursor"), makeResult("Kimi")];
    // Cursor: 在 cooldown (last_notified 刚)
    // Kimi: muted (永远)
    const state = {
      apps: {
        Cursor: { name: "Cursor", last_notified: FAKE_NOW - 1000 },
      },
      mutes: { Kimi: { until: 0, reason: "manual" } },
    };
    const notifCfg = { cooldown_hours: 24 };
    const deps = makeDeps({ results, state, notifCfg, markNotified });

    await runCheck(deps, { silent: false });

    expect(notificationInstances).toHaveLength(0);
    expect(markNotified).not.toHaveBeenCalled();
  });

  it("silent=true (auto-check) → 不发通知, 不受 mutes 影响", async () => {
    // 后台静默 check 不发通知是固定行为, mutes 跟它无关
    const markNotified = vi.fn();
    const results = [makeResult("Cursor")];
    const state = { apps: {}, mutes: {} };
    const deps = makeDeps({ results, state, markNotified });

    await runCheck(deps, { silent: true });

    expect(notificationInstances).toHaveLength(0);
    expect(markNotified).not.toHaveBeenCalled();
  });
});

// ── C5: incremental payload 注入 ─────────────────────────

describe("runCheck incremental payload (C5)", () => {
  it("silent=true → enqueue payload 携带 incremental appsLastChecked (来自 state.apps.*.ts)", async () => {
    const seen = [];
    const pool = {
      enqueue: (task) => {
        if (task.type === "detect-app") {
          seen.push({
            name: task.payload.appCfg.name,
            incremental: task.payload.incremental,
          });
        }
        return Promise.resolve({
          name: task.payload.appCfg.name,
          status: "up_to_date",
          has_update: false,
        });
      },
    };
    const state = {
      apps: {
        Cursor: { ts: FAKE_NOW - 2 * FAKE_DAY }, // 2 天前, < 7d 阈值
        Kimi: { ts: FAKE_NOW - 10 * FAKE_DAY }, // 10 天前, > 7d 阈值
        Ghost: { ts: FAKE_NOW - 1 * FAKE_DAY }, // 1 天前
      },
    };
    const results = [
      makeResult("Cursor"),
      makeResult("Kimi"),
      makeResult("Ghost"),
    ];
    const deps = makeDeps({ results, state, poolOverride: pool });

    await runCheck(deps, { silent: true });

    expect(seen).toHaveLength(3);
    // 每个 task 都有 incremental (silent=true 走增量模式)
    for (const s of seen) {
      expect(s.incremental).toBeTruthy();
      expect(s.incremental.recentDays).toBe(7);
    }
    // appsLastChecked map 含 3 个 app 的 ts
    expect(seen[0].incremental.appsLastChecked.Cursor).toBe(
      FAKE_NOW - 2 * FAKE_DAY,
    );
    expect(seen[0].incremental.appsLastChecked.Kimi).toBe(
      FAKE_NOW - 10 * FAKE_DAY,
    );
    expect(seen[0].incremental.appsLastChecked.Ghost).toBe(
      FAKE_NOW - 1 * FAKE_DAY,
    );
  });

  it("silent=false (manual) → enqueue payload.incremental=null (走全链)", async () => {
    const seen = [];
    const pool = {
      enqueue: (task) => {
        if (task.type === "detect-app") {
          seen.push({
            name: task.payload.appCfg.name,
            incremental: task.payload.incremental,
          });
        }
        return Promise.resolve({
          name: task.payload.appCfg.name,
          status: "up_to_date",
          has_update: false,
        });
      },
    };
    const state = { apps: { Cursor: { ts: FAKE_NOW - 1000 } } };
    const results = [makeResult("Cursor")];
    const deps = makeDeps({ results, state, poolOverride: pool });

    await runCheck(deps, { silent: false });

    expect(seen[0].incremental).toBeNull();
  });

  it("state.apps 全空 → appsLastChecked 空对象, recentDays=7 仍在", async () => {
    const seen = [];
    const pool = {
      enqueue: (task) => {
        if (task.type === "detect-app") seen.push(task.payload);
        return Promise.resolve({
          name: task.payload.appCfg.name,
          status: "up_to_date",
          has_update: false,
        });
      },
    };
    const results = [makeResult("Cursor")];
    const deps = makeDeps({ results, state: { apps: {} }, poolOverride: pool });

    await runCheck(deps, { silent: true });

    expect(seen[0].incremental).toEqual({ appsLastChecked: {}, recentDays: 7 });
  });
});

// ── 手动刷新绕过熔断 (forceRefresh 透传) ─────────────────

describe("runCheck forceRefresh payload (manual bypass)", () => {
  it("silent=false (manual) → enqueue payload.forceRefresh=true", async () => {
    const seen = [];
    const pool = {
      enqueue: (task) => {
        if (task.type === "detect-app") seen.push(task.payload.forceRefresh);
        return Promise.resolve({
          name: task.payload.appCfg.name,
          status: "up_to_date",
          has_update: false,
        });
      },
    };
    const results = [makeResult("Cursor")];
    const deps = makeDeps({ results, state: { apps: {} }, poolOverride: pool });

    await runCheck(deps, { silent: false });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(true);
  });

  it("silent=true (auto) → enqueue payload.forceRefresh=false", async () => {
    const seen = [];
    const pool = {
      enqueue: (task) => {
        if (task.type === "detect-app") seen.push(task.payload.forceRefresh);
        return Promise.resolve({
          name: task.payload.appCfg.name,
          status: "up_to_date",
          has_update: false,
        });
      },
    };
    const results = [makeResult("Cursor")];
    const deps = makeDeps({ results, state: { apps: {} }, poolOverride: pool });

    await runCheck(deps, { silent: true });

    expect(seen[0]).toBe(false);
  });
});
