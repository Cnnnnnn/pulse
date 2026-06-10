/**
 * tests/ai-sessions/provider-cloud.test.js
 *
 * Phase B6b (AI Sessions Daily Digest): CloudSummarizer 测试.
 *跟 plan B6b 对齐 (~15 cases).
 *
 *覆盖4 provider: openai / anthropic / deepseek / minimax.
 * mock httpClient (不真打 cloud API).
 */

import { describe, it, expect, vi } from 'vitest';
import {
 CloudSummarizer,
 PROVIDER_ENDPOINTS,
 ANTHROPIC_VERSION,
 DEFAULT_TIMEOUT_MS,
} from '../../src/ai-sessions/provider-cloud.js';

function makeHttpClient(overrides = {}) {
 return {
 get: vi.fn(async () => ({ status:200, body: '{}', headers: {} })),
 post: vi.fn(async () => ({ status:200, body: '{"choices":[{"message":{"content":"ok"}}]}', headers: {} })),
 ...overrides,
 };
}

const CLOUD_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'minimax'];

function makeCfg(providerId, apiKey = 'sk-test-key') {
 return { providerId, model: `${providerId}-test-model`, apiKey };
}

describe('CloudSummarizer —路由 + URL', () => {
 for (const providerId of CLOUD_PROVIDERS) {
 it(`${providerId}: 默认 baseUrl + path走对 endpoint`, async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 await s.healthcheck({ provider: providerId, model: 'm', config: makeCfg(providerId), httpClient: http });
 const expected = PROVIDER_ENDPOINTS[providerId];
 // 去重 /v1 (如果 baseUrl 末尾是 /v1, 则剥除 path 的 /v1): _joinUrl 同逻辑
 const expectedUrl = expected.baseUrl.endsWith('/v1') && expected.path.startsWith('/v1/')
 ? `${expected.baseUrl}${expected.path.slice(3)}`
 : `${expected.baseUrl}${expected.path}`;
 expect(http.post).toHaveBeenCalledWith(
 expectedUrl,
 expect.any(Object),
 expect.any(Object),
 expect.any(Object)
 );
 });

 it(`${providerId}: config.baseUrl覆盖默认`, async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 const cfg = { ...makeCfg(providerId), baseUrl: 'https://proxy.example.com' };
 await s.healthcheck({ provider: providerId, model: 'm', config: cfg, httpClient: http });
 const ep = PROVIDER_ENDPOINTS[providerId];
 expect(http.post).toHaveBeenCalledWith(
 `https://proxy.example.com${ep.path}`,
 expect.any(Object),
 expect.any(Object),
 expect.any(Object)
 );
 });

 it(`${providerId}: summarize走同 endpoint, content提取正确`, async () => {
 const ep = PROVIDER_ENDPOINTS[providerId];
 const httpBody = ep.protocol === 'openai'
 ? '{"choices":[{"message":{"content":"#总结\\n- a"}}]}'
 : '{"content":[{"text":"#总结\\n- a"}]}';
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: httpBody, headers: {} })),
 });
 const s = new CloudSummarizer();
 const out = await s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: providerId,
 model: `${providerId}-m`,
 config: makeCfg(providerId),
 httpClient: http,
 });
 expect(out).toBe('#总结\n- a'); // 真换行 (JSON parse 后 \n)
 });
 }
});

describe('CloudSummarizer — auth headers', () => {
 it('OpenAI兼容 (openai/deepseek/minimax): Authorization Bearer', async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai', 'sk-openai'), httpClient: http });
 const headers = http.post.mock.calls[0][2];
 expect(headers['Authorization']).toBe('Bearer sk-openai');
 expect(headers['anthropic-version']).toBeUndefined();
 });

 it('Anthropic: x-api-key + anthropic-version, 无 Bearer', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"content":[{"text":"ok"}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await s.healthcheck({ provider: 'anthropic', model: 'm', config: makeCfg('anthropic', 'sk-ant-key'), httpClient: http });
 const headers = http.post.mock.calls[0][2];
 expect(headers['x-api-key']).toBe('sk-ant-key');
 expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
 expect(headers['Authorization']).toBeUndefined();
 });

 it('summarize 也带同一组 auth headers', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"choices":[{"message":{"content":"ok"}}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'deepseek',
 model: 'deepseek-chat',
 config: makeCfg('deepseek', 'sk-deepseek'),
 httpClient: http,
 });
 const headers = http.post.mock.calls[0][2];
 expect(headers['Authorization']).toBe('Bearer sk-deepseek');
 });

 it('Anthropic summarize: system message拆到 body.system', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"content":[{"text":"ok"}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await s.summarize({
 messages: [
 { role: 'system', content: '你是助手' },
 { role: 'user', content: 'hi' },
 ],
 provider: 'anthropic',
 model: 'claude-sonnet-4-5',
 config: makeCfg('anthropic'),
 httpClient: http,
 });
 const body = http.post.mock.calls[0][1];
 expect(body.system).toBe('你是助手');
 // messages数组里只剩 user/assistant
 expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
 });

 it('Anthropic summarize: 没 system → body.system 不存在', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"content":[{"text":"ok"}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'anthropic',
 model: 'm',
 config: makeCfg('anthropic'),
 httpClient: http,
 });
 const body = http.post.mock.calls[0][1];
 expect(body.system).toBeUndefined();
 });
});

describe('CloudSummarizer — healthcheck状态码', () => {
 it('200/201 → ok: true', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"choices":[{"message":{"content":"ok"}}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http });
 expect(r.ok).toBe(true);
 expect(r.status).toBe(200);
 expect(typeof r.latencyMs).toBe('number');
 });

 it('401 → ok: false, error=auth_401', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:401, body: 'unauthorized', headers: {} })),
 });
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http });
 expect(r.ok).toBe(false);
 expect(r.error).toBe('auth_401');
 expect(r.status).toBe(401);
 });

 it('403 → ok: false, error=auth_403', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:403, body: 'forbidden', headers: {} })),
 });
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'anthropic', model: 'm', config: makeCfg('anthropic'), httpClient: http });
 expect(r.ok).toBe(false);
 expect(r.error).toBe('auth_403');
 });

 it('429 → ok: false, error=http_status_429', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:429, body: 'rate limit', headers: {} })),
 });
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http });
 expect(r.ok).toBe(false);
 expect(r.error).toBe('http_status_429');
 });

 it('network err (r.error) → ok: false, error透传', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:0, body: '', headers: {}, error: 'network' })),
 });
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http });
 expect(r.ok).toBe(false);
 expect(r.error).toBe('network');
 });
});

describe('CloudSummarizer — summarize错误处理', () => {
 it('401 → throw 含 auth_401 + provider', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:401, body: 'unauthorized', headers: {} })),
 });
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http,
 })).rejects.toThrow(/auth_401.*openai/);
 });

 it('network err → throw 含 cloud_summarize', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:0, body: '', headers: {}, error: 'network' })),
 });
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'minimax', model: 'm', config: makeCfg('minimax'), httpClient: http,
 })).rejects.toThrow(/cloud_summarize.*network/);
 });

 it('JSON parse失败 → throw "response not JSON"', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: 'not json', headers: {} })),
 });
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http,
 })).rejects.toThrow(/response not JSON/);
 });

 it('OpenAI: response缺 choices[0].message.content → throw', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"choices":[{"message":{}}]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http,
 })).rejects.toThrow(/missing content/);
 });

 it('Anthropic: response.content缺 text → throw', async () => {
 const http = makeHttpClient({
 post: vi.fn(async () => ({ status:200, body: '{"content":[]}', headers: {} })),
 });
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'anthropic', model: 'm', config: makeCfg('anthropic'), httpClient: http,
 })).rejects.toThrow(/missing content/);
 });

 it('timeout120s (跟 ollama 一致)', async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 await s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: http,
 });
 const opts = http.post.mock.calls[0][3];
 expect(opts).toEqual(expect.objectContaining({ timeout: DEFAULT_TIMEOUT_MS }));
 expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
 });
});

describe('CloudSummarizer —校验 +边界', () => {
 it('不支持的 providerId → healthcheck ok:false (不 throw)', async () => {
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'unknown', model: 'm', config: makeCfg('unknown'), httpClient: makeHttpClient() });
 expect(r.ok).toBe(false);
 expect(r.error).toMatch(/unsupported providerId/);
 });

 it('config.providerId缺 → healthcheck ok:false, summarize throw', async () => {
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: { model: 'm', apiKey: 'sk' }, httpClient: makeHttpClient() });
 expect(r.ok).toBe(false);
 expect(r.error).toMatch(/providerId/);
 });

 it('config.apiKey缺 → healthcheck ok:false', async () => {
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: { providerId: 'openai', model: 'm' }, httpClient: makeHttpClient() });
 expect(r.ok).toBe(false);
 expect(r.error).toMatch(/apiKey/);
 });

 it('顶层 model缺 → summarize throw (用顶层 model 而非 config.model)', async () => {
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: '', config: makeCfg('openai'), httpClient: makeHttpClient(),
 })).rejects.toThrow(/model/);
 });

 it('config.model缺 → healthcheck ok:false', async () => {
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: { providerId: 'openai', apiKey: 'sk' }, httpClient: makeHttpClient() });
 expect(r.ok).toBe(false);
 expect(r.error).toMatch(/model/);
 });

 it('summarize messages 空数组 → throw TypeError', async () => {
 const s = new CloudSummarizer();
 await expect(s.summarize({
 messages: [],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: makeHttpClient(),
 })).rejects.toThrow(TypeError);
 });

 it('没 httpClient → healthcheck/summarize 都报', async () => {
 const s = new CloudSummarizer();
 const r = await s.healthcheck({ provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: null });
 expect(r.ok).toBe(false);
 expect(r.error).toMatch(/httpClient/);
 await expect(s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'm', config: makeCfg('openai'), httpClient: null,
 })).rejects.toThrow(TypeError);
 });

 it('summarize body 含 model / messages / stream:false / max_tokens (OpenAI兼容)', async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 await s.summarize({
 messages: [{ role: 'user', content: 'hi' }],
 provider: 'openai', model: 'gpt-4o-mini', config: makeCfg('openai'), httpClient: http,
 });
 const body = http.post.mock.calls[0][1];
 expect(body).toEqual(expect.objectContaining({
 model: 'gpt-4o-mini',
 messages: [{ role: 'user', content: 'hi' }],
 stream: false,
 max_tokens:2048,
 temperature:0.3,
 }));
 });

 it('baseUrl trailing slash去掉', async () => {
 const http = makeHttpClient();
 const s = new CloudSummarizer();
 const cfg = { ...makeCfg('openai'), baseUrl: 'https://api.openai.com/v1///' };
 await s.healthcheck({ provider: 'openai', model: 'm', config: cfg, httpClient: http });
 const url = http.post.mock.calls[0][0];
 expect(url).toBe('https://api.openai.com/v1/chat/completions');
 });
});
