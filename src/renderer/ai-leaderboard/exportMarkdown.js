/**
 * src/renderer/ai-leaderboard/exportMarkdown.js
 *
 * v3.0 导出工具：将当前表格/对比数据生成 Markdown 表格并复制到剪贴板。
 */

import { VENDOR_META } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtValueRatio } from "./format.js";

/**
 * 生成当前视角表格的 Markdown。
 * @param {object} opts
 * @param {Array} opts.rows - 当前展示的模型列表
 * @param {string} opts.view - "arena" | "aa"
 * @param {string} [opts.board] - Arena board key
 * @returns {string} Markdown 表格
 */
export function tableToMarkdown({ rows, view, board }) {
  const vendorLabel = (m) => (VENDOR_META[m.vendor] || {}).label || m.vendor;

  if (view === "arena") {
    const header = "| # | 模型 | 厂商 | ELO | 置信区间 |";
    const sep = "|---|------|------|-----|----------|";
    const lines = rows.map((m, i) => {
      const slice = m.arena && m.arena[board];
      const elo = slice && typeof slice.score === "number" ? Math.round(slice.score) : "—";
      const ci = slice && slice.ci != null ? `±${Math.round(slice.ci)}` : "—";
      return `| ${i + 1} | ${m.name} | ${vendorLabel(m)} | ${elo} | ${ci} |`;
    });
    return [header, sep, ...lines].join("\n");
  }

  // AA view
  const header = "| # | 模型 | 厂商 | 智能指数 | 代码 | Agent | 速度 | 输出价 | 性价比 |";
  const sep = "|---|------|------|----------|------|-------|------|--------|--------|";
  const lines = rows.map((m, i) => {
    const aa = m.aa || {};
    return `| ${i + 1} | ${m.name} | ${vendorLabel(m)} | ${fmtIndex(aa.intelligenceIndex)} | ${fmtIndex(aa.codingIndex)} | ${fmtIndex(aa.agenticIndex)} | ${fmtSpeed(aa.outputTokensPerSec)} | ${fmtPricePer1M(aa.priceOutputPer1M)} | ${fmtValueRatio(aa)} |`;
  });
  return [header, sep, ...lines].join("\n");
}

/**
 * 生成对比数据的 Markdown。
 * @param {object} opts
 * @param {Array} opts.models - 对比的模型列表
 * @param {Array} opts.rows - 对比行定义 [{label, get}]
 * @returns {string}
 */
export function compareToMarkdown({ models, rows }) {
  const names = models.map((m) => m.name);
  const header = `| 指标 | ${names.join(" | ")} |`;
  const sep = `|------|${names.map(() => "------").join("|")}|`;
  const lines = rows.map((row) => {
    const vals = models.map((m) => row.get(m));
    return `| ${row.label} | ${vals.join(" | ")} |`;
  });
  return [header, sep, ...lines].join("\n");
}

/**
 * 复制文本到剪贴板。
 * @param {string} text
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback: execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
