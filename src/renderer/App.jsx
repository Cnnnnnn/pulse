/**
 * src/renderer/App.jsx
 *
 * 根组件 —— 顶层布局 (v2.9.0 拍准).
 *
 * v2.9.0: AppShell 接管 main 区 (含 v2.6 phase 切 + v2.9.0 worldcup view 切).
 *   Header / FilterBar / 全局组件 (Toast / BulkUpgrade / AITasksDrawer) 仍 在顶层.
 *   WeeklyBanner 仍 在 Header 下方, 跟 v2.6 兼容.
 *
 * v2 改进 (跟 v2.6 保持):
 *   - footerTime 修复: 显示检查 *完成* 时间
 */

import { checkSession } from './store.js';
import { Header } from './components/Header.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { WeeklyBanner } from './components/WeeklyBanner.jsx';
import { BulkUpgradeModal } from './components/BulkUpgradeModal.jsx';
import { AITasksDrawer } from './components/AITasksDrawer.jsx';
import { Toast } from './components/Toast.jsx';
import { AppShell } from './components/AppShell.jsx';
import { results } from './store.js';

export function App({ onCheck }) {
  const session = checkSession.value;
  const hasResults = results.value.size > 0;

  return (
    <div id="app">
      <div id="titlebar"></div>
      <Header onCheck={onCheck} />
      <AITasksDrawer />
      <FilterBar />
      <main id="content">
        {hasResults && <WeeklyBanner state={results.value} />}
        <AppShell onCheck={onCheck} />
      </main>
      <footer id="footer">
        <span id="check-time">{footerTime(session)}</span>
        <div class="footer-right">
          <button class="btn btn-ghost btn-sm" onClick={onOpenConfig}>打开配置</button>
        </div>
      </footer>
      <BulkUpgradeModal />
      <Toast />
    </div>
  );
}

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
  return '';
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function onOpenConfig() {
  window.dispatchEvent(new CustomEvent('app:open-config'));
}
