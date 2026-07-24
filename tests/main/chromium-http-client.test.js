/**
 * tests/main/chromium-http-client.test.js
 *
 * ChromiumHttpClient (走 Electron net.fetch / session.defaultSession.fetch) 测试.
 * 跟 HttpClient (Node https) 同接口, 但底层是 Chromium 网络栈 — 能绕过东财
 * 对 Node OpenSSL 的反爬 (TLS 握手后 RST).
 *
 * 测试策略: 注入一个 fake `net` 模块, 验证包装逻辑 (request 构造 / 错误处理 / retry).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const electronPath = require.resolve("electron");
const { mainArtifactPath } = require("../_setup/require-main.cjs");
const clientPath = mainArtifactPath("chromium-http-client");

function makeFakeElectron(impl) {
  // electron 模块本身是个 stub — vi.resetModules 时清缓存重建.
  return {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: impl,
  };
}

describe("ChromiumHttpClient", () => {
  let fakeNet;
  let fakeElectron;

  beforeEach(() => {
    vi.resetModules();
    fakeNet = { fetch: vi.fn() };
    fakeElectron = makeFakeElectron({ net: fakeNet });
    require.cache[electronPath] = fakeElectron;
    delete require.cache[clientPath];
  });

  it("uses net.fetch (Chromium network stack) — NOT Node https", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    fakeNet.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"data":{}}',
      headers: { get: () => null },
    });
    const c = new ChromiumHttpClient({ timeout: 5000, maxRetries: 0 });
    const r = await c.get("https://push2.eastmoney.com/api/qt/clist/get?x=1");
    expect(fakeNet.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeNet.fetch.mock.calls[0];
    expect(url).toBe("https://push2.eastmoney.com/api/qt/clist/get?x=1");
    expect(init.method).toBe("GET");
    expect(init.headers["User-Agent"]).toMatch(/Mozilla/); // 必须带浏览器 UA, 避免反爬
    expect(r.status).toBe(200);
    expect(r.body).toBe('{"data":{}}');
    expect(r.error).toBeUndefined();
  });

  it("passes through custom headers (e.g. stock UA)", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    fakeNet.fetch.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => "",
      headers: { get: () => null },
    });
    const c = new ChromiumHttpClient();
    await c.get("https://example.com", {
      headers: { "X-Foo": "bar", "User-Agent": "CustomUA" },
    });
    const init = fakeNet.fetch.mock.calls[0][1];
    expect(init.headers["X-Foo"]).toBe("bar");
    expect(init.headers["User-Agent"]).toBe("CustomUA");
  });

  it("retries network failures (N times) before giving up", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    fakeNet.fetch.mockRejectedValue(new Error("connection reset"));
    const c = new ChromiumHttpClient({ timeout: 100, maxRetries: 2, retryDelayMs: 1 });
    const r = await c.get("https://example.com");
    expect(fakeNet.fetch).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(r.error).toBe("network");
    expect(r.status).toBe(0);
  });

  it("does NOT retry HTTP 5xx (server problem, retry won't help)", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    fakeNet.fetch.mockResolvedValue({
      ok: false, status: 503, text: async () => "service unavailable",
      headers: { get: () => null },
    });
    const c = new ChromiumHttpClient({ maxRetries: 3, retryDelayMs: 1 });
    const r = await c.get("https://example.com");
    expect(fakeNet.fetch).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(503);
    expect(r.body).toBe("service unavailable");
  });

  it("returns error='timeout' when AbortController fires", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    // fetch 模拟: signal 一旦 abort 就抛 AbortError
    fakeNet.fetch.mockImplementation(async (url, init) => {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
        setTimeout(() => resolve({ ok: true, status: 200, text: async () => "" }), 5000);
      });
    });
    const c = new ChromiumHttpClient({ timeout: 50, maxRetries: 0 });
    const r = await c.get("https://example.com");
    expect(r.error).toBe("timeout");
  });

  it("matches HttpClient interface: .get(url, { headers, timeout }) → { status, body, error, headers }", async () => {
    const { ChromiumHttpClient } = require(clientPath);
    fakeNet.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => "ok",
      headers: { get: (k) => (k === "content-type" ? "text/plain" : null) },
    });
    const c = new ChromiumHttpClient();
    const r = await c.get("https://example.com");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("body");
    expect(r).toHaveProperty("headers");
    // 必须能被 stock-fetcher 当 HttpClient 用 (HttpClient 接口契约)
    expect(typeof r.status).toBe("number");
  });
});