/**
 * src/renderer/search/searchStore.js
 *
 * A3: 搜索 modal 状态. signals + actions.
 */
import { signal } from '@preact/signals';
import { api } from '../api.js';

export const isSearchOpen = signal(false);
export const searchQuery = signal('');
export const searchActiveSource = signal(null); // null = 全部
export const searchResults = signal([]);
export const searchCounts = signal({ news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 });
export const searchSelectedIndex = signal(0);
export const isSearching = signal(false);

let debounceTimer = null;

export function openSearch() {
  isSearchOpen.value = true;
  searchQuery.value = '';
  searchResults.value = [];
  searchSelectedIndex.value = 0;
}

export function closeSearch() {
  isSearchOpen.value = false;
  searchQuery.value = '';
  searchResults.value = [];
  searchSelectedIndex.value = 0;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

export function setSearchQuery(q) {
  searchQuery.value = q;
  searchSelectedIndex.value = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  const queryStr = q;
  debounceTimer = setTimeout(async () => {
    if (!queryStr.trim()) {
      searchResults.value = [];
      searchCounts.value = { news: 0, 'ai-task': 0, reminder: 0, fund: 0, app: 0 };
      return;
    }
    isSearching.value = true;
    try {
      const out = await api.searchQuery(queryStr, searchActiveSource.value);
      searchResults.value = out.results || [];
      searchCounts.value = out.counts || searchCounts.value;
    } catch {
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }, 150);
}

export function setSearchActiveSource(s) {
  searchActiveSource.value = s;
  searchSelectedIndex.value = 0;
  // 切源后重新 query (单源重新匹配)
  const q = searchQuery.value;
  if (q && q.trim()) setSearchQuery(q);
}

export function moveSearchSelection(delta) {
  const len = searchResults.value.length;
  if (len === 0) { searchSelectedIndex.value = 0; return; }
  let next = searchSelectedIndex.value + delta;
  if (next < 0) next = 0;
  if (next >= len) next = len - 1;
  searchSelectedIndex.value = next;
}
