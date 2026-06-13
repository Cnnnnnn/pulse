/**
 * tests/integration/detect-worker-helpers.test.js
 *
 * Phase 11: extractBrewCask
 * Phase 15: extractErrorMessage
 *
 * Worker 内部函数, 不导出, 通过 source-string eval 测.
 * 重构后 extractBrewCask / extractErrorMessage 搬到 result-builder.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, '../../src/workers/result-builder.js'),
  'utf-8'
);

function extractFn(name) {
  const re = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = SRC.match(re);
  if (!m) throw new Error(`${name} not found in source`);
  // 取从 function 开始到下一个匹配的 '}' (粗略)
  const startIdx = m.index;
  let depth = 0;
  let i = startIdx;
  while (i < SRC.length) {
    const c = SRC[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const fnSrc = SRC.slice(startIdx, i + 1);
        return new Function(`${fnSrc}; return ${name};`)();
      }
    }
    i++;
  }
  throw new Error(`could not find end of ${name}`);
}

describe('extractBrewCask (Phase 11)', () => {
  const fn = extractFn('extractBrewCask');

  it('新 schema: cask 在 detectors[].cask 里', () => {
    expect(fn({ detectors: [{ type: 'brew_formulae', cask: 'cursor' }] })).toBe('cursor');
  });

  it('跳过空 cask 找下一个非空', () => {
    expect(fn({ detectors: [{ type: 'brew_formulae', cask: '' }, { type: 'brew_formulae', cask: 'kimi' }] })).toBe('kimi');
  });

  it('没 detectors → 返回空', () => {
    expect(fn({ name: 'foo' })).toBe('');
    expect(fn(null)).toBe('');
  });
});

describe('extractErrorMessage (Phase 15)', () => {
  const fn = extractFn('extractErrorMessage');

  it('versionUnknown → 已安装版本无法读取 (优先, 不看 trace)', () => {
    expect(fn([], null, true)).toBe('已安装版本无法读取');
  });

  it('空 trace + versionUnknown=false → null', () => {
    expect(fn([], null, false)).toBeNull();
    expect(fn(undefined, '1.0', false)).toBeNull();
  });

  it('trace 全成功 → null (没 error 字段)', () => {
    const trace = [
      { det: 'brew_formulae', version: '1.0' },
      { det: 'app_store_lookup', version: '1.0' },
    ];
    expect(fn(trace, '1.0', false)).toBeNull();
  });

  it('trace 有 error → 返回最后一条', () => {
    const trace = [
      { det: 'brew_formulae', error: 'timeout — https://x' },
      { det: 'app_store_lookup', error: 'HTTP 404' },
    ];
    expect(fn(trace, null, false)).toBe('HTTP 404');
  });

  it('trace 部分失败 + 成功 → 返回离末尾最近的 error (倒序找)', () => {
    const trace = [
      { det: 'brew_formulae', error: 'timeout — https://x' },
      { det: 'app_store_lookup', version: '1.0' },
    ];
    // 末尾没 error, 继续往前找, 找到第一条 (timeout)
    expect(fn(trace, '1.0', false)).toBe('timeout — https://x');
  });

  it('trace 最后一条是 error + 之前有成功的 → 仍返回 error', () => {
    const trace = [
      { det: 'brew_formulae', version: '1.0' },
      { det: 'app_store_lookup', error: 'JSON parse error' },
    ];
    expect(fn(trace, null, false)).toBe('JSON parse error');
  });

  it('error 字符串直接透传, 不修改', () => {
    const trace = [{ det: 'X', error: 'HTTP 500 — server is on fire' }];
    expect(fn(trace, null, false)).toBe('HTTP 500 — server is on fire');
  });
});
