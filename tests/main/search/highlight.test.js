/**
 * tests/main/search/highlight.test.js
 * A3: 高亮片段生成 — 从 searchText 定位命中, 前后各取 radius 字符, 包 <mark>
 */
import { describe, it, expect } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../../_setup/require-main.cjs");
const { makeSnippet } = requireMain('search/highlight');
describe('makeSnippet', () => {
  const TEXT = '本次更新主要针对 macOS 上的性能优化，修复了大型文件打开时的卡顿问题。';

  it('wraps matched token with <mark> and adds radius context', () => {
    const out = makeSnippet(TEXT, ['性能'], { radius: 10 });
    expect(out).toContain('<mark>性能</mark>');
    expect(out).toContain('macOS');
    expect(out).toContain('优化');
  });

  it('returns title-truncated when no query token matches', () => {
    const out = makeSnippet(TEXT, ['不存在的词'], { radius: 10 });
    expect(out).not.toContain('<mark>');
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it('does not add leading "..." when match near start', () => {
    const out = makeSnippet(TEXT, ['本次'], { radius: 10 });
    expect(out.startsWith('...')).toBe(false);
  });

  it('adds leading "..." when match is past the radius', () => {
    const out = makeSnippet(TEXT, ['卡顿'], { radius: 5 });
    expect(out.startsWith('...')).toBe(true);
  });

  it('adds trailing "..." when match + radius does not reach end', () => {
    const out = makeSnippet(TEXT, ['本次'], { radius: 5 });
    expect(out.endsWith('...')).toBe(true);
  });

  it('handles multiple query tokens', () => {
    const out = makeSnippet(TEXT, ['性能', '卡顿'], { radius: 6 });
    expect(out).toContain('<mark>');
  });
});
