/**
 * src/renderer/ai-leaderboard/AiLeaderboardPage.jsx
 *
 * v3.1 布局对齐 ai-leaderboard-redesign-preview
 */
import { useEffect, useState } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import {
  loading,
  error,
  attribution,
  hasSampleSource,
  fetchedAt,
  searchQuery,
  clearSearchQuery,
  getDisplayed,
  refresh,
  activeView,
  activeBoard,
  activeDim,
  activeLB,
  sortKey,
} from "./aiLeaderboardStore.js";
import { ARENA_BOARDS, AA_DIMENSIONS, LIVE_DIMENSIONS, SORT_COLUMN_LABELS } from "./types.js";
import { fmtClock } from "./format.js";
import { tableToMarkdown, copyToClipboard } from "./exportMarkdown.js";
import { LeaderboardFilterBar } from "./LeaderboardFilterBar.jsx";
import { LeaderboardTable } from "./LeaderboardTable.jsx";
import { ValueScatter } from "./ValueScatter.jsx";
import { ComparePanel } from "./ComparePanel.jsx";
import { AttributionFooter } from "./AttributionFooter.jsx";
import { LoadingState, ErrorState, EmptyState } from "./states.jsx";
import { TopPodium } from "./TopPodium.jsx";
import { BoardHealthCard } from "./BoardHealthCard.jsx";

export function AiLeaderboardPage() {
  const rows = getDisplayed();
  const view = activeView.value;

  const [animate, setAnimate] = useState(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 450);
    return () => clearTimeout(t);
  }, []);

  async function handleCopyTable() {
    const md = tableToMarkdown({ rows, view, board: activeBoard.value });
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const sortLabel = sortKey.value && SORT_COLUMN_LABELS[sortKey.value];
  let crumb;
  if (view === "arena") {
    const boardMeta = ARENA_BOARDS[activeBoard.value] || {};
    crumb = `${boardMeta.label || "文本"} 榜`;
  } else if (view === "livebench") {
    const lbMeta = LIVE_DIMENSIONS[activeLB.value] || {};
    const sub = sortLabel || lbMeta.label || "Overall";
    crumb = `LiveBench · ${sub}`;
  } else {
    const dimMeta = AA_DIMENSIONS[activeDim.value] || {};
    const sub = sortLabel || dimMeta.label || "Intelligence Index";
    crumb = `AA · ${sub}`;
  }

  const count = rows.length;
  const clock = fmtClock(fetchedAt.value);
  const isEmpty = !loading.value && !error.value && rows.length === 0;
  const sample = hasSampleSource();
  const scopeNote =
    view === "aa" || view === "livebench"
      ? "仅 LLM"
      : view === "arena" && count > 0 && count <= 15
        ? `仅 Top ${count}`
        : null;

  return (
    <div class="ai-leaderboard-page" data-view={view}>
      <FeatureHeader
        className="ai-leaderboard-header"
        brand={
          <div class="ai-leaderboard-page-header__brand">
            <h1 class="ai-leaderboard-page-header__title">AI 榜单</h1>
            <p class="ai-leaderboard-page-header__sub">三个评测源，一个视图</p>
          </div>
        }
      >
        <span
          class={`ai-leaderboard-status-pill${sample ? " is-sample" : ""}`}
          title={sample ? "部分数据为示例快照" : "数据来自在线或缓存"}
        >
          <span class="ai-leaderboard-status-pill__dot" aria-hidden="true" />
          {sample ? "含示例" : "实时"}
          {clock ? ` · ${clock}` : ""}
        </span>
      </FeatureHeader>

      <div class="ai-leaderboard-toolbar">
        <LeaderboardFilterBar />
      </div>

      {count > 0 && (
        <div class="ai-leaderboard-summary" aria-live="polite">
          <span class="ai-leaderboard-summary__dot" aria-hidden="true" />
          <span>{crumb}</span>
          <span class="ai-leaderboard-summary__sep">·</span>
          <span>
            共 <strong>{count}</strong> 个模型
          </span>
          {scopeNote && (
            <>
              <span class="ai-leaderboard-summary__sep">·</span>
              <span class="ai-leaderboard-summary__note">{scopeNote}</span>
            </>
          )}
          <span class="ai-leaderboard-summary__fill" />
          <BoardHealthCard total={count} compact />
          {count > 0 && (
            <button type="button" class="ai-lb-copy-btn" onClick={handleCopyTable}>
              {copied ? "已复制 ✓" : "复制表格"}
            </button>
          )}
        </div>
      )}

      <div class={`ai-leaderboard-body${animate ? " is-entering" : ""}`}>
        {loading.value && <LoadingState />}

        {error.value && (
          <ErrorState message={error.value} onRetry={() => refresh()} />
        )}

        {isEmpty && (
          <EmptyState onRetry={() => (searchQuery.value ? clearSearchQuery() : refresh())} />
        )}

        {!loading.value && !error.value && rows.length > 0 && (
          <>
            {view === "aa" && <ValueScatter items={rows} />}
            <TopPodium rows={rows} view={view} />
            <LeaderboardTable rows={rows} view={view} />
          </>
        )}
      </div>

      <ComparePanel />

      <AttributionFooter attribution={attribution.value} />
    </div>
  );
}

export default AiLeaderboardPage;
