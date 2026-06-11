/**
 * src/renderer/components/VersionsLayout.jsx
 *
 * v2.9.1 — 抽 [版本检查] tab 自己的 layout 容器
 *
 * 含:
 *   - WeeklyBanner (有 results 时)
 *   - Skeleton / ResultsView / ErrorBanner (依 checkSession.phase)
 *
 * Header + FilterBar 仍在 App.jsx 顶层 (跟 v2.6 兼容)
 *  - 上版本检查 layout 跟世界 独立, 跟 v2.6 1:1
 */

import { checkSession, results } from '../store.js';
import { Skeleton } from './Skeleton.jsx';
import { ResultsView } from './ResultsView.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { WeeklyBanner } from './WeeklyBanner.jsx';

export function VersionsLayout({ onCheck }) {
  const session = checkSession.value;
  const phase = session.phase;
  const hasResults = results.value.size > 0;

  return (
    <>
      {hasResults && <WeeklyBanner state={results.value} />}
      {!hasResults && phase === 'running' && <Skeleton />}
      {hasResults && <ResultsView />}
      {phase === 'idle' && !hasResults && <ResultsView />}
      {phase === 'error' && (
        <>
          <ErrorBanner onRetry={onCheck} />
          <ResultsView />
        </>
      )}
    </>
  );
}

export default VersionsLayout;
