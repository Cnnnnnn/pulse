/**
 * src/renderer/components/UpgradeAdvice.jsx
 *
 * A2 — 有更新时显示「该不该升」AI 建议 (按需拉取 + 缓存).
 */
import { useState } from "preact/hooks";
import { api } from "../api.js";
import { humanizeAiError } from "../../ai/ai-errors.js";

const REC_LABELS = {
  upgrade: "建议升级",
  wait: "可再等等",
  skip: "建议跳过",
};

function ageLabel(generatedAt) {
  if (typeof generatedAt !== "number") return "";
  const delta = Date.now() - generatedAt;
  if (delta < 60_000) return "刚刚生成";
  const m = Math.floor(delta / 60_000);
  if (m < 60) return `${m}m 前生成`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h 前生成`;
  return `${Math.floor(h / 24)}d 前生成`;
}

export function UpgradeAdvice({ appName, hasUpdate }) {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);
  const [vote, setVote] = useState(null); // A8: null | "up" | "down" (反馈后锁定)

  if (!hasUpdate || !appName) return null;

  async function sendVote(v) {
    if (vote || !api.feedbackRecord) return; // 已投过 / 无 API
    setVote(v);
    try {
      await api.feedbackRecord({
        feature: "advice",
        appName,
        version: advice && advice.latestVersion,
        rec: advice && advice.recommendation,
        confidence: advice && advice.confidence,
        vote: v,
        ts: Date.now(),
      });
    } catch {
      /* noop, 反馈丢失不影响主流程 */
    }
  }

  async function fetchAdvice(force = false) {
    if (loading || !api.upgradeAdviceFetch) return;
    // A8: force 重生成 = 用户对当前结果不满意 → 记一条隐式反馈
    if (force && api.feedbackRecord && advice) {
      try {
        api.feedbackRecord({
          feature: "advice",
          appName,
          version: advice.latestVersion,
          rec: advice.recommendation,
          confidence: advice.confidence,
          vote: null,
          implicit: "refreshed",
          ts: Date.now(),
        });
      } catch {
        /* noop */
      }
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.upgradeAdviceFetch({ appName, force });
      if (r && r.ok) {
        setAdvice(r);
      } else {
        const { label, raw } = humanizeAiError(r && r.reason, r && r.error);
        setError({ label, raw });
      }
    } catch (err) {
      setError({ label: "获取失败", raw: (err && err.message) || "" });
    } finally {
      setLoading(false);
    }
  }

  if (!advice && !loading && !error) {
    return (
      <button
        type="button"
        class="upgrade-advice-trigger"
        onClick={(e) => { e.stopPropagation(); fetchAdvice(false); }}
        title="AI 分析该不该升级"
      >
        💡 该不该升?
      </button>
    );
  }

  if (loading) {
    return (
      <div class="upgrade-advice upgrade-advice--loading">
        <span class="upgrade-advice-loading-label">💡 AI 分析中 · 通常 5–10s</span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="upgrade-advice upgrade-advice--error" title={error.raw}>
        {error.label}
        <button
          type="button"
          class="upgrade-advice-retry"
          onClick={(e) => { e.stopPropagation(); fetchAdvice(true); }}
        >
          重试
        </button>
      </div>
    );
  }

  const rec = advice.recommendation || "wait";
  const conf = advice.confidence || "medium";
  const cachedAt = ageLabel(advice.generatedAt);
  const reasons = Array.isArray(advice.reasons) ? advice.reasons.filter(Boolean) : [];
  return (
    <div
      class={`upgrade-advice upgrade-advice--${rec}`}
      title={reasons.join(" · ")}
      onClick={(e) => e.stopPropagation()}
    >
      <span class="upgrade-advice-badge">{REC_LABELS[rec] || rec}</span>
      <span
        class={`upgrade-advice-confidence upgrade-advice-confidence--${conf}`}
        title={`模型置信度: ${conf}`}
        aria-label={`confidence-${conf}`}
      >
        ●
      </span>
      <span class="upgrade-advice-summary">{advice.summary}</span>
      {reasons.length > 0 && (
        <ul class="upgrade-advice-reasons">
          {reasons.map((r) => (
            <li key={r}>▸ {r}</li>
          ))}
        </ul>
      )}
      {cachedAt && (
        <span class="upgrade-advice-cached">{cachedAt}</span>
      )}
      <span class="upgrade-advice-feedback">
        <button
          type="button"
          class={`upgrade-advice-feedback-btn ${vote === "up" ? "is-active" : ""}`}
          aria-label="feedback-up"
          onClick={(e) => { e.stopPropagation(); sendVote("up"); }}
          title="有用"
          disabled={!!vote}
        >👍</button>
        <button
          type="button"
          class={`upgrade-advice-feedback-btn ${vote === "down" ? "is-active" : ""}`}
          aria-label="feedback-down"
          onClick={(e) => { e.stopPropagation(); sendVote("down"); }}
          title="没用"
          disabled={!!vote}
        >👎</button>
      </span>
      <button
        type="button"
        class="upgrade-advice-refresh"
        onClick={(e) => { e.stopPropagation(); fetchAdvice(true); }}
        title="重新分析 (会消耗 AI 配额)"
      >
        ↻
      </button>
    </div>
  );
}
