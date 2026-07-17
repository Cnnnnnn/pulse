/**
 * src/renderer/github/GithubMarkdown.jsx
 *
 * 公共 markdown 渲染组件：marked 解析 + DOMPurify 消毒。
 * 被 GithubReadmeView（README tab）和 GithubReleasesView（release notes）复用。
 *
 * 安全契约：所有外部 markdown（README / release body）必须经此组件渲染，
 * 不得直接 dangerouslySetInnerHTML。DOMPurify 默认配置已拦截 script /
 * javascript: 协议 / 事件处理器 / iframe 等，XSS 测试在 github-markdown.test.jsx。
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

/**
 * @param {object} props
 * @param {string} props.markdown 原始 markdown 文本
 * @param {string} [props.className] 附加到容器的 class（如 "github-rel-notes"）
 */
export function GithubMarkdown({ markdown, className = "" }) {
  if (!markdown || !markdown.trim()) {
    return <div class={`readme-content ${className}`.trim()} />;
  }
  let html;
  try {
    const parsed = marked.parse(markdown);
    html = typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    // 解析失败：回退为转义后的纯文本 pre，绝不让原始 markdown 直出
    html = `<pre>${escapeHtml(markdown)}</pre>`;
  }
  const safe = DOMPurify.sanitize(html);
  const cls = `readme-content ${className}`.trim();
  return <div class={cls} dangerouslySetInnerHTML={{ __html: safe }} />;
}

export default GithubMarkdown;
