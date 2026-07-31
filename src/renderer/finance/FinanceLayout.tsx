/**
 * src/renderer/finance/FinanceLayout.tsx
 *
 * 财经模块顶层容器（接入 NewsLayout 的 finance sub-tab）。
 * 结构：MarketStrip（行情条）+ 列表 / 详情（按 financeSelectedId 切换）。
 */

import { useEffect } from "preact/hooks";
import {
  financeSelectedId,
  bootstrapFinance,
  cleanupFinanceUpdates,
} from "./financeStore.ts";
import { MarketStrip } from "./MarketStrip.tsx";
import { FinanceContent } from "./FinanceContent.tsx";
import { FinanceArticleView } from "./FinanceArticleView.tsx";
import "./finance.css";

export function FinanceLayout({ search }: { search?: string }) {
  useEffect(() => {
    void bootstrapFinance();
    return () => cleanupFinanceUpdates();
  }, []);

  const selectedId = financeSelectedId.value;

  return (
    <div class="finance-layout">
      <MarketStrip />
      {selectedId ? (
        <FinanceArticleView id={selectedId} />
      ) : (
        <FinanceContent search={search || ""} />
      )}
    </div>
  );
}

export default FinanceLayout;
