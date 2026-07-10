/**
 * tests/renderer/search/search-nav.test.js
 * A3: 跳转逻辑 — 切面板 + 滚动高亮
 */
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock setActiveNav (navStore)
import { setActiveNav } from '../../../src/renderer/worldcup/navStore.js';

vi.mock('../../../src/renderer/worldcup/navStore.js', () => ({
  setActiveNav: vi.fn(),
}));

import { navigateToResult } from '../../../src/renderer/search/search-nav.js';

describe('navigateToResult', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('news result: sets nav to news (P-N 合并 ithome + wechat-hot)', () => {
    navigateToResult({ source: 'news', nativeId: 'u1', payload: {} });
    expect(setActiveNav).toHaveBeenCalledWith('news');
  });

  it('reminder result: sets nav to reminders', () => {
    navigateToResult({ source: 'reminder', nativeId: 'r1', payload: {} });
    expect(setActiveNav).toHaveBeenCalledWith('reminders');
  });

  it('app result: sets nav to versions', () => {
    navigateToResult({ source: 'app', nativeId: 'Cursor', payload: {} });
    expect(setActiveNav).toHaveBeenCalledWith('versions');
  });

  it('fund result: sets nav to funds', () => {
    navigateToResult({ source: 'fund', nativeId: 'f1', payload: { code: '001234' } });
    expect(setActiveNav).toHaveBeenCalledWith('funds');
  });

  it('highlights matching element when present', () => {
    const el = document.createElement('article');
    el.setAttribute('data-article-id', 'u1');
    document.body.appendChild(el);
    navigateToResult({ source: 'news', nativeId: 'u1', payload: {} });
    expect(el.classList.contains('search-highlight')).toBe(true);
  });
});
