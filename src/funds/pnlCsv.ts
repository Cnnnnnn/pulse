/**
 * src/funds/pnlCsv.ts
 *
 * 阶段 B (蓝图 §3.5): 盈亏记录 CSV 导出. 纯前端, 零依赖.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

import { fmtCurrency, fmtPct } from "./format";

const CSV_HEADER = "日期,当日盈亏,收益率,市值";

/**
 * 生成 CSV 字符串 (首字节 UTF-8 BOM).
 * 容错: rows 非数组 / 字段缺失 按空串处理, 不抛错.
 */
export function buildPnlCsv(rows: any) {
  const data = Array.isArray(rows) ? rows : [];
  const body = data.map((r: any) =>
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
 */
export function exportPnlCsv(rows: any, month: any) {
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
