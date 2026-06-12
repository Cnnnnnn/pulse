/**
 * tests/helpers/mock-http.js
 *
 * 给 detector 单元测试用的 mock http client。直接喂预设响应，离线跑。
 *
 * 用法：
 *   const http = new MockHttp({ get: [{ status: 200, body: '{"version":"3.6.31"}' }] });
 *   const ctx = makeCtx({ http });
 *   const r = await new BrewFormulaeDetector({ cask: 'cursor' }).detect(ctx);
 *   expect(r.version).toBe('3.6.31');
 */

export class MockHttp {
  /**
   * @param {object} [opts]
   * @param {Array} [opts.get]    GET 响应队列（按调用顺序消费）
   * @param {Array} [opts.head]   HEAD 响应队列
   * @param {Array} [opts.post]   POST 响应队列
   * @param {string} [opts.defaultError]  若队列耗尽：返回此 error（'network'|'timeout'）而不是默认
   */
  constructor(opts = {}) {
    this._getQueue = [...(opts.get || [])];
    this._headQueue = [...(opts.head || [])];
    this._postQueue = [...(opts.post || [])];
    this._defaultError = opts.defaultError || null;
    /** @type {Array<{ match: RegExp, response: object | ((url: string) => object) }> | null} */
    this._urlHandlers = opts.urlHandlers || null;

    // 记录调用（断言用）
    this.getCalls = [];
    this.headCalls = [];
    this.postCalls = [];
  }

  async get(url, opts) {
    this.getCalls.push({ url, opts });
    if (this._urlHandlers) {
      for (const h of this._urlHandlers) {
        if (h.match.test(url)) {
          const raw =
            typeof h.response === "function" ? h.response(url) : h.response;
          return this._materialize(raw);
        }
      }
      return this._exhausted("get");
    }
    if (this._getQueue.length === 0) {
      return this._exhausted("get");
    }
    const r = this._getQueue.shift();
    return this._materialize(r);
  }

  async head(url, opts) {
    this.headCalls.push({ url, opts });
    if (this._headQueue.length === 0) {
      return this._exhausted("head");
    }
    const r = this._headQueue.shift();
    // head 调用方通常只读 status / finalUrl / headers
    if (r && "finalUrl" in r) {
      return {
        status: r.status ?? 200,
        finalUrl: r.finalUrl,
        headers: r.headers || {},
      };
    }
    return this._materialize(r);
  }

  async post(url, body, headers, opts) {
    this.postCalls.push({ url, body, headers, opts });
    if (this._postQueue.length === 0) {
      return this._exhausted("post");
    }
    const r = this._postQueue.shift();
    return this._materialize(r);
  }

  _materialize(r) {
    if (!r) return { status: 200, body: "", headers: {} };
    if (r.error) return { status: 0, body: "", headers: {}, error: r.error };
    return {
      status: r.status ?? 200,
      body: r.body ?? "",
      headers: r.headers ?? {},
    };
  }

  _exhausted(_kind) {
    if (this._defaultError === "network" || this._defaultError === "timeout") {
      return { status: 0, body: "", headers: {}, error: this._defaultError };
    }
    return { status: 200, body: "", headers: {} };
  }
}

export function makeCtx({
  http,
  appCfg = {},
  arch = "arm64",
  logger,
  detCfg = {},
  url = "",
} = {}) {
  return {
    appCfg: { name: "TestApp", bundle: "TestApp.app", ...appCfg },
    arch,
    http: http || new MockHttp(),
    logger: logger || { debug() {}, info() {}, warn() {}, error() {} },
    detCfg,
    url,
  };
}
