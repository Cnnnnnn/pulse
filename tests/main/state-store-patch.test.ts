/**
 * tests/main/state-store-patch.test.js
 *
 * 验证 patchState 范式: 字段保留 + bug 回归.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  load,
  patchState,
  saveAISessionsConfig,
  saveActiveCategory,
  saveAiUsageSnapshotProvider,
  appendAiUsageHistoryDayProvider,
} = requireMain("state-store");
let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
  statePath = path.join(tmpDir, "state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seed(j) {
  fs.writeFileSync(statePath, JSON.stringify(j, null, 2));
}

describe("patchState (公共范式)", () => {
  it("seed 已有 ai_sessions_config + apps → 写自定义字段时这两个都保留", () => {
    seed({
      v: 1,
      ts: 1,
      apps: { Cursor: { name: "Cursor" } },
      mutes: {},
      ai_sessions_config: { provider: "openai" },
    });
    const next = patchState((s) => {
      s.custom_field = "x";
    }, statePath);
    expect(next.ai_sessions_config).toEqual({ provider: "openai" });
    expect(next.apps.Cursor).toBeDefined();
    expect(next.custom_field).toBe("x");
  });

  it("updater 不写某字段 → 老值被保留 (避免再被吃)", () => {
    seed({
      v: 1,
      ts: 1,
      apps: { X: { name: "X" } },
      funds: { holdings: [{ a: 1 }] },
      reminders: [{ id: "r1" }],
      recentActivity: [{ kind: "k1" }],
    });
    const next = patchState((s) => {
      s.active_category = "ai";
    }, statePath);
    expect(next.funds.holdings).toEqual([{ a: 1 }]);
    expect(next.reminders).toEqual([{ id: "r1" }]);
    expect(next.recentActivity).toEqual([{ kind: "k1" }]);
  });

  it("opts.dropAiSessionsConfig=true → ai_sessions_config 不被保留 (用于显式清空)", () => {
    seed({
      v: 1,
      ts: 1,
      apps: {},
      ai_sessions_config: { provider: "openai" },
    });
    const next = patchState(() => {}, statePath, {
      dropAiSessionsConfig: true,
    });
    expect(next.ai_sessions_config).toBeUndefined();
  });

  it("过期 mute 写盘时被 GC", () => {
    seed({
      v: 1,
      ts: 1,
      apps: {},
      mutes: {
        forever: { until: 0, reason: "manual" },
        expired: { until: 1, reason: "manual" }, // 早已过期
      },
    });
    const next = patchState(() => {}, statePath);
    expect(next.mutes.forever).toBeDefined();
    expect(next.mutes.expired).toBeUndefined();
  });

  it("updater 缺省 (undefined) → 仍正常写盘 (纯保留语义)", () => {
    seed({ v: 1, ts: 1, apps: { A: { name: "A" } } });
    const next = patchState(undefined, statePath);
    expect(next.apps.A).toBeDefined();
    expect(next.v).toBe(1);
  });
});

// ─── 修复 bug 的回归测试 ──────────────────────────────────
// 老 saveActiveCategory / saveWorldcupMatchInsights 不 preserve ai_sessions_config,
// 重构后通过 patchState 自动补上 (2026-08: WC 已下线, 替换为 AiUsage 同模式回归).

describe("bug 修复: ai_sessions_config 保留", () => {
  beforeEach(() => {
    seed({
      v: 1,
      ts: 1,
      apps: {},
      ai_sessions_config: { provider: "openai" },
    });
  });

  it("saveAiUsageSnapshotProvider 不再吃掉 ai_sessions_config (回归 — 替代 WC 旧测)", () => {
    saveAiUsageSnapshotProvider(
      "minimax",
      { fetchedAt: 1, windows: { weekly: { usedPercent: 50 } } },
      statePath,
    );
    const s = load(statePath);
    expect(s.ai_sessions_config).toEqual({ provider: "openai" });
    expect(s.ai_usage.providers.minimax).toBeDefined();
    expect(s.ai_usage.providers.minimax.fetchedAt).toBe(1);
  });

  it("saveActiveCategory 不再吃掉 ai_sessions_config", () => {
    saveActiveCategory("ai", statePath);
    const s = load(statePath);
    expect(s.ai_sessions_config).toEqual({ provider: "openai" });
    expect(s.active_category).toBe("ai");
  });

  it("appendAiUsageHistoryDayProvider 不再吃掉 ai_sessions_config (回归)", () => {
    saveAiUsageSnapshotProvider(
      "minimax",
      { fetchedAt: 2, windows: { weekly: { usedPercent: 60 } } },
      statePath,
    );
    appendAiUsageHistoryDayProvider(
      "minimax",
      { date: "2026-08-07", used: 100, percent: 50 },
      statePath,
    );
    const s = load(statePath);
    expect(s.ai_sessions_config).toEqual({ provider: "openai" });
    expect(s.ai_usage.providers.minimax.fetchedAt).toBe(2);
    expect(s.ai_usage_history.providers.minimax.days[0].used).toBe(100);
  });

  it("saveAISessionsConfig(null) 仍然显式清字段", () => {
    saveAISessionsConfig(null, statePath);
    const s = load(statePath);
    expect(s.ai_sessions_config).toBeUndefined();
  });
});
