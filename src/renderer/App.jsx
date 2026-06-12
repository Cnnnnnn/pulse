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
import { BulkUpgradeModal } from './components/BulkUpgradeModal.jsx';
import { AISettingsModal } from './components/AISettingsModal.jsx';
import { Toast } from './components/Toast.jsx';
import { AppShell } from './components/AppShell.jsx';

export function App({ onCheck }) {
  const session = checkSession.value;
  return (
    <div id="app">
      <div id="titlebar"></div>
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
