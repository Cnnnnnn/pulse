/**
 * src/renderer/stocks/ResultTable.jsx
 *
 * 结果表格 — 列头可排序, 每行右侧 ⭐ 存自选.
 * 对照 spec §6.4. 涨跌用红绿 (A 股惯例: 红涨绿跌; 这里用项目既有 up/down 语义).
 */
import {
  results,
  loading,
  error,
  sortKey,
  sortDir,
  setSort,
  addWatchlist,
  removeWatchlist,
  isInWatchlist,
} from "./stockStore.js";
import { PanelEmpty } from "../components/EmptyState.jsx";

const COLUMNS = [
  { key: "name", label: "名称/代码", align: "left" },
  { key: "price", label: "现价", align: "right" },
  { key: "changePct", label: "涨跌%", align: "right" },
  { key: "pe", label: "PE", align: "right" },
  { key: "roe", label: "ROE%", align: "right" },
  { key: "industry", label: "行业", align: "left" },
];

export function ResultTable({ api }) {
  const rows = results.value || [];
  const sk = sortKey.value;
  const sd = sortDir.value;
  const isLoading = loading.value;
  const err = error.value;

  function toggleStar(code) {
    if (isInWatchlist(code)) removeWatchlist(api, code);
    else addWatchlist(api, code);
  }

  if (err) {
    return (
      <div class="stock-table-error">行情接口暂时不可用: {err}</div>
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
    <div class="stock-table">
      <div class="stock-table-head">
        {COLUMNS.map((col) => (
          <span
            key={col.key}
            class={`stock-th stock-th-${col.align}${
              sk === col.key ? " sorted" : ""
            }`}
            onClick={() => setSort(col.key)}
          >
            {col.label}
            {sk === col.key ? (sd === "desc" ? " ▼" : " ▲") : ""}
          </span>
        ))}
        <span class="stock-th stock-th-center">⭐</span>
      </div>
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
          <span class="stock-td stock-td-center">
            <button
              type="button"
              class={`stock-star${isInWatchlist(r.code) ? " active" : ""}`}
              onClick={() => toggleStar(r.code)}
              aria-label="存自选"
            >
              {isInWatchlist(r.code) ? "★" : "☆"}
            </button>
          </span>
        </div>
      ))}
      <div class="stock-table-foot">
        显示 {rows.length} 只{isLoading ? " · 加载中…" : ""}
      </div>
    </div>
  );
}

export default ResultTable;
