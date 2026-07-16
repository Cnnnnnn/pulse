/**
 * src/renderer/github/GithubReadmeView.jsx
 *
 * GitHub 优秀项目收录 — README 渲染 (marked + DOMPurify 安全消毒)。
 */

import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function GithubReadmeView({ markdown, loading }) {
  if (loading) {
    return <div class="github-readme-loading">README 加载中…</div>;
  }
  if (!markdown || !markdown.trim()) {
    return (
      <div class="github-readme-empty">该项目没有可用的 README 内容。</div>
    );
  }
  let html;
  try {
    const parsed = marked.parse(markdown);
    html = typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    html = `<pre>${escapeHtml(markdown)}</pre>`;
  }
  const safe = DOMPurify.sanitize(html);
  return (
    <div
      class="readme-content"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export default GithubReadmeView;
