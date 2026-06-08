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
import { openAISettings, aiSessionsEnabled } from '../store.js';

export function Header({ onCheck }) {
  const status = checkStatus.value;
  const isRunning = status === 'running';

  return (
    <header id="header">
      <div class="header-left">
        <h1 id="title">Pulse</h1>
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
 <svg width="16" height="16" viewBox="002424" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M234v6h-6M120v-6h6"/>
 <path d="M3.519a9900114.85-3.36L2310M114l4.644.36A9900020.4915"/>
 </svg>
 检查更新
 </>)}
 </button>
 <BulkUpgradeButton />
 {/* Phase B6c.4: AI总结 设置按钮 —toggle modal.
 aiSessionsEnabled=true 时按钮高亮(已配),false 时灰色(opt-in 没配) */}
 <button
 id="btn-ai-settings"
 class={`btn btn-ghost btn-icon ${aiSessionsEnabled.value ? 'is-active' : ''}`}
 onClick={() => openAISettings(true)}
 title={aiSessionsEnabled.value ? 'AI总结 设置' : '设置 AI每日总结 (opt-in)'}
 aria-label="AI总结 设置"
 >
 <svg width="16" height="16" viewBox="002424" fill="none" stroke="currentColor" stroke-width="2">
 <circle cx="12" cy="12" r="3"/>
 <path d="M19.415a1.651.65000.331.82l.06.06a2200102.8322001-2.830l-.06-.06a1.651.65000-1.82-.331.651.65000-11.51V21a22001-40v-.09A1.651.65000919.4a1.651.65000-1.82.33l-.06.06a22001-2.830220010-2.83l.06-.06a1.651.65000.33-1.821.651.65000-1.51-1H3a220010-4h.09A1.651.650004.69a1.651.65000-.33-1.82l-.06-.06a220010-2.83220012.830l.06.06a1.651.650001.82.33H9a1.651.650001-1.51V3a2200140v.09a1.651.6500011.511.651.650001.82-.33l.06-.06a220012.8302200102.83l-.06.06a1.651.65000-.331.82V9a1.651.650001.511H21a2200104h-.09a1.651.65000-1.511z"/>
 </svg>
 </button>
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
