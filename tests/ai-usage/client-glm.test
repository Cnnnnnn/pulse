/**
 * tests/ai-usage/client-glm.test.js
 *
 * GlmQuotaClient 测试: 验证 GET endpoint + auth header + 状态码处理.
 */

import { describe, test, expect } from "vitest";
const {
  _resolveEndpoint,
  GlmQuotaClient,
} = require("../../src/ai-usage/client-glm");

describe("_resolveEndpoint", () => {
  test("returns Global endpoint by default", () => {
    expect(_resolveEndpoint({ region: "global" })).toBe(
      "https://api.z.ai/api/monitor/usage/quota/limit",
    );
  });
  test("returns CN endpoint when region=cn", () => {
    expect(_resolveEndpoint({ region: "cn" })).toBe(
      "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    );
  });
  test("opts.endpoint overrides", () => {
    expect(
      _resolveEndpoint({
        region: "global",
        endpoint: "https://custom.example.com/x",
      }),
    ).toBe("https://custom.example.com/x");
  });
  test("env override GLM_MONITOR_URL wins over opts", () => {
    const prev = process.env.GLM_MONITOR_URL;
    process.env.GLM_MONITOR_URL = "https://env.example.com/y";
    try {
      expect(_resolveEndpoint({ region: "global" })).toBe(
        "https://env.example.com/y",
      );
    } finally {
      if (prev === undefined) delete process.env.GLM_MONITOR_URL;
      else process.env.GLM_MONITOR_URL = prev;
    }
  });
  test("region 不在 cn / global 时默认 global (海外优先, 国内反爬回避)", () => {
    expect(_resolveEndpoint({ region: "unknown" })).toBe(
      "https://api.z.ai/api/monitor/usage/quota/limit",
    );
  });
});

function makeMockHttpClient(map) {
  return {
    calls: [],
    async get(url, opts) {
      this.calls.push({ url, opts, method: "GET" });
      const r = map[url];
      if (!r) return { status: 404, body: "{}", error: "no_fixture" };
      if (r.throw) throw new Error(r.throw);
      return { status: r.status, body: r.body, error: r.error };
    },
  };
}

const GLOBAL_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const CN_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const OK_BODY = JSON.stringify({
  code: 200,
  msg: "操作成功",
  success: true,
  data: {
    level: "pro",
    limits: [
      {
        type: "TOKENS_LIMIT",
        unit: 3,
        number: 5,
        usage: 800000000,
        remaining: 672305536,
        percentage: 15,
        nextResetTime: 1770648402389,
      },
      {
        type: "TOKENS_LIMIT",
        unit: 6,
        number: 7,
        usage: 5600000000,
        remaining: 4710000000,
        percentage: 16,
        nextResetTime: 1771100000000,
      },
      { type: "TIME_LIMIT", usage: 4000, remaining: 2172, percentage: 45 },
    ],
  },
});

describe("GlmQuotaClient.fetchOnce", () => {
  test("happy path: 200 + valid body → ok snapshot (global, Bearer auth)", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 200, body: OK_BODY },
    });
    const c = new GlmQuotaClient({ apiKey: "sk-glm-test", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.provider).toBe("glm");
    expect(r.snapshot.region).toBe("global");
    expect(r.snapshot.level).toBe("pro");
    expect(r.snapshot.windows["5h"]).not.toBeNull();
    expect(r.snapshot.windows.weekly).not.toBeNull();
    expect(r.snapshot.windows.mcp).not.toBeNull();
    // 验证 endpoint + Bearer auth
    expect(http.calls[0].url).toBe(GLOBAL_URL);
    expect(http.calls[0].opts.headers.Authorization).toBe("Bearer sk-glm-test");
  });

  test("cn region: Authorization 直接是 key (无 Bearer)", async () => {
    const http = makeMockHttpClient({
      [CN_URL]: { status: 200, body: OK_BODY },
    });
    const c = new GlmQuotaClient({
      apiKey: "sk-glm-cn",
      region: "cn",
      httpClient: http,
    });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(http.calls[0].url).toBe(CN_URL);
    expect(http.calls[0].opts.headers.Authorization).toBe("sk-glm-cn");
  });

  test("apiKey 缺失 → ok:false, reason=api_key_missing", async () => {
    const http = makeMockHttpClient({});
    const c = new GlmQuotaClient({ httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_key_missing");
    expect(http.calls.length).toBe(0);
  });

  test("401 → ok:false, reason=auth_401", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 401, body: '{"msg":"unauthorized"}' },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("auth_401");
    expect(r.status).toBe(401);
  });

  test("429 → ok:false, reason=rate_limited", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 429, body: '{"msg":"rate"}' },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rate_limited");
  });

  test("500 → ok:false, reason=http_status_500", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 500, body: "err" },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("http_status_500");
  });

  test("network err (throw) → ok:false, reason=network_failed", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 0, throw: "ETIMEDOUT" },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network_failed");
  });

  test("response 不是 JSON → ok:false, reason=response_not_json", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 200, body: "not json at all" },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("response_not_json");
  });

  test("response success=false → ok:false, reason=api_error", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: {
        status: 200,
        body: '{"code":403,"msg":"forbidden","success":false}',
      },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_error");
    expect(r.error).toBe("forbidden");
  });

  test("并发 fetchOnce 复用同一次 HTTP (_inFlight 单例)", async () => {
    const http = makeMockHttpClient({
      [GLOBAL_URL]: { status: 200, body: OK_BODY },
    });
    const c = new GlmQuotaClient({ apiKey: "k", httpClient: http });
    const [r1, r2] = await Promise.all([c.fetchOnce(), c.fetchOnce()]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(http.calls.length).toBe(1);
  });

  test("opts.region override 覆盖 constructor region", async () => {
    const http = makeMockHttpClient({
      [CN_URL]: { status: 200, body: OK_BODY },
    });
    const c = new GlmQuotaClient({
      apiKey: "k",
      region: "global",
      httpClient: http,
    });
    const r = await c.fetchOnce({ region: "cn" });
    expect(r.ok).toBe(true);
    expect(http.calls[0].url).toBe(CN_URL);
    expect(http.calls[0].opts.headers.Authorization).toBe("k");
  });
});
