/**
 * src/funds/pnlCsv.js
 *
 * 阶段 B (蓝图 §3.5): 盈亏记录 CSV 导出. 纯前端, 零依赖.
 *
 *  - buildPnlCsv(rows): 纯函数, 生成带 UTF-8 BOM 的 CSV 字符串 (便于单测).
 *  - exportPnlCsv(rows, month): 触发浏览器下载 (Blob + URL.createObjectURL
 *    + 临时 <a download>), 测试环境 (无 document) 安全 no-op.
 *
 * 数值口径 (PRD B1-4): 与 UI 表头一致, 金额走 fmtCurrency ("+¥123.45"),
 *                     收益率走 fmtPct ("+1.23%"). format.js 单一来源, 不漂移.
 * 表头与 FundPnlHistory 完全一致: 日期,当日盈亏,收益率,市值.
 * 日期用原始 YYYY-MM-DD 字符串, 便于 Excel 解析.
 *
 * 模块风格与 fundCalc.js 一致 (CJS module.exports), 供 renderer 组件 ESM
 * import 与 vitest 共用, 确保 build:renderer 打包通过.
 *
 * @module
 */

const { fmtCurrency, fmtPct } = require("./format.js");

const CSV_HEADER = "日期,当日盈亏,收益率,市值";

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
      fmtCurrency(r && r.todayProfit),
      fmtPct(r && r.dayReturnPct),
      fmtCurrency(r && r.totalMarketValue),
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