/**
 * 右侧结果列表
 */
import {
  searchResults,
  searchSelectedIndex,
  searchQuery,
  searchDataState,
} from './searchStore.ts';
import { SearchResultRow } from './SearchResultRow.tsx';
import { DrawerEmpty } from '../components/EmptyState.tsx';

export function SearchResultList({ onSelect }) {
  const results = searchResults.value;
  const state = searchDataState.value;
  const emptyMessage =
    state.phase === 'loading'
      ? '搜索中…'
      : state.phase === 'error'
        ? `搜索失败：${state.error || '请求失败'}`
        : searchQuery.value
          ? '无匹配结果'
          : '输入关键词搜索';
  return (
    <div class="search-result-list">
      {results.length === 0 ? (
        <DrawerEmpty
          message={emptyMessage}
          className="search-empty"
        />
      ) : (
        results.map((r, i) => (
          <SearchResultRow
            key={r.id}
            result={r}
            isSelected={i === searchSelectedIndex.value}
            onClick={() => onSelect(r)}
          />
        ))
      )}
    </div>
  );
}
