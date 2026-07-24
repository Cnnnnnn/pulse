/**
 * tests/detectors/url-template.test.js
 */
import { describe, it, expect } from 'vitest';
import { expandUrl } from '../../src/detectors/url-template.js';

describe('expandUrl', () => {
  it('展开 {arch}', () => {
    expect(expandUrl('https://x/v2/update?platform=workbuddy-darwin-{arch}', 'arm64'))
      .toBe('https://x/v2/update?platform=workbuddy-darwin-arm64');
    expect(expandUrl('https://x/v2/update?platform=workbuddy-darwin-{arch}', 'x64'))
      .toBe('https://x/v2/update?platform=workbuddy-darwin-x64');
  });

  it('展开 {arch_short} (跟 {arch} 等价)', () => {
    expect(expandUrl('https://api2.cursor.sh/updates/download/golden/darwin-{arch_short}/cursor/3.6', 'arm64'))
      .toBe('https://api2.cursor.sh/updates/download/golden/darwin-arm64/cursor/3.6');
  });

  it('多个占位符同一 URL 全部展开', () => {
    expect(expandUrl('https://x/{arch}/path/{arch_short}', 'arm64'))
      .toBe('https://x/arm64/path/arm64');
  });

  it('没有占位符的 URL 原样返回', () => {
    expect(expandUrl('https://example.com/abc', 'arm64')).toBe('https://example.com/abc');
  });

  it('空 / 异常输入安全处理', () => {
    expect(expandUrl('', 'arm64')).toBe('');
    expect(expandUrl(null, 'arm64')).toBe(null);
    expect(expandUrl(undefined, 'arm64')).toBe(undefined);
    expect(expandUrl('https://x', null)).toBe('https://x');
  });

  it('WorkBuddy / Cursor 真实 URL 展开', () => {
    // 来自 config.json 的原始 URL
    const workbuddy = 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}';
    expect(expandUrl(workbuddy, 'arm64'))
      .toBe('https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-arm64');

    const cursor = 'https://api2.cursor.sh/updates/download/golden/darwin-{arch_short}/cursor/3.6';
    expect(expandUrl(cursor, 'arm64'))
      .toBe('https://api2.cursor.sh/updates/download/golden/darwin-arm64/cursor/3.6');
  });
});
