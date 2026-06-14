/**
 * tests/ai-usage/bootstrap-ai-usage.test.js
 *
 * TDD for src/main/bootstrap/ai-usage.js
 * 把 "register IPC + 可选预热 fetch" 抽成纯函数, 单测.
 */

import { describe, test, expect } from "vitest";

const { bootstrapAiUsage } = require("../../src/main/bootstrap/ai-usage");

function makeDeps(overrides = {}) {
  const registeredChannels = [];
  const stateStore = {
    load: overrides.loadAiUsageSnapshot || (() => null),
    save: overrides.saveAiUsageSnapshot || (() => {}),
  };
  const storage = {
    loadApiKey: overrides.loadApiKey || (() => "fake-key"),
  };
  const MiniMaxQuotaClient = function () {
    this.fetchOnce = async () =>
      overrides.fetchResult || { ok: true, snapshot: { provider: "minimax" } };
  };
  const pushCalls = [];
  const sendToRenderer = (channel, payload) => pushCalls.push({ channel, payload });
  const register = (channel) => registeredChannels.push(channel);
  return {
    stateStore,
    storage,
    MiniMaxQuotaClient,
    sendToRenderer,
    register,
    registeredChannels,
    pushCalls,
  };
}

describe("bootstrapAiUsage", () => {
  test("registers both IPC channels", () => {
    const deps = makeDeps();
    bootstrapAiUsage(deps);
    expect(deps.registeredChannels.sort()).toEqual([
      "ai-usage:fetch",
      "ai-usage:get-cached",
    ]);
  });

  async function drain() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
    }
  }

  test("warmup=true (default) fires one fetch on bootstrap", async () => {
    const deps = makeDeps({
      fetchResult: { ok: true, snapshot: { provider: "minimax" } },
    });
    bootstrapAiUsage(deps);
    await drain();
    expect(deps.pushCalls).toEqual([
      {
        channel: "ai-usage-updated",
        payload: { snapshot: { provider: "minimax" }, prevSnapshot: null },
      },
    ]);
  });

  test("warmup=false skips initial fetch", async () => {
    const deps = makeDeps({
      fetchResult: { ok: true, snapshot: { provider: "minimax" } },
    });
    bootstrapAiUsage(deps, { warmup: false });
    await drain();
    expect(deps.pushCalls).toEqual([]);
  });

  test("warmup fetch failure is swallowed (no throw, no push)", async () => {
    const deps = makeDeps({
      fetchResult: { ok: false, reason: "network_failed" },
    });
    bootstrapAiUsage(deps);
    await drain();
    expect(deps.pushCalls).toEqual([]);
  });

  test("warmup fetch when api_key_missing: silently skip", async () => {
    const deps = makeDeps({ loadApiKey: () => null });
    bootstrapAiUsage(deps);
    await drain();
    expect(deps.pushCalls).toEqual([]);
  });
});
