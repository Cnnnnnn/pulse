/**
 * src/renderer/github/GithubAiParseView.jsx
 *
 * GitHub 优秀项目收录 — AI 解析结果清晰布局。
 * 展示：一句话定位 / 使用方法 / 核心功能 / 适用场景 / 关键词。
 */

import { IconRefresh } from "../components/icons.jsx";
import { githubReasonText } from "../store/github-projects-store.js";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 把带 `code` 与换行的纯文本渲染为安全 HTML
function renderUsage(text) {
  const escaped = escapeHtml(text || "");
  const withCode = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  return (
    <div
      class="github-ai-usage"
      dangerouslySetInnerHTML={{ __html: withCode.replace(/\n/g, "<br/>") }}
    />
  );
}

export function GithubAiParseView({ result, loading, error, onRetry }) {
  if (loading) {
    return (
      <div class="github-ai-loading">
        <div class="github-spinner" />
        <p>AI 正在解析项目价值…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div class="github-ai-error">
        <p>解析失败：{githubReasonText(error)}</p>
        {onRetry && (
          <button
            type="button"
            class="github-btn github-btn--primary"
            onClick={onRetry}
          >
            重试
          </button>
        )}
      </div>
    );
  }

  if (!result) {
    return <div class="github-ai-empty">暂无解析结果。</div>;
  }

  return (
    <div class="github-ai">
      {result.summary && (
        <section class="github-ai-section github-ai-summary">
          <p>{result.summary}</p>
        </section>
      )}

      {result.usage && (
        <section class="github-ai-section">
          <h4 class="github-ai-h">使用方法</h4>
          {renderUsage(result.usage)}
        </section>
      )}

      {result.features && result.features.length > 0 && (
        <section class="github-ai-section">
          <h4 class="github-ai-h">核心功能</h4>
          <ul class="github-ai-list">
            {result.features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {result.scenarios && result.scenarios.length > 0 && (
        <section class="github-ai-section">
          <h4 class="github-ai-h">适用场景</h4>
          <ul class="github-ai-list">
            {result.scenarios.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {result.tags && result.tags.length > 0 && (
        <section class="github-ai-section">
          <h4 class="github-ai-h">关键词</h4>
          <div class="github-ai-tags">
            {result.tags.map((t, i) => (
              <span class="github-ai-tag" key={i}>
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {onRetry && (
        <button
          type="button"
          class="github-btn github-btn--ghost github-ai-reparse"
          onClick={onRetry}
        >
          <IconRefresh size={14} /> 重新解析
        </button>
      )}
    </div>
  );
}

export default GithubAiParseView;
