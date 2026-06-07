/**
 * src/renderer/components/Header.jsx
 *
 * 顶部 Header: 标题 + 摘要 + "检查更新" + BulkUpgradeButton。
 * Bulk Upgrade 按钮抽到 BulkUpgradeButton.jsx (Phase 22), 状态/进度归它管。
 * 订阅 checkStatus, summary 三个 signal。
 */

import { checkStatus, lastError } from '../store.js';
import { summary, upgradableCount, checkedCount } from '../selectors.js';
import { BulkUpgradeButton } from './BulkUpgradeButton.jsx';

export function Header({ onCheck }) {
  const status = checkStatus.value;
  const isRunning = status === 'running';

  return (
    <header id="header">
      <div class="header-left">
        <h1 id="title">AppUpdateChecker</h1>
        <p id="summary">{summaryText(status)}</p>
        {status === 'error' && lastError.value && (
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
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                检查更新
              </>)}
        </button>
        <BulkUpgradeButton />
      </div>
    </header>
  );
}

function summaryText(status) {
  if (status === 'idle')    return '准备中...';
  if (status === 'running') {
    const done = checkedCount.value;
    return done > 0 ? `检查中 (${done})...` : '检查中...';
  }
  if (status === 'error')   return '检查失败';
  // 'done'
  return summary.value;
}
