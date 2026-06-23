/**
 * 左侧来源栏 — 各源命中数 + 点击切源
 */
import { searchCounts, searchActiveSource, setSearchActiveSource } from './searchStore.js';

const SOURCES = [
  { key: null, label: '全部' },
  { key: 'news', label: '📰 新闻' },
  { key: 'ai-task', label: '🤖 AI 任务' },
  { key: 'reminder', label: '⏰ 提醒' },
  { key: 'fund', label: '📊 基金' },
];

export function SearchSourceBar() {
  return (
    <div class="search-source-bar">
      {SOURCES.map((s) => {
        const count =
          s.key === null
            ? Object.values(searchCounts.value).reduce((a, b) => a + b, 0)
            : searchCounts.value[s.key] || 0;
        const active = searchActiveSource.value === s.key;
        return (
          <button
            key={String(s.key)}
            class={`search-source-item${active ? ' is-active' : ''}`}
            onClick={() => setSearchActiveSource(s.key)}
          >
            <span class="search-source-label">{s.label}</span>
            <span class="search-source-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
