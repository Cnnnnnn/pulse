/**
 * src/renderer/App.jsx
 *
 * 根组件 —— 顶层布局 (v2.9.5 拍准).
 *
 * v2.9.0 → v2.9.1: AppShell 拆 2 独立 layout.
 * v2.9.5: Header + AITasksDrawer + FilterBar 从顶层 移 给 VersionsLayout.
 *   [版本检查] tab: VersionsLayout 包 Header (检查更新 / Upgrade All / 通知 badge) + FilterBar (搜索 + 状态 chip) + 主体.
 *   [世界杯] tab:   WorldcupLayout 完全独立顶部, 不显 版本检查 任何元素.
 *   2 套顶部 0 共享, 拍 1 拍 (跟版本检查相关元素 留 在 版本检查).
 *
 * v2 改进 (跟 v2.6 保持):
 *   - footerTime 修复
 *   - Cmd+F 拦截 (在 AppShell 里, 切对应搜索框)
 */

import { checkSession } from './store.js';
import { api } from './api.js';
import { BulkUpgradeModal } from './components/BulkUpgradeModal.jsx';
import { AISettingsModal } from './components/AISettingsModal.jsx';
import { Toast } from './components/Toast.jsx';
import { StateRecoveredBanner } from './components/StateRecoveredBanner.jsx';
import { DigestDrawer } from './digest/DigestDrawer.jsx';
import { WatchlistModal } from './components/WatchlistModal.jsx';
import { ReleaseNotesWizard } from './components/ReleaseNotesWizard.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { AppShell } from './components/AppShell.jsx';
import { RemindersModal } from './reminders/RemindersModal.jsx';
import { RecentActivityModal } from './recent/RecentActivityModal.jsx';
import { TrayMenuConfigModal } from './components/TrayMenuConfigModal.jsx';

const isWin = (typeof window !== 'undefined' && window.platformInfo && window.platformInfo.platform) === 'win32';

export function App({ onCheck }) {
  const session = checkSession.value;
  return (
    <div id="app">
      <div id="titlebar">
        {isWin && (
          <div class="window-controls">
            <button
              type="button"
              class="window-control-btn window-control-btn--minimize"
              onClick={() => api.windowMinimize()}
              title="最小化"
              aria-label="最小化"
            >
              {/* 减号图标 (SVG, Win11 风格) */}
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="0" y="4.25" width="10" height="1.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              class="window-control-btn window-control-btn--maximize"
              onClick={() => api.windowToggleMaximize()}
              title="最大化"
              aria-label="最大化"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
            <button
              type="button"
              class="window-control-btn window-control-btn--close"
              onClick={() => api.windowClose()}
              title="关闭"
              aria-label="关闭"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0.7 0.7 L9.3 9.3 M9.3 0.7 L0.7 9.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <main id="content">
        <AppShell onCheck={onCheck} />
      </main>
      <footer id="footer">
        <span id="check-time">{footerTime(session)}</span>
        <div class="footer-right">
          <button class="btn btn-ghost btn-sm" onClick={onOpenConfig}>打开配置</button>
        </div>
      </footer>
      <BulkUpgradeModal />
      <AISettingsModal />
      <RemindersModal />
      <RecentActivityModal />
      <TrayMenuConfigModal />
      <ConfirmDialog />
      <Toast />
      <StateRecoveredBanner />
      <DigestDrawer />
      <WatchlistModal />
      <ReleaseNotesWizard />
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
