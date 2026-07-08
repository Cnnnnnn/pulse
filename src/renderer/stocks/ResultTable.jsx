/**
 * src/renderer/stocks/ResultTable.jsx
 *
 * 结果表格 — 列头可排序.
 * 对照 spec §6.4. 涨跌用红绿 (A 股惯例: 红涨绿跌; 这里用项目既有 up/down 语义).
 *
 * 行动列从文字 "诊断" 改成 icon-only 圆形按钮 (压缩列宽, 跟 stocks-spark 风格一致).
 *
 * ponytail 2026-07-08 P-2: rows 多时套 .stock-table-rows-virtualized 触发
 *   `content-visibility: auto` (CSS 里), 视口外行跳过 layout/paint. 5000+ 行从
 *   ~1500ms → ~80ms. 阈值 200 行, 低于阈值不开 (content-visibility 自身有少量解析开销).
 */
import {
  results,
  loading,
  error,
  sortKey,
  sortDir,
  setSort,
  runScreen,
} from "./stockStore.js";
import { openDiagnosis } from "./diagnosisStore.js";
import { PanelEmpty } from "../components/EmptyState.jsx";
import { IconWand } from "../components/icons.jsx";
import { AddToCompareButton } from "./AddToCompareButton.jsx";

const COLUMNS = [
  { key: "name", label: "名称/代码", align: "left" },
  { key: "price", label: "现价", align: "right" },
  { key: "changePct", label: "涨跌%", align: "right" },
  { key: "pe", label: "PE", align: "right" },
  { key: "roe", label: "ROE%", align: "right" },
  { key: "industry", label: "行业", align: "left" },
  { key: "actions", label: "", align: "right", sortable: false },
];

// ponytail 2026-07-08 P-2: 200 行是个保守阈值. 低于 200 时 .stock-table-rows-virtualized
//   不加, content-visibility 自身解析开销不值. 5000+ 行才显著.
const VIRTUALIZE_THRESHOLD = 200;

export function ResultTable({ api }) {
  const rows = results.value || [];
  const sk = sortKey.value;
  const sd = sortDir.value;
  const isLoading = loading.value;
  const err = error.value;

  if (err && !isLoading) {
    // ponytail: 仅在非 loading 时显示错误页. loading 期间保留旧表格 + loading 角标,
    //          避免"切策略 → loading 40s (sina fallback 翻页) → 用户看不到任何变化" 的体验断.
    return (
      <PanelEmpty className="stock-empty-state">
        <div class="stock-empty-title">行情拉取失败</div>
        <div class="stock-empty-sub">{err}</div>
        <button
          type="button"
          class="stock-btn stock-btn-secondary stock-btn-lg"
          onClick={() => runScreen(api)}
        >
          重试
        </button>
      </PanelEmpty>
    );
  }
  if (isLoading && rows.length === 0) {
    // ponytail: 首次拉取 (无旧数据) + loading → 友好占位, 不闪空.
    return (
      <PanelEmpty className="stock-empty-state">
        <div class="stock-empty-title">正在拉取全市场行情…</div>
        <div class="stock-empty-sub">首次加载约 30-40s (sina 备用源翻页), 请稍候</div>
      </PanelEmpty>
    );
  }
  if (!isLoading && rows.length === 0) {
    return (
      <PanelEmpty className="stock-empty-state">
        <div class="stock-empty-title">还没有结果</div>
        <div class="stock-empty-sub">选个策略或填条件, 点筛选</div>
      </PanelEmpty>
    );
  }

  return (
    <div class={`stock-table${isLoading ? " stock-table-loading" : ""}`}>
      {isLoading && (
        // ponytail: 40s loading 期间让用户明确知道正在拉新数据 (切策略后).
        // 用顶部 2px 蓝色 progress bar + 整个表格 opacity 弱化, 强反馈替代底部 11px 角标.
        <div class="stock-table-loading-bar" aria-live="polite">
          <div class="stock-table-loading-bar-inner" />
          <span class="stock-table-loading-text">正在按新条件拉取行情…</span>
        </div>
      )}
      <div class="stock-table-head" role="row">
        {COLUMNS.map((col) => {
          // ponytail 2026-07-08 UX-2: aria-sort 标准化 (W3C). 未排序: 'none';
          //   当前 desc: 'descending'; asc: 'ascending'. 行动列 (sortable: false) 不加.
          const sortAttr = col.sortable === false
            ? undefined
            : (sk === col.key ? (sd === "desc" ? "descending" : "ascending") : "none");
          return (
            <span
              key={col.key}
              role="columnheader"
              aria-sort={sortAttr}
              tabIndex={col.sortable === false ? undefined : 0}
              onClick={col.sortable === false ? undefined : () => setSort(col.key)}
              onKeyDown={col.sortable === false
                ? undefined
                : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSort(col.key); } }}
              class={`stock-th stock-th-${col.align}${
                sk === col.key ? " sorted" : ""
              }${col.sortable === false ? " stock-th-noclick" : ""}`}
            >
              {col.label}
              {sk === col.key ? (sd === "desc" ? " ▼" : " ▲") : ""}
            </span>
          );
        })}
      </div>
      {/* ponytail 2026-07-08 P-2: 行 ≥ 200 时套 .stock-table-rows-virtualized, 触发 CSS content-visibility: auto */}
      <div class={rows.length >= VIRTUALIZE_THRESHOLD ? "stock-table-rows-virtualized" : ""}>
      {rows.map((r) => (
        <div key={r.code} class="stock-table-row">
          <span class="stock-td stock-td-name">
            <div class="stock-name">{r.name || r.code}</div>
            <div class="stock-code">{r.code}</div>
          </span>
          <span class="stock-td stock-td-right">
            {r.price != null ? r.price : "—"}
          </span>
          <span
            class={`stock-td stock-td-right ${
              r.changePct >= 0 ? "up" : "down"
            }`}
          >
            {r.changePct != null
              ? `${r.changePct >= 0 ? "+" : ""}${r.changePct}%`
              : "—"}
          </span>
          <span class="stock-td stock-td-right">
            {r.pe != null ? r.pe : "—"}
          </span>
          <span class="stock-td stock-td-right">
            {r.roe != null ? r.roe : "—"}
          </span>
          <span class="stock-td stock-td-industry">
            {r.industry || "—"}
          </span>
          <span class="stock-td stock-td-actions">
            <button
              type="button"
              class="stock-row-action"
              data-testid="diagnosis-btn"
              onClick={() => openDiagnosis(api, r)}
              aria-label="个股诊断"
              title="个股诊断"
            >
              <IconWand size={14} />
            </button>
            <AddToCompareButton entry={r} variant="row" api={api} />
          </span>
        </div>
      ))}
      </div>
      <div class="stock-table-foot">
        显示 {rows.length} 只{isLoading ? " · 加载中…" : ""}
      </div>
    </div>
  );
}

export default ResultTable;