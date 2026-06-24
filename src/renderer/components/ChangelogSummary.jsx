/**
 * src/renderer/components/ChangelogSummary.jsx
 *
 * A1 — changelog AI 摘要 (按需拉取 + 缓存).
 */
import { useState } from "preact/hooks";
import { api } from "../api.js";

export function ChangelogSummary({ appName }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  if (!appName) return null;

  async function fetchSummary(force = false) {
    if (loading || !api.changelogSummaryFetch) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.changelogSummaryFetch({ appName, force });
      if (r && r.ok) {
        setSummary(r);
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

  if (!summary && !loading && !error) {
    return (
      <button
        type="button"
        class="changelog-summary-trigger"
        onClick={(e) => { e.stopPropagation(); fetchSummary(false); }}
        title="AI 提炼本版最重要的 3 件事"
      >
        ✨ 3 件大事
      </button>
    );
  }

  if (loading) {
    return <div class="changelog-summary changelog-summary--loading">摘要生成中…</div>;
  }

  if (error) {
    return (
      <div class="changelog-summary changelog-summary--error">
        {error}
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

  return (
    <div class="changelog-summary" onClick={(e) => e.stopPropagation()}>
      <div class="changelog-summary-label">✨ 本版要点</div>
      {summary.oneLiner && (
        <div class="changelog-summary-oneliner">{summary.oneLiner}</div>
      )}
      {showList && (
        <ol class="changelog-summary-list">
          {items.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
