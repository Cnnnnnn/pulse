/**
 * src/renderer/components/AppShell.jsx
 *
 * v2.9.0 — Shell 布局 + main 视图切换
 *
 *  左侧 180px (或 40 折叠) SideNav
 *  右侧 main 区: 跟 v2.6 一样, 根据 checkSession.phase 切 Skeleton / ResultsView / ErrorBanner.
 *    但 activeNav='worldcup' 时, 完全显示 WorldcupView, 跳过 v2.6 的 phase 逻辑.
 *
 * 跟 v2.6 主体 隔离: 0 共享 view, 但 Header / FilterBar / 全局组件 仍 在 App.jsx 顶层
 */

import { useEffect } from 'preact/hooks';
import { activeNav, navCollapsed } from '../worldcup/navStore.js';
import { checkSession, results } from '../store.js';
import { SideNav } from './SideNav.jsx';
import { Skeleton } from './Skeleton.jsx';
import { ResultsView } from './ResultsView.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { WorldcupView } from '../worldcup/WorldcupView.jsx';

export function AppShell({ onCheck }) {
  const nav = activeNav.value;
  const collapsed = navCollapsed.value;
  const session = checkSession.value;
  const phase = session.phase;
  const hasResults = results.value.size > 0;

  // Cmd+F 拦截 (在 AppShell 内也来一次, 防止 activeNav='worldcup' 时失效)
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const input = document.getElementById('filter-search-input');
        if (input) {
          input.focus();
          try { input.select(); } catch { /* noop */ }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class={`app-shell${collapsed ? ' app-shell-collapsed' : ''}`}>
      <SideNav />
      <div class="app-shell-view">
        {nav === 'worldcup' ? (
          <WorldcupView />
        ) : (
          <>
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
        )}
      </div>
    </div>
  );
}

export default AppShell;
