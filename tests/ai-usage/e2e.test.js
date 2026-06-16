/**
 * tests/ai-usage/e2e.test.js
 *
 * AI 用量端到端测试 (multi-provider v2): renderer 模拟 → main 业务逻辑 → client → mock HTTP.
 * 不起 Electron, 走真实 src/main 代码路径 (state-store + register-ai-usage._internals).
 *
 * 覆盖:
 *   - 完整 fetch 成功链路: state.json 持久化 (v2 providers 槽) + sendToRenderer 事件
 *   - 失败链路: 不写盘, 不 push, error reason 透传
 *   - 多 fetch 串联: 真实 disk-backed store, minimax + glm 各自落盘
 *   - getCached: 返回 { providers, histories } 全 provider 形状
 */

import { describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { _internals } from "../../src/main/ipc/register-ai-usage.js";

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

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-e2e-"));
  return path.join(dir, "state.json");
}

let statePath;

beforeEach(() => {
  statePath = tmpStatePath();
});

/** 写一个空的合法 state.json (无 ai_usage) */
function seedEmptyState() {
  fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, ts: 0 }));
}

describe("AI usage 端到端", () => {
  test("minimax 完整 fetch 成功: snapshot 落盘 v2 providers.minimax + 触发 push 事件", async () => {
    seedEmptyState();
    const pushCalls = [];
    const storage = { loadApiKey: () => "fake-key" };
    const MiniMaxQuotaClient = function () {
      this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
    };
    const GlmQuotaClient = function () {
      this.fetchOnce = async () => ({ ok: false, reason: "no_mock" });
    };

    // 用真实 state-store *Provider 函数 (disk-backed)
    const stateStoreMod = await import("../../src/main/state-store.js");
    const deps = {
      stateStore: {
        loadSnapshotProvider: (pid) =>
          stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
        saveSnapshotProvider: (pid, s) =>
          stateStoreMod.saveAiUsageSnapshotProvider(pid, s, statePath),
        loadHistoryProvider: (pid) =>
          stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
        appendHistoryProvider: (pid, e) =>
          stateStoreMod.appendAiUsageHistoryDayProvider(pid, e, statePath),
      },
      storage,
      MiniMaxQuotaClient,
      GlmQuotaClient,
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    const r = await _internals.fetch({ deps, opts: { provider: "minimax" } });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("minimax");
    expect(r.snapshot).toEqual(FAKE_SNAPSHOT);

    // 1) push 事件带 provider
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0].c).toBe("ai-usage-updated");
    expect(pushCalls[0].p.provider).toBe("minimax");
    expect(pushCalls[0].p.snapshot).toEqual(FAKE_SNAPSHOT);

    // 2) state.json 落盘为 v2: ai_usage.providers.minimax
    const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(saved.ai_usage.schema_version).toBe(2);
    expect(saved.ai_usage.providers.minimax).toEqual(FAKE_SNAPSHOT);
  });

  test("glm fetch 成功: 落盘 providers.glm, 不影响 minimax 槽", async () => {
    seedEmptyState();
    const pushCalls = [];
    const stateStoreMod = await import("../../src/main/state-store.js");
    const deps = {
      stateStore: {
        loadSnapshotProvider: (pid) =>
          stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
        saveSnapshotProvider: (pid, s) =>
          stateStoreMod.saveAiUsageSnapshotProvider(pid, s, statePath),
        loadHistoryProvider: (pid) =>
          stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
        appendHistoryProvider: (pid, e) =>
          stateStoreMod.appendAiUsageHistoryDayProvider(pid, e, statePath),
      },
      storage: { loadApiKey: () => "fake-key" },
      MiniMaxQuotaClient: function () {
        this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
      },
      GlmQuotaClient: function () {
        this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_GLM_SNAPSHOT });
      },
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    // 先 fetch minimax, 再 fetch glm
    await _internals.fetch({ deps, opts: { provider: "minimax" } });
    await _internals.fetch({ deps, opts: { provider: "glm" } });

    const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(saved.ai_usage.providers.minimax).toEqual(FAKE_SNAPSHOT);
    expect(saved.ai_usage.providers.glm).toEqual(FAKE_GLM_SNAPSHOT);
    // 两次 push, 各带 provider
    expect(pushCalls.map((p) => p.p.provider)).toEqual(["minimax", "glm"]);
  });

  test("fetch 失败: 不写盘, 不 push, 错误 reason 透传", async () => {
    seedEmptyState();
    const pushCalls = [];
    const stateStoreMod = await import("../../src/main/state-store.js");
    const deps = {
      stateStore: {
        loadSnapshotProvider: (pid) =>
          stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
        saveSnapshotProvider: (pid, s) =>
          stateStoreMod.saveAiUsageSnapshotProvider(pid, s, statePath),
        loadHistoryProvider: (pid) =>
          stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
        appendHistoryProvider: (pid, e) =>
          stateStoreMod.appendAiUsageHistoryDayProvider(pid, e, statePath),
      },
      storage: { loadApiKey: () => "fake-key" },
      MiniMaxQuotaClient: function () {
        this.fetchOnce = async () => ({ ok: false, reason: "auth_401", status: 401 });
      },
      GlmQuotaClient: function () {
        this.fetchOnce = async () => ({ ok: false });
      },
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    const r = await _internals.fetch({ deps, opts: { provider: "minimax" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("auth_401");
    expect(r.status).toBe(401);
    expect(pushCalls).toEqual([]);
    // 没写 ai_usage
    const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(saved.ai_usage).toBeUndefined();
  });

  test("api_key 缺失: 早返回, 不调 client", async () => {
    seedEmptyState();
    let clientConstructed = false;
    const stateStoreMod = await import("../../src/main/state-store.js");
    const deps = {
      stateStore: {
        loadSnapshotProvider: (pid) =>
          stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
        saveSnapshotProvider: (pid, s) =>
          stateStoreMod.saveAiUsageSnapshotProvider(pid, s, statePath),
        loadHistoryProvider: (pid) =>
          stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
        appendHistoryProvider: (pid, e) =>
          stateStoreMod.appendAiUsageHistoryDayProvider(pid, e, statePath),
      },
      storage: { loadApiKey: () => null },
      MiniMaxQuotaClient: function () {
        clientConstructed = true;
        this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
      },
      GlmQuotaClient: function () {},
      pushEvent: () => {},
    };

    const r = await _internals.fetch({ deps, opts: { provider: "minimax" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_key_missing");
    expect(r.provider).toBe("minimax");
    expect(clientConstructed).toBe(false);
  });

  test("重复 fetch 串联: 真实 disk-backed store, 新 snapshot 覆盖旧", async () => {
    seedEmptyState();
    const stateStoreMod = await import("../../src/main/state-store.js");
    const baseStateStore = {
      loadSnapshotProvider: (pid) =>
        stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
      saveSnapshotProvider: (pid, s) =>
        stateStoreMod.saveAiUsageSnapshotProvider(pid, s, statePath),
      loadHistoryProvider: (pid) =>
        stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
      appendHistoryProvider: (pid, e) =>
        stateStoreMod.appendAiUsageHistoryDayProvider(pid, e, statePath),
    };

    // 第一次: fetchedAt=1
    {
      const deps = {
        ...{ stateStore: baseStateStore },
        storage: { loadApiKey: () => "fake-key" },
        MiniMaxQuotaClient: function () {
          this.fetchOnce = async () => ({ ok: true, snapshot: { ...FAKE_SNAPSHOT, fetchedAt: 1 } });
        },
        GlmQuotaClient: function () {},
        pushEvent: () => {},
      };
      const r1 = await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(r1.snapshot.fetchedAt).toBe(1);
    }

    // 第二次: fetchedAt=2 覆盖
    {
      const deps = {
        ...{ stateStore: baseStateStore },
        storage: { loadApiKey: () => "fake-key" },
        MiniMaxQuotaClient: function () {
          this.fetchOnce = async () => ({ ok: true, snapshot: { ...FAKE_SNAPSHOT, fetchedAt: 2 } });
        },
        GlmQuotaClient: function () {},
        pushEvent: () => {},
      };
      const r2 = await _internals.fetch({ deps, opts: { provider: "minimax" } });
      expect(r2.snapshot.fetchedAt).toBe(2);
    }

    const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(saved.ai_usage.providers.minimax.fetchedAt).toBe(2);
  });

  test("getCached: 无数据 → { ok, providers:{minimax:null,glm:null}, histories }", async () => {
    seedEmptyState();
    const stateStoreMod = await import("../../src/main/state-store.js");
    const deps = {
      stateStore: {
        loadSnapshotProvider: (pid) =>
          stateStoreMod.loadAiUsageSnapshotProvider(pid, statePath),
        loadHistoryProvider: (pid) =>
          stateStoreMod.loadAiUsageHistoryProvider(pid, statePath),
      },
    };
    const r = await _internals.getCached({ deps });
    expect(r.ok).toBe(true);
    expect(r.providers).toEqual({ minimax: null, glm: null });
    expect(r.histories.minimax).toEqual({ days: [] });
    expect(r.histories.glm).toEqual({ days: [] });
  });
});
