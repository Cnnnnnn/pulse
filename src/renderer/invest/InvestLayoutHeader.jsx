/**
 * src/renderer/invest/InvestLayoutHeader.jsx
 *
 * 2026-07-13 投资 nav 合并 — 顶部统一两级 sub-tab header (镜像 NewsLayoutHeader):
 *   - 品牌: 投资 + IconCoin
 *   - 主级 sub-tabs: 基金 / 贵金属 / 选股 (写 investPrimary signal)
 *   - 二级 sub-tabs: 基金 (概览/列表/交易) + 选股 (筛选/个股分析, 写 stockActiveTab)
 *   - 刷新按钮 (派发到当前子模块, 由 caller 传 onRefresh + refreshing)
 *
 * 单一真相约定 (跨组件状态避免双向 props):
 *   - 基金二级 tab: fundPage 信号由 fundRoute 持有, Header 通过 props 接 (避免 Header 内 import fundRoute)
 *   - 选股二级 tab: stockActiveTab 信号由 diagnosisStore 持有, Header 直接读写 (Task 8 单源)
 *   - 主级 investPrimary: navStore 信号, Header 直接读写
 *
 * 2026-07-14 (计划 §3 Phase 1): 基金二级 tab 由 全部/自选 改为 概览/列表/交易.
 *   fundView (全部/自选) 仍保留, 由列表页内部作为次级筛选呈现 (FundCategoryTabs),
 *   Header 不再渲染, 避免与 fundPage 双 tab 重叠.
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

// 计划 §1.2 / Phase 1: 二级 tab 改为 概览 / 列表
// 2026-07-14: 第三项「交易 / 记账」已移除 (无下单/记账需求), 保留两个 tab.
export const FUND_VIEW_TABS = [
  { key: "dashboard", label: "概览" },
  { key: "list", label: "列表" },
];

export const STOCK_VIEW_TABS = [
  { key: "screen", label: "筛选" },
  { key: "diagnosis", label: "个股分析" },
];

// ponytail: 投资三模块搜索维度不同 (基金搜代码/名称、金属无搜索、选股有独立搜索框),
//   不强行合并, 各模块内部搜索框保留, Header 不渲染 search. 副标题「更新于 xxx」二期再接.
//
// ponytail 2026-07-13: 主级 sub-tab 接 ←/→ 键盘导航 (WAI-ARIA tablist pattern).
//   header 容器 onKeyDown 捕获, 根据当前 primary 找下/上一个 tab 写 investPrimary.
//   SubtabList 内部 button 自带 focus, 切完 primary 后用 querySelector 找到新 active button 并 focus.
function onHeaderKeyDown(e) {
  const target = e.currentTarget;
  const isInTablist =
    e.target && e.target.closest && e.target.closest('[role="tablist"]');
  if (!isInTablist) return;
  // 只在主级 (前缀 invest, 非 invest-sub) 上响应 — 二级 sub-tab 由它自己的 button onKeyDown 处理.
  const primaryList = target.querySelector('.invest-subtabs');
  if (!primaryList || !primaryList.contains(e.target)) return;
  const tabs = Array.from(primaryList.querySelectorAll('[role="tab"]'));
  const currentIdx = tabs.findIndex((b) => b === e.target);
  if (currentIdx === -1) return;
  let next = currentIdx;
  if (e.key === "ArrowRight") next = (currentIdx + 1) % tabs.length;
  else if (e.key === "ArrowLeft") next = (currentIdx - 1 + tabs.length) % tabs.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = tabs.length - 1;
  else return;
  e.preventDefault();
  if (next === currentIdx) return;
  const nextTab = tabs[next];
  if (nextTab) {
    setInvestPrimary(INVEST_PRIMARY_TABS[next].key);
    // 等 React/Preact 提交完 DOM 再 focus
    requestAnimationFrame(() => {
      const newActive = primaryList.querySelector('[role="tab"]');
      // 找 index=next 的那个 (setInvestPrimary 后 active 重渲染)
      const refreshed = Array.from(
        primaryList.querySelectorAll('[role="tab"]'),
      );
      const targetBtn = refreshed[next];
      if (targetBtn) targetBtn.focus();
      else void newActive;
    });
  }
}

export function InvestLayoutHeader({
  fundPage,
  onFundPageChange,
  onRefresh,
  refreshing,
}) {
  const primary = investPrimary.value;
  return (
    <header class="invest-header" onKeyDown={onHeaderKeyDown}>
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
            activeKey={fundPage}
            onChange={onFundPageChange}
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
