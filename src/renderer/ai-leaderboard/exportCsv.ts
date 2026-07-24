/**
 * src/renderer/ai-leaderboard/exportCsv.js
 *
 * AI 榜单 — CSV 序列化（纯函数，UTF-8 BOM 友好 Excel）。
 * 不引入 papaparse 等第三方库 —— 字段转义规则简单，~12 行。
 */

const UTF8_BOM = "\ufeff";

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * rows → CSV 字符串。
 * @param {object} opts
 * @param {Array<Record<string, any>>} opts.rows — 行数据
 * @param {Array<{key: string, header: string}>} opts.columns — 列定义（顺序与表头一致）
 * @returns {string} UTF-8 BOM + header + 多行 `\r\n` 分隔
 */
export function rowsToCsv({ rows, columns }) {
  const cols = Array.isArray(columns) ? columns : [];
  const list = Array.isArray(rows) ? rows : [];
  const header = cols.map((c) => csvCell(c && c.header != null ? c.header : (c && c.key) || "")).join(",");
  const body = list
    .map((row) =>
      cols.map((c) => csvCell(c && row ? row[c.key] : "")).join(","),
    )
    .join("\r\n");
  return UTF8_BOM + header + (body ? "\r\n" + body + "\r\n" : "\r\n");
}
