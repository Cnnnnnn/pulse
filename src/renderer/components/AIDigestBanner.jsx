/**
 * src/renderer/components/AIDigestBanner.jsx
 *
 * Phase B5a (AI Sessions Daily Digest): 顶部 digest banner.
 *
 * 跟 spec §5.1 一致:
 *   - 默认折叠 (details/summary)
 *   - 1 行 summary 截 60 字符 preview
 *   - 🔄 重跑按钮 → onRerun
 *   - loading skeleton 时显示 "⏳ 生成昨日 AI 总结..."
 *   - 没数据 (digest=null) + enabled=false → 整体不渲染
 *
 * 受控: digest / loading / onRerun 走 props, 自身无 state.
 *   - enabled 不在 props (store.aiSessionsEnabled 在 caller 决定是否 mount)
 *
 * CommonJS-friendly 风格 (跟邻居 components 统一).
 */

const PREVIEW_LEN = 60;

function formatTime(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function firstLine(s) {
  if (typeof s !== 'string') return '';
  const i = s.indexOf('\n');
  return i >= 0 ? s.slice(0, i) : s;
}

export function AIDigestBanner({ digest, loading, onRerun }) {
  if (loading) {
    return (
      <div class="ai-digest-banner loading" role="status" aria-live="polite">
        <span class="banner-icon">⏳</span>
        <span class="banner-title">生成昨日 AI 总结…</span>
      </div>
    );
  }
  if (!digest) return null;
  const preview = firstLine(digest.summary).slice(0, PREVIEW_LEN);
  const showEllipsis = firstLine(digest.summary).length > PREVIEW_LEN;
  return (
    <details class="ai-digest-banner">
      <summary>
        <span class="banner-icon">📅</span>
        <span class="banner-title">昨日 AI 总结</span>
        <span class="banner-count">({digest.sessionCount || 0} sessions)</span>
        <span class="banner-preview">
          — {preview}{showEllipsis ? '…' : ''}
        </span>
        <button
          type="button"
          class="rerun-btn"
          onClick={(e) => { e.preventDefault(); onRerun && onRerun(); }}
          title="重新生成"
          aria-label="重新生成 AI 总结"
        >🔄</button>
      </summary>
      <div class="ai-digest-content">{digest.summary}</div>
      <div class="ai-digest-meta">
        {digest.provider} · {digest.model} · {formatTime(digest.generatedAt)}
      </div>
    </details>
  );
}
