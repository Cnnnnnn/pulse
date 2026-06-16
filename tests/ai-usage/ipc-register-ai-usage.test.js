/**
 * tests/ai-usage/ipc-register-ai-usage.test.js
 *
 * TDD for src/main/ipc/register-ai-usage.js (multi-provider v2)
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

const FAKE_GLM_SNAPSHOT = {
  provider: "glm",
  region: "global",
  fetchedAt: 1700000000000,
  endpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
  windows: {
    "5h": { total: 800000000, remaining: 672000000, usedPercent: 15 },
    weekly: null,
    mcp: null,
  },
};

/**
 * v2 deps factory. stateStore 用 *Provider 函数 (接 providerId).
 * clientCtor 可注入: { minimax: fn, glm: fn }
 */
function makeDeps(overrides = {}) {
  const sendCalls = [];
  const snapshots = { minimax: null, glm: null };
  const histories = { minimax: { days: [] }, glm: { days: [] } };
  const saveCalls = []; // [{providerId, snapshot}]
  const appendCalls = []; // [{providerId, entry}]

  const stateStore = {
    loadSnapshotProvider: (pid) =>
      overrides.loadSnapshotProvider
        ? overrides.loadSnapshotProvider(pid)
        : snapshots[pid] || null,
    saveSnapshotProvider: (pid, snap) => {
      saveCalls.push({ providerId: pid, snapshot: snap });
      snapshots[pid] = snap;
    },
    loadHistoryProvider: (pid) => histories[pid] || { days: [] },
    appendHistoryProvider: (pid, entry) => {
      appendCalls.push({ providerId: pid, entry });
    },
  };

  const storage = {
    loadApiKey:
      overrides.loadApiKey ||
      ((pid) => (pid === "minimax" || pid === "glm" ? "fake-key" : null)),
  };

  // client 构造记录 + 可注入 fetchOnce 结果
  const clientCalls = [];
  const fetchResultsByProvider = overrides.fetchResultsByProvider || {};
  function makeCtor(providerId) {
    return function (opts) {
      clientCalls.push({ providerId, opts });
      this.fetchOnce = async () => {
        const arr = fetchResultsByProvider[providerId] || [];
        return arr.shift() || { ok: false, reason: "no_mock" };
      };
    };
  }

  return {
    stateStore,
    storage,
    MiniMaxQuotaClient: makeCtor("minimax"),
    GlmQuotaClient: makeCtor("glm"),
    clientCalls,
    saveCalls,
    appendCalls,
    sendCalls,
    pushEvent: (channel, payload) => sendCalls.push({ channel, payload }),
  };
}

beforeEach(() => {
  // noop
});

describe("register-ai-usage._internals", () => {
  describe("getCached", () => {
    test("无任何 provider 数据 → { ok, providers:{minimax:null, glm:null}, histories }", async () => {
      const deps = makeDeps();
      const r = await _internals.getCached({ deps });
      expect(r.ok).toBe(true);
      expect(r.providers).toEqual({ minimax: null, glm: null });
      expect(r.histories.minimax).toEqual({ days: [] });
      expect(r.histories.glm).toEqual({ days: [] });
    });

    test("有 minimax 快照 → providers.minimax 返回快照", async () => {
      const deps = makeDeps({
        loadSnapshotProvider: (pid) =>
          pid === "minimax" ? FAKE_SNAPSHOT : null,
      });
      const r = await _internals.getCached({ deps });
      expect(r.providers.minimax).toEqual(FAKE_SNAPSHOT);
      expect(r.providers.glm).toBe(null);
    });
  });

  describe("fetch", () => {
    test("api_key_missing when storage has no key", async () => {
      const deps = makeDeps({ loadApiKey: () => null });
      const r = await _internals.fetch({ deps, opts: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("api_key_missing");
      expect(r.provider).toBe("minimax");
    });

    test("api_key_missing when storage throws", async () => {
      const deps = makeDeps({
        loadApiKey: () => {
          throw new Error("decrypt failed");
        },
      });
      const r = await _internals.fetch({ deps, opts: {} });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("api_key_missing");
    });

    test("minimax success: fetches, saves provider-scoped, pushes event with provider", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: { minimax: [{ ok: true, snapshot: FAKE_SNAPSHOT }] },
      });
      const r = await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(r.ok).toBe(true);
      expect(r.provider).toBe("minimax");
      expect(r.snapshot).toEqual(FAKE_SNAPSHOT);
      // saved 到 minimax 槽
      expect(deps.saveCalls).toEqual([
        { providerId: "minimax", snapshot: FAKE_SNAPSHOT },
      ]);
      // pushed event 带 provider
      expect(deps.sendCalls).toHaveLength(1);
      expect(deps.sendCalls[0].channel).toBe("ai-usage-updated");
      expect(deps.sendCalls[0].payload.provider).toBe("minimax");
      expect(deps.sendCalls[0].payload.snapshot).toEqual(FAKE_SNAPSHOT);
      // client 用 minimax 构造器
      expect(deps.clientCalls).toHaveLength(1);
      expect(deps.clientCalls[0].providerId).toBe("minimax");
      expect(deps.clientCalls[0].opts.apiKey).toBe("fake-key");
    });

    test("glm success: 用 GlmQuotaClient, save 到 glm 槽", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: { glm: [{ ok: true, snapshot: FAKE_GLM_SNAPSHOT }] },
      });
      const r = await _internals.fetch({ deps, opts: { provider: "glm" } });
      expect(r.ok).toBe(true);
      expect(r.provider).toBe("glm");
      expect(deps.saveCalls).toEqual([
        { providerId: "glm", snapshot: FAKE_GLM_SNAPSHOT },
      ]);
      expect(deps.clientCalls[0].providerId).toBe("glm");
      expect(deps.sendCalls[0].payload.provider).toBe("glm");
    });

    test("未知 provider → unknown_provider", async () => {
      const deps = makeDeps();
      const r = await _internals.fetch({ deps, opts: { provider: "unknown" } });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("unknown_provider");
    });

    test("成功 fetch → appendHistory 用 5h.usedPercent 作主指标, used 作辅助", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: {
          minimax: [
            {
              ok: true,
              snapshot: {
                ...FAKE_SNAPSHOT,
                windows: {
                  ...FAKE_SNAPSHOT.windows,
                  "5h": { ...FAKE_SNAPSHOT.windows["5h"], usedPercent: 30, used: 1800 },
                },
              },
            },
          ],
        },
      });
      await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(deps.appendCalls).toHaveLength(1);
      expect(deps.appendCalls[0].providerId).toBe("minimax");
      const entry = deps.appendCalls[0].entry;
      expect(entry.percent).toBe(30);
      expect(entry.used).toBe(1800);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("成功 fetch 但 5h.usedPercent=0 → 不调 appendHistory", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: {
          minimax: [
            {
              ok: true,
              snapshot: {
                ...FAKE_SNAPSHOT,
                windows: {
                  ...FAKE_SNAPSHOT.windows,
                  "5h": { total: 100, remaining: 100, used: 0, usedPercent: 0 },
                },
              },
            },
          ],
        },
      });
      await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(deps.appendCalls).toHaveLength(0);
    });

    test("成功 fetch 5h.usedPercent 未知 → 不调 appendHistory", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: {
          minimax: [
            {
              ok: true,
              snapshot: {
                ...FAKE_SNAPSHOT,
                windows: {
                  ...FAKE_SNAPSHOT.windows,
                  "5h": { total: 100, remaining: 100, used: 50 }, // 没 usedPercent
                },
              },
            },
          ],
        },
      });
      await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(deps.appendCalls).toHaveLength(0);
    });

    test("failure: returns error, does NOT save, does NOT push", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: {
          minimax: [{ ok: false, reason: "rate_limited", error: "429" }],
        },
      });
      const r = await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("rate_limited");
      expect(deps.saveCalls).toEqual([]);
      expect(deps.sendCalls).toEqual([]);
    });

    test("honors region override (global)", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: {
          minimax: [{ ok: true, snapshot: { ...FAKE_SNAPSHOT, region: "global" } }],
        },
      });
      await _internals.fetch({ deps, opts: { provider: "minimax", region: "global" } });
      expect(deps.clientCalls[0].opts.region).toBe("global");
    });

    test("region defaults to cn", async () => {
      const deps = makeDeps({
        fetchResultsByProvider: { minimax: [{ ok: true, snapshot: FAKE_SNAPSHOT }] },
      });
      await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(deps.clientCalls[0].opts.region).toBe("cn");
    });
  });
});
