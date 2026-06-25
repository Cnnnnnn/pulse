/**
 * src/renderer/components/ChangelogSummary.jsx
 *
 * A1 — changelog AI 摘要 (按需拉取 + 缓存).
 */
import { useState } from "preact/hooks";
import { api } from "../api.js";
import { humanizeAiError } from "../../ai/ai-errors.js";
import { IconSparkles, IconRefresh, IconThumbsUp, IconThumbsDown } from "./icons.jsx";

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

function clampText(s, n) {
  if (typeof s !== "string") return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function ChangelogSummary({ appName }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [vote, setVote] = useState(null); // A8: null | "up" | "down"

  if (!appName) return null;

  async function sendVote(v) {
    if (vote || !api.feedbackRecord) return;
    setVote(v);
    try {
      await api.feedbackRecord({
        feature: "summary",
        appName,
        version: null,
        rec: null,
        confidence: null,
        vote: v,
        ts: Date.now(),
      });
    } catch {
      /* noop */
    }
  }

  async function fetchSummary(force = false) {
    if (loading || !api.changelogSummaryFetch) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.changelogSummaryFetch({ appName, force });
      if (r && r.ok) {
        setSummary(r);
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

  if (!summary && !loading && !error) {
    return (
      <button
        type="button"
        class="changelog-summary-trigger"
        onClick={(e) => { e.stopPropagation(); fetchSummary(false); }}
        title="AI 提炼本版最重要的 3 件事"
      >
        <IconSparkles size={14} /> 3 件大事
      </button>
    );
  }

  if (loading) {
    return (
      <div class="changelog-summary changelog-summary--loading">
        <div class="changelog-summary-skel" />
        <div class="changelog-summary-skel changelog-summary-skel--line" />
        <div class="changelog-summary-skel changelog-summary-skel--line" />
        <div class="changelog-summary-skel changelog-summary-skel--line" />
        <div class="changelog-summary-loading-label"><IconSparkles size={14} /> AI 提炼中 · 通常 5–15s</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="changelog-summary changelog-summary--error" title={error.raw}>
        {error.label}
        <button
          type="button"
          class="changelog-summary-retry"
          onClick={(e) => { e.stopPropagation(); fetchSummary(true); }}
        >
          重试
        </button>
      </div>
    );
  }

  const items = (summary && summary.highlights) || [];
  const showList =
    items.length > 0 &&
    !(items.length === 1 && summary.oneLiner && items[0] === summary.oneLiner);
  const cachedAt = ageLabel(summary.generatedAt);

  return (
    <div class="changelog-summary" onClick={(e) => e.stopPropagation()}>
      <div class="changelog-summary-label"><IconSparkles size={14} /> 本版要点</div>
      {summary.oneLiner && (
        <div class="changelog-summary-oneliner">{clampText(summary.oneLiner, 60)}</div>
      )}
      {showList && (
        <ol class="changelog-summary-list">
          {items.map((h) => (
            <li key={h}>{clampText(h, 50)}</li>
          ))}
        </ol>
      )}
      {cachedAt && (
        <div class="changelog-summary-cached">{cachedAt}</div>
      )}
      <span class="changelog-summary-feedback">
        <button
          type="button"
          class={`changelog-summary-feedback-btn ${vote === "up" ? "is-active" : ""}`}
          aria-label="feedback-up"
          onClick={(e) => { e.stopPropagation(); sendVote("up"); }}
          title="有用"
          disabled={!!vote}
        ><IconThumbsUp size={14} /></button>
        <button
          type="button"
          class={`changelog-summary-feedback-btn ${vote === "down" ? "is-active" : ""}`}
          aria-label="feedback-down"
          onClick={(e) => { e.stopPropagation(); sendVote("down"); }}
          title="没用"
          disabled={!!vote}
        ><IconThumbsDown size={14} /></button>
      </span>
    </div>
  );
}
