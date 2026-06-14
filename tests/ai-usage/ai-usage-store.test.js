/**
 * tests/ai-usage/ai-usage-store.test.js
 *
 * TDD for src/renderer/store/ai-usage-store.js
 * 单测 overrides window.api (通过 createApi({overrides}) 的同名 import).
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

beforeEach(() => {
  apiOverrides = {};
  // reset signal values
  store.aiUsageSnapshot.value = null;
  store.aiUsageLastError.value = null;
  store.aiUsageFetching.value = false;
  store.aiUsageFromCache.value = true;
  // bypass subscribe-once guard for test isolation
  store._resetSubscribeForTest && store._resetSubscribeForTest();
});

describe("ai-usage-store", () => {
  describe("loadAiUsageCached", () => {
    test("populates snapshot + fromCache=true when main has data", async () => {
      apiOverrides.aiUsageGetCached = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
      await store.loadAiUsageCached();
      expect(store.aiUsageSnapshot.value).toEqual(FAKE_SNAPSHOT);
      expect(store.aiUsageFromCache.value).toBe(true);
    });

    test("no-op when main returns null", async () => {
      apiOverrides.aiUsageGetCached = async () => ({ ok: true, snapshot: null });
      await store.loadAiUsageCached();
      expect(store.aiUsageSnapshot.value).toBe(null);
    });

    test("swallows thrown errors", async () => {
      apiOverrides.aiUsageGetCached = async () => {
        throw new Error("ipc broke");
      };
      await expect(store.loadAiUsageCached()).resolves.toBeUndefined();
      expect(store.aiUsageSnapshot.value).toBe(null);
    });
  });

  describe("fetchAiUsage", () => {
    test("success: clears lastError, returns ok", async () => {
      apiOverrides.aiUsageFetch = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
      store.applyAiUsageEvent({ snapshot: FAKE_SNAPSHOT }); // simulate push
      store.aiUsageLastError.value = "stale_error";
      const r = await store.fetchAiUsage();
      expect(r.ok).toBe(true);
      expect(store.aiUsageLastError.value).toBe(null);
    });

    test("failure: sets lastError, keeps existing snapshot", async () => {
      apiOverrides.aiUsageFetch = async () => ({
        ok: false,
        reason: "rate_limited",
        error: "429",
      });
      store.applyAiUsageEvent({ snapshot: FAKE_SNAPSHOT });
      const r = await store.fetchAiUsage();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("rate_limited");
      expect(store.aiUsageLastError.value).toBe("rate_limited");
      expect(store.aiUsageSnapshot.value).toEqual(FAKE_SNAPSHOT);
    });

    test("thrown: caught, lastError=threw", async () => {
      apiOverrides.aiUsageFetch = async () => {
        throw new Error("ipc broke");
      };
      const r = await store.fetchAiUsage();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("threw");
      expect(store.aiUsageLastError.value).toBe("threw");
    });

    test("toggles aiUsageFetching flag", async () => {
      let resolveFn;
      apiOverrides.aiUsageFetch = () =>
        new Promise((r) => {
          resolveFn = () => r({ ok: true, snapshot: FAKE_SNAPSHOT });
        });
      const p = store.fetchAiUsage();
      expect(store.aiUsageFetching.value).toBe(true);
      resolveFn();
      await p;
      expect(store.aiUsageFetching.value).toBe(false);
    });
  });

  describe("applyAiUsageEvent", () => {
    test("updates snapshot + fromCache=false + clears error", () => {
      store.aiUsageLastError.value = "stale";
      store.applyAiUsageEvent({ snapshot: FAKE_SNAPSHOT });
      expect(store.aiUsageSnapshot.value).toEqual(FAKE_SNAPSHOT);
      expect(store.aiUsageFromCache.value).toBe(false);
      expect(store.aiUsageLastError.value).toBe(null);
    });

    test("ignores empty payload", () => {
      store.applyAiUsageEvent({});
      expect(store.aiUsageSnapshot.value).toBe(null);
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
      captured({ snapshot: FAKE_SNAPSHOT });
      expect(store.aiUsageSnapshot.value).toEqual(FAKE_SNAPSHOT);
    });
  });
});
