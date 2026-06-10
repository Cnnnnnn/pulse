/**
 * src/renderer/App.jsx
 *
 * 根组件 —— 顶层布局 + 状态视图切换 (v2 Session-based)。
 *
 * v2 改进:
 *   - 视图切换基于 checkSession.phase (不再用旧的 checkStatus)
 *   - footerTime 修复: 显示检查 *完成* 时间 (finishedAt), 而非开始时间
 *   - running 期间也显示已有 results (不闪 skeleton)
 *   - 每个 app 的 phase 驱动行级 spinner/done/error 态 (在 AppRow 内)
 *
 * v2.7.0: library 集成
 *   - bootstrap 拉 libraryConfig + unmonitoredApps
 *   - 订阅 onConfigUpdated 事件, library 写完刷 store
 *   - 切到 'unmonitored' tab 时渲染 LibrarySection (替换 ResultsView)
 *   - DetectorWizardModal 状态在这里管
 */

import { useEffect, useState } from 'preact/hooks';
import {
  checkSession, results, cachedState,
  libraryConfig, activeFilter,
} from './store.js';
import { api } from './api.js';
import { Header } from './components/Header.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { Skeleton } from './components/Skeleton.jsx';
import { ResultsView } from './components/ResultsView.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { WeeklyBanner } from './components/WeeklyBanner.jsx';
import { BulkUpgradeModal } from './components/BulkUpgradeModal.jsx';
import { AITasksDrawer } from './components/AITasksDrawer.jsx';
import { Toast } from './components/Toast.jsx';
import { PinnedSection } from './components/PinnedSection.jsx';
import { TagBar } from './components/TagBar.jsx';
import { LibrarySection, refreshUnmonitored } from './components/LibrarySection.jsx';
import { DetectorWizardModal } from './components/DetectorWizardModal.jsx';

export function App({ onCheck }) {
  const session = checkSession.value;
  const phase = session.phase;
  const [wizardItem, setWizardItem] = useState(null);

  // 全局拦截 Cmd+F / Ctrl+F, 聚焦 search input
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

  // v2.7.0: bootstrap 拉 libraryConfig + unmonitoredApps + 订阅 config-updated 事件
  useEffect(() => {
    // 1) 拉 libraryConfig (从 getConfig 里抽, 避免额外 IPC)
    if (typeof api.getConfig === 'function') {
      api.getConfig().then((cfg) => {
        if (cfg && cfg.library) {
          libraryConfig.value = cfg.library;
        }
      }).catch(() => { /* noop */ });
    }
    // 2) 拉 unmonitored (background, 不阻塞)
    refreshUnmonitored();
    // 3) 订阅 config-updated 事件
    if (typeof api.onConfigUpdated === 'function') {
      const off = api.onConfigUpdated((data) => {
        if (data && data.config && data.config.library) {
          libraryConfig.value = data.config.library;
          // 重新扫 unmonitored (ignore 列表可能改了)
          refreshUnmonitored();
        }
      });
      return () => { if (typeof off === 'function') off(); };
    }
  }, []);

  const hasResults = results.value.size > 0;
  const showUnmonitored = activeFilter.value === 'unmonitored';

  return (
    <div id="app">
      <div id="titlebar"></div>
      <Header onCheck={onCheck} />
      <AITasksDrawer />
      <FilterBar />
      <PinnedSection />
      <TagBar />
      <main id="content">
        {/* 周报 banner, 有结果时显示 */}
        {hasResults && <WeeklyBanner state={cachedState.value} />}

        {/* 视图切换逻辑 (v2):
            - running + 无结果 → Skeleton (等待首批 progress)
            - 有结果 → ResultsView (running 期间也显示, 每个 AppRow 自带 phase 态)
            - idle → ResultsView (显示缓存结果)
            - error → ErrorBanner + ResultsView (保留上次结果)
        */}
        {!hasResults && phase === 'running' && <Skeleton />}
        {hasResults && !showUnmonitored && <ResultsView />}
        {phase === 'idle' && !hasResults && !showUnmonitored && <ResultsView />}
        {phase === 'error' && (
          <>
            <ErrorBanner onRetry={onCheck} />
            {!showUnmonitored && <ResultsView />}
          </>
        )}

        {/* v2.7.0: "未监控" tab 单独渲染, 替换 ResultsView */}
        {showUnmonitored && <LibrarySection onOpenWizard={(item) => setWizardItem(item)} />}
      </main>
      <footer id="footer">
        <span id="check-time">{footerTime(session)}</span>
        <div class="footer-right">
          <button class="btn btn-ghost btn-sm" onClick={onOpenConfig}>打开配置</button>
        </div>
      </footer>
      <BulkUpgradeModal />
      {wizardItem && (
        <DetectorWizardModal
          item={wizardItem}
          onClose={() => setWizardItem(null)}
        />
      )}
      <Toast />
    </div>
  );
}

/**
 * Footer 时间显示 (v2 修复)。
 *
 * 旧 bug: 显示 checkStartTime (检查开始时间), 用户看到的是"检查中... 10:30 开始"
 * 但检查完成后仍然显示开始时间, 让人误以为检查还没结束。
 *
 * 修复: 完成后显示 finishedAt (完成时间), running 期间显示 startedAt。
 */
function footerTime(session) {
  if (session.phase === 'running' && session.startedAt) {
    return `检查中... ${formatTime(new Date(session.startedAt))} 开始`;
  }
  if (session.phase === 'done' && session.finishedAt && session.startedAt) {
    const duration = session.finishedAt - session.startedAt;
    return `上次检查: ${formatTime(new Date(session.finishedAt))} · 用时 ${(duration / 1000).toFixed(1)}s`;
  }
  if (session.phase === 'error' && session.finishedAt) {
    return `检查失败: ${formatTime(new Date(session.finishedAt))}`;
  }
  // idle — 如果有缓存结果的 finishedAt (上次检查遗留), 也可以显示
  return '';
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function onOpenConfig() {
  window.dispatchEvent(new CustomEvent('app:open-config'));
}
