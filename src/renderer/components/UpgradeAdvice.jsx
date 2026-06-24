/**
 * src/renderer/components/UpgradeAdvice.jsx
 *
 * A2 — 有更新时显示「该不该升」AI 建议 (按需拉取 + 缓存).
 */
import { useState } from "preact/hooks";
import { api } from "../api.js";

const REC_LABELS = {
  upgrade: "建议升级",
  wait: "可再等等",
  skip: "建议跳过",
};

export function UpgradeAdvice({ appName, hasUpdate }) {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);

  if (!hasUpdate || !appName) return null;

  async function fetchAdvice(force = false) {
    if (loading || !api.upgradeAdviceFetch) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.upgradeAdviceFetch({ appName, force });
      if (r && r.ok) {
        setAdvice(r);
      } else if (r && r.reason === "api_key_missing") {
        setError("需配置 AI API Key");
      } else {
        setError((r && (r.reason || r.error)) || "获取失败");
      }
    } catch (err) {
      setError((err && err.message) || "获取失败");
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
    return <div class="upgrade-advice upgrade-advice--loading">分析中…</div>;
  }

  if (error) {
    return (
      <div class="upgrade-advice upgrade-advice--error" title={error}>
        {error}
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
  return (
    <div
      class={`upgrade-advice upgrade-advice--${rec}`}
      title={advice.reasons && advice.reasons.join(" · ")}
      onClick={(e) => e.stopPropagation()}
    >
      <span class="upgrade-advice-badge">{REC_LABELS[rec] || rec}</span>
      <span class="upgrade-advice-summary">{advice.summary}</span>
      <button
        type="button"
        class="upgrade-advice-refresh"
        onClick={(e) => { e.stopPropagation(); fetchAdvice(true); }}
        title="重新分析"
      >
        ↻
      </button>
    </div>
  );
}
