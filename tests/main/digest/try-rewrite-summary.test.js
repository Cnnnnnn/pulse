/**
 * tests/main/digest/try-rewrite-summary.test.js
 *
 * A7 v3: tryRewriteSummary 纯函数单测.
 * 验证 messages 拼接 + chatCompletion 行为 + 失败回退.
 */

import { describe, it, expect, vi } from 'vitest';
import { tryRewriteSummary } from '../../../src/main/digest/daily-summary-job.js';

function makeDeps({ llmResult, prompt }) {
  const sharedLlm = {
    chatCompletion: vi.fn(async () => llmResult),
  };
  return {
    sharedLlm,
    resolvePrompt: vi.fn(() => prompt),
  };
}

const DEFAULT_PROMPT = {
  system: 'system prompt',
  rules: 'rules prompt',
  fewShot: '',
};

describe('tryRewriteSummary — A7 v3', () => {
  it('空 lines → 直接返回 (不调 LLM)', async () => {
    const deps = makeDeps({ llmResult: { ok: true, text: 'x' }, prompt: DEFAULT_PROMPT });
    const r = await tryRewriteSummary([], '2026-06-20', deps);
    expect(r).toEqual([]);
    expect(deps.sharedLlm.chatCompletion).not.toHaveBeenCalled();
  });

  it('chatCompletion ok + text 非空 → split lines 返回', async () => {
    const deps = makeDeps({
      llmResult: { ok: true, text: '第 1 行\n  第 2 行  \n\n第 3 行' },
      prompt: DEFAULT_PROMPT,
    });
    const r = await tryRewriteSummary(['• A 1 → 2', '• B 3 → 4'], '2026-06-20', deps);
    expect(r).toEqual(['第 1 行', '第 2 行', '第 3 行']);
  });

  it('chatCompletion ok 但 text 全空白 → 回退原 lines', async () => {
    const deps = makeDeps({
      llmResult: { ok: true, text: '   \n  \n' },
      prompt: DEFAULT_PROMPT,
    });
    const origLines = ['• A 1 → 2'];
    const r = await tryRewriteSummary(origLines, '2026-06-20', deps);
    expect(r).toBe(origLines);
  });

  it('chatCompletion ok=false → 回退原 lines', async () => {
    const deps = makeDeps({
      llmResult: { ok: false, reason: 'api_key_missing' },
      prompt: DEFAULT_PROMPT,
    });
    const origLines = ['• A 1 → 2'];
    const r = await tryRewriteSummary(origLines, '2026-06-20', deps);
    expect(r).toBe(origLines);
  });

  it('chatCompletion 抛错 → 回退原 lines', async () => {
    const deps = {
      sharedLlm: {
        chatCompletion: vi.fn(async () => {
          throw new Error('network down');
        }),
      },
      resolvePrompt: () => DEFAULT_PROMPT,
    };
    const origLines = ['• A 1 → 2'];
    const r = await tryRewriteSummary(origLines, '2026-06-20', deps);
    expect(r).toBe(origLines);
  });

  it('messages 拼接: system + user(规则+日期+要点)', async () => {
    const deps = makeDeps({
      llmResult: { ok: true, text: '改写' },
      prompt: { system: '我是早报编辑', rules: '1. 简洁\n2. 保留数字', fewShot: '' },
    });
    await tryRewriteSummary(['• Cursor 1 → 2'], '2026-06-24', deps);
    const call = deps.sharedLlm.chatCompletion.mock.calls[0];
    const messages = call[0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('我是早报编辑');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('1. 简洁');
    expect(messages[1].content).toContain('2. 保留数字');
    expect(messages[1].content).toContain('日期: 2026-06-24');
    expect(messages[1].content).toContain('要点:');
    expect(messages[1].content).toContain('  • Cursor 1 → 2');
  });

  it('resolvePrompt 抛错 → 回退原 lines', async () => {
    const deps = {
      sharedLlm: { chatCompletion: vi.fn() },
      resolvePrompt: () => { throw new Error('bad key'); },
    };
    const origLines = ['• A'];
    const r = await tryRewriteSummary(origLines, '2026-06-20', deps);
    expect(r).toBe(origLines);
    expect(deps.sharedLlm.chatCompletion).not.toHaveBeenCalled();
  });

  it('prompt.system 非 string → 回退原 lines (不调 LLM)', async () => {
    const deps = {
      sharedLlm: { chatCompletion: vi.fn() },
      resolvePrompt: () => ({ system: null, rules: 'r' }),
    };
    const origLines = ['• A'];
    const r = await tryRewriteSummary(origLines, '2026-06-20', deps);
    expect(r).toBe(origLines);
    expect(deps.sharedLlm.chatCompletion).not.toHaveBeenCalled();
  });

  it('共享模块默认 resolvePrompt 能解析 daily_digest_summary', async () => {
    // 集成测试: 走真实 prompt-registry 默认值
    const { resolvePrompt } = await import('../../../src/ai/prompt-registry.js');
    const prompt = resolvePrompt('daily_digest_summary');
    expect(typeof prompt.system).toBe('string');
    expect(prompt.system.length).toBeGreaterThan(0);
    expect(typeof prompt.rules).toBe('string');
  });
});