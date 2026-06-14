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
    loadHistory: overrides.loadAiUsageHistory || (() => ({ days: [] })),
    appendHistory: overrides.appendAiUsageHistoryDay || vi.fn(),
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
    test("returns { ok, snapshot: null, history: { days: [] } } when no snapshot", async () => {
      const deps = makeDeps();
      const r = await _internals.getCached({ deps: deps });
      expect(r).toEqual({ ok: true, snapshot: null, history: { days: [] } });
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
      // pushed (含 prevSnapshot 供 renderer 算 burn rate)
      expect(deps.sendCalls).toEqual([
        { channel: "ai-usage-updated", payload: { snapshot: FAKE_SNAPSHOT, prevSnapshot: null, history: { days: [] } } },
      ]);
      // client constructed once
      expect(deps.clientCalls).toHaveLength(1);
      expect(deps.clientCalls[0].apiKey).toBe("fake-key");
      expect(deps.clientCalls[0].region).toBe("cn");
    });

    test("成功 fetch → appendHistory 用 5h.used", async () => {
      const appendHistory = vi.fn();
      const deps = makeDeps({
        fetchResults: [{ ok: true, snapshot: FAKE_SNAPSHOT }],
        appendAiUsageHistoryDay: appendHistory,
      });
      await _internals.fetch({ deps: deps, opts: {} });
      expect(appendHistory).toHaveBeenCalledTimes(1);
      const arg = appendHistory.mock.calls[0][0];
      expect(arg.used).toBe(1800); // 5h.used
      expect(arg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("成功 fetch 但 5h.used=0 → 不调 appendHistory", async () => {
      const appendHistory = vi.fn();
      const deps = makeDeps({
        fetchResults: [{
          ok: true,
          snapshot: { ...FAKE_SNAPSHOT, windows: { "5h": { total: 100, remaining: 100, used: 0, usedPercent: 0 } } },
        }],
        appendAiUsageHistoryDay: appendHistory,
      });
      await _internals.fetch({ deps: deps, opts: {} });
      expect(appendHistory).not.toHaveBeenCalled();
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
