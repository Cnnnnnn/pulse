/**
 * tests/ai-usage/auth-watch.test.ts
 *
 * 「登录态失效 → 提醒重新登录」纯决策函数测试.
 *
 * 重点是三条边界:
 *   1. 从没成功过的 provider 不提醒 (否则对没装 codex 的人是噪音)
 *   2. 3 天内不重复提醒 (30min 一轮的 scheduler 不能刷屏)
 *   3. 恢复后清记录, 下次再失效要能重新提醒
 */

import { describe, test, expect } from "vitest";
const { requireAiUsage } = require("../_setup/require-main.cjs");

const {
  decideAuthReminder,
  CODEX_AUTH_REASONS,
  REWARN_AFTER_MS,
} = requireAiUsage("auth-watch");

const NOW = 1789000000000;

function failed(reason: string, provider = "codex") {
  return { ok: false, provider, reason };
}
const OK_CODEX = { ok: true, provider: "codex" };

function decide(overrides: any = {}) {
  return decideAuthReminder({
    results: [failed("token_expired")],
    prefs: { authWarned: {} },
    hadSnapshot: { codex: true },
    now: NOW,
    ...overrides,
  });
}

describe("decideAuthReminder — 该提醒的情形", () => {
  test("曾经的快照 + 登录态失效 → 提醒, 并记下时间戳", () => {
    const r = decide();
    expect(r.notified).toBe(true);
    expect(r.notification.title).toContain("Codex");
    expect(r.notification.body).toContain("codex");
    expect(r.patch.authWarned.codex).toBe(NOW);
  });

  test("token_expired / auth_401 / codex_auth_missing 都算登录态失效", () => {
    for (const reason of CODEX_AUTH_REASONS) {
      const r = decide({ results: [failed(reason)] });
      expect(r.notified).toBe(true);
    }
  });

  test("auth_403 也归到同一档 (被拒绝 ≠ 没配置)", () => {
    expect(decide({ results: [failed("auth_403")] }).notified).toBe(true);
  });
});

describe("decideAuthReminder — 不该打扰的情形", () => {
  test("从没成功过 (无历史快照) → 不提醒 (还没登录过, 不是失效)", () => {
    const r = decide({ hadSnapshot: { codex: false } });
    expect(r.notified).toBe(false);
    expect(r.notification).toBeUndefined();
    expect(r.patch).toBeUndefined();
  });

  test("没配 API key (api_key_missing) 不算登录态失效", () => {
    expect(decide({ results: [failed("api_key_missing")] }).notified).toBe(false);
  });

  test("网络失败 / 服务端错误 不提醒 (不是登录问题)", () => {
    for (const reason of ["network_failed", "rate_limited", "http_status_500"]) {
      expect(decide({ results: [failed(reason)] }).notified).toBe(false);
    }
  });

  test("fetch 抛异常 (reason=exception) 不提醒", () => {
    expect(decide({ results: [failed("exception")] }).notified).toBe(false);
  });

  test("其它 provider 的 401 不提醒 (只认 codex)", () => {
    expect(
      decide({ results: [failed("auth_401", "minimax")], hadSnapshot: { minimax: true } })
        .notified,
    ).toBe(false);
  });

  test("results 为空 / 非数组 → 安全返回", () => {
    expect(decide({ results: [] }).notified).toBe(false);
    expect(decide({ results: null }).notified).toBe(false);
    expect(decideAuthReminder().notified).toBe(false);
  });
});

describe("decideAuthReminder — 去重与恢复", () => {
  test("3 天内不重复提醒", () => {
    const r = decide({ prefs: { authWarned: { codex: NOW - 60_000 } } });
    expect(r.notified).toBe(false);
    expect(r.patch).toBeUndefined();
  });

  test("超过 3 天仍失效 → 再提醒一次并刷新时间戳", () => {
    const r = decide({
      prefs: { authWarned: { codex: NOW - REWARN_AFTER_MS - 1 } },
    });
    expect(r.notified).toBe(true);
    expect(r.patch.authWarned.codex).toBe(NOW);
  });

  test("fetch 恢复成功 → 清掉记录 (下次再失效能重新提醒)", () => {
    const r = decide({
      results: [OK_CODEX],
      prefs: { authWarned: { codex: NOW - 60_000 } },
    });
    expect(r.notified).toBe(false);
    expect(r.patch.authWarned.codex).toBeUndefined();
  });

  test("恢复但没有记录 → 不产出空 patch (不白写盘)", () => {
    const r = decide({ results: [OK_CODEX], prefs: { authWarned: {} } });
    expect(r.patch).toBeUndefined();
  });

  test("恢复时保留其它 provider 的记录", () => {
    const r = decide({
      results: [OK_CODEX],
      prefs: { authWarned: { codex: 1, minimax: 2 } },
    });
    expect(r.patch.authWarned).toEqual({ minimax: 2 });
  });

  test("prefs 缺失 / 结构异常时不抛, 且不产出脏 patch", () => {
    expect(decide({ prefs: null }).notified).toBe(true);
    const bad = decide({ prefs: { authWarned: "bad" } });
    expect(bad.notified).toBe(true);
    expect(bad.patch.authWarned).toEqual({ codex: NOW });
  });
});
