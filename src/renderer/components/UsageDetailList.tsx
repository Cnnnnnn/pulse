/**
 * src/renderer/components/UsageDetailList.jsx
 *
 * 每日用量明细表 — 真实数据来自 snapshot.usageSummary.dateModelUsage
 * (90 天, 每天含 models[] + totals). 每行 = 一天, 展示:
 *   日期 / 总 token / 输入 / 输出 / 缓存命中 / 当日主模型.
 *
 * 能力:
 *   - 列排序 (aria-sort + 键盘可达的排序按钮)
 *   - 模型名搜索
 *   - 时间范围 (全部 / 近 30 天 / 近 7 天)
 *   - 只看活跃日 (total > 0)
 *   - CSV 导出 (当前 筛选+排序 结果)
 *   - 空态 / sticky 表头 / 焦点环 / prefers-reduced-motion
 *
 * 视觉: 全部引用主站系统令牌 (--surface / --border / --text-* / --accent-primary),
 * 跟随 data-theme; 模型色点复用 modelColor (--model-color-N). 无任何裸 hex.
 */

import { useMemo, useState } from "preact/hooks";
import { modelColorIndex } from "./modelColor.js";

/** 列定义. numeric 控制右对齐与排序语义. */
const COLUMNS = [
  { key: "date", label: "日期", numeric: false },
  { key: "total", label: "总 token", numeric: true },
  { key: "input", label: "输入", numeric: true },
  { key: "output", label: "输出", numeric: true },
  { key: "cacheHit", label: "缓存命中", numeric: true },
  { key: "topModel", label: "主模型", numeric: false },
];

/** 大数 → 千分位整数. 例: 12345678 → "12,345,678". */
function formatFull(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** CSV 单元格转义 (含逗号/引号/换行时加引号). */
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {Array<{date:string, models?:Array, totals?:object}>|null|undefined} dateModelUsage
 */
export function UsageDetailList({ dateModelUsage }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc"); // date desc = 新→旧
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all"); // all | "30" | "7"
  const [activeOnly, setActiveOnly] = useState(false);

  // 原始行: 每天聚合为一条 (取当日 token 最高模型作为主模型).
  const rows = useMemo(() => {
    if (!Array.isArray(dateModelUsage)) return [];
    const out = [];
    for (const d of dateModelUsage) {
      if (!d || typeof d.date !== "string") continue;
      const totals = d.totals || {};
      const models = Array.isArray(d.models) ? d.models : [];
      let top = null;
      let max = -1;
      for (const m of models) {
        const t = typeof m.totalToken === "number" ? m.totalToken : 0;
        if (t > max) {
          max = t;
          top = m.model;
        }
      }
      out.push({
        date: d.date,
        total: typeof totals.totalToken === "number" ? totals.totalToken : 0,
        input: typeof totals.inputToken === "number" ? totals.inputToken : null,
        output: typeof totals.outputToken === "number" ? totals.outputToken : null,
        cacheHit: typeof totals.cacheHitPercent === "number" ? totals.cacheHitPercent : null,
        topModel: top,
      });
    }
    return out;
  }, [dateModelUsage]);

  // 筛选 + 排序 (派生).
  const view = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => (r.topModel || "").toLowerCase().includes(q));
    if (activeOnly) out = out.filter((r) => r.total > 0);
    if (range !== "all") out = out.slice(-Number(range));

    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av == null) av = sortKey === "date" ? "" : -Infinity;
      if (bv == null) bv = sortKey === "date" ? "" : -Infinity;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return out;
  }, [rows, query, activeOnly, range, sortKey, sortDir]);

  // 无数据: 整块降级为空态 (由调用方控制 zone 是否渲染, 这里兜底).
  if (rows.length === 0) {
    return (
      <div class="ai-usage-detail">
        <div class="ai-usage-section-header">
          <span class="ai-usage-section-eyebrow">明细</span>
          <span class="ai-usage-section-title">每日用量明细</span>
        </div>
        <div class="ai-usage-detail-empty">暂无逐日用量数据</div>
      </div>
    );
  }

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 日期默认新→旧; 数值默认大→小; 文本默认 a→z
      setSortDir(key === "date" ? "desc" : key === "topModel" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const header = ["日期", "总token", "输入token", "输出token", "缓存命中率", "主模型"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of view) {
      lines.push(
        [
          r.date,
          r.total,
          r.input ?? "",
          r.output ?? "",
          r.cacheHit != null ? `${r.cacheHit}%` : "",
          r.topModel ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const csv = "﻿" + lines.join("\n"); // BOM 保证 Excel 正确识别 UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-detail-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sortIndicator = (key) =>
    key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div class="ai-usage-detail">
      <div class="ai-usage-section-header">
        <span class="ai-usage-section-eyebrow">明细</span>
        <span class="ai-usage-section-title">每日用量明细 · {rows.length} 天</span>
      </div>

      <div class="ai-usage-detail-toolbar">
        <div class="ai-usage-detail-search-wrap">
          <input
            class="ai-usage-detail-search"
            type="search"
            placeholder="按模型筛选…"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="按模型名筛选明细"
          />
        </div>

        <div class="ai-usage-detail-seg" role="group" aria-label="时间范围">
          {[
            ["all", "全部"],
            ["30", "近 30 天"],
            ["7", "近 7 天"],
          ].map(([v, lbl]) => (
            <button
              type="button"
              key={v}
              class={`ai-usage-detail-seg-btn${range === v ? " is-active" : ""}`}
              aria-pressed={range === v}
              onClick={() => setRange(v)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <label class="ai-usage-detail-toggle">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.currentTarget.checked)}
          />
          只看活跃日
        </label>

        <button type="button" class="ai-usage-detail-export" onClick={exportCsv}>
          导出 CSV
        </button>
      </div>

      <div class="ai-usage-detail-scroll">
        <table class="ai-usage-detail-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  class={`ai-usage-detail-th${c.numeric ? " is-num" : ""}`}
                  aria-sort={
                    sortKey === c.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    class="ai-usage-detail-sort"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    {sortIndicator(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                <td class="ai-usage-detail-empty" colSpan={COLUMNS.length}>
                  无匹配记录
                </td>
              </tr>
            ) : (
              view.map((r) => {
                const colorIdx = modelColorIndex(r.topModel);
                return (
                  <tr key={r.date} class="ai-usage-detail-row">
                    <td class="ai-usage-detail-date">{r.date}</td>
                    <td class="is-num ai-usage-detail-total">{formatFull(r.total)}</td>
                    <td class="is-num">
                      {r.input != null ? formatFull(r.input) : "—"}
                    </td>
                    <td class="is-num">
                      {r.output != null ? formatFull(r.output) : "—"}
                    </td>
                    <td class="is-num">
                      {r.cacheHit != null ? `${r.cacheHit}%` : "—"}
                    </td>
                    <td class="ai-usage-detail-model">
                      {r.topModel ? (
                        <>
                          <span
                            class="ai-usage-detail-dot"
                            style={{ "--dot": `var(--model-color-${colorIdx + 1})` }}
                            aria-hidden="true"
                          />
                          {r.topModel}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
