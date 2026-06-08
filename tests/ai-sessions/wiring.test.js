/**
 * tests/ai-sessions/wiring.test.js
 *
 * Phase B6b.5 (AI Sessions Daily Digest): buildDailyDigestRunner 测试.
 *
 *覆盖:
 * - 默认 cfg (ollama)走 OllamaSummarizer
 * - cfg.provider=openai/anthropic/deepseek/minimax走 CloudSummarizer
 * - apiKey拿不到 → fallback stub summarizer (healthcheck ok:false)
 * - cfg.provider 不支持 → fallback 'ollama'
 * - runtimeOverride优先于 cfg (B6c Settings modal改的)
 * - mergeAISessionsConfig各种 merge形态
 */

import { describe, it, expect, vi } from 'vitest';
import {
 buildDailyDigestRunner,
 mergeAISessionsConfig,
 SUPPORTED_PROVIDERS,
} from '../../src/ai-sessions/wiring.js';

function makeFakeOllama() {
 return { healthcheck: vi.fn(), summarize: vi.fn() };
}

function makeFakeCloud() {
 return { healthcheck: vi.fn(), summarize: vi.fn() };
}

describe('SUPPORTED_PROVIDERS', () => {
 it('包含 ollama +4 cloud providers', () => {
 expect(SUPPORTED_PROVIDERS).toEqual(expect.arrayContaining(['ollama', 'openai', 'anthropic', 'deepseek', 'minimax']));
 expect(SUPPORTED_PROVIDERS).toHaveLength(5);
 });
});

describe('buildDailyDigestRunner — ollama路由', () => {
 it('cfg.provider=ollama → impl 是 OllamaSummarizer instance', () => {
 const fake = makeFakeOllama();
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama', ollama: { host: 'http://x:1234', model: 'qwen3:7b' } },
 summarizerImpl: fake,
 });
 expect(w.providerId).toBe('ollama');
 expect(w.summarizer.provider).toBe('ollama');
 expect(w.summarizer.model).toBe('qwen3:7b');
 expect(w.summarizer.config.host).toBe('http://x:1234');
 });

 it('cfg.provider缺省 → fallback ollama + 默认 model=qwen3.5:9b', () => {
 const fake = makeFakeOllama();
 const w = buildDailyDigestRunner({
 config: { enabled: true },
 summarizerImpl: fake,
 });
 expect(w.providerId).toBe('ollama');
 expect(w.summarizer.model).toBe('qwen3.5:9b');
 expect(w.summarizer.config.host).toBe('http://localhost:11434');
 });
});

describe('buildDailyDigestRunner — cloud路由', () => {
 for (const providerId of ['openai', 'anthropic', 'deepseek', 'minimax']) {
 it(`${providerId} + 有 apiKey + 有 model → CloudSummarizer + apiKey注入`, () => {
 const fake = makeFakeCloud();
 const w = buildDailyDigestRunner({
 config: {
 enabled: true,
 provider: providerId,
 cloud: { providerId, model: `${providerId}-m` },
 },
 summarizerImpl: fake,
 resolveApiKey: vi.fn(() => 'sk-test-key'),
 });
 expect(w.providerId).toBe(providerId);
 expect(w.summarizer.provider).toBe(providerId);
 expect(w.summarizer.model).toBe(`${providerId}-m`);
 expect(w.summarizer.config.providerId).toBe(providerId);
 expect(w.summarizer.config.apiKey).toBe('sk-test-key');
 });
 }

 it('openai + 没 apiKey → stub summarizer (healthcheck永远 ok:false)', async () => {
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'openai', cloud: { providerId: 'openai', model: 'gpt-4o-mini' } },
 resolveApiKey: vi.fn(() => null),
 });
 expect(w.providerId).toBe('openai');
 const h = await w.summarizer.impl.healthcheck({});
 expect(h.ok).toBe(false);
 expect(h.error).toMatch(/api key not found/);
 await expect(w.summarizer.impl.summarize({})).rejects.toThrow(/no api key/);
 });

 it('anthropic + 没 model → stub summarizer', async () => {
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'anthropic', cloud: { providerId: 'anthropic' } },
 resolveApiKey: vi.fn(() => 'sk-ant'),
 });
 expect(w.providerId).toBe('anthropic');
 const h = await w.summarizer.impl.healthcheck({});
 expect(h.ok).toBe(false);
 expect(h.error).toMatch(/model not configured/);
 });

 it('cfg.providerId 不支持 (e.g. "gemini") → fallback ollama', () => {
 const fake = makeFakeOllama();
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'gemini' },
 summarizerImpl: fake,
 });
 expect(w.providerId).toBe('ollama');
 expect(w.summarizer.provider).toBe('ollama');
 });
});

describe('buildDailyDigestRunner — runtimeOverride (B6c Settings)', () => {
 it('runtimeOverride.enabled=true 即使 cfg.enabled=false →仍走 ollama路由', () => {
 const fake = makeFakeOllama();
 const w = buildDailyDigestRunner({
 config: { enabled: false, provider: 'ollama' },
 runtimeOverride: { enabled: true, provider: 'ollama', ollama: { model: 'qwen3.5:9b' } },
 summarizerImpl: fake,
 });
 expect(w.providerId).toBe('ollama');
 expect(w.summarizer.provider).toBe('ollama');
 });

 it('runtimeOverride.provider=openai + cfg.provider=ollama → openai生效', () => {
 const fake = makeFakeCloud();
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama' },
 runtimeOverride: { enabled: true, provider: 'openai', cloud: { providerId: 'openai', model: 'gpt-4o-mini' } },
 summarizerImpl: fake,
 resolveApiKey: vi.fn(() => 'sk-openai'),
 });
 expect(w.providerId).toBe('openai');
 expect(w.summarizer.provider).toBe('openai');
 });

 it('runtimeOverride.ollama.model优先 cfg.ollama.model', () => {
 const fake = makeFakeOllama();
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama', ollama: { model: 'cfg-model' } },
 runtimeOverride: { provider: 'ollama', ollama: { model: 'override-model' } },
 summarizerImpl: fake,
 });
 expect(w.summarizer.model).toBe('override-model');
 });
});

describe('buildDailyDigestRunner — return shape', () => {
 it('返 { runner, summarizer, detectors, storage, start, stop, providerId }', () => {
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama' },
 summarizerImpl: makeFakeOllama(),
 });
 expect(w).toEqual(expect.objectContaining({
 runner: expect.any(Object),
 summarizer: expect.any(Object),
 detectors: expect.any(Array),
 storage: expect.any(Object),
 providerId: 'ollama',
 }));
 expect(typeof w.start).toBe('function');
 expect(typeof w.stop).toBe('function');
 });

 it('start + stop idempotent + 清 interval', () => {
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama' },
 summarizerImpl: makeFakeOllama(),
 });
 w.start(60_000);
 w.start(60_000); //二次 idempotent,不抛
 w.stop();
 w.stop(); //二次 idempotent
 });

 it('storage 是 state-store wrapper,saveDigest / hasDigest / loadDigests 可调', () => {
 const w = buildDailyDigestRunner({
 config: { enabled: true, provider: 'ollama' },
 summarizerImpl: makeFakeOllama(),
 statePath: '/tmp/nonexistent-state.json',
 });
 expect(typeof w.storage.saveDigest).toBe('function');
 expect(typeof w.storage.hasDigest).toBe('function');
 expect(typeof w.storage.loadDigests).toBe('function');
 // 不存在 path → loadDigests返 {} (graceful)
 expect(w.storage.loadDigests()).toEqual({});
 });
});

describe('mergeAISessionsConfig', () => {
 it('override=null/undefined →返 cfg原样', () => {
 const cfg = { enabled: true, provider: 'ollama', ollama: { model: 'qwen3.5:9b' } };
 expect(mergeAISessionsConfig(cfg, null)).toEqual(cfg);
 expect(mergeAISessionsConfig(cfg, undefined)).toEqual(cfg);
 });

 it('override.enabled覆盖 cfg.enabled', () => {
 expect(mergeAISessionsConfig(
 { enabled: false, provider: 'ollama' },
 { enabled: true }
 ).enabled).toBe(true);
 });

 it('override.provider覆盖 cfg.provider', () => {
 expect(mergeAISessionsConfig(
 { enabled: true, provider: 'ollama' },
 { provider: 'openai' }
 ).provider).toBe('openai');
 });

 it('override.ollama跟 cfg.ollama shallow-merge', () => {
 const out = mergeAISessionsConfig(
 { enabled: true, provider: 'ollama', ollama: { host: 'http://h', model: 'm1' } },
 { provider: 'ollama', ollama: { model: 'm2' } }
 );
 expect(out.ollama).toEqual({ host: 'http://h', model: 'm2' });
 });

 it('override.cloud 部分覆盖 (e.g. 加 baseUrl)', () => {
 const out = mergeAISessionsConfig(
 { enabled: true, provider: 'openai', cloud: { providerId: 'openai', model: 'gpt-4o-mini' } },
 { provider: 'openai', cloud: { baseUrl: 'https://proxy.example.com' } }
 );
 expect(out.cloud).toEqual({
 providerId: 'openai',
 model: 'gpt-4o-mini',
 baseUrl: 'https://proxy.example.com',
 });
 });

 it('override 非 boolean enabled保持 cfg 原值', () => {
 const out = mergeAISessionsConfig(
 { enabled: true, provider: 'ollama' },
 { enabled: 'yes' }
 );
 expect(out.enabled).toBe(true);
 });

 it('override 不是 object →返 cfg 原样', () => {
 const cfg = { enabled: true, provider: 'ollama' };
 expect(mergeAISessionsConfig(cfg, 'string')).toEqual(cfg);
 expect(mergeAISessionsConfig(cfg,123)).toEqual(cfg);
 });

 it('cfg缺省 → 用 fallback defaults', () => {
 const out = mergeAISessionsConfig(null, null);
 expect(out).toEqual({
 enabled: false,
 provider: 'ollama',
 ollama: {},
 cloud: null,
 });
 });
});
