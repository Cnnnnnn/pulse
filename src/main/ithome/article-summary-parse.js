/**
 * src/main/ithome/article-summary-parse.js
 *
 * 从 IT 新闻 AI 总结文本解析结构化字段
 */

const FIELD_PATTERNS = [
  { key: "abstract", re: /^(摘要|概括|简述)[:：]\s*(.+)$/ },
  { key: "keywords", re: /^(关键词|关键字|标签)[:：]\s*(.+)$/ },
  { key: "domain", re: /^(所属领域|领域|分类|赛道)[:：]\s*(.+)$/ },
  { key: "impact", re: /^(影响方面|影响|对哪些方面有影响)[:：]\s*(.+)$/ },
];

function splitKeywords(raw) {
  return String(raw || "")
    .split(/[,，、;；|/]\s*/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * @param {string} text
 * @returns {{ abstract: string, keywords: string[], domain: string, impact: string }}
 */
function parseArticleSummary(text) {
  const raw = typeof text === "string" ? text : "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^#{1,6}\s/.test(l));

  const out = {
    abstract: "",
    keywords: [],
    domain: "",
    impact: "",
  };
  const extra = [];

  for (const line of lines) {
    const clean = line.replace(/^[-*•]\s*/, "").trim();
    let matched = false;
    for (const { key, re } of FIELD_PATTERNS) {
      const m = re.exec(clean);
      if (!m) continue;
      if (key === "keywords") {
        out.keywords = splitKeywords(m[2]);
      } else {
        out[key] = m[2].trim();
      }
      matched = true;
      break;
    }
    if (!matched) extra.push(clean);
  }

  if (!out.abstract) {
    out.abstract =
      extra.length > 0 ? extra.join(" ") : raw.replace(/\s+/g, " ").trim();
  }

  return {
    abstract: out.abstract.replace(/\s+/g, " ").trim().slice(0, 500),
    keywords: out.keywords,
    domain: out.domain.replace(/\s+/g, " ").trim().slice(0, 80),
    impact: out.impact.replace(/\s+/g, " ").trim().slice(0, 400),
  };
}

/**
 * @param {{ text?: string, abstract?: string, keywords?: string[], domain?: string, impact?: string }} entry
 */
function enrichSummaryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return parseArticleSummary("");
  }
  if (entry.abstract || entry.domain || entry.impact) {
    return {
      abstract: entry.abstract || "",
      keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
      domain: entry.domain || "",
      impact: entry.impact || "",
    };
  }
  return parseArticleSummary(entry.text || "");
}

module.exports = {
  parseArticleSummary,
  enrichSummaryEntry,
  splitKeywords,
};
