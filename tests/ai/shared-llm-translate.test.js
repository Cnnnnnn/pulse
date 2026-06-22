import { describe, test, expect } from 'vitest';
import { translate } from '../../src/ai/shared-llm.js';

/**
 * shared-llm.translate() 是 Twitter Serenity translator.js (Task 7) 依赖的入口.
 *
 * 测试策略: shared-llm.js 是 CommonJS, chatCompletion 同文件无法单独 mock.
 * 现有 tests/ai/shared-llm.test.js 也只测 guard-clause 路径 (无 API key).
 * 这里对齐同样模式: 只测 translate 的早期返回 guard, 不测真实 LLM 调用
 * (后者需要 API key, 跟现有 chatCompletion 测试处境一致).
 */
describe('shared-llm.translate()', () => {
  test('translate 空 text 返回空串不调 LLM', async () => {
    const result = await translate('', { prompt: 'p' });
    expect(result).toBe('');
  });

  test('translate 非 string text 容错返回空串', async () => {
    expect(await translate(null, { prompt: 'p' })).toBe('');
    expect(await translate(undefined, { prompt: 'p' })).toBe('');
    expect(await translate(123, { prompt: 'p' })).toBe('');
  });

  test('translate 缺 prompt opts 也容错 (返回空串或走 LLM 失败兜底)', async () => {
    // 无 opts → prompt='' → chatCompletion 仍会被调 (无 API key 返回 {ok:false}) → translate 兜底 ''
    const result = await translate('hello', {});
    expect(typeof result).toBe('string');
  });

  test('translate 是 async function (返回 Promise)', () => {
    const p = translate('x', { prompt: 'p' });
    expect(p).toBeInstanceOf(Promise);
    p.catch(() => {}); // 防 unhandled rejection
  });
});
