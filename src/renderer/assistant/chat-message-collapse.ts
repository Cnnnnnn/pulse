/**
 * 长消息折叠阈值与截断.
 */
export const MESSAGE_COLLAPSE_CHAR_LIMIT = 480;

export function shouldCollapseMessage(
  role: "user" | "assistant" | "system",
  content: string,
  expanded: boolean,
): boolean {
  if (expanded || role === "system") return false;
  return content.length > MESSAGE_COLLAPSE_CHAR_LIMIT;
}

export function collapseMessagePreview(content: string, limit = MESSAGE_COLLAPSE_CHAR_LIMIT): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit).trimEnd()}…`;
}
