import { useEffect, useState } from "preact/hooks";
import { ithomeSummaries, summarizeIthomeArticle } from "./store.ts";
import { normalizeArticleSummary } from "./NewsArticleSummary.tsx";
import { refreshAIReadyStatus } from "../store.ts";
import { IconChevronDown, IconChevronUp, IconSparkles } from "../components/icons.tsx";

const ANALYSIS_MODES = [
  { key: "summary", label: "快速摘要" },
  { key: "whyImportant", label: "为什么重要" },
  { key: "impact", label: "影响谁" },
  { key: "risks", label: "风险与不确定性" },
  { key: "followUps", label: "后续关注" },
  { key: "cluster", label: "多篇聚合" },
];

function completeness(article) {
  const size = String(article?.body || article?.excerpt || "").trim().length;
  if (size >= 500) return "高";
  if (size >= 200) return "中";
  return "低";
}

function completenessLabel(value, article) {
  const map = { high: "高", medium: "中", low: "低", 高: "高", 中: "中", 低: "低" };
  return map[value] || completeness(article);
}

function listText(items) {
  return Array.isArray(items) && items.length > 0 ? items.join("；") : "";
}

function modeContent(mode, fields, summary) {
  if (mode === "summary") return fields.abstract || summary?.text || "暂无摘要。";
  if (mode === "impact") return fields.impact || "当前摘要接口尚未返回影响对象字段。";
  if (mode === "whyImportant") {
    return fields.whyImportant || (fields.impact
      ? `当前结果给出的影响方面：${fields.impact}`
      : "旧摘要未包含“为什么重要”，重新分析可补齐。");
  }
  if (mode === "risks") return listText(fields.risks) || "旧摘要未包含风险与不确定性，重新分析可补齐。";
  if (mode === "followUps") return listText(fields.followUps) || "旧摘要未包含后续关注项，重新分析可补齐。";
  return "多篇聚合入口已预留，下一步接入队列多选和聚合 prompt。";
}

export function NewsAnalysisPanel({ article }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState("summary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const summary = ithomeSummaries.value[article?.id];
  const fields = normalizeArticleSummary(summary);
  const hasSummary = !!(summary && (summary.text || fields.abstract));

  useEffect(() => {
    setExpanded(false);
    setMode("summary");
    setError("");
  }, [article?.id]);

  async function handleGenerate(force = false) {
    const ready = await refreshAIReadyStatus();
    if (!ready) {
      setError("请先在侧栏「AI 配置」中保存 Provider、模型和 API Key");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await summarizeIthomeArticle(article.id, force);
      if (!result || !result.ok) {
        setError(result?.reason || "生成失败");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      class={`ithome-analysis-panel${expanded ? " is-expanded" : " is-collapsed"}`}
      aria-label="AI 分析"
    >
      <div class="ithome-analysis-head">
        <button
          type="button"
          class="ithome-analysis-toggle"
          aria-label={expanded ? "收起 AI 分析" : "展开 AI 分析"}
          aria-expanded={expanded}
          aria-controls="ithome-analysis-content"
          onClick={() => setExpanded((value) => !value)}
        >
          <span class="ithome-analysis-toggle-main">
            <IconSparkles size={16} />
            <span class="ithome-analysis-toggle-copy">
              <strong>AI 分析</strong>
              <span class="ithome-analysis-subtitle">
                {hasSummary ? "已缓存" : "尚未分析"} · 输入完整度：{completenessLabel(summary?.completeness, article)}
              </span>
            </span>
          </span>
          <span class="ithome-analysis-toggle-action">
            {expanded ? "收起" : "展开"}
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </span>
        </button>
        {expanded && (
          <button
            type="button"
            class="ithome-analysis-generate"
            onClick={() => void handleGenerate(hasSummary)}
            disabled={busy}
          >
            <IconSparkles size={14} /> {busy ? "分析中…" : hasSummary ? "重新分析" : "生成分析"}
          </button>
        )}
      </div>
      {expanded && (
        <div id="ithome-analysis-content">
          <div class="ithome-analysis-tabs" role="tablist" aria-label="AI 分析模式">
            {ANALYSIS_MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={mode === item.key}
                class={`ithome-analysis-tab${mode === item.key ? " is-active" : ""}`}
                onClick={() => setMode(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {error && <p class="ithome-analysis-error" role="alert">{error}</p>}
          <div class="ithome-analysis-result">
            <div class="ithome-analysis-result-label">
              {ANALYSIS_MODES.find((item) => item.key === mode)?.label}
            </div>
            <p>{modeContent(mode, fields, summary)}</p>
            <div class="ithome-analysis-evidence">
              {fields.evidence.length > 0
                ? `AI 依据：${fields.evidence.join("；")}`
                : `原文依据：${article?.body ? "正文已加载" : "当前使用标题 / 摘要"}`} · 结构化字段：{hasSummary ? "已返回" : "待生成"}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default NewsAnalysisPanel;
