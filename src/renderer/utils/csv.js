/**
 * src/renderer/utils/csv.js
 *
 * 通用 CSV 下载工具 — 浏览器原生实现, 不引入第三方库.
 *
 * 设计:
 *   - UTF-8 BOM (让 Excel 正确识别中文)
 *   - CRLF 行分隔符 (Excel 友好)
 *   - 转义逗号/引号/换行 (RFC 4180)
 *   - 1s 后 revokeObjectURL 释放内存
 *
 * ponytail: 整段 < 40 行, 没拆 hook, 因为调用方只有 2 处 (FundDetail / FundList).
 *          等出现第三处调用再考虑抽 hook.
 */
export function downloadCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 2026-07-15: 文件名安全化 — 去掉路径分隔符 / 特殊字符, 防止下载异常
//   ponytail: 单行正则在所有现代浏览器都 OK, 不引入 lodash
export function safeFilename(s) {
  return String(s || "fund")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}