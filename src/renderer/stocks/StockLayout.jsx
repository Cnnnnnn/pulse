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
 *
 * 投资 nav 合并 (2026-07-13) R2: 原 stock-header + stock-toolbar subtab 移除,
 *   迁到 InvestLayoutHeader (主级 InvestLayoutHeader 二级 subtab).
 *   StockContent 不再渲染 nav-level 控件, 只渲染 panel body + 静默刷新 + drawer.
 */
import { useEffect } from "preact/hooks";
import { StrategyBar } from "./StrategyBar.jsx";
import { CriteriaPanel } from "./CriteriaPanel.jsx";
import { ResultTable } from "./ResultTable.jsx";
import { AiAdviseDrawer } from "./AiAdviseDrawer.jsx";
import { CompareDrawer } from "./CompareDrawer.jsx";
import { ComparePoolButton } from "./ComparePoolButton.jsx";
import { IconSearch, IconSparkles } from "../components/icons.jsx";
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

// ponytail 2026-07-08 UX-2: subtab 键盘导航 (WAI-ARIA tablist pattern). ←→ 切相邻,
//   Home/End 跳首尾. 只在 tablist 内的 tab 元素上接收.
//   测试兼容: happy-dom 的 fireEvent.keyDown 不一定带 currentTarget, 用 closest 兜底.
//
// 2026-07-13: StockContent 不再渲染 subtab 控件, 此函数保留供 InvestLayoutHeader (Task 4)
//   主级 subtab 接管时复用 (R2/N1).
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
  if (next === currentIdx) return;
  if (tabs[next]) {
    tabs[next].focus();
    tabs[next].click();
  }
}

// ponytail: 导出 onSubtabKeyDown 给 Task 14 (键盘导航) 复用.
export { onSubtabKeyDown };

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 投资 nav 合并 (2026-07-13) R2: StockContent 不再渲染 stock-header / stock-toolbar subtab,
 * 二级 subtab 由 InvestLayoutHeader (Task 4) 接管, 单一真相是 stockActiveTab signal.
 * 保留功能: 筛选/AI 按钮下移到工具位, 静默刷新 effect 保留, drawer 保留.
 */
export function StockContent() {
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

  const tab = stockActiveTab.value; // 订阅 — InvestLayoutHeader 二级 tab 改它
  const ts = fetchedAt.value;

  return (
    <div class="stock-layout">
      <div class="stock-toolbar-actions">
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
        {ts && (
          <span class="stock-toolbar-ts" aria-label="最后更新时间">
            更新于 {fmtTime(ts)}
          </span>
        )}
      </div>
      {tab === "diagnosis" ? (
        <div id="stock-panel-diagnosis" role="tabpanel">
          <StockDiagnosisPage api={api} />
        </div>
      ) : (
        <div
          id="stock-panel-screen"
          role="tabpanel"
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

// ponytail: StockLayout 保留为 (data loading + StockContent) 复合 wrapper,
//   以备将来单独作为顶级 nav panel 使用; InvestLayout 直接 import StockContent (跳过 wrapper).
export function StockLayout() {
  return <StockContent />;
}

export default StockLayout;