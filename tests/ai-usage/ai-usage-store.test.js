/**
 * tests/ai-usage/ai-usage-store.test.js
 *
 * TDD for src/renderer/store/ai-usage-store.js (multi-provider v2)
 * 单测 overrides window.api (通过 createApi({overrides}) 的同名 import).
 *
 * signals 现在是 { minimax, glm } 形状.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

const FAKE_SNAPSHOT = {
  provider: "minimax",
  region: "cn",
  fetchedAt: 1700000000000,
  endpoint: "https://www.minimaxi.com/v1/token_plan/remains",
  windows: {
    "5h": {
      total: 6000,
      remaining: 4200,
      used: 1800,
      resetAt: 1700003600000,
      resetInSec: 3600,
      label: "5 小时滚动窗口",
    },
    weekly: null,
  },
  credits: null,
};

const FAKE_GLM_SNAPSHOT = {
  provider: "glm",
  region: "global",
  fetchedAt: 1700000000001,
  endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
  windows: { "5h": { usedPercent: 15 }, weekly: null, mcp: null },
};

let apiOverrides = {};

vi.mock("../../src/renderer/api.js", () => {
  return {
    api: {
      aiUsageGetCached: (...args) =>
        apiOverrides.aiUsageGetCached && apiOverrides.aiUsageGetCached(...args),
      aiUsageFetch: (...args) =>
        apiOverrides.aiUsageFetch && apiOverrides.aiUsageFetch(...args),
      onAiUsageUpdated: (cb) => {
        if (apiOverrides.onAiUsageUpdated) apiOverrides.onAiUsageUpdated(cb);
      },
    },
  };
});

const store = await import("../../src/renderer/store/ai-usage-store.js");

function emptySlots(v) {
  return { minimax: v, glm: v };
}

beforeEach(() => {
  apiOverrides = {};
  // reset signal values to multi-provider empty shape
  store.aiUsageSnapshot.value = emptySlots(null);
  store.aiUsagePrevSnapshot.value = emptySlots(null);
  store.aiUsageHistory.value = emptySlots({ days: [] });
  store.aiUsageLastError.value = emptySlots(null);
  store.aiUsageFetching.value = emptySlots(false);
  store.aiUsageFromCache.value = emptySlots(true);
  store.aiUsageActiveProvider.value = "minimax";
  store._resetSubscribeForTest && store._resetSubscribeForTest();
});

describe("ai-usage-store", () => {
  describe("loadAiUsageCached", () => {
    test("populates minimax snapshot + fromCache=true when main has data", async () => {
      apiOverrides.aiUsageGetCached = async () => ({
        ok: true,
        providers: { minimax: FAKE_SNAPSHOT, glm: null },
        histories: { minimax: { days: [] }, glm: { days: [] } },
      });
      await store.loadAiUsageCached();
      expect(store.aiUsageSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
      expect(store.aiUsageSnapshot.value.glm).toBe(null);
      expect(store.aiUsageFromCache.value.minimax).toBe(true);
    });

    test("populates glm snapshot when present", async () => {
      apiOverrides.aiUsageGetCached = async () => ({
        ok: true,
        providers: { minimax: null, glm: FAKE_GLM_SNAPSHOT },
        histories: { minimax: { days: [] }, glm: { days: [] } },
      });
      await store.loadAiUsageCached();
      expect(store.aiUsageSnapshot.value.glm).toEqual(FAKE_GLM_SNAPSHOT);
    });

    test("no-op when main returns null providers", async () => {
      apiOverrides.aiUsageGetCached = async () => ({
        ok: true,
        providers: { minimax: null, glm: null },
        histories: { minimax: { days: [] }, glm: { days: [] } },
      });
      await store.loadAiUsageCached();
      expect(store.aiUsageSnapshot.value.minimax).toBe(null);
      expect(store.aiUsageSnapshot.value.glm).toBe(null);
    });

    test("swallows thrown errors", async () => {
      apiOverrides.aiUsageGetCached = async () => {
        throw new Error("ipc broke");
      };
      await expect(store.loadAiUsageCached()).resolves.toBeUndefined();
      expect(store.aiUsageSnapshot.value.minimax).toBe(null);
    });
  });

  describe("fetchAiUsage", () => {
    test("success: clears minimax lastError, returns ok", async () => {
      apiOverrides.aiUsageFetch = async () => ({ ok: true, provider: "minimax" });
      store.applyAiUsageEvent({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      store.aiUsageLastError.value = { minimax: "stale_error", glm: null };
      const r = await store.fetchAiUsage({ provider: "minimax" });
      expect(r.ok).toBe(true);
      expect(store.aiUsageLastError.value.minimax).toBe(null);
    });

    test("failure: sets minimax lastError, keeps existing snapshot", async () => {
      apiOverrides.aiUsageFetch = async () => ({
        ok: false,
        provider: "minimax",
        reason: "rate_limited",
        error: "429",
      });
      store.applyAiUsageEvent({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      const r = await store.fetchAiUsage({ provider: "minimax" });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("rate_limited");
      expect(store.aiUsageLastError.value.minimax).toBe("rate_limited");
      expect(store.aiUsageSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
    });

    test("glm failure does not affect minimax slot", async () => {
      apiOverrides.aiUsageFetch = async () => ({
        ok: false,
        provider: "glm",
        reason: "auth_401",
      });
      store.applyAiUsageEvent({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      await store.fetchAiUsage({ provider: "glm" });
      expect(store.aiUsageLastError.value.glm).toBe("auth_401");
      // minimax 槽不受影响
      expect(store.aiUsageLastError.value.minimax).toBe(null);
      expect(store.aiUsageSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
    });

    test("thrown: caught, lastError=threw", async () => {
      apiOverrides.aiUsageFetch = async () => {
        throw new Error("ipc broke");
      };
      const r = await store.fetchAiUsage({ provider: "minimax" });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("threw");
      expect(store.aiUsageLastError.value.minimax).toBe("threw");
    });

    test("toggles aiUsageFetching flag for the fetching provider", async () => {
      let resolveFn;
      apiOverrides.aiUsageFetch = () =>
        new Promise((r) => {
          resolveFn = () => r({ ok: true, provider: "minimax" });
        });
      const p = store.fetchAiUsage({ provider: "minimax" });
      expect(store.aiUsageFetching.value.minimax).toBe(true);
      expect(store.aiUsageFetching.value.glm).toBe(false);
      resolveFn();
      await p;
      expect(store.aiUsageFetching.value.minimax).toBe(false);
    });

    test("unknown provider → ok:false", async () => {
      const r = await store.fetchAiUsage({ provider: "nope" });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("unknown_provider");
    });
  });

  describe("applyAiUsageEvent", () => {
    test("updates minimax slot + fromCache=false + clears error", () => {
      store.aiUsageLastError.value = { minimax: "stale", glm: null };
      store.applyAiUsageEvent({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      expect(store.aiUsageSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
      expect(store.aiUsageFromCache.value.minimax).toBe(false);
      expect(store.aiUsageLastError.value.minimax).toBe(null);
    });

    test("updates glm slot independently", () => {
      store.applyAiUsageEvent({ provider: "glm", snapshot: FAKE_GLM_SNAPSHOT });
      expect(store.aiUsageSnapshot.value.glm).toEqual(FAKE_GLM_SNAPSHOT);
      expect(store.aiUsageSnapshot.value.minimax).toBe(null);
    });

    test("ignores payload without provider", () => {
      store.applyAiUsageEvent({ snapshot: FAKE_SNAPSHOT });
      expect(store.aiUsageSnapshot.value.minimax).toBe(null);
    });

    test("rotates current → prev for the provider", () => {
      store.applyAiUsageEvent({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      store.applyAiUsageEvent({
        provider: "minimax",
        snapshot: { ...FAKE_SNAPSHOT, fetchedAt: 9999 },
      });
      expect(store.aiUsagePrevSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
      expect(store.aiUsageSnapshot.value.minimax.fetchedAt).toBe(9999);
    });
  });

  describe("setActiveProvider", () => {
    test("switches active tab", () => {
      store.setActiveProvider("glm");
      expect(store.aiUsageActiveProvider.value).toBe("glm");
    });

    test("ignores unknown provider", () => {
      store.setActiveProvider("nope");
      expect(store.aiUsageActiveProvider.value).toBe("minimax");
    });
  });

  describe("subscribeAiUsageUpdates", () => {
    test("registers handler (idempotent)", () => {
      const reg = vi.fn();
      apiOverrides.onAiUsageUpdated = reg;
      store.subscribeAiUsageUpdates();
      store.subscribeAiUsageUpdates(); // 二次调用
      expect(reg).toHaveBeenCalledTimes(1);
    });

    test("registered handler can apply event", () => {
      let captured;
      apiOverrides.onAiUsageUpdated = (cb) => {
        captured = cb;
      };
      store.subscribeAiUsageUpdates();
      captured({ provider: "minimax", snapshot: FAKE_SNAPSHOT });
      expect(store.aiUsageSnapshot.value.minimax).toEqual(FAKE_SNAPSHOT);
    });
  });
});
