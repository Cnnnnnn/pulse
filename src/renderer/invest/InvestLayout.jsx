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
 *
 * ponytail: 基金 + 金属的数据加载 effect 之前分散在各自 Layout wrapper,
 *   Content 拆分后没有 mount/unmount 触发的副作用入口; 上版本在 FundContent 注释里
 *   谎称 "InvestLayout 接管",但实际漏了基金的 effect —— 切到基金 tab 全是空白.
 *   这里统一搬到 InvestLayout,cleanup 也绑到外层 useEffect 的返回.
 *   选股不需要 (StockContent 内部 start/stopRefreshTimer)。
 */
import { useEffect } from "preact/hooks";
import "./InvestLayout.css";
import { investPrimary } from "../worldcup/navStore.js";
import { refreshActiveNav } from "../nav-refresh.js";
import {
  fundView,
  fundsLoading,
  loadFunds,
  loadNavState,
  loadFundHistory,
  fetchNavNow,
  subscribeNavUpdates,
  prefetchAllNavHistory,
} from "../funds/fundStore.js";
import { metalsRefreshing } from "../metals/metalStore.js";
import { api } from "../api.js";
import { FundContent } from "../funds/FundLayout.jsx";
import { MetalContent } from "../metals/MetalLayout.jsx";
import { StockContent } from "../stocks/StockLayout.jsx";
import { InvestLayoutHeader } from "./InvestLayoutHeader.jsx";

export function InvestLayout() {
  // 基金数据加载 — 一次 mount, 写 cleanup 到 useEffect return.
  // 之前依赖 FundLayout wrapper; 现在 InvestLayout 是顶级 mount, 在这里订阅主进程推送 + 预拉.
  useEffect(() => {
    const unsub = subscribeNavUpdates(api);
    void loadFunds(api);
    void loadNavState(api);
    void loadFundHistory(api);
    void fetchNavNow(api);
    void prefetchAllNavHistory(api);
    return () => {
      try {
        unsub && unsub();
      } catch {
        /* noop */
      }
    };
  }, []);

  // 金属数据加载 — 动态 import 拿到 init/cleanup,接到外层 useEffect return.
  // metalStore 内部 cleanup 幂等 (listener null 检查), 所以即使 cleanup 跑多次也是安全的.
  useEffect(() => {
    if (typeof window === "undefined" || !window.metalsApi) return undefined;
    let cancelled = false;
    let cleanupStore = null;
    import("../metals/metalStore.js").then((mod) => {
      if (cancelled) return;
      cleanupStore = () => mod.cleanupMetalStore();
      void mod.initMetalStore();
    });
    return () => {
      cancelled = true;
      if (cleanupStore) {
        try {
          cleanupStore();
        } catch {
          /* noop */
        }
      }
    };
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
