/**
 * src/renderer/funds/FundLayout.jsx
 *
 * v2.10+ 基金管理 — Layout 容器 (跟 WorldcupLayout 同级, 完全独立).
 *
 * 顶部: FundHeader (总览卡片 + 工具栏 + 搜索框)
 * 中间: CategoryTabs (全部 / 股票 / 债券 / 货币 / QDII / 其他)
 * 主体: FundList (rows) | 空状态
 * Modal: AddFundModal (添加 / 编辑)
 *
 * mount 时:
 *   - loadFunds (启动拉 holdings)
 *   - loadNavState (启动拉 scheduler 状态)
 *   - subscribeNavUpdates (订阅主进程推送)
 */

import { useEffect, useState } from 'preact/hooks';
import { FundHeader } from './FundHeader.jsx';
import { FundMainTabs } from './FundMainTabs.jsx';
import { FundPnlHistory } from './FundPnlHistory.jsx';
import { CategoryTabs } from './CategoryTabs.jsx';
import { FundList } from './FundList.jsx';
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
  const [mainTab, setMainTab] = useState('holdings');

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
    <div class="fund-layout">
      <FundHeader onRefresh={() => fetchNavNow(api)} />
      <FundMainTabs active={mainTab} onChange={setMainTab} />
      <div class="fund-layout-main">
        {mainTab === 'holdings' ? (
          <>
            <CategoryTabs />
            <FundList />
          </>
        ) : (
          <FundPnlHistory layout="page" />
        )}
      </div>
      {addModalOpen.value && <AddFundModal />}
      {alertModalOpen.value && <FundAlertModal />}
    </div>
  );
}

export default FundLayout;