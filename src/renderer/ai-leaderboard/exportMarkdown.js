/**
 * src/renderer/ai-leaderboard/exportMarkdown.js
 *
 * v3.0 导出工具：将当前表格/对比数据生成 Markdown 表格并复制到剪贴板。
 */

import { VENDOR_META, ARENA_BOARDS } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtValueRatio, fmtLivebench, fmtLbCost, fmtVotes, licenseKind, licenseShort } from "./format.js";

/**
 * 生成当前视角表格的 Markdown。
 * @param {object} opts
 * @param {Array} opts.rows - 当前展示的模型列表
 * @param {string} opts.view - "arena" | "aa" | "livebench"
 * @param {string} [opts.board] - Arena board key
 * @returns {string} Markdown 表格
 */
export function tableToMarkdown({ rows, view, board }) {
  const vendorLabel = (m) => (VENDOR_META[m.vendor] || {}).label || m.vendor;

  if (view === "arena") {
    const boardMeta = ARENA_BOARDS[board] || ARENA_BOARDS.text;
    const boardName = boardMeta.key; // Arena board 名（text / vision / code / text-to-image / text-to-video）
    const header = "| # | 模型 | 厂商 | 许可 | ELO | 置信区间 | 票数 |";
    const sep = "|---|------|------|------|-----|----------|------|";
    const lines = rows.map((m, i) => {
      const slice = m.arena && m.arena[boardName];
      const elo = slice && typeof slice.score === "number" ? Math.round(slice.score) : "—";
      const ci = slice && slice.ci != null ? `±${Math.round(slice.ci)}` : "—";
      const votes = slice && typeof slice.votes === "number" ? slice.votes.toLocaleString() : "—";
      const lic = licenseShort(licenseKind(m.license));
      return `| ${i + 1} | ${m.name} | ${vendorLabel(m)} | ${lic} | ${elo} | ${ci} | ${votes} |`;
    });
    return [header, sep, ...lines].join("\n");
  }

  if (view === "livebench") {
    const header = "| # | 模型 | 厂商 | 综合 | Coding | Language | 指令遵循 | $/成功 |";
    const sep = "|---|------|------|------|--------|----------|----------|--------|";
    const lines = rows.map((m, i) => {
      const lb = m.livebench || {};
      const byCat = lb.byCategory || {};
      return `| ${i + 1} | ${m.name} | ${vendorLabel(m)} | ${fmtLivebench(lb.overall)} | ${fmtLivebench(byCat.Coding)} | ${fmtLivebench(byCat.Language)} | ${fmtLivebench(byCat.IF)} | ${fmtLbCost(lb.cost && lb.cost.perSuccessfulTask)} |`;
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
 * 生成单个模型详情的 Markdown。
 * @param {object|null} model
 * @returns {string}
 */
export function detailToMarkdown(model) {
  if (!model) return "";
  const lines = [
    `# ${model.name}`,
    "",
    `- ID: \`${model.id}\``,
    `- 厂商: ${(VENDOR_META[model.vendor] || {}).label || model.vendor || "—"}`,
    `- 分类: ${model.category || "—"}`,
  ];
  if (model.isSample) lines.push("- 备注: 示例数据");
  lines.push("");

  for (const key of ["arena", "aa", "openrouter", "livebench", "modelsdev"]) {
    const slice = model[key];
    const source = (model.sources || {})[key] || "none";
    lines.push(`## ${key} (${source})`);
    if (!slice || (typeof slice === "object" && Object.keys(slice).length === 0)) {
      lines.push("_无数据_");
    } else {
      for (const [field, value] of Object.entries(slice)) {
        if (value == null || value === "") continue;
        lines.push(`- ${field}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
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
