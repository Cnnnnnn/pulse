/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * v2.9.5 — 抽 [版本检查] tab 自己的 layout 容器, 含 顶部 (Header + AITasksDrawer + FilterBar)
 *
 * 含:
 *   - 顶部: Header (Pulse logo + 检查更新 + Upgrade All + 通知 badge) + AITasksDrawer + FilterBar (搜索 + 状态 chip)
 *   - 主体: WeeklyBanner (有 results 时) + Skeleton / ResultsView / ErrorBanner (依 checkSession.phase)
 *
 * 0 共享 跟 WorldcupLayout (2 tab 完全独立顶部, 拍 1 拍).
 */

import { checkSession, results } from '../store.js';
import { Header } from './Header.jsx';
import { FilterBar } from './FilterBar.jsx';
import { AITasksDrawer } from './AITasksDrawer.jsx';
import { Skeleton } from './Skeleton.jsx';
import { ResultsView } from './ResultsView.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { WeeklyBanner } from './WeeklyBanner.jsx';

export function VersionsLayout({ onCheck }) {
  const session = checkSession.value;
  const phase = session.phase;
  const hasResults = results.value.size > 0;

  return (
    <div class="versions-layout">
      <Header onCheck={onCheck} />
      <AITasksDrawer />
      <FilterBar />
      <div class="versions-layout-body">
        {hasResults && <WeeklyBanner state={results.value} />}
        {phase === 'running' && !hasResults && <Skeleton />}
        <ResultsView />
        {phase === 'error' && (
          <>
            <ErrorBanner onRetry={onCheck} />
            <ResultsView />
          </>
        )}
      </div>
    </div>
  );
}

export default VersionsLayout;
