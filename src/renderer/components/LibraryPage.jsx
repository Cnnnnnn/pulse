/**
 * src/renderer/components/LibraryPage.jsx
 *
 * Library view (路由 /versions/library). PageHeader + ViewSwitcher
 * + MergedFilterChip + TableView (ResultsView) 或 CardView (AppCard 网格).
 *
 * ponytail: 复用现有 ResultsView 当 TableView. Card 视图 < 100 行直接渲染,
 *          > 100 行用 VirtualCardGrid (Task 13 实现) — 本任务先放 placeholder.
 */
import { PageHeader } from "./PageHeader.jsx";
import { ViewSwitcher } from "./ViewSwitcher.jsx";
import { MergedFilterChip } from "./MergedFilterChip.jsx";
import { ResultsView } from "./ResultsView.jsx";
import { AppCard } from "./AppCard.jsx";
import { viewMode } from "../library-view-store.js";
import { results } from "../store.js";

export function LibraryPage() {
  const mode = viewMode.value;
  const totalApps = results.value.size;
  const upgradable = Array.from(results.value.values()).filter((r) => r && r.has_update).length;
  const useVirtual = mode === "card" && totalApps > 100;

  return (
    <div class="library-page">
      <PageHeader
        title="应用库"
        subtitle={`${totalApps} 个监控 · ${upgradable} 个可升级`}
      >
        <ViewSwitcher />
      </PageHeader>
      <MergedFilterChip />
      {mode === "table" && <ResultsView />}
      {mode === "card" && (
        useVirtual
          ? <VirtualCardGrid />
          : <div class="app-card-grid">{Array.from(results.value.keys()).map((n) => <AppCard key={n} name={n} />)}</div>
      )}
    </div>
  );
}

// placeholder, Task 13 实现真正的窗口化渲染
function VirtualCardGrid() {
  return <div class="app-card-grid">virtual TODO</div>;
}

export default LibraryPage;
