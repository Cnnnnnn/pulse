/**
 * src/renderer/stocks/StockLayout.jsx
 *
 * 选股 tab 容器 (对照 FundLayout).
 * 注意: 进 tab 不自动筛选 (避免进 tab 就打接口), 用户手动点筛选.
 *
 * Phase 32: 个股 AI 分析抽屉 (StockDetailDrawer) 挂这里, 不再独立 nav.
 * 顶栏 "AI 个股" 按钮打开抽屉, 抽屉自带搜索输入让用户选股.
 */
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import { AiAdviseDrawer } from "./AiAdviseDrawer.jsx";
import { StockDetailDrawer } from "./StockDetailDrawer.jsx";
import { IconSearch, IconSparkles, IconTrendingUp } from "../components/icons.jsx";
import { detailOpen } from "./stockDetailStore.js";
import {
  runScreen,
  fetchedAt,
  loading,
  openAdvise,
  aiAdviseOpen,
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
  const ts = fetchedAt.value;

  return (
    <div class="stock-layout">
      <div class="stock-header">
        <div class="stock-header-left">
          <span class="stock-title"><IconTrendingUp size={14} /> 选股</span>
          <span class="stock-market-tag">A股 · 沪深</span>
        </div>
        <div class="stock-header-right">
          <span class="stock-updated">更新于 {fmtTime(ts)}</span>
          <button
            type="button"
            class="stock-btn stock-btn-secondary"
            onClick={() => { detailOpen.value = true; }}
            aria-label="AI 个股分析"
            data-testid="stock-detail-open"
          >
            <IconSparkles size={14} /> AI 个股
          </button>
          <button
            type="button"
            class="stock-btn stock-btn-secondary stock-btn-ai"
            disabled={loading.value}
            onClick={() => openAdvise()}
            aria-label="AI 推荐筛选条件"
          >
            <IconSparkles size={14} /> AI 推荐
          </button>
          <button
            type="button"
            class="stock-btn stock-btn-primary"
            disabled={loading.value}
            onClick={() => runScreen(api)}
          >
            {loading.value ? "筛选中…" : (<><IconSearch size={14} /> 筛选</>)}
          </button>
        </div>
      </div>
      <StrategyBar />
      <CriteriaPanel />
      <div class={aiAdviseOpen.value ? "stock-results-pad-drawer" : detailOpen.value ? "stock-detail-pad-drawer" : ""}>
        <ResultTable api={api} />
      </div>
      <AiAdviseDrawer api={api} />
      <StockDetailDrawer api={api} />
    </div>
  );
}

export default StockLayout;