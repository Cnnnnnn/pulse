import { useEffect, useState } from "preact/hooks";
import {
  activeBoard,
  activeDim,
  activeLB,
  activeView,
  attribution,
  compareList,
  columnValue,
  fetchedAt,
  isSample,
  items,
  sortDir,
  sortKey,
  sourceCoverage,
  sourceDate,
  stale,
} from "./aiLeaderboardStore.ts";
import {
  AA_DIMENSIONS,
  ARENA_BOARDS,
  LIVE_DIMENSIONS,
  SORT_COLUMN_LABELS,
  VENDOR_META,
  VIEWS,
} from "./types.ts";
import { fmtDate, fmtIndex, fmtPricePer1M, fmtScore, fmtSpeed } from "./format.ts";
import {
  IconAlert,
  IconChevronDown,
  IconChevronUp,
  IconInfo,
  IconSparkles,
  IconWand,
  IconX,
} from "../components/icons.tsx";

const SOURCE_LABELS = {
  arena: "Arena",
  aa: "Artificial Analysis",
  livebench: "LiveBench",
  huggingface: "HuggingFace",
  openrouter: "OpenRouter",
  modelsdev: "Models.dev",
};

function vendorLabel(model) {
  return (VENDOR_META[model?.vendor] || {}).label || model?.vendor || "未知厂商";
}

function defaultMetricKey(view) {
  if (view === "arena") return "elo";
  if (view === "livebench") return activeLB.value || "lb_overall";
  if (view === "huggingface") return activeDim.value || "hf_downloads";
  return activeDim.value || "intelligence";
}

function metricLabel(view, key) {
  if (key && SORT_COLUMN_LABELS[key]) return SORT_COLUMN_LABELS[key];
  if (view === "arena") return `${ARENA_BOARDS[activeBoard.value]?.label || "Arena"} ELO`;
  if (view === "livebench") return LIVE_DIMENSIONS[activeLB.value]?.label || "LiveBench Overall";
  if (view === "huggingface") return "HuggingFace Downloads";
  return AA_DIMENSIONS[activeDim.value]?.label || "Intelligence Index";
}

function metricValue(model, view, key) {
  const value = columnValue(model, view, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetric(value, view, key) {
  if (value == null) return "暂无数据";
  if (view === "arena") return fmtScore(value);
  if (view === "aa") {
    if (key === "speed") return fmtSpeed(value);
    if (key === "price" || key === "inputPrice") return fmtPricePer1M(value);
    return fmtIndex(value);
  }
  if (view === "livebench") return Number(value).toFixed(1);
  if (view === "huggingface") return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return String(value);
}

function bestBy(models, getter, direction = "desc") {
  return models
    .map((model) => ({ model, value: getter(model) }))
    .filter((entry) => entry.value != null)
    .sort((a, b) => direction === "asc" ? a.value - b.value : b.value - a.value)[0] || null;
}

function buildAnalysis(models, view) {
  const key = sortKey.value || defaultMetricKey(view);
  const label = metricLabel(view, key);
  const values = models.map((model) => ({ model, value: metricValue(model, view, key) }));
  const comparable = values.filter((entry) => entry.value != null);
  const currentBest = bestBy(models, (model) => metricValue(model, view, key), sortDir.value);
  const fastest = bestBy(models, (model) => model?.aa?.outputTokensPerSec, "desc");
  const lowestPrice = bestBy(models, (model) => model?.aa?.priceOutputPer1M, "asc");
  const coding = bestBy(models, (model) => model?.aa?.codingIndex, "desc");
  const intelligence = bestBy(models, (model) => model?.aa?.intelligenceIndex, "desc");

  const conclusion = currentBest
    ? `${currentBest.model.name} 在当前「${label}」指标中表现最好（${formatMetric(currentBest.value, view, key)}）。${models.length > 1 ? `它与其余 ${models.length - 1} 个模型的差异，主要来自当前排序维度。` : "可以先作为当前视角的基准模型。"}`
    : "已选模型缺少当前视角的有效指标，暂时无法做出可靠排序结论。";

  const why = [];
  if (currentBest) why.push(`${currentBest.model.name} 的「${label}」为 ${formatMetric(currentBest.value, view, key)}，当前排序方向为${sortDir.value === "asc" ? "升序" : "降序"}。`);
  if (fastest) why.push(`${fastest.model.name} 输出速度最高（${fmtSpeed(fastest.value)}），更适合需要即时反馈的交互。`);
  if (lowestPrice) why.push(`${lowestPrice.model.name} 输出价最低（${fmtPricePer1M(lowestPrice.value)}），成本敏感场景可优先关注。`);
  if (!why.length) why.push("当前已加载数据不足以拆解差异，建议补充其它评测源后再比较。 ");

  const scenes = [];
  if (intelligence) scenes.push(`${intelligence.model.name}：复杂研究、长上下文分析与通用推理。`);
  if (coding) scenes.push(`${coding.model.name}：代码生成、调试与工程任务。`);
  if (fastest && (!intelligence || fastest.model.id !== intelligence.model.id)) scenes.push(`${fastest.model.name}：实时对话、批处理和需要低等待的工作流。`);
  if (lowestPrice && (!coding || lowestPrice.model.id !== coding.model.id)) scenes.push(`${lowestPrice.model.name}：高频调用、摘要和成本敏感的自动化任务。`);
  if (!scenes.length) scenes.push("请结合具体任务类型、延迟和预算，再决定是否扩大比较范围。");

  const risks = [];
  if (isSample.value || models.some((model) => model.isSample)) risks.push("当前包含示例快照，结论用于体验和结构化比较，不代表实时排名。");
  if (stale.value) risks.push("榜单使用了缓存数据；不同来源的更新时间可能不一致。");
  if (comparable.length < models.length) risks.push(`${models.length - comparable.length} 个已选模型缺少「${label}」数据，不能直接横向比较。`);
  risks.push("评测榜单反映特定测试集和采样窗口，实际效果仍会受提示词、上下文和部署参数影响。");

  return { key, label, values, conclusion, why, scenes, risks };
}

function AnalysisSection({ id, title, Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section class={`ai-lb-analysis-section${open ? " is-open" : ""}`}>
      <button
        type="button"
        class="ai-lb-analysis-section__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <span class="ai-lb-analysis-section__title"><Icon size={16} />{title}</span>
        {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </button>
      {open && <div id={id} class="ai-lb-analysis-section__body">{children}</div>}
    </section>
  );
}

export function AIAnalysisPanel({ open, onClose }) {
  const [feedback, setFeedback] = useState("");
  const ids = compareList.value;
  const models = ids.map((id) => items.value.find((model) => model.id === id)).filter(Boolean);
  const view = activeView.value;

  useEffect(() => {
    setFeedback("");
  }, [ids.join(",")]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || models.length === 0) return null;

  const analysis = buildAnalysis(models, view);
  const coverage = sourceCoverage.value || {};
  const coveredSources = Object.keys(SOURCE_LABELS)
    .filter((key) => Number(coverage[key]) > 0)
    .map((key) => SOURCE_LABELS[key]);
  const sourcesText = coveredSources.length > 0 ? coveredSources.join("、") : (VIEWS[view]?.label || "当前榜单");
  const updated = sourceDate.value || fetchedAt.value;
  const attributionText = (attribution.value || [])
    .map((entry) => entry?.text || entry?.label)
    .filter(Boolean)
    .slice(0, 2)
    .join("；");

  return (
    <aside class="ai-lb-analysis-panel" role="dialog" aria-modal="false" aria-label="AI 分析" data-analysis-view={view}>
      <header class="ai-lb-analysis-panel__header">
        <div>
          <div class="ai-lb-analysis-panel__title-row">
            <IconSparkles size={17} />
            <h2>AI 分析</h2>
            <span class="ai-lb-analysis-panel__beta">Beta</span>
          </div>
          <p class="ai-lb-analysis-panel__subtitle">基于当前榜单数据生成</p>
        </div>
        <button type="button" class="ai-lb-analysis-panel__close" aria-label="关闭 AI 分析" onClick={onClose}>
          <IconX size={17} />
        </button>
      </header>

      <div class="ai-lb-analysis-panel__body">
        <div class="ai-lb-analysis-selection">
          <div class="ai-lb-analysis-selection__head">
            <span>对比模型 {models.length}/3</span>
            <button type="button" onClick={onClose}>重新选择</button>
          </div>
          <div class="ai-lb-analysis-selection__models">
            {models.map((model, index) => (
              <span key={model.id} class={`ai-lb-analysis-model-chip is-${index % 4}`}>
                <span class="ai-lb-analysis-model-chip__dot" aria-hidden="true" />
                {model.name}
              </span>
            ))}
          </div>
        </div>

        <AnalysisSection id="ai-analysis-conclusion" title="结论" Icon={IconInfo}>
          <p class="ai-lb-analysis-copy">{analysis.conclusion}</p>
          <div class="ai-lb-analysis-metric-list">
            {analysis.values.map(({ model, value }) => (
              <div class="ai-lb-analysis-metric" key={model.id}>
                <span class={`ai-lb-analysis-model-chip__dot is-${models.indexOf(model) % 4}`} aria-hidden="true" />
                <span>{model.name}</span>
                <strong>{formatMetric(value, view, analysis.key)}</strong>
              </div>
            ))}
          </div>
        </AnalysisSection>

        <AnalysisSection id="ai-analysis-why" title="为什么" Icon={IconWand}>
          <ul class="ai-lb-analysis-list">
            {analysis.why.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </AnalysisSection>

        <AnalysisSection id="ai-analysis-scenes" title="适用场景" Icon={IconSparkles}>
          <ul class="ai-lb-analysis-list">
            {analysis.scenes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </AnalysisSection>

        <AnalysisSection id="ai-analysis-risks" title="风险与不确定性" Icon={IconAlert}>
          <ul class="ai-lb-analysis-list ai-lb-analysis-list--muted">
            {analysis.risks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </AnalysisSection>

        <AnalysisSection id="ai-analysis-sources" title="数据来源" Icon={IconInfo} defaultOpen={false}>
          <p class="ai-lb-analysis-copy">本次分析基于 {sourcesText} 的已加载字段，未改变原始榜单排序。</p>
          {attributionText && <p class="ai-lb-analysis-source-note">{attributionText}</p>}
          <p class="ai-lb-analysis-source-note">数据截至 {updated ? fmtDate(updated) || updated : "当前快照"} · 当前指标：{analysis.label}</p>
        </AnalysisSection>
      </div>

      <footer class="ai-lb-analysis-panel__footer">
        <p>本次分析基于 {analysis.label} 指标</p>
        <div class="ai-lb-analysis-feedback" role="group" aria-label="分析反馈">
          <button type="button" class={feedback === "yes" ? "is-selected" : ""} aria-pressed={feedback === "yes"} onClick={() => setFeedback("yes")}>有帮助</button>
          <button type="button" class={feedback === "no" ? "is-selected" : ""} aria-pressed={feedback === "no"} onClick={() => setFeedback("no")}>没帮助</button>
        </div>
      </footer>
    </aside>
  );
}

export default AIAnalysisPanel;
