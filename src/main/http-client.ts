/**
 * src/main/http-client.ts
 *
 * 统一 HTTP client（带 timeout + JSON helper + redirect + retry）。
 * DetectContext.http 就是这个模块的实例（或其 mock）。
 *
 * 设计原则：
 *   - 不抛低层错误（ECONNRESET / EAI_AGAIN），统一包成 { status: 0, error: 'network' }
 *   - HTTP 4xx/5xx 不抛，返回 { status, body, headers } — 由 detector 决定 reason
 *   - timeout 用 AbortController（Node 18+ 原生支持）
 *   - 不解析 content-type，由调用方按需 JSON.parse / yaml.load
 *
 * Phase 24: 网络失败重试. _request 返 result { error: 'network' | 'timeout' }
 *   时, _withRetry 等 3s 重试 1 次. 4xx/5xx 不重试 (BE 问题).
 *   0 retries 也支持, 跟旧行为一致.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as httpType from "node:http";
import type * as httpsType from "node:https";
import type * as urlType from "node:url";

const http: typeof httpType = require("node:http");
const https: typeof httpsType = require("node:https");
const { URL }: typeof urlType = require("node:url");

const { DetectorError, REASONS } = require("../detectors/errors");

type HttpResponse = import("../shared/electron/http-client-adapter").HttpResponse;
type HttpGetOptions = import("../shared/electron/http-client-adapter").HttpGetOptions;
type HttpHeadOptions = import("../shared/electron/http-client-adapter").HttpHeadOptions;
type HttpPostOptions = import("../shared/electron/http-client-adapter").HttpPostOptions;

interface LoggerLike {
  debug?: (msg: string) => void;
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

interface HttpClientOpts {
  timeout?: number;
  logger?: LoggerLike;
  maxBodyBytes?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface RequestInternal {
  method: string;
  headers?: Record<string, string>;
  timeout?: number;
  body?: string | null;
  maxBodyBytes?: number;
}

const UA = "Pulse/2.2";
// 默认 body 上限 1MB — 避免 server 直接返回完整 .dmg/.zip 时把 worker 内存炸了
// Kimi endpoint: HEAD=400, GET=200 + 整个 dmg → 必须限
// detector 可通过 opts.maxBodyBytes 调小/调大
const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;
// Phase 24: 默认网络失败重试 1 次, 间隔 3s. detector 可通过 opts.maxRetries=0 禁用.
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 3000;

class HttpClient {
  defaultTimeout: number;
  logger: LoggerLike;
  maxBodyBytes: number;
  maxRetries: number;
  retryDelayMs: number;

  /**
   * @param opts
   */
  constructor(opts: HttpClientOpts = {}) {
    this.defaultTimeout = opts.timeout ?? 8000;
    this.logger = opts.logger || { debug() {}, info() {}, warn() {}, error() {} };
    this.maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /**
   * GET 请求。follow=true 时最多跟 5 跳重定向。
   */
  async get(url: string, opts: HttpGetOptions = {}): Promise<HttpResponse> {
    return this._withRetry(() => this._getOnce(url, opts));
  }

  async _getOnce(url: string, opts: HttpGetOptions): Promise<HttpResponse> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    if (opts.follow) {
      return this._follow(url, opts, 0, "GET");
    }
    return this._request(url, {
      method: "GET",
      headers: opts.headers,
      timeout,
      maxBodyBytes: opts.maxBodyBytes ?? this.maxBodyBytes,
    });
  }

  /**
   * HEAD 请求，follow=true 时跟随重定向。
   */
  async head(url: string, opts: HttpHeadOptions = {}): Promise<HttpResponse> {
    return this._withRetry(() => this._headOnce(url, opts));
  }

  async _headOnce(url: string, opts: HttpHeadOptions): Promise<HttpResponse> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    if (opts.follow) {
      return this._followHead(url, opts, 0);
    }
    const r = await this._request(url, { method: "HEAD", headers: opts.headers, timeout });
    return { status: r.status, body: r.body, headers: r.headers, finalUrl: url };
  }

  /**
   * POST JSON 请求。
   */
  async post(
    url: string,
    body: string | unknown,
    headers: Record<string, string> = {},
    opts: HttpPostOptions = {},
  ): Promise<HttpResponse> {
    return this._withRetry(() => this._postOnce(url, body, headers, opts));
  }

  async _postOnce(
    url: string,
    body: string | unknown,
    headers: Record<string, string>,
    opts: HttpPostOptions,
  ): Promise<HttpResponse> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const merged: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      ...headers,
    };
    return this._request(url, {
      method: "POST",
      headers: merged as Record<string, string>,
      timeout,
      body: data,
    });
  }

  // ── 内部 ──

  /**
   * Phase 24: 包一层 retry. 仅 network / timeout 错误重试, 4xx/5xx / too_large 不重试.
   * 重试期间 logger.debug 记一下, 方便调试.
   */
  async _withRetry(fn: () => Promise<HttpResponse>): Promise<HttpResponse> {
    let lastResult: HttpResponse;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      lastResult = await fn();
      const retriable = lastResult && (lastResult.error === "network" || lastResult.error === "timeout");
      if (!retriable) return lastResult;
      if (attempt < this.maxRetries) {
        try {
          if (this.logger.debug) this.logger.debug(`http retry ${attempt + 1}/${this.maxRetries} after ${lastResult.error}`);
        } catch { /* noop */ }
        await new Promise<void>((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
    // 重试用完, 还是网络/timeout 错误, 返回最后一次 result (caller 看到的跟旧行为一致)
    return lastResult;
  }

  async _follow(
    url: string,
    opts: HttpGetOptions,
    hop: number,
    method: string,
  ): Promise<HttpResponse> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    const maxBodyBytes = opts.maxBodyBytes ?? this.maxBodyBytes;
    const r = await this._request(url, {
      method,
      headers: opts.headers,
      timeout,
      maxBodyBytes,
    });
    if (r.status >= 300 && r.status < 400 && r.headers.location && hop < 5) {
      const next = this._absUrl(r.headers.location, url);
      return this._follow(next, opts, hop + 1, "GET");
    }
    return { ...r, finalUrl: url };
  }

  async _followHead(
    url: string,
    opts: HttpHeadOptions,
    hop: number,
  ): Promise<HttpResponse> {
    const timeout = opts.timeout ?? this.defaultTimeout;
    const r = await this._request(url, { method: "HEAD", headers: opts.headers, timeout });
    if (r.status >= 300 && r.status < 400 && r.headers.location && hop < 5) {
      const next = this._absUrl(r.headers.location, url);
      return this._followHead(next, opts, hop + 1);
    }
    return { status: r.status, body: "", headers: r.headers, finalUrl: url };
  }

  _absUrl(loc: string, base: string): string {
    if (loc.startsWith("http://") || loc.startsWith("https://")) return loc;
    try {
      const u = new URL(base);
      if (loc.startsWith("//")) return `${u.protocol}${loc}`;
      if (loc.startsWith("/")) return `${u.protocol}//${u.host}${loc}`;
      return `${u.protocol}//${u.host}/${loc}`;
    } catch {
      return loc;
    }
  }

  _request(rawUrl: string, args: RequestInternal): Promise<HttpResponse> {
    const { method, headers = {}, timeout, body = null, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = args;
    return new Promise<HttpResponse>((resolve) => {
      let parsed: URL;
      try { parsed = new URL(rawUrl); }
      catch { return resolve({ status: 0, body: "", headers: {}, error: "network" }); }

      const mod = parsed.protocol === "https:" ? https : http;
      const reqOpts = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: { "User-Agent": UA, ...headers },
      };
      const req = mod.request(reqOpts, (res: httpType.IncomingMessage) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        // Phase 7 bugfix: Kimi endpoint 把整个 .dmg 当 body 返回 (Content-Length = 100MB+).
        // 旧的 "累计到 256KB 再 destroy" 在慢网络下永远到不了 256KB → 整个 worker 卡死.
        // 优化: 一拿到 Content-Length 就提前 abort, 不等流式读完.
        const cl = parseInt(((res.headers || {}) as Record<string, string>)["content-length"], 10);
        if (Number.isFinite(cl) && cl > maxBodyBytes) {
          truncated = true;
          try { res.destroy(); } catch { /* noop */ }
        }
        res.on("data", (c: Buffer) => {
          if (truncated) return;
          total += c.length;
          if (total > maxBodyBytes) {
            truncated = true;
            // 立即切断, 不再读后续 chunk
            try { res.destroy(); } catch { /* noop */ }
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          if (truncated) {
            // Phase 6: body 超过 maxBodyBytes — 当作 'too_large' error 处理
            // 保留 headers + status (说不定是 200 + 大文件, 也说不定是 302 + 大 body)
            const text = Buffer.concat(chunks).toString("utf-8");
            resolve({
              status: res.statusCode || 0,
              body: text,
              headers: (res.headers || {}) as Record<string, string>,
              error: "too_large",
            });
            return;
          }
          const text = Buffer.concat(chunks).toString("utf-8");
          resolve({
            status: res.statusCode || 0,
            body: text,
            headers: (res.headers || {}) as Record<string, string>,
          });
        });
        res.on("error", () => resolve({ status: 0, body: "", headers: {}, error: "network" }));
      });
      req.on("error", () => resolve({ status: 0, body: "", headers: {}, error: "network" }));
      if (timeout) {
        req.setTimeout(timeout, () => {
          try { req.destroy(new Error("timeout")); } catch { /* noop */ }
          resolve({ status: 0, body: "", headers: {}, error: "timeout" });
        });
      }
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = { HttpClient };