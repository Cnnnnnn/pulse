/**
 * src/ai-sessions/summarizer.js
 *
 * Phase B1a (AI Sessions Daily Digest): 抽象 LLMSummarizer class.
 *
 * 跟 spec §4.3 一致:
 *   - healthcheck()            -> { ok, error? }
 *   - summarize(sessions, opts) -> string (markdown)
 *
 * 第一实现见 src/ai-sessions/provider-ollama.js (B3) + provider-cloud.js (B6).
 *
 * CommonJS, 跟 src/config/ 一致.
 *
 * 设计:
 *   - 抽象 class 包装 impl + shared session-flattening + prompt loading.
 *   - 5 个 provider 都通过这个抽象注入. provider 间不共享 transport.
 *   - summarize() 走 prompts.js 拿 digest prompt template, flatten sessions → 喂给 LLM.
 */

const { buildDigestPrompt, buildPerSessionPrompt } = require('./prompts');

class LLMSummarizer {
  /**
   * @param {object} opts
   * @param {string} opts.provider      'ollama' | 'openai' | 'anthropic' | 'deepseek' | 'minimax'
   * @param {string} opts.model         e.g. 'qwen3.5:9b'
   * @param {object} opts.impl          具体实现 (OllamaSummarizer 等)
   *                                    必须实现: healthcheck / summarize
   * @param {object} [opts.config]      透传 impl (e.g. ollama {host}, cloud {apiKeyRef})
   * @param {object} [opts.httpClient]  可选 http helper (默认用 node:http 走 impl 内部)
   */
  constructor({ provider, model, impl, config, httpClient } = {}) {
    if (!provider || typeof provider !== 'string') {
      throw new TypeError('LLMSummarizer: provider must be non-empty string');
    }
    if (!model || typeof model !== 'string') {
      throw new TypeError('LLMSummarizer: model must be non-empty string');
    }
    if (!impl || typeof impl.healthcheck !== 'function'
             || typeof impl.summarize !== 'function') {
      throw new TypeError('LLMSummarizer: impl must have healthcheck/summarize');
    }
    this.provider = provider;
    this.model = model;
    this.impl = impl;
    this.config = config || {};
    this.httpClient = httpClient || null;
  }

  /**
   * 检查 LLM provider 是否 healthy.
   * @returns {Promise<{ok: boolean, error?: string, latencyMs?: number}>}
   */
  async healthcheck() {
    try {
      const r = await this.impl.healthcheck({ provider: this.provider, model: this.model, config: this.config, httpClient: this.httpClient });
      if (r && typeof r.ok === 'boolean') return r;
      return { ok: Boolean(r) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'unknown' };
    }
  }

  /**
   * 调 LLM 出 daily digest.
   * - flatten sessions → prompt
   * - 调 impl.summarize(messages)
   * - 返 markdown summary string
   *
   * @param {Array<{id: string, appName: string, startedAt: number, endedAt: number, messages: Array<{role: string, content: string, ts: number}>}>} sessions
   * @param {object} [opts]
   * @param {string} [opts.dateKey]    'YYYY-MM-DD' (用于 prompt context)
   * @param {string} [opts.locale]     'zh-CN' (默认)
   * @returns {Promise<string>}         markdown summary
   */
  async summarize(sessions, opts = {}) {
    if (!Array.isArray(sessions)) {
      throw new TypeError('summarize: sessions must be array');
    }
    const dateKey = opts.dateKey || new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const locale = opts.locale || 'zh-CN';

    // Phase B5b: per-session 模式 — digest.js 拆成 N 次单 session 调,
    // 走 buildPerSessionPrompt (vs buildDigestPrompt 的 batch 模式).
    // batch 模式在弱 coder model 上会忽略 "per-session" 指令, 一锅炖.
    const perSession = Boolean(opts.perSession);
    const { messages, meta } = perSession && sessions.length === 1
      ? buildPerSessionPrompt({ session: sessions[0], index: opts.perSessionIndex || 0, locale })
      : buildDigestPrompt({ sessions, dateKey, locale, model: this.model, provider: this.provider });

    const result = await this.impl.summarize({
      messages,
      provider: this.provider,
      model: this.model,
      config: this.config,
      httpClient: this.httpClient,
      meta,
    });
    // P71: summarize 返回 { content, usage }; 兼容旧 string 返回
    const summary = typeof result === 'string' ? result : (result && result.content);
    if (typeof summary !== 'string') {
      throw new TypeError('summarize: impl.summarize must return string content');
    }
    return summary;
  }
}

module.exports = { LLMSummarizer };
