/**
 * AI 助手消息 Markdown 渲染（轻量：列表/加粗/代码/链接）.
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function ChatMarkdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  if (!content || !content.trim()) return null;
  let html: string;
  try {
    const parsed = marked.parse(content);
    html = typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    html = `<p>${escapeHtml(content)}</p>`;
  }
  const safe = DOMPurify.sanitize(html);
  const cls = `global-chat-markdown ${className}`.trim();
  return <div class={cls} dangerouslySetInnerHTML={{ __html: safe }} />;
}
