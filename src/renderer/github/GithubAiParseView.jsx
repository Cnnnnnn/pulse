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
    return <GithubAiParseSkeleton />;
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

/**
 * AI 解析加载态骨架屏 —— 结构镜像真实 AI 解析（摘要块 / 用法区 / 列表区 / 标签行），
 * 复用 README 骨架屏同款主题安全 shimmer，保证两个 tab 加载体验一致。
 * role=status + 视觉隐藏文案，屏幕阅读器可播报。
 */
function GithubAiParseSkeleton() {
  return (
    <div class="github-ai-skel" role="status" aria-live="polite">
      <span class="github-skel__sr">AI 解析中…</span>
      <div class="github-skel__block github-ai-skel__summary" />
      <div class="github-ai-skel__section">
        <div class="github-skel__block github-ai-skel__label" />
        <div class="github-skel__block github-ai-skel__line" />
        <div class="github-skel__block github-ai-skel__line github-skel__short" />
      </div>
      <div class="github-ai-skel__section">
        <div class="github-skel__block github-ai-skel__label" />
        <div class="github-skel__block github-ai-skel__line" />
        <div class="github-skel__block github-ai-skel__line" />
        <div class="github-skel__block github-ai-skel__line github-skel__mid" />
      </div>
      <div class="github-ai-skel__tags">
        <span class="github-skel__block github-ai-skel__tag" />
        <span class="github-skel__block github-ai-skel__tag" />
        <span class="github-skel__block github-ai-skel__tag" />
        <span class="github-skel__block github-ai-skel__tag" />
      </div>
    </div>
  );
}
