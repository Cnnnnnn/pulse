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
import { api } from '../api.js';

/**
 * Deep-link 到 GitHub Releases / 该版本 release page. 主进程 open-url IPC
 * 验证 + shell.openExternal 打开系统浏览器 (Electron target=_blank 默认
 * 在 Pulse 内开新 BrowserWindow, 不是用户预期的"系统浏览器打开").
 */
function openExternal(url) {
  if (!url) return;
  if (api && typeof api.openUrl === 'function') {
    api.openUrl(url).catch(() => {});
  } else if (typeof window !== 'undefined' && window.open) {
    // 兜底: 没 preload (例如 dev/snapshot) 时, 用 window.open (browser 内开 tab)
    try { window.open(url, '_blank', 'noopener'); } catch { /* noop */ }
  }
}

/**
 * 根据 source 字段给出 release page 按钮文案. 通用 fallback: "查看发布页".
 */
function releasesLinkLabel(source) {
  if (typeof source === 'string' && source.includes('github')) {
    return '↗ GitHub Releases';
  }
  if (typeof source === 'string' && source.startsWith('sparkle')) {
    return '↗ 项目主页';
  }
  return '↗ 查看发布页';
}

export function ChangelogPanel({ result }) {
  const src = result && result.changelog;
  const url = result && result.changelog_url;
  const format = (result && result.changelog_format) || 'md';
  const history = (result && Array.isArray(result.changelog_history)) ? result.changelog_history : [];
  // 当前 detector 返的 release page URL (e.g. github_release.html_url),
  // 永远是该版本的 releases page, 显示在 panel 头部让用户一键跳转.
  const releaseUrl = (result && result.release_url) || '';
  const [view, setView] = useState('current'); // 'current' | history index

  // 切换 view 时重置到 current
  const prevResultRef = useRef(result && result.latest_version);
  useEffect(() => {
    if (prevResultRef.current !== (result && result.latest_version)) {
      prevResultRef.current = result && result.latest_version;
      setView('current');
    }
  }, [result && result.latest_version]);

  // 源/url/历史都没有 → 整个 panel 都不渲染
  if (!src && !url && history.length === 0 && !releaseUrl) return null;

  // 当前选中显示的内容
  const isCurrent = view === 'current';
  const activeSrc = isCurrent ? src : (history[view] && history[view].changelog) || '';
  const activeUrl = isCurrent ? url : (history[view] && history[view].changelog_url) || '';
  const activeLabel = isCurrent
    ? ((result && result.latest_version) || 'latest')
    : ((history[view] && history[view].version) || 'older');

  // 没源没 changelog_url → 空状态 (仅版本标签 + 历史 tab, 不再展示 fallback 链接)
  if (!activeSrc && !activeUrl) {
    return (
      <div class="changelog-panel">
        <div class="changelog-version-label">{activeLabel}</div>
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
        {/* ↗ Releases 按钮: 跳到该版本的 release page (e.g. GitHub Releases).
            只在 release_url 存在时显示, 走主进程 open-url IPC → shell.openExternal. */}
        {isCurrent && releaseUrl && (
          <button
            type="button"
            class="changelog-releases-btn"
            title={`在浏览器打开: ${releaseUrl}`}
            onClick={() => openExternal(releaseUrl)}
          >
            {releasesLinkLabel(result.source)}
          </button>
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
        latest
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
