/**
 * tests/ai-sessions/provider-ollama.test.js
 *
 * Phase B3a (AI Sessions Daily Digest): OllamaSummarizer 测试.
 * 跟 plan B3a 对齐 (~20 cases).
 *
 * Mock HttpClient (不真打 ollama), 测:
 *   - healthcheck: 200 / 5xx / network err / 4xx
 *   - summarize: 正常 / HTTP 错 / JSON 错 / message.content 缺
 *   - 错误统一包成 { ok: false, error } 或 throw
 *   - host 默认值 + 注入
 *   - model / messages 校验
 */

// @vitest-environment happy-dom
// (happy-dom 跟 node 同效, 这里只为跟邻居 .test.jsx 风格一致; happy-dom 不影响这套测试)

import { describe, it, expect, vi } from 'vitest';
import { OllamaSummarizer, DEFAULT_OLLAMA_HOST, DEFAULT_TIMEOUT_MS } from '../../src/ai-sessions/provider-ollama.js';

function makeHttpClient(overrides = {}) {
  return {
    get: vi.fn(async () => ({ status: 200, body: '{}', headers: {} })),
    post: vi.fn(async () => ({ status: 200, body: '{"message":{"content":"ok"}}', headers: {} })),
    ...overrides,
  };
}

describe('OllamaSummarizer — healthcheck', () => {
  it('200 + 任意 body → ok: true', async () => {
    const http = makeHttpClient({ get: vi.fn(async () => ({ status: 200, body: '{"models":[]}', headers: {} })) });
    const s = new OllamaSummarizer();
    const r = await s.healthcheck({ provider: 'ollama', model: 'qwen3.5:9b', config: {}, httpClient: http });
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(typeof r.latencyMs).toBe('number');
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('5xx → ok: false, error 含 status', async () => {
    const http = makeHttpClient({ get: vi.fn(async () => ({ status: 500, body: 'oops', headers: {} })) });
    const s = new OllamaSummarizer();
    const r = await s.healthcheck({ provider: 'ollama', model: 'm', config: {}, httpClient: http });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('http_status_500');
  });

  it('network 错 (r.error=network) → ok: false', async () => {
    const http = makeHttpClient({ get: vi.fn(async () => ({ status: 0, body: '', headers: {}, error: 'network' })) });
    const s = new OllamaSummarizer();
    const r = await s.healthcheck({ provider: 'ollama', model: 'm', config: {}, httpClient: http });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('network');
  });

  it('timeout → ok: false, error=timeout', async () => {
    const http = makeHttpClient({ get: vi.fn(async () => ({ status: 0, body: '', headers: {}, error: 'timeout' })) });
    const s = new OllamaSummarizer();
    const r = await s.healthcheck({ provider: 'ollama', model: 'm', config: {}, httpClient: http });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('timeout');
  });

  it('没 httpClient → ok: false, error: httpClient not provided', async () => {
    const s = new OllamaSummarizer();
    const r = await s.healthcheck({ provider: 'ollama', model: 'm', config: {}, httpClient: null });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/httpClient/);
  });

  it('默认 host = http://localhost:11434', async () => {
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.healthcheck({ provider: 'ollama', model: 'm', config: {}, httpClient: http });
    expect(http.get).toHaveBeenCalledWith(
      `${DEFAULT_OLLAMA_HOST}/api/tags`,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('config.host 覆盖默认', async () => {
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.healthcheck({ provider: 'ollama', model: 'm', config: { host: 'http://myhost:9999' }, httpClient: http });
    expect(http.get).toHaveBeenCalledWith(
      'http://myhost:9999/api/tags',
      expect.any(Object)
    );
  });

  it('config.host 去掉 trailing slash 避免 //api', async () => {
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.healthcheck({ provider: 'ollama', model: 'm', config: { host: 'http://myhost:9999///' }, httpClient: http });
    expect(http.get).toHaveBeenCalledWith('http://myhost:9999/api/tags', expect.any(Object));
  });
});

describe('OllamaSummarizer — summarize', () => {
  const MESSAGES = [
    { role: 'system', content: '你是一个 AI 助理' },
    { role: 'user', content: '总结一下今天的工作' },
  ];

  it('正常: 返 message.content 字符串', async () => {
    // mock body 里 \\n 在 JSON.parse 时变真换行
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 200, body: '{"message":{"content":"# 总结\\n- a"}}', headers: {} })) });
    const s = new OllamaSummarizer();
    const out = await s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'qwen3.5:9b', config: {}, httpClient: http });
    expect(out).toBe('# 总结\n- a');  // 真换行
  });

  it('post body 包含 model / messages / stream: false / options', async () => {
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'qwen3.5:9b', config: { host: 'http://x:1234' }, httpClient: http });
    expect(http.post).toHaveBeenCalledWith(
      'http://x:1234/api/chat',
      expect.objectContaining({
        model: 'qwen3.5:9b',
        messages: MESSAGES,
        stream: false,
        options: expect.objectContaining({ num_predict: expect.any(Number) }),
      }),
      expect.objectContaining({ 'Content-Type': 'application/json' }),
      expect.objectContaining({ timeout: DEFAULT_TIMEOUT_MS })
    );
  });

  it('5xx → throw 含 http_status_', async () => {
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 500, body: 'oops', headers: {} })) });
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http })).rejects.toThrow(/http_status_500/);
  });

  it('network err → throw 含 ollama_summarize', async () => {
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 0, body: '', headers: {}, error: 'network' })) });
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http })).rejects.toThrow(/ollama_summarize.*network/);
  });

  it('JSON parse 失败 → throw "response not JSON"', async () => {
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 200, body: 'not json', headers: {} })) });
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http })).rejects.toThrow(/response not JSON/);
  });

  it('response.message.content 缺 → throw "missing message.content"', async () => {
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 200, body: '{"message":{}}', headers: {} })) });
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http })).rejects.toThrow(/missing message\.content/);
  });

  it('response.message 完全缺 → throw "missing"', async () => {
    const http = makeHttpClient({ post: vi.fn(async () => ({ status: 200, body: '{}', headers: {} })) });
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http })).rejects.toThrow(/missing message\.content/);
  });

  it('messages 空数组 → throw TypeError', async () => {
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: [], provider: 'ollama', model: 'm', config: {}, httpClient: makeHttpClient() })).rejects.toThrow(TypeError);
  });

  it('messages 非数组 → throw TypeError', async () => {
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: null, provider: 'ollama', model: 'm', config: {}, httpClient: makeHttpClient() })).rejects.toThrow(TypeError);
  });

  it('model 缺 → throw TypeError', async () => {
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: '', config: {}, httpClient: makeHttpClient() })).rejects.toThrow(TypeError);
  });

  it('没 httpClient → throw TypeError', async () => {
    const s = new OllamaSummarizer();
    await expect(s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: null })).rejects.toThrow(TypeError);
  });

  it('timeout 120s (B3a plan spec)', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.summarize({ messages: MESSAGES, provider: 'ollama', model: 'm', config: {}, httpClient: http });
    const call = http.post.mock.calls[0];
    expect(call[3]).toEqual(expect.objectContaining({ timeout: 120_000 }));
  });
});

describe('OllamaSummarizer — meta 透传', () => {
  it('summarize meta 不强制使用, 接收但忽略', async () => {
    const http = makeHttpClient();
    const s = new OllamaSummarizer();
    await s.summarize({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'ollama', model: 'm', config: {}, httpClient: http,
      meta: { dateKey: '2026-06-07', locale: 'zh-CN', sessionCount: 3 },
    });
    // meta 不进 body (spec §4.4 ollama API 不需要)
    const body = http.post.mock.calls[0][1];
    expect(body.meta).toBeUndefined();
  });
});
