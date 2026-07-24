/**
 * tests/main/ai-usage-cache.test.js
 *
 * v2.22 Task B1: ai-usage-cache 简化接口 — 给 tray 用的 facade.
 * 底层复用 stateStore.loadAiUsageSnapshotProvider / saveAiUsageSnapshotProvider
 * (v2.14 已 ship).
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");

let tmpDir;
let statePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-cache-test-"));
  statePath = path.join(tmpDir, "state.json");
});

describe("ai-usage-cache", () => {
  it("loadAll: 空 state 时返 { providers: {}, histories: {}, fetchedAt: 0 }", async () => {
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    const out = cache.loadAll();
    expect(out).toEqual({ providers: {}, histories: {}, fetchedAt: 0 });
  });

  it("loadAll: 有 state 时返 minimax snapshot + history", async () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, ts: 0, apps: {},
      ai_usage: { providers: { minimax: { windows: { "5h": { usedPercent: 72 } } } } },
      ai_usage_history: { providers: { minimax: { days: [{ date: "2026-06-17", percent: 50 }] } } },
    }));
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    const out = cache.loadAll();
    expect(out.providers.minimax.windows["5h"].usedPercent).toBe(72);
    expect(out.histories.minimax.days[0].percent).toBe(50);
  });

  it("getTraySummary: snapshot=undefined → status='unconfigured'", async () => {
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    const summary = cache.getTraySummary("minimax");
    expect(summary).toEqual({ status: "unconfigured" });
  });

  it("getTraySummary: 有 snapshot → { status:'ok', percent, remainLabel, fetchedAt }", async () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1, ts: 0, apps: {},
      ai_usage: { providers: { minimax: { windows: { "5h": { usedPercent: 72, used: 720, total: 1000 } } } } },
    }));
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    const summary = cache.getTraySummary("minimax");
    expect(summary.status).toBe("ok");
    expect(summary.percent).toBe(72);
    expect(summary.remainLabel).toBeDefined();
    expect(summary.fetchedAt).toBeGreaterThan(0);
  });

  it("setSnapshot: 走 stateStore, 然后 loadAll 能读到", async () => {
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    cache.setSnapshot("minimax", { windows: { "5h": { usedPercent: 50 } } });
    expect(cache.loadAll().providers.minimax.windows["5h"].usedPercent).toBe(50);
  });

  it("setSnapshot: 未知 provider 抛错", async () => {
    const { createAiUsageCache } = await Promise.resolve(requireMain("ai-usage-cache"));
    const cache = createAiUsageCache({ statePath });
    expect(() => cache.setSnapshot("bogus", {})).toThrow(/unknown provider/);
  });
});
