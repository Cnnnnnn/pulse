/**
 * src/ai-sessions/provider-ollama.js
 *
 * Phase B3a (AI Sessions Daily Digest): 本地 ollama provider impl.
 *
 * 跟 spec §4.4 "Provider 1" 一致:
 *   - healthcheck: HTTP GET <host>/api/tags, 200 = ok
 *   - summarize:   HTTP POST <host>/api/chat
 *                    body { model, messages, stream: false }
 *                    返 { message: { content: string } }
 *   - 无 auth
 *   - timeout 120s, retry 1 次 (走 httpClient 自带 retry)
 *
 * host 默认 http://localhost:11434, 可在 opts.config.host 覆盖.
 *
 * 接入 LLMSummarizer:
 *   - impl.healthcheck({ provider, model, config, httpClient })
 *     返 { ok, error?, latencyMs? }
 *   - impl.summarize({ messages, provider, model, config, httpClient, meta })
 *     返 markdown summary string
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120_000;  // 2 min — 大 digest 慢

class OllamaSummarizer {
  /**
   * 健康检查: GET /api/tags, 200 = ok.
   * @param {object} opts
   * @param {string} opts.provider
   * @param {string} opts.model
   * @param {object} opts.config   { host }
   * @param {object} opts.httpClient  HttpClient 实例 (DI)
   * @returns {Promise<{ok: boolean, error?: string, latencyMs?: number}>}
   */
  async healthcheck({ provider, model, config, httpClient } = {}) {
    if (!httpClient) {
      return { ok: false, error: 'httpClient not provided' };
    }
    const host = _resolveHost(config);
    const url = `${host}/api/tags`;
    const t0 = Date.now();
    const r = await httpClient.get(url, { timeout: 5_000, maxBodyBytes: 1024 * 1024 });
    const latencyMs = Date.now() - t0;
    if (r.error) {
      return { ok: false, error: r.error, latencyMs };
    }
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, latencyMs };
    }
    return { ok: false, error: `http_status_${r.status}`, latencyMs };
  }

  /**
   * 调 ollama 出 summary.
   * @param {object} opts
   * @param {Array<{role: string, content: string}>} opts.messages
   * @param {string} opts.provider
   * @param {string} opts.model
   * @param {object} opts.config   { host }
   * @param {object} opts.httpClient
   * @param {object} [opts.meta]   透传 (dateKey / locale / sessionCount)
   * @returns {Promise<string>}     markdown summary
   */
  async summarize({ messages, provider, model, config, httpClient, meta } = {}) {
    if (!httpClient) {
      throw new TypeError('OllamaSummarizer.summarize: httpClient not provided');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('OllamaSummarizer.summarize: messages must be non-empty array');
    }
    if (typeof model !== 'string' || model.length === 0) {
      throw new TypeError('OllamaSummarizer.summarize: model must be non-empty string');
    }
    const host = _resolveHost(config);
    const url = `${host}/api/chat`;
    const body = {
      model,
      messages,
      stream: false,
      // 可选: 透传 options (num_predict / temperature)
      options: { num_predict: 2048, temperature: 0.3 },
    };
    const r = await httpClient.post(url, body, { 'Content-Type': 'application/json' }, { timeout: DEFAULT_TIMEOUT_MS });
    if (r.error) {
      throw new Error(`ollama_summarize: ${r.error} (${r.status || 'no_status'})`);
    }
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`ollama_summarize: http_status_${r.status} body=${(r.body || '').slice(0, 200)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(r.body);
    } catch (err) {
      throw new Error(`ollama_summarize: response not JSON: ${err.message}; body=${(r.body || '').slice(0, 200)}`);
    }
    const content = parsed && parsed.message && typeof parsed.message.content === 'string'
      ? parsed.message.content
      : null;
    if (content == null) {
      throw new Error(`ollama_summarize: missing message.content in response; body=${(r.body || '').slice(0, 200)}`);
    }
    return content;
  }
}

function _resolveHost(config) {
  const host = config && typeof config.host === 'string' && config.host.length > 0
    ? config.host
    : DEFAULT_OLLAMA_HOST;
  // 去掉 trailing slash 避免 //api
  return host.replace(/\/+$/, '');
}

module.exports = {
  OllamaSummarizer,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_TIMEOUT_MS,
};
