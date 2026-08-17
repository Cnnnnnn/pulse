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
import { PageHeader } from "./PageHeader.tsx";
import { PageActionsBar } from "./PageActionsBar.tsx";
import { ViewSwitcher } from "./ViewSwitcher.tsx";
import { MergedFilterChip } from "./MergedFilterChip.tsx";
import { ResultsView } from "./ResultsView.tsx";
import { AppCard } from "./AppCard.tsx";
import { VirtualCardGrid } from "./VirtualCardGrid.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { OverviewEmptyState } from "./OverviewEmptyState.tsx";
import { useRunCheck } from "../hooks/useRunCheck.ts";
import { viewMode } from "../store/library-view-store.ts";
import { results } from "../store.ts";
import { filteredResults, upgradableCount } from "../selectors.ts";

export function LibraryPage() {
  const mode = viewMode.value;
  const totalApps = results.value.size;
  const visibleNames = Array.from(filteredResults.value.keys());
  const upgradable = upgradableCount.value;
  const { isLoading, run, cancel } = useRunCheck();

  // 空态: 首次启动引导 CTA
  if (totalApps === 0) {
    return <OverviewEmptyState onRunCheck={run} onCancel={cancel} isLoading={isLoading} />;
  }

  const useVirtual = mode === "card" && visibleNames.length > 100;

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
        {isLoading && (
          <button type="button" class="btn btn-ghost btn-sm" onClick={cancel}>
            取消
          </button>
        )}
        <PageActionsBar />
        <ViewSwitcher />
      </PageHeader>
      <MergedFilterChip />
      <div class="library-list-scroll">
        {mode === "table" && <ResultsView />}
        {mode === "card" && (
          visibleNames.length === 0
            ? <EmptyState filtered={totalApps > 0} />
            : useVirtual
              ? <VirtualCardGrid names={visibleNames} />
              : <div class="app-card-grid">{visibleNames.map((n) => <AppCard key={n} name={n} />)}</div>
        )}
      </div>
    </div>
  );
}

export default LibraryPage;
