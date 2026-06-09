/**
 * tests/config/category-llm.test.js
 *
 * Step B (LLM classify): 三层 fallback 测试.
 *
 * 覆盖:
 *   - classifyByHeuristic: 已知 app 名 / bundle / URL 命中关键词 → 返 cat
 *   - classifyByHeuristic: 未知 → null
 *   - classifyByHeuristic: 空 app / 非对象 → null
 *   - getCategory 三层查找顺序: 静态 → LLM cache → other
 *   - LLM cache: 注入、读、case-insensitive
 *   - classifyByLLM: 正常 mock caller → 解析 JSON, 返 {app: cat}
 *   - classifyByLLM: caller 抛 / 超时 → 返 {}
 *   - classifyByLLM: LLM 返 ```json ... ``` → 也能解
 *   - classifyByLLM: LLM 返非法 catId → 被过滤
 *   - classifyByLLM: 没人注入 llmCaller → 返 {} (graceful skip)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as real from '../../src/config/category.js';

const GOOD_CATS = [
  { id: 'ai', name: 'AI 工具', icon: '🤖', order: 1 },
  { id: 'dev', name: '开发者', icon: '🛠', order: 2 },
  { id: 'browser', name: '浏览器', icon: '🌐', order: 3 },
  { id: 'comms', name: '沟通', icon: '💬', order: 4 },
  { id: 'media', name: '媒体', icon: '🎨', order: 5 },
  { id: 'notes', name: '笔记', icon: '📝', order: 6 },
  { id: 'system', name: '系统', icon: '🔧', order: 7 },
  { id: 'other', name: '其他', icon: '📦', order: 99 },
];

beforeEach(() => {
  real.setData({ cats: GOOD_CATS, map: {}, source: 'test' });
  // 重置 LLM cache — 用 _clearLLMCache (setLLMCache 是累加, 不接 reset)
  real._clearLLMCache();
});

describe('category.js — classifyByHeuristic (Step B)', () => {
  it('命中: Cursor → ai', () => {
    expect(real.classifyByHeuristic({ name: 'Cursor', bundle: 'Cursor.app' })).toBe('ai');
  });

  it('命中: VS Code / Docker / Postman → dev', () => {
    expect(real.classifyByHeuristic({ name: 'VS Code' })).toBe('dev');
    expect(real.classifyByHeuristic({ name: 'Docker Desktop' })).toBe('dev');
    expect(real.classifyByHeuristic({ name: 'Postman' })).toBe('dev');
  });

  it('命中: Chrome / Firefox / Arc → browser', () => {
    expect(real.classifyByHeuristic({ name: 'Chrome' })).toBe('browser');
    expect(real.classifyByHeuristic({ name: 'Firefox' })).toBe('browser');
    expect(real.classifyByHeuristic({ name: 'Arc' })).toBe('browser');
  });

  it('命中: Slack / Discord / 微信 → comms', () => {
    expect(real.classifyByHeuristic({ name: 'Slack' })).toBe('comms');
    expect(real.classifyByHeuristic({ name: 'Discord' })).toBe('comms');
    expect(real.classifyByHeuristic({ name: '微信' })).toBe('comms');
  });

  it('命中: Figma / Spotify → media', () => {
    expect(real.classifyByHeuristic({ name: 'Figma' })).toBe('media');
    expect(real.classifyByHeuristic({ name: 'Spotify' })).toBe('media');
  });

  it('命中: Obsidian / Notion → notes', () => {
    expect(real.classifyByHeuristic({ name: 'Obsidian' })).toBe('notes');
    expect(real.classifyByHeuristic({ name: 'Notion' })).toBe('notes');
  });

  it('命中: Raycast / 1Password → system', () => {
    expect(real.classifyByHeuristic({ name: 'Raycast' })).toBe('system');
    expect(real.classifyByHeuristic({ name: '1Password' })).toBe('system');
  });

  it('命中: bundle 名字含关键词也算', () => {
    expect(real.classifyByHeuristic({ name: 'Unknown', bundle: 'Cursor.app' })).toBe('ai');
  });

  it('命中: download_url 域名也参与匹配', () => {
    expect(real.classifyByHeuristic({ name: 'X', download_url: 'https://www.cursor.com/downloads' })).toBe('ai');
  });

  it('不命中: 真的未知 → null', () => {
    expect(real.classifyByHeuristic({ name: 'RandomNoMatchXYZ' })).toBeNull();
  });

  it('不命中: 空 / 非对象 → null', () => {
    expect(real.classifyByHeuristic(null)).toBeNull();
    expect(real.classifyByHeuristic(undefined)).toBeNull();
    expect(real.classifyByHeuristic({})).toBeNull();
    expect(real.classifyByHeuristic({ name: '' })).toBeNull();
  });
});

describe('category.js — LLM cache + 三层 fallback (Step B)', () => {
  it('getCategory 三层: 静态 map 优先', () => {
    real.setData({
      cats: GOOD_CATS,
      map: { 'cursor': 'ai' },
      source: 'test',
    });
    real.setLLMCache({ 'Cursor': 'dev' });  // 即使 LLM 给了 dev, 静态优先
    expect(real.getCategory('Cursor')).toBe('ai');
  });

  it('getCategory 第二层: 静态没命中 → LLM cache', () => {
    real.setData({ cats: GOOD_CATS, map: {}, source: 'test' });
    real.setLLMCache({ 'Kimi': 'ai' });
    expect(real.getCategory('Kimi')).toBe('ai');
    expect(real.getCategory('KIMI')).toBe('ai');  // 大小写不敏感
  });

  it('getCategory 第三层: 都没有 → other', () => {
    real.setData({ cats: GOOD_CATS, map: {}, source: 'test' });
    real.setLLMCache({ 'Kimi': 'ai' });
    expect(real.getCategory('NeverSeenAppXYZ')).toBe('other');
  });

  it('setLLMCache 过滤非法 catId', () => {
    real.setLLMCache({ 'X': 'not-a-real-id', 'Kimi': 'ai' });
    expect(real.getLLMCache()).toEqual({ 'kimi': 'ai' });
  });

  it('setLLMCache 接受非空合法 appName (空字符串忽略)', () => {
    real.setLLMCache({ '': 'ai', 'Kimi': 'ai' });
    expect(real.getLLMCache()).toEqual({ 'kimi': 'ai' });
  });

  it('setLLMCache 接受 null/非对象 graceful skip', () => {
    expect(() => real.setLLMCache(null)).not.toThrow();
    expect(() => real.setLLMCache(undefined)).not.toThrow();
    expect(() => real.setLLMCache(123)).not.toThrow();
  });

  it('getLLMCache 返 {appName: catId} 全部', () => {
    real.setLLMCache({ 'Kimi': 'ai', 'Kodi': 'media' });
    expect(real.getLLMCache()).toEqual({ 'kimi': 'ai', 'kodi': 'media' });
  });
});

describe('category.js — classifyByLLM (Step B)', () => {
  it('没人注入 llmCaller → 返 {} (graceful skip)', async () => {
    const out = await real.classifyByLLM([{ name: 'X' }], {});
    expect(out).toEqual({});
  });

  it('caller 返正常 JSON 字符串 → 解析后返 {app: cat}', async () => {
    const caller = vi.fn(async () => '{"Cursor": "ai", "Kimi": "ai", "Chrome": "browser"}');
    const out = await real.classifyByLLM(
      [{ name: 'Cursor' }, { name: 'Kimi' }, { name: 'Chrome' }],
      { llmCaller: caller }
    );
    expect(out).toEqual({ Cursor: 'ai', Kimi: 'ai', Chrome: 'browser' });
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it('caller 返 ```json ... ``` → 也能解', async () => {
    const caller = vi.fn(async () => '```json\n{"Cursor": "ai"}\n```');
    const out = await real.classifyByLLM([{ name: 'Cursor' }], { llmCaller: caller });
    expect(out).toEqual({ Cursor: 'ai' });
  });

  it('caller 返非 JSON → 返 {}', async () => {
    const caller = vi.fn(async () => 'I think it should be AI');
    const out = await real.classifyByLLM([{ name: 'Cursor' }], { llmCaller: caller });
    expect(out).toEqual({});
  });

  it('caller 抛 → 返 {} (不 throw)', async () => {
    const caller = vi.fn(async () => { throw new Error('network'); });
    const out = await real.classifyByLLM([{ name: 'Cursor' }], { llmCaller: caller });
    expect(out).toEqual({});
  });

  it('caller 超时 → 返 {} (不 throw)', async () => {
    const caller = vi.fn(async () => {
      // 永远 pending — timeoutMs=50
      await new Promise(() => {});
    });
    const out = await real.classifyByLLM([{ name: 'Cursor' }], { llmCaller: caller, timeoutMs: 50 });
    expect(out).toEqual({});
  }, 5_000);

  it('LLM 返非法 catId → 被过滤', async () => {
    const caller = vi.fn(async () => '{"Cursor": "ai", "FakeApp": "wrong_id"}');
    const out = await real.classifyByLLM([{ name: 'Cursor' }, { name: 'FakeApp' }], { llmCaller: caller });
    expect(out).toEqual({ Cursor: 'ai' });
  });

  it('LLM 返空对象 → 返 {}', async () => {
    const caller = vi.fn(async () => '{}');
    const out = await real.classifyByLLM([{ name: 'Cursor' }], { llmCaller: caller });
    expect(out).toEqual({});
  });

  it('空 apps 数组 → 返 {}, 不调 caller', async () => {
    const caller = vi.fn(async () => '{"x":1}');
    const out = await real.classifyByLLM([], { llmCaller: caller });
    expect(out).toEqual({});
    expect(caller).not.toHaveBeenCalled();
  });

  it('prompt 里包含 _heuristic 提示', async () => {
    const caller = vi.fn(async () => '{"Cursor": "ai"}');
    await real.classifyByLLM(
      [{ name: 'Cursor', _heuristic: 'ai' }],
      { llmCaller: caller }
    );
    const userMsg = caller.mock.calls[0][1];
    expect(userMsg).toContain('Cursor');
    expect(userMsg).toContain('ai');  // heuristic 提示
  });
});
