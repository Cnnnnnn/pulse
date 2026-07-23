/**
 * src/ai-usage/client-glm.js
 *
 * GlmQuotaClient: GET /api/monitor/usage/quota/limit
 * 跟 MiniMaxQuotaClient 结构对齐, 但用 z.ai monitor API.
 *
 * Endpoints:
 * - 海外 (默认): https://api.z.ai/api/monitor/usage/quota/limit (Bearer auth)
 * - 国内: https://open.bigmodel.cn/api/monitor/usage/quota/limit (直接 key, 有反爬, 不推荐)
 */

const { normalizeGlm } = require("./normalize-glm");

const ENDPOINTS = {
  cn: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  global: "https://api.z.ai/api/monitor/usage/quota/limit",
};

/**
 * 选 endpoint. 优先级: env override > opts.endpoint > ENDPOINTS[region]
 * @param {object} opts { region, endpoint }
 * @returns {string}
 */
function _resolveEndpoint(opts = {}) {
  const env = process.env.GLM_MONITOR_URL;
  if (typeof env === "string" && env.length > 0) return env;
  if (typeof opts.endpoint === "string" && opts.endpoint.length > 0) {
    return opts.endpoint;
  }
  const region = opts.region === "cn" ? "cn" : "global";
  return ENDPOINTS[region];
}

class GlmQuotaClient {
  /**
   * @param {object} [opts]
   * @param {object} [opts.httpClient]    HttpClient (默认 new HttpClient({ timeout: 15_000, maxRetries: 0 }))
   * @param {string} [opts.apiKey]         GLM API key (测试可注入)
   * @param {string} [opts.region]         'global' (默认) | 'cn'
   * @param {string} [opts.endpoint]       全 URL override
   * @param {object} [opts.log]            logger (默认 SILENT)
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || null;
    this.region = opts.region === "cn" ? "cn" : "global";
    this._explicitEndpoint =
      typeof opts.endpoint === "string" && opts.endpoint.length > 0;
    this.endpoint = _resolveEndpoint({
      region: this.region,
      endpoint: opts.endpoint,
    });
    this.httpClient = opts.httpClient || null;
    this.log = opts.log || { info: () => {}, warn: () => {}, error: () => {} };
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

  /**
   * 计算 Authorization header.
   * z.ai (海外) 推荐 Bearer; 国内 bigmodel 直接 key.
   * @param {string} region
   * @returns {string}
   */
  _authHeader(region) {
    return region === "cn" ? this.apiKey : `Bearer ${this.apiKey}`;
  }

  async _doFetch(opts = {}) {
    // 1) apiKey 校验
    if (typeof this.apiKey !== "string" || this.apiKey.length === 0) {
      return { ok: false, reason: "api_key_missing" };
    }

    // 2) 选 endpoint (opts.region 可 override; 但 this.endpoint 是固定 override, 优先用)
    const region = opts.region === "cn" ? "cn" : this.region;
    // constructor 设了显式 endpoint override 时, region 切换不影响 endpoint;
    // 否则按 region 重算.
    const endpoint = this._explicitEndpoint
      ? this.endpoint
      : _resolveEndpoint({ region });

    // 3) lazy create HttpClient
    const { HttpClient: HttpClientCtor } = require("../main/http-client.ts");
    const http =
      this.httpClient || new HttpClientCtor({ timeout: 15_000, maxRetries: 0 });

    // 4) 发请求 — z.ai monitor 是 GET, 不带 body
    let r;
    try {
      r = await http.get(endpoint, {
        headers: { Authorization: this._authHeader(region) },
        timeout: 15_000,
      });
    } catch (err) {
      return {
        ok: false,
        reason: "network_failed",
        error: (err && err.message) || "unknown",
      };
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
    if (status >= 500)
      return { ok: false, reason: `http_status_${status}`, status };
    if (status < 200 || status >= 300) {
      return { ok: false, reason: `http_status_${status}`, status };
    }

    // 6) parse JSON
    let parsed;
    try {
      parsed = JSON.parse(r.body);
    } catch (err) {
      return {
        ok: false,
        reason: "response_not_json",
        error: err.message,
        status,
      };
    }

    // 7) normalize
    const n = normalizeGlm(parsed, {
      fetchedAt: Date.now(),
      endpoint,
      provider: "glm",
      region,
    });
    if (!n.ok) {
      return { ok: false, reason: n.reason, error: n.error, status };
    }

    return { ok: true, snapshot: n.snapshot };
  }
}

module.exports = { GlmQuotaClient, ENDPOINTS, _resolveEndpoint };
