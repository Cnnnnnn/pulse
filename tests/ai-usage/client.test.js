import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
const { _resolveEndpoint, MiniMaxQuotaClient } = require("../../src/ai-usage/client");

describe("_resolveEndpoint", () => {
  test("returns CN endpoint by default", () => {
    expect(_resolveEndpoint({ region: "cn" })).toBe(
      "https://www.minimaxi.com/v1/token_plan/remains",
    );
  });
  test("returns Global endpoint when region=global", () => {
    expect(_resolveEndpoint({ region: "global" })).toBe(
      "https://www.minimax.io/v1/token_plan/remains",
    );
  });
  test("opts.endpoint overrides", () => {
    expect(
      _resolveEndpoint({
        region: "cn",
        endpoint: "https://custom.example.com/x",
      }),
    ).toBe("https://custom.example.com/x");
  });
  test("env override MINIMAX_TOKEN_PLAN_URL wins over opts", () => {
    const prev = process.env.MINIMAX_TOKEN_PLAN_URL;
    process.env.MINIMAX_TOKEN_PLAN_URL = "https://env.example.com/y";
    try {
      expect(_resolveEndpoint({ region: "cn" })).toBe(
        "https://env.example.com/y",
      );
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_TOKEN_PLAN_URL;
      else process.env.MINIMAX_TOKEN_PLAN_URL = prev;
    }
  });
});

function makeMockHttpClient(map) {
  return {
    calls: [],
    async post(url, body, headers, opts) {
      this.calls.push({ url, body, headers, opts });
      const r = map[url];
      if (!r) {
        return { status: 404, body: "{}", error: "no_fixture" };
      }
      if (r.throw) throw new Error(r.throw);
      return { status: r.status, body: r.body };
    },
  };
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

const CN_URL = "https://www.minimaxi.com/v1/token_plan/remains";
const OK_BODY = fixture("minimax-token-plan-ok.json");
const ERROR_BODY = fixture("minimax-token-plan-error.json");

describe("MiniMaxQuotaClient.fetchOnce", () => {
  test("happy path: 200 + valid body → ok snapshot", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "sk-test", region: "cn" });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows["5h"].total).toBe(6000);
    expect(r.snapshot.windows["5h"].remaining).toBe(4200);
    expect(r.snapshot.windows["5h"].used).toBe(1800);
    expect(r.snapshot.windows.weekly.total).toBe(50000);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].headers.Authorization).toBe("Bearer sk-test");
    expect(http.calls[0].opts.timeout).toBe(15_000);
  });

  test("401 → reason=auth_401, status=401, no snapshot", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 401, body: '{"error":"invalid"}' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "bad", region: "cn" });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("auth_401");
    expect(r.status).toBe(401);
    expect(r.snapshot).toBeUndefined();
  });

  test("403 → reason=auth_403", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 403, body: "{}" } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    expect((await c.fetchOnce()).reason).toBe("auth_403");
  });

  test("429 → reason=rate_limited", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 429, body: "{}" } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    expect((await c.fetchOnce()).reason).toBe("rate_limited");
  });

  test("5xx → reason=http_status_5xx", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 503, body: "{}" } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    expect((await c.fetchOnce()).reason).toBe("http_status_503");
  });

  test("base_resp error → reason=api_error", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: ERROR_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_error");
    expect(r.error).toMatch(/cookie/);
  });

  test("non-JSON body → reason=response_not_json", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: "<html>not json</html>" } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    expect((await c.fetchOnce()).reason).toBe("response_not_json");
  });

  test("network throw → reason=network_failed", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { throw: "ECONNREFUSED" } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network_failed");
    expect(r.error).toBe("ECONNREFUSED");
  });

  test("missing apiKey → reason=api_key_missing", async () => {
    const http = makeMockHttpClient({});
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: null, region: "cn" });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_key_missing");
  });

  test("concurrent fetch × 3 shares same HTTP call", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    const [r1, r2, r3] = await Promise.all([c.fetchOnce(), c.fetchOnce(), c.fetchOnce()]);
    expect(http.calls).toHaveLength(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  test("after in-flight resolves, next fetch re-fires HTTP", async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: "x", region: "cn" });
    await c.fetchOnce();
    await c.fetchOnce();
    expect(http.calls).toHaveLength(2);
  });
});
