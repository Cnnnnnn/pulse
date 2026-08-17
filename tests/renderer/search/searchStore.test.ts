/**
 * tests/renderer/search/searchStore.test.js
 * A3: 搜索 store signals + actions
 */
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock api 避免 searchStore 顶层 import 报错
vi.mock('../../../src/renderer/api.ts', () => ({
  api: { searchQuery: vi.fn(() => Promise.resolve({ results: [], counts: {} })) },
}));

import {
  isSearchOpen,
  searchQuery,
  searchActiveSource,
  searchResults,
  searchCounts,
  searchSelectedIndex,
  searchDataState,
  openSearch,
  closeSearch,
  setSearchQuery,
  setSearchActiveSource,
  moveSearchSelection,
} from '../../../src/renderer/search/searchStore.ts';

describe('searchStore', () => {
  beforeEach(() => {
    closeSearch();
    setSearchQuery('');
    setSearchActiveSource(null);
  });

  it('openSearch sets isOpen=true', () => {
    openSearch();
    expect(isSearchOpen.value).toBe(true);
  });

  it('closeSearch sets isOpen=false and clears query', () => {
    openSearch();
    setSearchQuery('test');
    searchDataState.value = {
      phase: 'error',
      data: { results: [], counts: { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 } },
      error: 'search_failed',
      source: 'unknown',
      fetchedAt: 0,
      lastAttemptAt: 1,
    };
    closeSearch();
    expect(isSearchOpen.value).toBe(false);
    expect(searchQuery.value).toBe('');
    expect(searchDataState.value.phase).toBe('idle');
  });

  it('setSearchActiveSource updates signal', () => {
    setSearchActiveSource('news');
    expect(searchActiveSource.value).toBe('news');
  });

  it('moveSearchSelection clamps within results bounds', () => {
    // 模拟有 3 条结果
    searchResults.value = [{ id: '1' }, { id: '2' }, { id: '3' }];
    searchSelectedIndex.value = 0;
    moveSearchSelection(1);
    expect(searchSelectedIndex.value).toBe(1);
    moveSearchSelection(1);
    expect(searchSelectedIndex.value).toBe(2);
    moveSearchSelection(1); // 越界, clamp
    expect(searchSelectedIndex.value).toBe(2);
    moveSearchSelection(-5); // 负向 clamp
    expect(searchSelectedIndex.value).toBe(0);
  });
});
