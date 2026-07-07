/**
 * src/renderer/stocks/StockLayout.jsx
 *
 * 选股 tab 容器 (对照 FundLayout). 两个子 tab (照搬世界杯 segmented control):
 *   - screen      筛选 (StrategyBar + CriteriaPanel + ResultTable)
 *   - diagnosis   个股分析 (StockSearchInput + StockDiagnosisPage)
 *
 * 子 tab 由 stockActiveTab signal 控制; 个股分析 tab 顶部搜索框 + ResultTable 行内
 * 诊断按钮都调 openDiagnosis(code) (它切到 diagnosis tab 并设 stockDiagnosisCode).
 *
 * 布局: 极简留白 — 顶栏只剩「标题 + 副标题(更新时间) + 主操作(筛选)」, AI 推荐
 * 收纳到表格栏的工具位, 不抢顶部视线. subtab segmented control 跟工具栏同行.
 *
 * 注意: 进 tab 不自动筛选 (避免进 tab 就打接口), 用户手动点筛选.
 */
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import { AiAdviseDrawer } from "./AiAdviseDrawer.jsx";
import { IconSearch, IconSparkles, IconTrendingUp } from "../components/icons.jsx";
import { stockActiveTab } from "./diagnosisStore.js";
import { StockDiagnosisPage } from "./StockDiagnosisPage.jsx";
import {
  runScreen,
  fetchedAt,
  loading,
  openAdvise,
  aiAdviseOpen,
} from "./stockStore.js";
import { api } from "../api.js";

const STOCK_SUBTABS = [
  { key: "screen", label: "筛选" },
  { key: "diagnosis", label: "个股分析" },
];

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
      <header class="stock-header">
        <div class="stock-header-titles">
          <h1 class="stock-title">
            <IconTrendingUp size={18} />
            <span>选股</span>
          </h1>
          <p class="stock-subtitle">A股 · 沪深 · 更新于 {fmtTime(ts)}</p>
        </div>
        <div class="stock-header-actions">
          <button
            type="button"
            class="stock-btn-icon"
            disabled={loading.value}
            onClick={() => openAdvise()}
            aria-label="AI 推荐筛选条件"
            title="AI 推荐筛选条件"
          >
            <IconSparkles size={16} />
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
      </header>

      <div class="stock-toolbar">
        <div class="stock-subtabs">
          {STOCK_SUBTABS.map((t) => (
            <button
              key={t.key}
              class={`stock-subtab${stockActiveTab.value === t.key ? " stock-subtab-active" : ""}`}
              onClick={() => (stockActiveTab.value = t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {stockActiveTab.value === "diagnosis" ? (
        <StockDiagnosisPage api={api} />
      ) : (
        <div class="stock-body">
          <div class="stock-filters">
            <StrategyBar />
            <CriteriaPanel />
          </div>
          <div class={aiAdviseOpen.value ? "stock-results stock-results-pad-drawer" : "stock-results"}>
            <ResultTable api={api} />
          </div>
        </div>
      )}
      <AiAdviseDrawer api={api} />
    </div>
  );
}

export default StockLayout;