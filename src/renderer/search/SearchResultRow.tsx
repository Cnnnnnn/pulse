/**
 * 单条结果卡片 — 标题(高亮) + matchedSnippet + 来源标签 + 时间
 */
import DOMPurify from 'dompurify';
import { SearchSourceIcon } from '../components/icons.tsx';

function formatTimeAgo(ms: number) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return `${Math.floor(diff / 86400_000)}天前`;
}

export function SearchResultRow({ result, isSelected, onClick }: {
  result: { matchedSnippet: string; title: string; source: string; payload?: Record<string, unknown> };
  isSelected: boolean;
  onClick: (e: MouseEvent) => void;
}) {
  const snippetHtml = result.matchedSnippet
    ? DOMPurify.sanitize(result.matchedSnippet)
    : '';
  const dateMsRaw = result.payload?.dateMs;
  const dateMs = typeof dateMsRaw === "number" ? dateMsRaw : undefined;
  return (
    <div
      class={`search-result-row${isSelected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <div class="search-result-title">
        <span class="search-result-icon"><SearchSourceIcon source={result.source} size={14} /></span>
        <span>{result.title}</span>
        {dateMs ? <span class="search-result-time">{formatTimeAgo(dateMs)}</span> : null}
      </div>
      {snippetHtml ? (
        <div
          class="search-result-snippet"
          dangerouslySetInnerHTML={{ __html: snippetHtml }}
        />
      ) : null}
    </div>
  );
}
