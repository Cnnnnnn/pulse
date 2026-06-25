/**
 * 基金管理顶层 Tab: 持仓 | 盈亏记录
 */

import { FundTabIcon } from '../components/icons.jsx';

export const FUND_MAIN_TABS = [
  { id: 'holdings', label: '持仓' },
  { id: 'pnl', label: '盈亏记录' },
];

export function FundMainTabs({ active, onChange }) {
  return (
    <div class="fund-view-tabs" role="tablist" aria-label="基金管理视图">
      {FUND_MAIN_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          class={`fund-view-tab${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
          role="tab"
          aria-selected={active === t.id}
        >
          <span class="fund-view-tab-icon" aria-hidden="true">
            <FundTabIcon tabId={t.id} />
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export default FundMainTabs;
