/**
 * src/renderer/ai-leaderboard/AiLeaderboardPage.jsx
 *
 * v3.0 双视角主页面：
 *  - FeatureHeader + 视角描述
 *  - FilterBar（视角 tabs + 子筛选 + 通用控件）
 *  - 上下文条（视角 · 子筛选 · 计数 · 更新时间）
 *  - 四态内容区（loading / error / empty / table）
 *  - 署名脚注
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
} from "./aiLeaderboardStore.js";
import { VIEWS, ARENA_BOARDS, AA_DIMENSIONS } from "./types.js";
import { fmtClock } from "./format.js";
import { tableToMarkdown, copyToClipboard } from "./exportMarkdown.js";
import { LeaderboardFilterBar } from "./LeaderboardFilterBar.jsx";
import { LeaderboardTable } from "./LeaderboardTable.jsx";
import { ValueScatter } from "./ValueScatter.jsx";
import { ComparePanel } from "./ComparePanel.jsx";
import { AttributionFooter } from "./AttributionFooter.jsx";
import { LoadingState, ErrorState, EmptyState } from "./states.jsx";

export function AiLeaderboardPage() {
  const rows = getDisplayed();
  const view = activeView.value;
  const viewMeta = VIEWS[view] || {};

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

  // 上下文面包屑
  let crumb;
  if (view === "arena") {
    const boardMeta = ARENA_BOARDS[activeBoard.value] || {};
    crumb = `Arena · ${boardMeta.label || "文本"}`;
  } else {
    const dimMeta = AA_DIMENSIONS[activeDim.value] || {};
    crumb = `深度分析 · ${dimMeta.label || "智能指数"}`;
  }

  const count = rows.length;
  const clock = fmtClock(fetchedAt.value);
  const isEmpty = !loading.value && !error.value && rows.length === 0;

  return (
    <div class="ai-leaderboard-page">
      <FeatureHeader
        className="ai-leaderboard-header"
        brand={
          <>
            <span class="ai-leaderboard-header__mark" aria-hidden="true">📊</span>
            AI 榜单
          </>
        }
      >
        <span class="ai-leaderboard-header__hint">{viewMeta.description || ""}</span>
        {hasSampleSource() && (
          <span class="ai-leaderboard-header__badge" title="部分数据为示例快照，非实时">
            含示例数据
          </span>
        )}
      </FeatureHeader>

      <div class="ai-leaderboard-toolbar">
        <LeaderboardFilterBar />
      </div>

      <div class="ai-leaderboard-context">
        <span class="ai-leaderboard-context__crumb">{crumb}</span>
        <span class="ai-leaderboard-context__count" aria-live="polite">共 {count} 个模型</span>
        {clock && <span class="ai-leaderboard-context__time">更新于 {clock}</span>}
        {view === "aa" && (
          <span class="ai-leaderboard-context__note" title="Artificial Analysis Free tier 仅覆盖 LLM 端点">
            仅 LLM
          </span>
        )}
        {view === "arena" && count > 0 && count <= 15 && (
          <span class="ai-leaderboard-context__note" title="Arena 社区快照仅追踪该 board 的头部模型">
            仅 Top {count}
          </span>
        )}
        {count > 0 && (
          <button type="button" class="ai-lb-copy-btn" onClick={handleCopyTable}>
            {copied ? "已复制 ✓" : "复制表格"}
          </button>
        )}
      </div>

      <div class={`ai-leaderboard-body${animate ? " is-entering" : ""}`}>
        {loading.value && <LoadingState />}

        {error.value && (
          <ErrorState message={error.value} onRetry={() => refresh()} />
        )}

        {isEmpty && (
          <EmptyState onRetry={() => clearSearchQuery()} />
        )}

        {!loading.value && !error.value && rows.length > 0 && (
          <>
            {view === "aa" && <ValueScatter items={rows} />}
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
