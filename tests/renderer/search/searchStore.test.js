/**
 * tests/renderer/search/searchStore.test.js
 * A3: 搜索 store signals + actions
 */
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock api 避免 searchStore 顶层 import 报错
vi.mock('../../../src/renderer/api.js', () => ({
  api: { searchQuery: vi.fn(() => Promise.resolve({ results: [], counts: {} })) },
}));

import {
  isSearchOpen,
  searchQuery,
  searchActiveSource,
  searchResults,
  searchCounts,
  searchSelectedIndex,
  openSearch,
  closeSearch,
  setSearchQuery,
  setSearchActiveSource,
  moveSearchSelection,
} from '../../../src/renderer/search/searchStore.js';

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
    closeSearch();
    expect(isSearchOpen.value).toBe(false);
    expect(searchQuery.value).toBe('');
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
