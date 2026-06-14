/**
 * tests/ai-usage/ipc-register-ai-usage.test.js
 *
 * TDD for src/main/ipc/register-ai-usage.js
 * 把 handler 内的纯业务逻辑当 _internals 暴露, 单测直接调 _internals.fetch
 * 和 _internals.getCached, 不需要 mock electron / safeStorage.
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.2
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

const { _internals } = require("../../src/main/ipc/register-ai-usage");

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

function makeDeps(overrides = {}) {
  const sendCalls = [];
  const stateStore = {
    load: overrides.loadAiUsageSnapshot || (() => null),
    save: overrides.saveAiUsageSnapshot || vi.fn(),
  };
  const storage = {
    loadApiKey: overrides.loadApiKey || vi.fn(() => "fake-key"),
  };
  const clientCalls = [];
  const fetchResults = overrides.fetchResults || [];
  const MiniMaxQuotaClient = function (opts) {
    clientCalls.push(opts);
    this.fetchOnce = async () => fetchResults.shift() || { ok: false, reason: "no_mock" };
  };
  return {
    stateStore,
    storage,
    MiniMaxQuotaClient,
    clientCalls,
    sendCalls,
    pushEvent: (channel, payload) => sendCalls.push({ channel, payload }),
  };
}

beforeEach(() => {
  // noop
});

describe("register-ai-usage._internals", () => {
  describe("getCached", () => {
    test("returns { ok, snapshot: null } when no snapshot", async () => {
      const deps = makeDeps();
      const r = await _internals.getCached({ deps: deps });
      expect(r).toEqual({ ok: true, snapshot: null });
    });

    test("returns cached snapshot when present", async () => {
      const deps = makeDeps({ loadAiUsageSnapshot: () => FAKE_SNAPSHOT });
      const r = await _internals.getCached({ deps: deps });
      expect(r.ok).toBe(true);
      expect(r.snapshot).toEqual(FAKE_SNAPSHOT);
    });
  });

  describe("fetch", () => {
    test("api_key_missing when storage has no key", async () => {
      const deps = makeDeps({ loadApiKey: () => null });
      const r = await _internals.fetch({ deps: deps, opts: {} });
      expect(r).toEqual({ ok: false, reason: "api_key_missing" });
    });

    test("api_key_missing when storage throws", async () => {
      const deps = makeDeps({
        loadApiKey: () => {
          throw new Error("decrypt failed");
        },
      });
      const r = await _internals.fetch({ deps: deps, opts: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("api_key_missing");
    });

    test("success: fetches, saves, pushes event, returns ok", async () => {
      const deps = makeDeps({
        fetchResults: [{ ok: true, snapshot: FAKE_SNAPSHOT }],
      });
      const r = await _internals.fetch({ deps: deps, opts: {} });
      expect(r.ok).toBe(true);
      expect(r.snapshot).toEqual(FAKE_SNAPSHOT);
      // saved
      expect(deps.stateStore.save).toHaveBeenCalledWith(FAKE_SNAPSHOT);
      // pushed
      expect(deps.sendCalls).toEqual([
        { channel: "ai-usage-updated", payload: { snapshot: FAKE_SNAPSHOT } },
      ]);
      // client constructed once
      expect(deps.clientCalls).toHaveLength(1);
      expect(deps.clientCalls[0].apiKey).toBe("fake-key");
      expect(deps.clientCalls[0].region).toBe("cn");
    });

    test("failure: returns error, does NOT save, does NOT push", async () => {
      const deps = makeDeps({
        fetchResults: [{ ok: false, reason: "rate_limited", error: "429" }],
      });
      const r = await _internals.fetch({ deps: deps, opts: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("rate_limited");
      expect(deps.stateStore.save).not.toHaveBeenCalled();
      expect(deps.sendCalls).toEqual([]);
    });

    test("honors region override (global)", async () => {
      const deps = makeDeps({
        fetchResults: [{ ok: true, snapshot: { ...FAKE_SNAPSHOT, region: "global" } }],
      });
      await _internals.fetch({ deps: deps, opts: { region: "global" } });
      expect(deps.clientCalls[0].region).toBe("global");
    });

    test("region defaults to cn", async () => {
      const deps = makeDeps({
        fetchResults: [{ ok: true, snapshot: FAKE_SNAPSHOT }],
      });
      await _internals.fetch({ deps: deps, opts: {} });
      expect(deps.clientCalls[0].region).toBe("cn");
    });
  });
});
