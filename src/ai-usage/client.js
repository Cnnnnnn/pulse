/**
 * src/ai-usage/client.js
 *
 * MiniMaxQuotaClient: GET /v1/token_plan/remains
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.1
 */

const { normalize } = require('./normalize');

const ENDPOINTS = {
  cn: 'https://www.minimaxi.com/v1/token_plan/remains',
  global: 'https://www.minimax.io/v1/token_plan/remains',
};

/**
 * 选 endpoint. 优先级: env override > opts.endpoint > ENDPOINTS[region]
 * @param {object} opts { region, endpoint }
 * @returns {string}
 */
function _resolveEndpoint(opts = {}) {
  const env = process.env.MINIMAX_TOKEN_PLAN_URL;
  if (typeof env === 'string' && env.length > 0) return env;
  if (typeof opts.endpoint === 'string' && opts.endpoint.length > 0) return opts.endpoint;
  const region = opts.region === 'global' ? 'global' : 'cn';
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
    this.region = opts.region === 'global' ? 'global' : 'cn';
    this.endpoint = _resolveEndpoint({ region: this.region, endpoint: opts.endpoint });
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
      try { return await this._doFetch(opts); }
      finally { this._inFlight = null; }
    })();
    return this._inFlight;
  }

  async _doFetch(opts = {}) {
    // stub — Task U1.4 填实现
    throw new Error('not implemented');
  }
}

module.exports = { MiniMaxQuotaClient, ENDPOINTS, _resolveEndpoint };
