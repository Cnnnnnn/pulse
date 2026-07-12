/**
 * src/funds/pnlCsv.js
 *
 * 阶段 B (蓝图 §3.5): 盈亏记录 CSV 导出. 纯前端, 零依赖.
 *
 *  - buildPnlCsv(rows): 纯函数, 生成带 UTF-8 BOM 的 CSV 字符串 (便于单测).
 *  - exportPnlCsv(rows, month): 触发浏览器下载 (Blob + URL.createObjectURL
 *    + 临时 <a download>), 测试环境 (无 document) 安全 no-op.
 *
 * 数值口径 (主理人决策 #2 — 零依赖; 裸数值便于 Excel 直接计算):
 *  - 当日盈亏 / 市值: 2 位小数带符号 (+/-).
 *  - 收益率: 带符号不带 %.
 * 表头与 FundPnlHistory 完全一致: 日期,当日盈亏,收益率,市值.
 * 日期用原始 YYYY-MM-DD 字符串, 便于 Excel 解析.
 *
 * 模块风格与 fundCalc.js 一致 (CJS module.exports), 供 renderer 组件 ESM
 * import 与 vitest 共用, 确保 build:renderer 打包通过.
 *
 * @module
 */

const CSV_HEADER = "日期,当日盈亏,收益率,市值";

function signed2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function signedPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  // 收益率: 带符号, 不带 %.
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

/**
 * 生成 CSV 字符串 (首字节 UTF-8 BOM).
 * 容错: rows 非数组 / 字段缺失 按空串处理, 不抛错.
 * @param {Array<{date?:any, todayProfit?:number, dayReturnPct?:number, totalMarketValue?:number}>} rows
 * @returns {string}
 */
function buildPnlCsv(rows) {
  const data = Array.isArray(rows) ? rows : [];
  const body = data.map((r) =>
    [
      r && r.date != null ? String(r.date) : "",
      signed2(r && r.todayProfit),
      signedPct(r && r.dayReturnPct),
      signed2(r && r.totalMarketValue),
    ].join(","),
  );
  // UTF-8 BOM: 让 Excel 正确识别中文列头 (蓝图 §7).
  return "﻿" + [CSV_HEADER, ...body].join("\n");
}

/**
 * 触发浏览器下载. 无 DOM (测试) 环境直接返回, 不触发副作用.
 * @param {Array} rows
 * @param {string} month  "YYYY-MM"
 */
function exportPnlCsv(rows, month) {
  if (typeof document === "undefined") return; // 非 DOM 环境 (测试) 直接退出
  const csv = buildPnlCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `基金盈亏_${month || "history"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 释放 object URL (setTimeout 避免某些浏览器下载被截断)
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

module.exports = { buildPnlCsv, exportPnlCsv };
