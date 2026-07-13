import { useEffect } from 'preact/hooks';
import { FundHero } from './FundHero.jsx';
import { CategoryTabs } from './CategoryTabs.jsx';
import { FundCardGrid } from './FundCardGrid.jsx';
import { FundPnlHistory } from './FundPnlHistory.jsx';
import { AddFundModal } from './AddFundModal.jsx';
import { FundAlertModal } from './FundAlertModal.jsx';
import {
  loadFunds,
  loadNavState,
  loadFundHistory,
  subscribeNavUpdates,
  fetchNavNow,
  prefetchAllNavHistory,
  addModalOpen,
  alertModalOpen,
} from './fundStore.js';
import { api } from '../api.js';

// ponytail: 投资 nav 合并 (2026-07-13) — 原 FundLayout 改为 FundContent,
//   nav-level 数据加载 effect 抽到 InvestLayout 统一触发 (避免 Content 卸载重 mount 重复加载).
//   保留 FundLayout export 以兼容旧 LazyNavPanel 引用 (Phase A 已删除, 但保留无害).
export function FundContent() {
  // Content 自身不再触发数据加载 — InvestLayout 接管.
  // CategoryTabs / FundCardGrid / FundPnlHistory / Modal 全在 FundContent 渲染.
  return (
    <div class="fund-layout fund-layout--dashboard">
      <FundHero />
      <CategoryTabs />
      <FundCardGrid />
      <FundPnlHistory layout="panel" />
      {addModalOpen.value && <AddFundModal />}
      {alertModalOpen.value && <FundAlertModal />}
    </div>
  );
}

// ponytail: FundLayout 保留为 (data loading effect + FundContent) 复合 wrapper,
//   以备将来单独作为顶级 nav panel 使用; InvestLayout 直接 import FundContent (跳过 wrapper).
export function FundLayout() {
  useEffect(() => {
    const unsub = subscribeNavUpdates(api);
    void loadFunds(api);
    void loadNavState(api);
    void loadFundHistory(api);
    void fetchNavNow(api);
    void prefetchAllNavHistory(api);
    return () => {
      try { unsub && unsub(); } catch { /* noop */ }
    };
  }, []);

  return <FundContent />;
}
export default FundLayout;
