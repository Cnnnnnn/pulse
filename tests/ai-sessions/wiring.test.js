/**
 * tests/ai-sessions/wiring.test.js
 *
 * 重做版 buildTaskSummaryEngine 测试.
 *
 * 覆盖:
 *   - 默认 cfg → fallback minimax
 *   - cfg.provider=deepseek/minimax 走 CloudSummarizer
 *   - apiKey 拿不到 → stub summarizer
 *   - model 缺失 → stub summarizer
 *   - runtimeOverride 优先于 cfg
 *   - 返 { engine, summarizer, detectors, storage, providerId, enabled }
 *   - mergeAISessionsConfig 各种形态
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildTaskSummaryEngine,
  mergeAISessionsConfig,
  SUPPORTED_PROVIDERS,
} from '../../src/ai-sessions/wiring.js';

function makeFakeCloud() {
  return { healthcheck: vi.fn(), summarize: vi.fn() };
}

describe('SUPPORTED_PROVIDERS — only cloud', () => {
  it('只含 deepseek + minimax', () => {
    expect(SUPPORTED_PROVIDERS).toEqual(['deepseek', 'minimax']);
  });

  it('ollama / openai / anthropic 不再支持', () => {
    expect(SUPPORTED_PROVIDERS).not.toContain('ollama');
    expect(SUPPORTED_PROVIDERS).not.toContain('openai');
    expect(SUPPORTED_PROVIDERS).not.toContain('anthropic');
  });
});

describe('buildTaskSummaryEngine — cloud 路由', () => {
  for (const providerId of ['deepseek', 'minimax']) {
    it(`${providerId} + 有 apiKey + 有 model → CloudSummarizer + apiKey 注入`, () => {
      const fake = makeFakeCloud();
      const w = buildTaskSummaryEngine({
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

  it('deepseek + 没 apiKey → stub summarizer (healthcheck ok:false)', async () => {
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'deepseek', cloud: { providerId: 'deepseek', model: 'deepseek-chat' } },
      resolveApiKey: vi.fn(() => null),
    });
    expect(w.providerId).toBe('deepseek');
    const h = await w.summarizer.impl.healthcheck({});
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/api key not found/);
    await expect(w.summarizer.impl.summarize({})).rejects.toThrow(/no api key/);
  });

  it('minimax + 没 model → stub summarizer', async () => {
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'minimax', cloud: { providerId: 'minimax' } },
      resolveApiKey: vi.fn(() => 'sk-minimax'),
    });
    expect(w.providerId).toBe('minimax');
    const h = await w.summarizer.impl.healthcheck({});
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/model not configured/);
  });

  it('cfg.provider 不支持 (e.g. "ollama" 老 state 残留, "openai", "gemini") → fallback minimax', () => {
    for (const p of ['ollama', 'openai', 'gemini', undefined]) {
      const fake = makeFakeCloud();
      const w = buildTaskSummaryEngine({
        config: { enabled: true, provider: p },
        summarizerImpl: fake,
      });
      expect(w.providerId).toBe('minimax');
      expect(w.summarizer.provider).toBe('minimax');
    }
  });
});

describe('buildTaskSummaryEngine — runtimeOverride (Settings)', () => {
  it('runtimeOverride.enabled=true + provider=minimax → 走 minimax 路由', () => {
    const fake = makeFakeCloud();
    const w = buildTaskSummaryEngine({
      config: { enabled: false, provider: 'deepseek' },
      runtimeOverride: { enabled: true, provider: 'minimax', cloud: { providerId: 'minimax', model: 'm-1' } },
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => 'sk-m'),
    });
    expect(w.providerId).toBe('minimax');
    expect(w.summarizer.provider).toBe('minimax');
    expect(w.summarizer.config.apiKey).toBe('sk-m');
  });

  it('runtimeOverride.cloud.model 优先 cfg.cloud.model', () => {
    const fake = makeFakeCloud();
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'deepseek', cloud: { providerId: 'deepseek', model: 'cfg-model' } },
      runtimeOverride: { provider: 'deepseek', cloud: { model: 'override-model' } },
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => 'sk-d'),
    });
    expect(w.summarizer.model).toBe('override-model');
  });

  it('runtimeOverride=null + cfg 也没 → fallback minimax + stub', () => {
    const fake = makeFakeCloud();
    const w = buildTaskSummaryEngine({
      config: null,
      runtimeOverride: null,
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => null),
    });
    expect(w.providerId).toBe('minimax');
    expect(w.summarizer.provider).toBe('minimax');
    expect(w.summarizer.model).toBe('stub');
  });
});

describe('buildTaskSummaryEngine — return shape', () => {
  it('返 { engine, summarizer, detectors, storage, providerId, enabled }', () => {
    const fake = makeFakeCloud();
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'deepseek', cloud: { providerId: 'deepseek', model: 'm' } },
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => 'sk'),
    });
    expect(typeof w.engine.listTasks).toBe('function');
    expect(typeof w.engine.summarizeTasks).toBe('function');
    expect(w).toEqual(expect.objectContaining({
      summarizer: expect.any(Object),
      detectors: expect.any(Array),
      storage: expect.any(Object),
      providerId: 'deepseek',
      enabled: true,
    }));
    // 默认 detectors: cursor + codex + minimax-code
    expect(w.detectors.map((d) => d.appName)).toEqual(['cursor', 'codex', 'minimax-code']);
  });

  it('extraDetectors 注入替代默认 codex/minimax', () => {
    const fake = makeFakeCloud();
    const stubImpl = { isInstalled: () => false, listSessions: async () => [], readSession: async () => ({}) };
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'minimax', cloud: { providerId: 'minimax', model: 'm' } },
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => 'sk'),
      extraDetectors: [{ appName: 'fake-app', impl: stubImpl }],
    });
    expect(w.detectors.map((d) => d.appName)).toEqual(['cursor', 'fake-app']);
  });

  it('storage 是 state-store wrapper: loadTaskSummaries / saveTaskSummary 可调', () => {
    const fake = makeFakeCloud();
    const w = buildTaskSummaryEngine({
      config: { enabled: true, provider: 'minimax', cloud: { providerId: 'minimax', model: 'm' } },
      summarizerImpl: fake,
      resolveApiKey: vi.fn(() => 'sk'),
      statePath: '/tmp/nonexistent-state.json',
    });
    expect(typeof w.storage.loadTaskSummaries).toBe('function');
    expect(typeof w.storage.saveTaskSummary).toBe('function');
    // 不存在 path → loadTaskSummaries 返 {} (graceful)
    expect(w.storage.loadTaskSummaries()).toEqual({});
  });
});

describe('mergeAISessionsConfig', () => {
  it('override=null/undefined → 返 cfg 原样', () => {
    const cfg = { enabled: true, provider: 'deepseek', cloud: { model: 'm' } };
    expect(mergeAISessionsConfig(cfg, null)).toEqual(cfg);
    expect(mergeAISessionsConfig(cfg, undefined)).toEqual(cfg);
  });

  it('override.enabled 覆盖 cfg.enabled', () => {
    expect(mergeAISessionsConfig(
      { enabled: false, provider: 'deepseek' },
      { enabled: true },
    ).enabled).toBe(true);
  });

  it('override.provider 覆盖 cfg.provider', () => {
    expect(mergeAISessionsConfig(
      { enabled: true, provider: 'deepseek' },
      { provider: 'minimax' },
    ).provider).toBe('minimax');
  });

  it('override.cloud 部分覆盖 (e.g. 加 baseUrl)', () => {
    const out = mergeAISessionsConfig(
      { enabled: true, provider: 'deepseek', cloud: { providerId: 'deepseek', model: 'deepseek-chat' } },
      { provider: 'deepseek', cloud: { baseUrl: 'https://proxy.example.com' } },
    );
    expect(out.cloud).toEqual({
      providerId: 'deepseek',
      model: 'deepseek-chat',
      baseUrl: 'https://proxy.example.com',
    });
  });

  it('override 非 boolean enabled 保持 cfg 原值', () => {
    const out = mergeAISessionsConfig(
      { enabled: true, provider: 'deepseek' },
      { enabled: 'yes' },
    );
    expect(out.enabled).toBe(true);
  });

  it('override 不是 object → 返 cfg 原样', () => {
    const cfg = { enabled: true, provider: 'deepseek' };
    expect(mergeAISessionsConfig(cfg, 'string')).toEqual(cfg);
    expect(mergeAISessionsConfig(cfg, 123)).toEqual(cfg);
  });

  it('cfg 缺省 → 用 fallback defaults (provider=minimax)', () => {
    const out = mergeAISessionsConfig(null, null);
    expect(out).toEqual({
      enabled: false,
      provider: 'minimax',
      cloud: null,
    });
  });
});
