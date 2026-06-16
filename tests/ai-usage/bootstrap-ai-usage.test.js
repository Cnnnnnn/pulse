/**
 * tests/ai-usage/bootstrap-ai-usage.test.js
 *
 * TDD for src/main/bootstrap/ai-usage.js (multi-provider v2)
 * 把 "register IPC + 可选预热 fetch" 抽成纯函数, 单测.
 */

import { describe, test, expect } from "vitest";

const { bootstrapAiUsage } = require("../../src/main/bootstrap/ai-usage");

function makeDeps(overrides = {}) {
  const registeredChannels = [];
  const stateStore = {
    loadSnapshotProvider: () => null,
    saveSnapshotProvider: overrides.saveSnapshotProvider || (() => {}),
    loadHistoryProvider: () => ({ days: [] }),
    appendHistoryProvider: () => {},
  };
  const storage = {
    loadApiKey: overrides.loadApiKey || (() => "fake-key"),
  };
  // 每个 provider 各自的 client 构造器; fetchResult key by providerId
  const fetchResultByProvider =
    overrides.fetchResultByProvider || {};
  function makeCtor(providerId) {
    return function () {
      this.fetchOnce = async () => {
        const r =
          fetchResultByProvider[providerId] || {
            ok: true,
            snapshot: { provider: providerId },
          };
        return r;
      };
    };
  }
  const pushCalls = [];
  const sendToRenderer = (channel, payload) =>
    pushCalls.push({ channel, payload });
  const register = (channel) => registeredChannels.push(channel);
  return {
    stateStore,
    storage,
    MiniMaxQuotaClient: makeCtor("minimax"),
    GlmQuotaClient: makeCtor("glm"),
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

  test("warmup=true (default) fires fetch for both providers", async () => {
    const deps = makeDeps({
      fetchResultByProvider: {
        minimax: { ok: true, snapshot: { provider: "minimax" } },
        glm: { ok: true, snapshot: { provider: "glm" } },
      },
    });
    bootstrapAiUsage(deps);
    await drain();
    // 两次 push (minimax + glm), 各带 provider
    expect(deps.pushCalls).toHaveLength(2);
    const pushedProviders = deps.pushCalls.map((p) => p.payload.provider).sort();
    expect(pushedProviders).toEqual(["glm", "minimax"]);
  });

  test("warmup=false skips initial fetch", async () => {
    const deps = makeDeps({
      fetchResultByProvider: {
        minimax: { ok: true, snapshot: { provider: "minimax" } },
        glm: { ok: true, snapshot: { provider: "glm" } },
      },
    });
    bootstrapAiUsage(deps, { warmup: false });
    await drain();
    expect(deps.pushCalls).toEqual([]);
  });

  test("warmup fetch failure is swallowed (no throw, no push)", async () => {
    const deps = makeDeps({
      fetchResultByProvider: {
        minimax: { ok: false, reason: "network_failed" },
        glm: { ok: false, reason: "network_failed" },
      },
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
