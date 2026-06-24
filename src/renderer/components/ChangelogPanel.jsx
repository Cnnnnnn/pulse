/**
 * src/renderer/components/ChangelogPanel.jsx
 *
 * Phase 14: inline changelog 展示. 安全渲染 (marked + DOMPurify).
 * Phase 18: 顶部加 "older releases" 列表, 用户可切换看历史版本 release notes.
 * 父组件 (AppRow) 管理展开状态, 本组件只负责渲染.
 */

import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { renderChangelog } from '../changelog.js';
import { ChangelogSummary } from './ChangelogSummary.jsx';

export function ChangelogPanel({ result }) {
  const src = result && result.changelog;
  const url = result && result.changelog_url;
  const format = (result && result.changelog_format) || 'md';
  const history = (result && Array.isArray(result.changelog_history)) ? result.changelog_history : [];
  // Phase 20: 没 detector 拉到 changelog 时, 仍可显示 "查看 release notes ↗" 链接
  // fallback: release_notes_url > changelog_url > download_url
  const fallbackUrl = (result && result.release_notes_url)
    || url
    || (result && result.download_url)
    || '';
  const [view, setView] = useState('current'); // 'current' | history index

  // 切换 view 时重置到 current
  const prevResultRef = useRef(result && result.latest_version);
  useEffect(() => {
    if (prevResultRef.current !== (result && result.latest_version)) {
      prevResultRef.current = result && result.latest_version;
      setView('current');
    }
  }, [result && result.latest_version]);

  // 源/url/历史/release_notes_url 都没有 → 整个 panel 都不渲染
  if (!src && !url && history.length === 0 && !fallbackUrl) return null;

  // 当前选中显示的内容
  const isCurrent = view === 'current';
  const activeSrc = isCurrent ? src : (history[view] && history[view].changelog) || '';
  const activeUrl = isCurrent ? url : (history[view] && history[view].changelog_url) || '';
  const activeLabel = isCurrent
    ? (result && result.latest_version ? `${result.latest_version} (current)` : 'current')
    : (history[view] && history[view].version) || 'older';

  // 没源没 changelog_url (但可能有 release_notes_url) → 空状态
  if (!activeSrc && !activeUrl) {
    return (
      <div class="changelog-panel">
        <div class="changelog-version-label">{activeLabel}</div>
        <div class="changelog-empty">
          无 release notes 源 —{' '}
          {fallbackUrl
            ? <a href={fallbackUrl} target="_blank" rel="noopener">查看官网</a>
            : <span>查看官网</span>}
        </div>
        {history.length > 0 && <HistoryTabs history={history} view={view} onChange={setView} />}
      </div>
    );
  }

  const html = useMemo(
    () => renderChangelog(activeSrc, format, activeUrl),
    [activeSrc, format, activeUrl]
  );

  return (
    <div class="changelog-panel">
      <div class="changelog-panel-head">
        <div class="changelog-version-label">{activeLabel}</div>
        {isCurrent && result && result.name && (
          <ChangelogSummary appName={result.name} />
        )}
      </div>
      <div
        class="changelog-body"
        // 渲染来自 detector 的 release notes, 已经过 DOMPurify.sanitize, 安全
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {history.length > 0 && <HistoryTabs history={history} view={view} onChange={setView} />}
    </div>
  );
}

/**
 * Phase 18: 历史版本 tab. 在面板底部, 用户可点击切换到旧版 release notes.
 */
function HistoryTabs({ history, view, onChange }) {
  if (!history || history.length === 0) return null;
  return (
    <div class="changelog-history">
      <span class="changelog-history-label">历史版本:</span>
      <button
        class={`changelog-history-tab${view === 'current' ? ' active' : ''}`}
        onClick={() => onChange('current')}
      >
        current
      </button>
      {history.map((h, i) => (
        <button
          key={h.version + i}
          class={`changelog-history-tab${view === i ? ' active' : ''}`}
          onClick={() => onChange(i)}
          title={h.ts ? new Date(h.ts).toLocaleString() : ''}
        >
          {h.version}
        </button>
      ))}
    </div>
  );
}
