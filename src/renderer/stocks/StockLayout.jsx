/**
 * src/renderer/stocks/StockLayout.jsx
 *
 * 选股 tab 容器 (对照 FundLayout).
 * mount: loadWatchlist + 订阅自选股行情推送 + 初始拉一次行情.
 * 注意: 进 tab 不自动筛选 (避免进 tab 就打接口), 用户手动点 🔍.
 */
import { useEffect } from "preact/hooks";
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import {
  runScreen,
  loadWatchlist,
  subscribeWatchlistQuotes,
  refreshWatchlistQuotes,
  fetchedAt,
} from "./stockStore.js";
import { api } from "../api.js";

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function StockLayout() {
  useEffect(() => {
    void loadWatchlist(api);
    const unsub = subscribeWatchlistQuotes(api);
    void refreshWatchlistQuotes(api);
    return () => {
      try {
        unsub && unsub();
      } catch {
        /* noop */
      }
    };
  }, []);

  const ts = fetchedAt.value;

  return (
    <div class="stock-layout">
      <div class="stock-header">
        <div class="stock-header-left">
          <span class="stock-title">📈 选股</span>
          <span class="stock-market-tag">A股 · 沪深</span>
        </div>
        <div class="stock-header-right">
          <span class="stock-updated">更新于 {fmtTime(ts)}</span>
          <button
            type="button"
            class="stock-btn stock-btn-primary"
            onClick={() => runScreen(api)}
          >
            🔍 筛选
          </button>
        </div>
      </div>
      <StrategyBar />
      <CriteriaPanel />
      <ResultTable api={api} />
    </div>
  );
}

export default StockLayout;
