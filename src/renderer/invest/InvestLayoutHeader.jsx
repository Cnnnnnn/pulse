/**
 * src/renderer/invest/InvestLayoutHeader.jsx
 *
 * 2026-07-13 投资 nav 合并 — 顶部统一两级 sub-tab header (镜像 NewsLayoutHeader):
 *   - 品牌: 投资 + IconCoin
 *   - 主级 sub-tabs: 基金 / 贵金属 / 选股 (写 investPrimary signal)
 *   - 二级 sub-tabs: 基金 (全部/自选) + 选股 (筛选/个股分析, 写 stockActiveTab)
 *   - 刷新按钮 (派发到当前子模块, 由 caller 传 onRefresh + refreshing)
 *
 * 单一真相约定 (跨组件状态避免双向 props):
 *   - 基金二级 tab: fundView 信号由 InvestLayout 持有, Header 通过 props 接 (避免 Header 内 import fundStore)
 *   - 选股二级 tab: stockActiveTab 信号由 diagnosisStore 持有, Header 直接读写 (Task 8 单源)
 *   - 主级 investPrimary: navStore 信号, Header 直接读写
 */
import {
  investPrimary,
  setInvestPrimary,
} from "../worldcup/navStore.js";
import { stockActiveTab } from "../stocks/diagnosisStore.js";
import { IconCoin as IconInvest, IconRefresh } from "../components/icons.jsx";
import { SubtabList } from "../components/SubtabList.jsx";

export const INVEST_PRIMARY_TABS = [
  { key: "funds", label: "基金" },
  { key: "metals", label: "贵金属" },
  { key: "stocks", label: "选股" },
];

export const FUND_VIEW_TABS = [
  { key: "all", label: "全部" },
  { key: "watch", label: "自选" },
];

export const STOCK_VIEW_TABS = [
  { key: "screen", label: "筛选" },
  { key: "diagnosis", label: "个股分析" },
];

// ponytail: 投资三模块搜索维度不同 (基金搜代码/名称、金属无搜索、选股有独立搜索框),
//   不强行合并, 各模块内部搜索框保留, Header 不渲染 search. 副标题「更新于 xxx」二期再接.
export function InvestLayoutHeader({
  fundView,
  onFundViewChange,
  onRefresh,
  refreshing,
}) {
  const primary = investPrimary.value;
  return (
    <header class="invest-header">
      <div class="invest-header-row">
        <div class="invest-header-brand">
          <span class="invest-header-icon" aria-hidden="true">
            <IconInvest size={18} />
          </span>
          <h2 class="invest-header-title">投资</h2>
        </div>
        <div class="invest-header-actions">
          <button
            type="button"
            class={`invest-refresh-btn${refreshing ? " is-loading" : ""}`}
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="刷新当前投资子模块"
            title="刷新当前投资子模块"
          >
            <span class="invest-refresh-icon" aria-hidden="true">
              <IconRefresh size={14} />
            </span>
          </button>
        </div>
      </div>
      <div class="invest-header-row invest-header-row-tabs">
        <SubtabList
          prefix="invest"
          tabs={INVEST_PRIMARY_TABS}
          activeKey={primary}
          onChange={(k) => setInvestPrimary(k)}
          ariaLabel="投资模块切换"
        >
          {(t) => <span>{t.label}</span>}
        </SubtabList>
        {primary === "funds" && (
          <SubtabList
            prefix="invest-sub"
            tabs={FUND_VIEW_TABS}
            activeKey={fundView}
            onChange={onFundViewChange}
            ariaLabel="基金视图切换"
          >
            {(t) => <span>{t.label}</span>}
          </SubtabList>
        )}
        {primary === "stocks" && (
          <SubtabList
            prefix="invest-sub"
            tabs={STOCK_VIEW_TABS}
            activeKey={stockActiveTab.value}
            onChange={(k) => {
              stockActiveTab.value = k;
            }}
            ariaLabel="选股视图切换"
          >
            {(t) => <span>{t.label}</span>}
          </SubtabList>
        )}
      </div>
    </header>
  );
}

export default InvestLayoutHeader;
