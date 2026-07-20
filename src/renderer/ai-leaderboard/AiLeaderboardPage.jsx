/**
 * src/renderer/ai-leaderboard/AiLeaderboardPage.jsx — AI 榜单主页面。
 * 结构：FeatureHeader(动态语境) + FilterBar(分类 Tab + 维度/厂商/搜索/刷新)
 *        + 上下文条(分类 · 维度 · 计数 · 更新时间) + 内容区(四态 + 表格) + 署名脚注。
 *
 * 镜像 games/GamesPage.jsx：本地派生(rows = getDisplayed()) + 四态渲染。
 */
import { useEffect, useState } from "preact/hooks";
import { FeatureHeader } from "../components/FeatureHeader.jsx";
import {
  items,
  loading,
  error,
  attribution,
  hasSampleSource,
  fetchedAt,
  searchQuery,
  clearSearchQuery,
  getDisplayed,
  refresh,
  activeCategory,
  activeDimension,
} from "./aiLeaderboardStore.js";
import { CATEGORY_META, DIMENSION_META } from "./types.js";
import { fmtClock } from "./format.js";
import { LeaderboardFilterBar } from "./LeaderboardFilterBar.jsx";
import { LeaderboardTable } from "./LeaderboardTable.jsx";
import { AttributionFooter } from "./AttributionFooter.jsx";
import { LoadingState, ErrorState, EmptyState } from "./states.jsx";

export function AiLeaderboardPage() {
  const rows = getDisplayed();
  const category = activeCategory.value;
  const dimension = activeDimension.value;
  const meta = CATEGORY_META[category] || {};
  const dimMeta = DIMENSION_META[dimension] || {};

  // 入场动画仅首屏播放一次（尊重 prefers-reduced-motion，见 styles.css 全局规则）
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 450);
    return () => clearTimeout(t);
  }, []);

  const crumb = `${meta.label || category} · ${dimMeta.label || dimension}`;
  const count = rows.length;
  const clock = fmtClock(fetchedAt.value);
  const q = (searchQuery.value || "").trim();

  const isEmpty = !loading.value && !error.value && rows.length === 0;

  return (
    <div class="ai-leaderboard-page">
      <FeatureHeader
        className="ai-leaderboard-header"
        brand={
          <>
            <span class="ai-leaderboard-header__mark" aria-hidden="true">📊</span>
            AI 榜单排名
          </>
        }
      >
        <span class="ai-leaderboard-header__hint">大模型排名 · 性价比 · 速度</span>
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
          <LeaderboardTable rows={rows} dimension={dimension} />
        )}
      </div>

      <AttributionFooter attribution={attribution.value} />
    </div>
  );
}

export default AiLeaderboardPage;
