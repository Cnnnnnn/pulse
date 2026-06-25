/**
 * src/renderer/worldcup/WorldcupHeader.jsx
 *
 * v2.9.1 — 世界杯 tab 独立顶部
 *
 * 品牌区: IconFootball Pulse · 世界杯 2026
 * 2 子 tab: [赛程] / [球队]
 * 搜索框: 按 队 / 场址 过滤 (id="worldcup-search-input", 跟 Cmd+F 切对齐)
 */

import { useEffect, useRef } from 'preact/hooks';
import { IconFootball, IconRefresh, WorldcupTabIcon } from '../components/icons.jsx';

export function WorldcupHeader({
  subTab,
  subTabs,
  onSubTabChange,
  search,
  onSearchChange,
  onRefreshScores,
  scoresLoading = false,
}) {
  const inputRef = useRef(null);
  // subTab 切到 球队 时 auto-focus 搜索框
  useEffect(() => {
    if ((subTab === 'teams' || subTab === 'scorers') && inputRef.current) {
      inputRef.current.focus();
    }
  }, [subTab]);

  return (
    <div class="worldcup-header">
      <div class="worldcup-header-brand">
        <span class="worldcup-header-icon" aria-hidden="true">
          <IconFootball size={20} />
        </span>
        <h2 class="worldcup-header-title">世界杯 2026</h2>
        <span class="worldcup-header-sub">美加墨 · 6/11 - 7/19 · 48 队 104 场</span>
        <button
          type="button"
          class={`worldcup-refresh-btn${scoresLoading ? ' worldcup-refresh-btn-loading' : ''}`}
          onClick={() => onRefreshScores && onRefreshScores()}
          disabled={scoresLoading}
          title="刷新比分"
          aria-label="刷新比分"
        >
          <span class="worldcup-refresh-icon" aria-hidden="true">
            <IconRefresh size={18} />
          </span>
        </button>
      </div>
      <div class="worldcup-header-controls">
        <div class="worldcup-subtabs">
          {subTabs.map((t) => (
            <button
              key={t.key}
              class={`worldcup-subtab${subTab === t.key ? ' worldcup-subtab-active' : ''}`}
              onClick={() => onSubTabChange(t.key)}
            >
              <span class="worldcup-subtab-icon" aria-hidden="true">
                <WorldcupTabIcon tabKey={t.key} />
              </span>
              <span class="worldcup-subtab-label">{t.label}</span>
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          id="worldcup-search-input"
          class="worldcup-search-input"
          type="search"
          placeholder={
            subTab === 'scorers'
              ? '搜索球员 / 球队...'
              : subTab === 'teams'
                ? '搜索球队...'
                : '搜索队名 / 场址...'
          }
          value={search}
          onInput={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default WorldcupHeader;
