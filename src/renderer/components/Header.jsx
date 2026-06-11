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

export function Header({ onCheck, onOpenStats }) {
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
        {/* v2.8.1 F1 Stats 入口 */}
        <button
          class="btn btn-ghost btn-sm"
          onClick={onOpenStats}
          title="查看 Pulse 自我统计 (5 标 / detector 分布 / 升级历史 / mute 活跃)"
          aria-label="Stats"
        >
          📊
        </button>
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
