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
  addModalOpen,
  alertModalOpen,
} from './fundStore.js';
import { api } from '../api.js';

export function FundLayout() {
  useEffect(() => {
    const unsub = subscribeNavUpdates(api);
    void loadFunds(api);
    void loadNavState(api);
    void loadFundHistory(api);
    void fetchNavNow(api);
    return () => {
      try { unsub && unsub(); } catch { /* noop */ }
    };
  }, []);

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
export default FundLayout;
