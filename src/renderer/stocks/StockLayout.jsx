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
 *
 * ponytail 2026-07-08 UX-2: subtab 加 WAI-ARIA tablist 模式 — role=tablist/tab, aria-selected,
 *   aria-controls 指向 panel; 键盘 ← / → / Home / End 切换. 列头(在 ResultTable 里) 加
 *   aria-sort. 不引依赖 (HTML5 原生语义).
 */
import { useEffect } from "preact/hooks";
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import { AiAdviseDrawer } from "./AiAdviseDrawer.jsx";
import { CompareDrawer } from "./CompareDrawer.jsx";
import { ComparePoolButton } from "./ComparePoolButton.jsx";
import { IconSearch, IconSparkles, IconTrendingUp } from "../components/icons.jsx";
import { stockActiveTab } from "./diagnosisStore.js";
import { StockDiagnosisPage } from "./StockDiagnosisPage.jsx";
import {
  runScreen,
  runScreenSilent,
  fetchedAt,
  loading,
  openAdvise,
  aiAdviseOpen,
  results,
  silentRefreshTick,
  startRefreshTimer,
  stopRefreshTimer,
} from "./stockStore.js";
import { api } from "../api.js";

const STOCK_SUBTABS = [
  { key: "screen", label: "筛选", panelId: "stock-panel-screen" },
  { key: "diagnosis", label: "个股分析", panelId: "stock-panel-diagnosis" },
];

// ponytail 2026-07-08 UX-2: subtab 键盘导航 (WAI-ARIA tablist pattern). ←→ 切相邻,
//   Home/End 跳首尾. 只在 tablist 内的 tab 元素上接收.
//   测试兼容: happy-dom 的 fireEvent.keyDown 不一定带 currentTarget, 用 closest 兜底.
function onSubtabKeyDown(e, currentIdx) {
  const tab = e.currentTarget || e.target;
  const list = (tab && tab.closest) ? tab.closest('[role="tablist"]') : null;
  if (!list) return;
  const tabs = list.querySelectorAll('[role="tab"]');
  let next = currentIdx;
  if (e.key === "ArrowRight") next = (currentIdx + 1) % tabs.length;
  else if (e.key === "ArrowLeft") next = (currentIdx - 1 + tabs.length) % tabs.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = tabs.length - 1;
  else return;
  e.preventDefault();
  if (next === currentIdx) return; // 当前已是目标, 不重复触发 click
  if (tabs[next]) {
    tabs[next].focus();
    tabs[next].click();
  }
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function StockLayout() {
  const ts = fetchedAt.value;
  // ponytail 2026-07-08 D-6: 静默刷新 — 监听 stockStore.silentRefreshTick (60s +1).
  //   触发就调 runScreen (主进程 60s cache TTL 命中 → 0 网络 / cache miss → P-1 后 9s 重拉).
  //   失败仍由 runScreen 内部 try/catch 静默处理. 不闪 loading bar, 不清空 results.
  useEffect(() => {
    if (!api || !api.stocksScreen) return undefined;
    startRefreshTimer();
    const _tick = silentRefreshTick.value; // 订阅
    void _tick;
    return () => stopRefreshTimer();
  }, [api]);

  // ponytail 2026-07-08 D-6: 静默 refresh tick 触发 — 调 runScreenSilent, 不闪 loading 角标.
  //   用 results 非空作判断 (没结果时调没意义); criteria/sort 直接用 store 当前值.
  useEffect(() => {
    const tick = silentRefreshTick.value;
    if (!tick) return; // 首次 mount 时跳过 (tick=0 默认)
    if (!api || !api.stocksScreen) return;
    if (!Array.isArray(results.value) || results.value.length === 0) return;
    runScreenSilent(api);
  }, [silentRefreshTick.value]);

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
        <div class="stock-subtabs" role="tablist" aria-label="选股视图切换">
          {STOCK_SUBTABS.map((t, idx) => {
            const active = stockActiveTab.value === t.key;
            return (
              <button
                key={t.key}
                id={`stock-tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={t.panelId}
                tabIndex={active ? 0 : -1}
                class={`stock-subtab${active ? " stock-subtab-active" : ""}`}
                onClick={() => (stockActiveTab.value = t.key)}
                onKeyDown={(e) => onSubtabKeyDown(e, idx)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {stockActiveTab.value === "diagnosis" ? (
        <div id="stock-panel-diagnosis" role="tabpanel" aria-labelledby="stock-tab-diagnosis">
          <StockDiagnosisPage api={api} />
        </div>
      ) : (
        <div
          id="stock-panel-screen"
          role="tabpanel"
          aria-labelledby="stock-tab-screen"
          class="stock-body"
        >
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
      <CompareDrawer api={api} />
      <ComparePoolButton />
    </div>
  );
}

export default StockLayout;