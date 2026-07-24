/**
 * src/renderer/ithome/NewsArticleSummary.jsx
 *
 * IT 新闻 AI 摘要 — 布局对齐会话总结 (summary-result-grid)
 */

export function splitKeywords(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw || "")
    .split(/[,，、;；|/]\s*/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeArticleSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return { abstract: "", keywords: [], domain: "", impact: "" };
  }
  // 任何结构化字段或数组型 keywords → 走结构化分支;
  // 否则视为纯 text 摘要(无 keywords/domain/impact)
  const text = String(summary.text || "").trim();
  const abstract = summary.abstract || text;
  const hasStructured =
    summary.abstract || summary.domain || summary.impact || Array.isArray(summary.keywords);
  if (hasStructured) {
    return {
      abstract,
      keywords: splitKeywords(summary.keywords),
      domain: summary.domain || "",
      impact: summary.impact || "",
    };
  }
  return {
    abstract,
    keywords: [],
    domain: "",
    impact: "",
  };
}

export function NewsArticleSummary({ summary, compact = false }) {
  const fields = normalizeArticleSummary(summary);
  const hasStructure =
    fields.domain || fields.impact || fields.keywords.length > 0;

  if (compact || !hasStructure) {
    const teaser = fields.abstract || summary?.text || "";
    if (!teaser) return null;
    return (
      <p class="summary-result-text ithome-summary-teaser-text">{teaser}</p>
    );
  }

  return (
    <div class="summary-result-grid ithome-article-summary-grid">
      <div class="summary-result-block">
        <div class="summary-result-label">摘要</div>
        <p class="summary-result-text">
          {fields.abstract || "暂无摘要。"}
        </p>
      </div>
      {fields.keywords.length > 0 && (
        <div class="summary-result-block">
          <div class="summary-result-label">关键词</div>
          <div class="ithome-summary-keywords">
            {fields.keywords.map((kw) => (
              <span key={kw} class="ithome-summary-keyword">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
      {fields.domain && (
        <div class="summary-result-block">
          <div class="summary-result-label">所属领域</div>
          <p class="summary-result-text">{fields.domain}</p>
        </div>
      )}
      {fields.impact && (
        <div class="summary-result-block">
          <div class="summary-result-label">影响方面</div>
          <p class="summary-result-text">{fields.impact}</p>
        </div>
      )}
    </div>
  );
}

export default NewsArticleSummary;
