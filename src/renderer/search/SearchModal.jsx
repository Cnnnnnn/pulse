/**
 * 搜索 modal 顶层 — 输入框 + 左来源栏 + 右结果 + 键盘导航
 */
import { useEffect, useRef } from 'preact/hooks';
import {
  isSearchOpen,
  closeSearch,
  searchQuery,
  searchResults,
  searchSelectedIndex,
  setSearchQuery,
  moveSearchSelection,
} from './searchStore.js';
import { SearchSourceBar } from './SearchSourceBar.jsx';
import { SearchResultList } from './SearchResultList.jsx';
import { navigateToResult } from './search-nav.js';

export function SearchModal() {
  const inputRef = useRef(null);
  const isOpen = isSearchOpen.value;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSearchSelection(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSearchSelection(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = searchResults.value[searchSelectedIndex.value];
      if (r) navigateToResult(r);
      return;
    }
  };

  return (
    <div class="search-modal-overlay" onClick={closeSearch}>
      <div
        class="search-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div class="search-modal-input-wrap">
          <span class="search-modal-icon">🔍</span>
          <input
            ref={inputRef}
            class="search-modal-input"
            placeholder="搜索新闻、AI 任务、提醒..."
            value={searchQuery.value}
            onInput={(e) => setSearchQuery(e.target.value)}
          />
          <span class="search-modal-esc">Esc</span>
        </div>
        <div class="search-modal-body">
          <SearchSourceBar />
          <SearchResultList onSelect={navigateToResult} />
        </div>
      </div>
    </div>
  );
}
