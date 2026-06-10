/**
 * tests/ai-sessions/summarizer.test.js
 *
 * Phase B1a (AI Sessions Daily Digest): LLMSummarizer 抽象 class + prompts 测试.
 * 跟 plan B1a 对齐 (~15 cases).
 *
 * 覆盖:
 *   - constructor 校验
 *   - healthcheck: 调 impl, 正常 + 异常
 *   - summarize: 调 impl, prompt 正确
 *   - prompts.buildDigestPrompt: system / user 内容 / 截断
 */

import { describe, it, expect, vi } from 'vitest';
import { LLMSummarizer } from '../../src/ai-sessions/summarizer.js';
import { buildDigestPrompt, buildPerSessionPrompt, formatSessionBlock, MAX_SESSION_MESSAGES, MAX_MESSAGE_CONTENT_CHARS } from '../../src/ai-sessions/prompts.js';

function makeImpl(overrides = {}) {
  return {
    healthcheck: vi.fn(async () => ({ ok: true })),
    summarize: vi.fn(async () => '# 总结\n- 测试'),
    ...overrides,
  };
}

describe('LLMSummarizer — constructor', () => {
  it('需要 provider / model / impl', () => {
    expect(() => new LLMSummarizer({ model: 'm', impl: makeImpl() })).toThrow(TypeError);
    expect(() => new LLMSummarizer({ provider: 'p', impl: makeImpl() })).toThrow(TypeError);
    expect(() => new LLMSummarizer({ provider: 'p', model: 'm' })).toThrow(TypeError);
  });

  it('impl 必须含 healthcheck + summarize', () => {
    expect(() => new LLMSummarizer({ provider: 'p', model: 'm', impl: {} })).toThrow(TypeError);
  });

  it('正常构造保存字段', () => {
    const impl = makeImpl();
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    expect(s.provider).toBe('ollama');
    expect(s.model).toBe('qwen3.5:9b');
    expect(s.impl).toBe(impl);
  });
});

describe('LLMSummarizer — healthcheck', () => {
  it('调 impl.healthcheck, 返 { ok: true }', async () => {
    const impl = makeImpl({ healthcheck: async () => ({ ok: true, latencyMs: 5 }) });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    const r = await s.healthcheck();
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBe(5);
  });

  it('impl throw → 返 { ok: false, error }', async () => {
    const impl = makeImpl({ healthcheck: async () => { throw new Error('ECONNREFUSED'); } });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    const r = await s.healthcheck();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  it('impl 返 truthy 非对象 → 包成 { ok: true }', async () => {
    const impl = makeImpl({ healthcheck: async () => 'yes' });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    const r = await s.healthcheck();
    expect(r.ok).toBe(true);
  });
});

describe('LLMSummarizer — summarize', () => {
  it('调 impl.summarize, 返 string', async () => {
    const impl = makeImpl({ summarize: async () => '# 总结\n- A' });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    const out = await s.summarize([], { dateKey: '2026-06-07' });
    expect(out).toBe('# 总结\n- A');
  });

  it('sessions 非数组 → throw', async () => {
    const s = new LLMSummarizer({ provider: 'ollama', model: 'm', impl: makeImpl() });
    await expect(s.summarize(null)).rejects.toThrow(TypeError);
  });

  it('impl.summarize 返非 string → throw', async () => {
    const impl = makeImpl({ summarize: async () => ({ not: 'string' }) });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'm', impl });
    await expect(s.summarize([])).rejects.toThrow(TypeError);
  });

  it('透传 messages 给 impl (system + user 格式)', async () => {
    const impl = makeImpl({ summarize: vi.fn(async () => 'out') });
    const s = new LLMSummarizer({ provider: 'ollama', model: 'qwen3.5:9b', impl });
    await s.summarize(
      [
        {
          id: 's1',
          appName: 'cursor',
          startedAt: 1000,
          endedAt: 2000,
          messages: [{ role: 'user', content: 'hi', ts: 1500 }],
        },
      ],
      { dateKey: '2026-06-07' }
    );
    expect(impl.summarize).toHaveBeenCalledOnce();
    const call = impl.summarize.mock.calls[0][0];
    expect(call.messages).toBeInstanceOf(Array);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[1].role).toBe('user');
    expect(call.messages[1].content).toContain('Session 1');
    expect(call.messages[1].content).toContain('hi');
  });
});

describe('prompts.buildDigestPrompt', () => {
  it('空 sessions: user 标 "(无 session 数据)"', () => {
    const { messages } = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07' });
    expect(messages[1].content).toContain('(无 session 数据)');
    expect(messages[1].content).toContain('Session 总数: 0');
  });

  it('zh-CN (默认) system prompt 含中文', () => {
    const { messages } = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07' });
    expect(messages[0].content).toMatch(/[\u4e00-\u9fa5]/);  // 任一中文字符
  });

  it('en-US / en system prompt 用英文', () => {
    const a = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07', locale: 'en-US' });
    expect(a.messages[0].content).toContain('personal AI assistant');
    const b = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07', locale: 'en' });
    expect(b.messages[0].content).toContain('personal AI assistant');
  });

  it('meta 含 dateKey / sessionCount / model / provider', () => {
    const { meta } = buildDigestPrompt({ sessions: [{ id: 'a', appName: 'c', messages: [] }], dateKey: '2026-06-07', model: 'qwen3.5:9b', provider: 'ollama' });
    expect(meta.dateKey).toBe('2026-06-07');
    expect(meta.sessionCount).toBe(1);
    expect(meta.model).toBe('qwen3.5:9b');
    expect(meta.provider).toBe('ollama');
    expect(meta.locale).toBe('zh-CN');
  });

  it('单条超长 message 截到 MAX_MESSAGE_CONTENT_CHARS', () => {
    const long = 'x'.repeat(MAX_MESSAGE_CONTENT_CHARS + 1000);
    const { messages } = buildDigestPrompt({
      sessions: [{ id: 's1', appName: 'c', messages: [{ role: 'user', content: long, ts: 1 }] }],
      dateKey: '2026-06-07',
    });
    expect(messages[1].content).toContain('x'.repeat(MAX_MESSAGE_CONTENT_CHARS));
    expect(messages[1].content).not.toContain('x'.repeat(MAX_MESSAGE_CONTENT_CHARS + 1));
  });

  it('超 MAX_SESSION_MESSAGES 截断 + 标 "(truncated ...)"', () => {
    const msgs = Array.from({ length: MAX_SESSION_MESSAGES + 50 }, (_, i) => ({ role: 'user', content: `m${i}`, ts: i }));
    const { messages } = buildDigestPrompt({
      sessions: [{ id: 's1', appName: 'c', messages: msgs }],
      dateKey: '2026-06-07',
    });
    expect(messages[1].content).toContain(`truncated to ${MAX_SESSION_MESSAGES}`);
  });

  // ── Phase B5b (per-session digest): system prompt 必须强制逐 session 输出 ──
  it('zh-CN system prompt 含 "### Session" + "2-3 句" + 禁合并主题', () => {
    const { messages } = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07' });
    const sys = messages[0].content;
    expect(sys).toContain('### Session');
    expect(sys).toContain('用户诉求');
    expect(sys).toContain('处理结果');
    expect(sys).toContain('保持每个 session 独立');
    expect(sys).toContain('简体中文');
  });

  it('en-US system prompt 含 "### Session" + "2-3 sentence" + keep-order 指令', () => {
    const { messages } = buildDigestPrompt({ sessions: [], dateKey: '2026-06-07', locale: 'en-US' });
    const sys = messages[0].content;
    expect(sys).toContain('### Session');
    expect(sys).toMatch(/2-3\s*sentence/i);
    expect(sys).toContain('input order');
  });

  it('user prompt 含 N 个 session 的 id, 顺序保留', () => {
    const sessions = [
      { id: 's-alpha', messages: [{ role: 'user', content: 'first', ts: 1 }] },
      { id: 's-beta',  messages: [{ role: 'user', content: 'second', ts: 2 }] },
      { id: 's-gamma', messages: [{ role: 'user', content: 'third', ts: 3 }] },
    ];
    const { messages } = buildDigestPrompt({ sessions, dateKey: '2026-06-07' });
    const user = messages[1].content;
    expect(user).toContain('Session 总数: 3');
    // 按出现顺序: alpha 在 beta 之前, beta 在 gamma 之前
    const a = user.indexOf('s-alpha');
    const b = user.indexOf('s-beta');
    const g = user.indexOf('s-gamma');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(g).toBeGreaterThan(b);
  });
});

describe('prompts.buildPerSessionPrompt — Phase B5b (single-session)', () => {
  it('zh-CN system 强制输出 "### Session <N>:" + 固定两行字段, 禁写客套话', () => {
    const { messages } = buildPerSessionPrompt({
      session: { id: 's1', messages: [{ role: 'user', content: 'hi', ts: 1 }] },
      index: 0,
      locale: 'zh-CN',
    });
    const sys = messages[0].content;
    expect(sys).toContain('### Session');
    expect(sys).toContain('用户诉求');
    expect(sys).toContain('处理结果');
    expect(sys).toContain('简体中文');
    expect(sys).toMatch(/不要客套话/);
  });

  it('en-US system 强制 "### Session <N>:" + 2-3 sentence', () => {
    const { messages } = buildPerSessionPrompt({
      session: { id: 's1', messages: [] },
      index: 0,
      locale: 'en-US',
    });
    const sys = messages[0].content;
    expect(sys).toContain('### Session');
    expect(sys).toMatch(/2-3\s*sentence/i);
  });

  it('user 只含 1 个 session 的 messages (不含 "Session 总数")', () => {
    const { messages } = buildPerSessionPrompt({
      session: {
        id: 's-only',
        startedAt: Date.UTC(2026, 5, 7, 12, 0, 0),  // 2026-06-07, 让 user prompt 含真日期
        messages: [{ role: 'user', content: 'hello', ts: 1 }],
      },
      index: 0,
      locale: 'zh-CN',
    });
    const user = messages[1].content;
    // 不能含 batch prompt 的 "Session 总数" 字段
    expect(user).not.toContain('Session 总数');
    // 应含 session id (formatSessionBlock 输出)
    expect(user).toContain('s-only');
    // 含 started 时间 (从 startedAt 推日期, ISO 取前 10)
    expect(user).toMatch(/日期:\s*2026-06-07/);
  });

  it('meta 含 locale / sessionId / index', () => {
    const { meta } = buildPerSessionPrompt({
      session: { id: 's-meta', messages: [] },
      index: 7,
      locale: 'zh-CN',
    });
    expect(meta.locale).toBe('zh-CN');
    expect(meta.sessionId).toBe('s-meta');
    expect(meta.index).toBe(7);
  });
});

describe('prompts.formatSessionBlock', () => {
  it('null session → ""', () => {
    expect(formatSessionBlock(null, 0)).toBe('');
  });

  it('session 无 messages → 仍输出 header', () => {
    const out = formatSessionBlock({ id: 's1' }, 0);
    expect(out).toContain('Session 1: s1');
  });
});
