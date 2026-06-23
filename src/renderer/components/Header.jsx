/**
 * src/renderer/components/Header.jsx
 *
 * 顶部 Header: 标题 + 摘要 + "检查更新" + BulkUpgradeButton。
 *
 * v2 改进:
 *   - 使用 checkSession.phase 替代旧 checkStatus
 *   - 进度显示包含 per-app phase: "检查中 (3/11)..." 而非 "检查中 (3)..."
 *   - 显示 detecting 态 app 数量 (有几个正在联网检测)
 */

import { checkSession, lastError } from '../store.js';
import { summary, upgradableCount, checkedCount, totalAppCount, detectingCount } from '../selectors.js';
import { BulkUpgradeButton } from './BulkUpgradeButton.jsx';
import { AITasksButton } from './AITasksDrawer.jsx';
import { RemindersButton } from '../reminders/RemindersModal.jsx';
import { RecentButton } from '../recent/RecentActivityModal.jsx';
import { ReleaseNotesTrigger } from './ReleaseNotesTrigger.jsx';
import { diagnosticsDrawerOpen } from '../diagnostics/diagnostics-store.js';
import { watchlistDrawerOpen, watchlistItems } from '../watchlist/watchlist-store.js';

export function Header({ onCheck }) {
  const session = checkSession.value;
  const phase = session.phase;
  const isRunning = phase === 'running';

  return (
    <header id="header">
      <div class="header-left">
        <h1 id="title">Pulse</h1>
        <p id="summary">{summaryText(phase)}</p>
        {phase === 'error' && lastError.value && (
          <p id="error-detail" class="error-detail">出错: {lastError.value}</p>
        )}
      </div>
      <div class="header-right">
        <button
          id="btn-check"
          class="btn btn-secondary"
          onClick={onCheck}
          disabled={isRunning}
        >
          {isRunning
            ? (<><span class="spinner"></span>检查中...</>)
            : (<>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                检查更新
              </>)}
        </button>
        <BulkUpgradeButton />
        <AITasksButton />
        <RemindersButton />
        <RecentButton />
        <button
          id="btn-diagnostics"
          class={`btn btn-ghost btn-icon ${diagnosticsDrawerOpen.value ? 'is-active' : ''}`}
          onClick={() => { diagnosticsDrawerOpen.value = !diagnosticsDrawerOpen.value; }}
          title="错误诊断"
          aria-label="错误诊断"
          aria-expanded={diagnosticsDrawerOpen.value}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </button>
        <button
          id="btn-watchlist"
          class={`btn btn-ghost btn-icon ${watchlistDrawerOpen.value ? 'is-active' : ''}`}
          onClick={() => { watchlistDrawerOpen.value = !watchlistDrawerOpen.value; }}
          title={`关注列表 (${watchlistItems.value.length})`}
          aria-label="关注列表"
          aria-expanded={watchlistDrawerOpen.value}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>{watchlistItems.value.length > 0 ? '★' : '☆'}</span>
        </button>
        <ReleaseNotesTrigger />
      </div>
    </header>
  );
}

/**
 * 摘要文字 (v2: 基于 session phase + per-app phases)。
 *
 * running 期间显示: "检查中 (3/11)..." — 分子是已完成数, 分母是总数
 * done 后显示统计摘要: "3 个有更新 · 5 个已是最新"
 */
function summaryText(phase) {
  if (phase === 'idle') return '准备中...';
  if (phase === 'running') {
    const done = checkedCount.value;
    const total = totalAppCount.value;
    const detecting = detectingCount.value;
    if (total > 0) {
      const suffix = detecting > 0 ? ` (${detecting} 检测中)` : '';
      return `检查中 (${done}/${total})${suffix}...`;
    }
    return done > 0 ? `检查中 (${done})...` : '检查中...';
  }
  if (phase === 'error') return '检查失败';
  // done
  return summary.value;
}
