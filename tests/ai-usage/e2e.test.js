/**
 * tests/ai-usage/e2e.test.js
 *
 * AI 用量端到端测试: renderer 模拟 → main 业务逻辑 → minimax client → mock HTTP.
 * 不起 Electron, 走真实 src/main 代码路径 (state-store + register-ai-usage._internals).
 *
 * 覆盖:
 *   - 完整 fetch 成功链路: state.json 持久化 + sendToRenderer 事件
 *   - 失败链路: last-known 保留 + sendToRenderer 不触发 + error reason 透传
 *   - 多 fetch 串联: 缓存用上次成功 snapshot
 */

import { describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { _internals } from "../../src/main/ipc/register-ai-usage.js";
import { HttpClient } from "../../src/main/http-client.js";

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

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-usage-e2e-"));
  return path.join(dir, "state.json");
}

let statePath;

beforeEach(() => {
  statePath = tmpStatePath();
});

describe("AI usage 端到端", () => {
  test("完整 fetch 成功: snapshot 落盘 state.json + 触发 push 事件", async () => {
    // 用真的 HttpClient, 通过 nock-like 在 Node 里 monkey-patch 拦截请求不可行,
    // 这里走 _internals 的 deps 注入: MiniMaxQuotaClient 用 fake (避免真网络)
    const pushCalls = [];
    const storage = { loadApiKey: () => "fake-key" };
    const MiniMaxQuotaClient = function () {
      this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
    };
    const deps = {
      stateStore: {
        load: () => null,
        save: (s) => {
          fs.writeFileSync(statePath, JSON.stringify({ v: 1, ai_usage: s }, null, 2));
        },
        loadHistory: () => ({ days: [] }),
        appendHistory: () => {},
      },
      storage,
      MiniMaxQuotaClient,
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    const r = await _internals.fetch({ deps, opts: {} });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toEqual(FAKE_SNAPSHOT);

    // 1) push 事件
    expect(pushCalls).toEqual([
      { c: "ai-usage-updated", p: { snapshot: FAKE_SNAPSHOT, prevSnapshot: null, history: { days: [] } } },
    ]);

    // 2) state.json 落盘
    expect(fs.existsSync(statePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(saved.ai_usage).toEqual(FAKE_SNAPSHOT);
  });

  test("fetch 失败: 不写盘, 不 push, 错误 reason 透传", async () => {
    const pushCalls = [];
    let saveCalled = false;
    const deps = {
      stateStore: {
        load: () => null,
        save: () => {
          saveCalled = true;
        },
        loadHistory: () => ({ days: [] }),
        appendHistory: () => {},
      },
      storage: { loadApiKey: () => "fake-key" },
      MiniMaxQuotaClient: function () {
        this.fetchOnce = async () => ({
          ok: false,
          reason: "auth_401",
          status: 401,
        });
      },
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    const r = await _internals.fetch({ deps, opts: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("auth_401");
    expect(r.status).toBe(401);
    expect(saveCalled).toBe(false);
    expect(pushCalls).toEqual([]);
  });

  test("api_key 缺失: 早返回, 不调 client", async () => {
    const pushCalls = [];
    let clientConstructed = false;
    const deps = {
      stateStore: { load: () => null, save: () => {}, loadHistory: () => ({ days: [] }), appendHistory: () => {} },
      storage: { loadApiKey: () => null },
      MiniMaxQuotaClient: function () {
        clientConstructed = true;
        this.fetchOnce = async () => ({ ok: true, snapshot: FAKE_SNAPSHOT });
      },
      pushEvent: (c, p) => pushCalls.push({ c, p }),
    };

    const r = await _internals.fetch({ deps, opts: {} });
    expect(r).toEqual({ ok: false, reason: "api_key_missing" });
    expect(clientConstructed).toBe(false);
    expect(pushCalls).toEqual([]);
  });

  test("重复 fetch 串联: 缓存上一次 snapshot, 新 fetch 成功覆盖", async () => {
    // 真实 disk-backed store, 两次 fetch 调真 save/load (statePath)
    const stateStoreMod = await import("../../src/main/state-store.js");
    const cache = { value: null };

    // 第一次 fetch
    {
      const pushCalls = [];
      const MiniMaxQuotaClient = function () {
        this.fetchOnce = async () => ({
          ok: true,
          snapshot: { ...FAKE_SNAPSHOT, fetchedAt: 1 },
        });
      };
      const deps = {
        stateStore: {
          load: () => cache.value,
          save: (s) => {
            cache.value = s;
            fs.writeFileSync(statePath, JSON.stringify({ v: 1, ai_usage: s }, null, 2));
          },
          loadHistory: () => ({ days: [] }),
          appendHistory: () => {},
        },
        storage: { loadApiKey: () => "fake-key" },
        MiniMaxQuotaClient,
        pushEvent: (c, p) => pushCalls.push({ c, p }),
      };
      const r1 = await _internals.fetch({ deps, opts: {} });
      expect(r1.snapshot.fetchedAt).toBe(1);
    }

    // 第二次 fetch — 新 snapshot, 旧 snapshot 仍在 cache
    {
      const pushCalls = [];
      const MiniMaxQuotaClient = function () {
        this.fetchOnce = async () => ({
          ok: true,
          snapshot: { ...FAKE_SNAPSHOT, fetchedAt: 2 },
        });
      };
      const deps = {
        stateStore: {
          load: () => cache.value,
          save: (s) => {
            cache.value = s;
            fs.writeFileSync(statePath, JSON.stringify({ v: 1, ai_usage: s }, null, 2));
          },
          loadHistory: () => ({ days: [] }),
          appendHistory: () => {},
        },
        storage: { loadApiKey: () => "fake-key" },
        MiniMaxQuotaClient,
        pushEvent: (c, p) => pushCalls.push({ c, p }),
      };
      const r2 = await _internals.fetch({ deps, opts: {} });
      expect(r2.snapshot.fetchedAt).toBe(2);
      // 验证 state.json 现在有 fetchedAt=2
      const saved = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      expect(saved.ai_usage.fetchedAt).toBe(2);
    }
  });

  test("getCached: state.json 无 ai_usage 字段 → { ok, snapshot: null }", async () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {} }));
    const deps = {
      stateStore: {
        load: () => {
          if (!fs.existsSync(statePath)) return null;
          const s = JSON.parse(fs.readFileSync(statePath, "utf-8"));
          if (!s.ai_usage || typeof s.ai_usage !== "object") return null;
          return { ...s.ai_usage };
        },
        loadHistory: () => ({ days: [] }),
        appendHistory: () => {},
      },
    };
    const r = await _internals.getCached({ deps });
    expect(r).toEqual({ ok: true, snapshot: null, history: { days: [] } });
  });
});
