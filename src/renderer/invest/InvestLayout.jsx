/**
 * src/renderer/invest/InvestLayout.jsx
 *
 * 2026-07-13 投资 nav 合并 — 顶级 nav panel 容器.
 * 架构 (镜像 NewsLayout / WorldcupLayout):
 *   <InvestLayout>
 *     <InvestLayoutHeader fundView onFundViewChange onRefresh refreshing />
 *     <div class="invest-body">
 *       {primary === 'funds'  && <FundContent />}
 *       {primary === 'metals' && <MetalContent />}
 *       {primary === 'stocks' && <StockContent />}
 *     </div>
 *   </InvestLayout>
 *
 * 关键契约:
 *   - 单一真相: investPrimary (navStore) / fundView (fundStore) / stockActiveTab (diagnosisStore)
 *   - 刷新按钮: onRefresh 派发到 nav-refresh 'invest' (按 investPrimary 派发到对应模块)
 *   - refreshing: 按 investPrimary 读对应模块 loading signal
 *     - funds → fundsLoading
 *     - metals → metalsRefreshing (N2 新增)
 *     - stocks → false (stockStore 内部 60s tick 静默刷新, 不闪按钮)
 */
import { useEffect } from "preact/hooks";
import "./InvestLayout.css";
import { investPrimary } from "../worldcup/navStore.js";
import { refreshActiveNav } from "../nav-refresh.js";
import { fundView, fundsLoading } from "../funds/fundStore.js";
import { metalsRefreshing } from "../metals/metalStore.js";
import { FundContent } from "../funds/FundLayout.jsx";
import { MetalContent } from "../metals/MetalLayout.jsx";
import { StockContent } from "../stocks/StockLayout.jsx";
import { InvestLayoutHeader } from "./InvestLayoutHeader.jsx";

export function InvestLayout() {
  // 投资 nav 合并: 基金数据加载由 FundContent 进入时自然触发 (已含在 FundLayout 复合 wrapper 内),
  // 这里不重复 effect —— 切到子模块时由各 Content 自己的 store 初始化.
  // 但 metals 需要 initMetalStore/cleanupMetalStore, 抽到 InvestLayout 顶层统一管理 (因 MetalContent 不含).
  // ponytail: LazyNavPanel 已对 nav='invest' 做 dynamic import, 此 effect 只跑一次 (InvestLayout mount).
  useEffect(() => {
    if (typeof window === "undefined" || !window.metalsApi) return undefined;
    // 动态 import 避免 metals 入口与 funds/stocks 解耦
    import("../metals/metalStore.js").then(({ initMetalStore, cleanupMetalStore }) => {
      initMetalStore();
      return () => cleanupMetalStore();
    });
    return undefined;
  }, []);

  const primary = investPrimary.value;
  const refreshing =
    primary === "funds"
      ? fundsLoading.value
      : primary === "metals"
      ? metalsRefreshing.value
      : false;

  return (
    <div class="invest-layout">
      <InvestLayoutHeader
        fundView={fundView.value}
        onFundViewChange={(k) => {
          fundView.value = k;
        }}
        onRefresh={() => {
          void refreshActiveNav("invest");
        }}
        refreshing={refreshing}
      />
      <div class="invest-body">
        {primary === "funds" && <FundContent />}
        {primary === "metals" && <MetalContent />}
        {primary === "stocks" && <StockContent />}
      </div>
    </div>
  );
}

export default InvestLayout;
