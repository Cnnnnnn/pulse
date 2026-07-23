/**
 * src/main/chromium-http-client.ts
 *
 * ChromiumHttpClient — 跟 HttpClient 同接口, 底层走 Electron net.fetch
 * (即 session.defaultSession.fetch, 用 Chromium 网络栈).
 *
 * 用途: 解决 push2.eastmoney.com 对 Node OpenSSL 客户端的 RST 反爬.
 *   Node https 在 TLS 握手成功后会被东财 reset (Node OpenSSL ClientHello 指纹可识别).
 *   Chromium 网络栈伪装成浏览器, 能稳定拿到数据.
 *
 * 接口契约 (跟 HttpClient 保持一致, stock-fetcher.js 无需改动):
 *   get(url, opts) → Promise<{status:number, body:string, headers:object, error?:string}>
 *
 * ponytail: 这个文件只换底层传输, 不动业务语义. retry / timeout 逻辑跟 HttpClient 对齐.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type HttpClientResult = {
  status: number;
  body: string;
  headers: Record<string, string>;
  error?: string;
};

export type ChromiumHttpClientOpts = {
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

export class ChromiumHttpClient {
  defaultTimeout: number;
  maxRetries: number;
  retryDelayMs: number;

  constructor(opts: ChromiumHttpClientOpts = {}) {
    this.defaultTimeout = opts.timeout ?? 10000;
    this.maxRetries = opts.maxRetries ?? 1;
    this.retryDelayMs = opts.retryDelayMs ?? 3000;
  }

  async get(url: string, opts: { timeout?: number; headers?: Record<string, string> } = {}): Promise<HttpClientResult> {
    return this._withRetry(() => this._getOnce(url, opts));
  }

  async _getOnce(url: string, opts: { timeout?: number; headers?: Record<string, string> }): Promise<HttpClientResult> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    // ponytail: net.fetch 在 app.whenReady() 之后才能用, 但 register-stocks.js
    // 只在 user 点按钮时调用 (那时 app 已 ready), 不需要 lazy guard.
    const { net } = require("electron");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const headers: Record<string, string> = { "User-Agent": UA, ...(opts.headers || {}) };
      const res = await net.fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      const body = await res.text();
      return {
        status: res.status,
        body,
        headers: {},
      };
    } catch (e: any) {
      const isAbort =
        e &&
        (e.name === "AbortError" || /aborted/i.test(String(e && e.message)));
      return {
        status: 0,
        body: "",
        headers: {},
        error: isAbort ? "timeout" : "network",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async _withRetry(fn: () => Promise<HttpClientResult>): Promise<HttpClientResult> {
    let lastResult!: HttpClientResult;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      lastResult = await fn();
      const retriable =
        lastResult &&
        (lastResult.error === "network" || lastResult.error === "timeout");
      if (!retriable) return lastResult;
      if (attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
    return lastResult;
  }
}

/**
 * 给 stock IPC 用的工厂 — 在 Electron 环境用 ChromiumHttpClient (绕开 Node OpenSSL RST),
 * 其余环境 (vitest / 离线测试) fallback 到 HttpClient.
 *
 * ponytail: 这样 stock-fetcher.js 完全无感,
 *          调用方只拿一个 `httpClient.get(url, opts)` 接口.
 */
export function createStockHttpClient(opts: ChromiumHttpClientOpts = {}): ChromiumHttpClient | any {
  const { app } = require("electron");
  const isElectron = app && typeof app.isReady === "function" && app.isReady();
  if (isElectron) {
    return new ChromiumHttpClient({ timeout: 10000, maxRetries: 1, ...opts });
  }
  // Fallback (vitest / 没 app 的环境)
  const { HttpClient } = require("./http-client.ts");
  return new HttpClient({ timeout: 10000, maxRetries: 1, ...opts });
}

module.exports = { ChromiumHttpClient, createStockHttpClient };