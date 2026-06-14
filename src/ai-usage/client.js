/**
 * src/ai-usage/client.js
 *
 * MiniMaxQuotaClient: GET /v1/token_plan/remains
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.1
 */

const { normalize } = require("./normalize");

const ENDPOINTS = {
  cn: "https://www.minimaxi.com/v1/token_plan/remains",
  global: "https://www.minimax.io/v1/token_plan/remains",
};

/**
 * 选 endpoint. 优先级: env override > opts.endpoint > ENDPOINTS[region]
 * @param {object} opts { region, endpoint }
 * @returns {string}
 */
function _resolveEndpoint(opts = {}) {
  const env = process.env.MINIMAX_TOKEN_PLAN_URL;
  if (typeof env === "string" && env.length > 0) return env;
  if (typeof opts.endpoint === "string" && opts.endpoint.length > 0)
    return opts.endpoint;
  const region = opts.region === "global" ? "global" : "cn";
  return ENDPOINTS[region];
}

class MiniMaxQuotaClient {
  /**
   * @param {object} [opts]
   * @param {object} [opts.httpClient]    HttpClient (默认 new HttpClient({ timeout: 15_000, maxRetries: 0 }))
   * @param {string} [opts.apiKey]         minimax API key (测试可注入)
   * @param {string} [opts.region]         'cn' (默认) | 'global'
   * @param {string} [opts.endpoint]       全 URL override
   * @param {object} [opts.log]            logger (默认 SILENT)
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || null;
    this.region = opts.region === "global" ? "global" : "cn";
    this.endpoint = _resolveEndpoint({
      region: this.region,
      endpoint: opts.endpoint,
    });
    this.httpClient = opts.httpClient || null;
    this.log = opts.log || { info: () => {}, warn: () => {}, error: () => {} };
    this._customHttpClient = Boolean(opts.httpClient);
  }

  /**
   * 拉一次配额数据.
   * _inFlight 单例: 同时间多次调用共享同一次 HTTP.
   * @param {object} [opts] { region override }
   * @returns {Promise<{ok, snapshot?, reason?, error?, status?}>}
   */
  async fetchOnce(opts = {}) {
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try {
        return await this._doFetch(opts);
      } finally {
        this._inFlight = null;
      }
    })();
    return this._inFlight;
  }

  async _doFetch(opts = {}) {
    // 1) apiKey 校验
    if (typeof this.apiKey !== "string" || this.apiKey.length === 0) {
      return { ok: false, reason: "api_key_missing" };
    }

    // 2) 选 endpoint (opts.region 可 override)
    const region = opts.region === "global" ? "global" : this.region;
    const endpoint = _resolveEndpoint({ region, endpoint: this.endpoint });

    // 3) lazy create HttpClient (require 返 { HttpClient } object, 要 new 出 instance)
    const { HttpClient: HttpClientCtor } = require("../main/http-client");
    const http = this.httpClient || new HttpClientCtor({ timeout: 15_000, maxRetries: 0 });

    // 4) 发请求 — minimax /v1/token_plan/remains 是 GET, 不带 body
    //    HttpClient.get(url, opts) 是 2 参 (不是 post 风格的 4 参)
    let r;
    try {
      r = await http.get(endpoint, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15_000,
      });
    } catch (err) {
      return { ok: false, reason: "network_failed", error: (err && err.message) || "unknown" };
    }

    // 5) 解析 status
    if (r.error && !r.status) {
      return { ok: false, reason: "network_failed", error: r.error };
    }
    const status = r.status;
    if (status === 401) return { ok: false, reason: "auth_401", status };
    if (status === 403) return { ok: false, reason: "auth_403", status };
    if (status === 429) return { ok: false, reason: "rate_limited", status };
    if (status === 404) return { ok: false, reason: "http_status_404", status };
    if (status >= 500) return { ok: false, reason: `http_status_${status}`, status };
    if (status < 200 || status >= 300) {
      return { ok: false, reason: `http_status_${status}`, status };
    }

    // 6) parse JSON
    let parsed;
    try { parsed = JSON.parse(r.body); }
    catch (err) {
      return { ok: false, reason: "response_not_json", error: err.message, status };
    }

    // 7) normalize
    const n = normalize(parsed, {
      fetchedAt: Date.now(),
      endpoint,
      provider: "minimax",
      region,
    });
    if (!n.ok) {
      return { ok: false, reason: n.reason, error: n.error, status };
    }
    return { ok: true, snapshot: n.snapshot };
  }
}

module.exports = { MiniMaxQuotaClient, ENDPOINTS, _resolveEndpoint };
