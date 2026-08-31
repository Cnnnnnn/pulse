/**
 * 将消息格式化为引用块，插入输入框.
 */
export function formatQuotedMessage(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return trimmed
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function appendQuoteToDraft(existing: string, quote: string): string {
  if (!quote) return existing;
  const base = existing.trim();
  return base ? `${base}\n\n${quote}\n\n` : `${quote}\n\n`;
}
