/**
 * src/renderer/components/LibraryPage.jsx
 *
 * 默认视图 (路由 /versions/library, 也是应用默认落地页).
 * PageHeader + ViewSwitcher + MergedFilterChip
 * + TableView (ResultsView) 或 CardView (AppCard 网格).
 *
 * 2026-06-27: 作为默认落地页.
 *   - results.size === 0 → OverviewEmptyState 空态 CTA (首次启动引导)
 *   - PageHeader 右侧加醒目「检查更新」主按钮 (useRunCheck)
 *   - KPI 压缩为 subtitle 一行小字 ("N 个监控 · M 个可升级")
 *
 * ponytail: 复用现有 ResultsView 当 TableView. Card 视图 < 100 行直接渲染,
 *          > 100 行用 VirtualCardGrid.
 */
import { PageHeader } from "./PageHeader.jsx";
import { PageActionsBar } from "./PageActionsBar.jsx";
import { ViewSwitcher } from "./ViewSwitcher.jsx";
import { MergedFilterChip } from "./MergedFilterChip.jsx";
import { ResultsView } from "./ResultsView.jsx";
import { AppCard } from "./AppCard.jsx";
import { VirtualCardGrid } from "./VirtualCardGrid.jsx";
import { OverviewEmptyState } from "./OverviewEmptyState.jsx";
import { useRunCheck } from "../hooks/useRunCheck.js";
import { viewMode } from "../library-view-store.js";
import { results } from "../store.js";

export function LibraryPage() {
  const mode = viewMode.value;
  const totalApps = results.value.size;
  const upgradable = Array.from(results.value.values()).filter((r) => r && r.has_update).length;
  const { isLoading, run } = useRunCheck();

  // 空态: 首次启动引导 CTA
  if (totalApps === 0) {
    return <OverviewEmptyState onRunCheck={run} isLoading={isLoading} />;
  }

  const useVirtual = mode === "card" && totalApps > 100;

  return (
    <div class="library-page">
      <PageHeader
        title="应用库"
        subtitle={`${totalApps} 个监控 · ${upgradable} 个可升级`}
      >
        <button
          type="button"
          class="btn-run-check"
          onClick={run}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label="检查更新"
          title="检查更新"
          data-testid="library-run-check"
        >
          {isLoading ? "检查中…" : "检查更新"}
        </button>
        <PageActionsBar />
        <ViewSwitcher />
      </PageHeader>
      <MergedFilterChip />
      <div class="library-list-scroll">
        {mode === "table" && <ResultsView />}
        {mode === "card" && (
          useVirtual
            ? <VirtualCardGrid />
            : <div class="app-card-grid">{Array.from(results.value.keys()).map((n) => <AppCard key={n} name={n} />)}</div>
        )}
      </div>
    </div>
  );
}

export default LibraryPage;
