/**
 * tests/ai-usage/client-codex.test.ts
 *
 * CodexQuotaClient: 读 ~/.codex/auth.json 的 OAuth token → chatgpt.com wham/usage.
 * 固定用例覆盖: 凭据读取 / 5h+周窗口 / business 账号的月度 credit 池 / 过期短路 / 错误 ladder.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
const { requireAiUsage } = require("../_setup/require-main.cjs");

const {
  normalizeCodex,
  readCodexCredentials,
  resolveCodexAuthPath,
  _jwtExpMs,
  CodexQuotaClient,
  CODEX_USAGE_URL,
} = requireAiUsage("client-codex");
const { pickPrimaryWindow } = requireAiUsage("derive");

/** 造一个形如 JWT 的 token, payload 只带 exp. */
function fakeToken(expSeconds: number) {
  const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc({ exp: expSeconds })}.sig`;
}

/**
 * 每用例独立目录 — 文件名由目录推导, 共用 tmp 文件会互相污染 (flaky).
 */
function makeAuthFile(contents: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-auth-"));
  const file = path.join(dir, "auth.json");
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
  return file;
}

function makeMockHttpClient(routes: any) {
  const calls: any[] = [];
  return {
    calls,
    async get(url: string, opts: any) {
      calls.push({ url, opts });
      const r = routes[url];
      if (!r) return { status: 404, body: "{}" };
      return r;
    },
  };
}

const EXPIRED = Math.floor(Date.now() / 1000) - 60;
const FRESH = Math.floor(Date.now() / 1000) + 3600;
const ACCOUNT_ID = "726b7c9a-098b-42d6-9788-a9ca291aaf4f";
const FETCHED_AT = 1789000000000;

// ── normalizeCodex ────────────────────────────────────────────

describe("normalizeCodex — business 账号 (rate_limit=null, 走月度 credit 池)", () => {
  // 真实响应裁剪版: rate_limit 为 null, spend_control.individual_limit 是唯一约束
  const raw = {
    email: "shien.liang@npt.sg",
    plan_type: "business",
    rate_limit: null,
    code_review_rate_limit: null,
    additional_rate_limits: [],
    credits: { has_credits: true, unlimited: false, balance: null },
    spend_control: {
      reached: false,
      individual_limit: {
        source: "group_based_spend_controls",
        unit: "credit",
        limit: "15000",
        used: "11128.445894002914",
        remaining: "3871.5541059970856",
        used_percent: 74,
        remaining_percent: 26,
        reset_after_seconds: 1265216,
        reset_at: 1790812801,
      },
    },
  };

  test("只有 monthly 窗口, 数值从字符串 coerce 成 number", () => {
    const r = normalizeCodex(raw, { fetchedAt: FETCHED_AT, endpoint: CODEX_USAGE_URL });
    expect(r.ok).toBe(true);
    expect(r.snapshot.provider).toBe("codex");
    expect(r.snapshot.level).toBe("business");
    expect(r.snapshot.accountEmail).toBe("shien.liang@npt.sg");
    expect(Object.keys(r.snapshot.windows)).toEqual(["monthly"]);
    const m = r.snapshot.windows.monthly;
    expect(m.usedPercent).toBe(74);
    expect(m.total).toBe(15000);
    expect(m.used).toBeCloseTo(11128.446, 2);
    expect(m.remaining).toBeCloseTo(3871.554, 2);
    expect(m.resetAt).toBe(1790812801000);
    expect(m.resetInSec).toBe(1265216);
  });

  test("pickPrimaryWindow 认 monthly (否则 history / tray 全空)", () => {
    const r = normalizeCodex(raw, { fetchedAt: FETCHED_AT });
    const picked = pickPrimaryWindow(r.snapshot);
    expect(picked).not.toBeNull();
    expect(picked.key).toBe("monthly");
  });
});

describe("normalizeCodex — 消费级账号 (rate_limit 有 5h + 周窗口)", () => {
  const raw = {
    plan_type: "plus",
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 42,
        limit_window_seconds: 18000,
        reset_after_seconds: 3600,
        reset_at: 1790812801,
      },
      secondary_window: {
        used_percent: 88,
        limit_window_seconds: 604800,
        reset_after_seconds: 200000,
        reset_at: 1790900000,
      },
    },
    spend_control: null,
  };

  test("18000s → 5h, 604800s → weekly, 5h 优先作主窗口", () => {
    const r = normalizeCodex(raw, { fetchedAt: FETCHED_AT });
    expect(Object.keys(r.snapshot.windows).sort()).toEqual(["5h", "weekly"]);
    expect(r.snapshot.windows["5h"].usedPercent).toBe(42);
    expect(r.snapshot.windows["5h"].label).toBe("5 小时窗口");
    expect(r.snapshot.windows.weekly.usedPercent).toBe(88);
    expect(pickPrimaryWindow(r.snapshot).key).toBe("5h");
  });

  test("认不出的窗口长度退化成 win<N>m, 不丢数据", () => {
    const r = normalizeCodex({
      rate_limit: {
        primary_window: { used_percent: 5, limit_window_seconds: 900, reset_at: 1 },
      },
    });
    expect(Object.keys(r.snapshot.windows)).toEqual(["win15m"]);
  });
});

describe("normalizeCodex — 边界", () => {
  test("非 object → response_not_json", () => {
    expect(normalizeCodex(null).ok).toBe(false);
    expect(normalizeCodex(null).reason).toBe("response_not_json");
  });

  test("两个窗口都空 → windows 为空对象 (不是 undefined)", () => {
    const r = normalizeCodex({ plan_type: "free", rate_limit: null });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows).toEqual({});
    expect(pickPrimaryWindow(r.snapshot)).toBeNull();
  });
});

// ── 凭据读取 ──────────────────────────────────────────────────

describe("readCodexCredentials", () => {
  test("$CODEX_HOME 优先于 ~/.codex", () => {
    expect(resolveCodexAuthPath({ CODEX_HOME: "/tmp/custom-home" })).toBe(
      "/tmp/custom-home/auth.json",
    );
    expect(resolveCodexAuthPath({})).toBe(
      path.join(os.homedir(), ".codex", "auth.json"),
    );
  });

  test("文件不存在 → codex_auth_missing", () => {
    const r = readCodexCredentials({ authPath: "/tmp/definitely-not-here/auth.json" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("codex_auth_missing");
  });

  test("只有 OPENAI_API_KEY 没 tokens → codex_auth_missing (no_oauth_tokens)", () => {
    const f = makeAuthFile({ OPENAI_API_KEY: "sk-x", auth_mode: "apikey" });
    const r = readCodexCredentials({ authPath: f });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("codex_auth_missing");
    expect(r.error).toBe("no_oauth_tokens");
  });

  test("正常 auth.json → accessToken + accountId + 从 JWT 解出的过期时间", () => {
    const f = makeAuthFile({
      auth_mode: "chatgpt",
      tokens: { access_token: fakeToken(FRESH), account_id: ACCOUNT_ID },
    });
    const r = readCodexCredentials({ authPath: f });
    expect(r.ok).toBe(true);
    expect(r.accountId).toBe(ACCOUNT_ID);
    expect(r.authMode).toBe("chatgpt");
    expect(r.expiresAtMs).toBe(FRESH * 1000);
  });

  test("坏 JSON → codex_auth_unreadable", () => {
    const f = makeAuthFile("{ not json");
    const r = readCodexCredentials({ authPath: f });
    expect(r.reason).toBe("codex_auth_unreadable");
  });

  test("_jwtExpMs 对非 JWT 返回 null (不抛)", () => {
    expect(_jwtExpMs("not-a-jwt")).toBeNull();
    expect(_jwtExpMs("")).toBeNull();
  });
});

// ── CodexQuotaClient ─────────────────────────────────────────

describe("CodexQuotaClient", () => {
  let authFile: string;

  beforeEach(() => {
    authFile = makeAuthFile({
      auth_mode: "chatgpt",
      tokens: { access_token: fakeToken(FRESH), account_id: ACCOUNT_ID },
    });
  });
  afterEach(() => {
    try {
      fs.rmSync(path.dirname(authFile), { recursive: true, force: true });
    } catch {
      /* noop */
    }
  });

  test("200 → ok, 带 Bearer + ChatGPT-Account-Id", async () => {
    const http = makeMockHttpClient({
      [CODEX_USAGE_URL]: {
        status: 200,
        body: JSON.stringify({
          plan_type: "business",
          spend_control: { individual_limit: { limit: "100", used: "30", used_percent: 30 } },
        }),
      },
    });
    const c = new CodexQuotaClient({ authPath: authFile, httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows.monthly.usedPercent).toBe(30);
    expect(http.calls[0].url).toBe(CODEX_USAGE_URL);
    expect(http.calls[0].opts.headers.Authorization).toBe(
      `Bearer ${JSON.parse(fs.readFileSync(authFile, "utf8")).tokens.access_token}`,
    );
    expect(http.calls[0].opts.headers["ChatGPT-Account-Id"]).toBe(ACCOUNT_ID);
  });

  test("缺 account_id 时不发该 header (不报错)", async () => {
    const f = makeAuthFile({ tokens: { access_token: fakeToken(FRESH) } });
    const http = makeMockHttpClient({
      [CODEX_USAGE_URL]: { status: 200, body: '{"plan_type":"free"}' },
    });
    const c = new CodexQuotaClient({ authPath: f, httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(http.calls[0].opts.headers["ChatGPT-Account-Id"]).toBeUndefined();
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
  });

  test("token 已过期 → token_expired, 且完全不发请求", async () => {
    const f = makeAuthFile({ tokens: { access_token: fakeToken(EXPIRED) } });
    const http = makeMockHttpClient({});
    const c = new CodexQuotaClient({ authPath: f, httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("token_expired");
    expect(http.calls.length).toBe(0);
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
  });

  test("401 → auth_401; 429 → rate_limited", async () => {
    const c401 = new CodexQuotaClient({
      authPath: authFile,
      httpClient: makeMockHttpClient({ [CODEX_USAGE_URL]: { status: 401, body: "{}" } }),
    });
    expect((await c401.fetchOnce()).reason).toBe("auth_401");

    const c429 = new CodexQuotaClient({
      authPath: authFile,
      httpClient: makeMockHttpClient({ [CODEX_USAGE_URL]: { status: 429, body: "{}" } }),
    });
    expect((await c429.fetchOnce()).reason).toBe("rate_limited");
  });

  test("响应非 JSON → response_not_json", async () => {
    const c = new CodexQuotaClient({
      authPath: authFile,
      httpClient: makeMockHttpClient({ [CODEX_USAGE_URL]: { status: 200, body: "<html>" } }),
    });
    expect((await c.fetchOnce()).reason).toBe("response_not_json");
  });

  test("auth.json 缺失 → codex_auth_missing", async () => {
    const c = new CodexQuotaClient({
      authPath: "/tmp/definitely-not-here/auth.json",
      httpClient: makeMockHttpClient({}),
    });
    expect((await c.fetchOnce()).reason).toBe("codex_auth_missing");
  });
});
