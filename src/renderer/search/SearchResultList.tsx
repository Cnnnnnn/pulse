/**
 * 右侧结果列表
 */
import { searchResults, searchSelectedIndex, searchQuery } from './searchStore.ts';
import { SearchResultRow } from './SearchResultRow.tsx';
import { DrawerEmpty } from '../components/EmptyState.tsx';

export function SearchResultList({ onSelect }) {
  const results = searchResults.value;
  return (
    <div class="search-result-list">
      {results.length === 0 ? (
        <DrawerEmpty
          message={searchQuery.value ? '无匹配结果' : '输入关键词搜索'}
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
