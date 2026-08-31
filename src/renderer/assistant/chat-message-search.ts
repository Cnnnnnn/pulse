/**
 * 当前对话内消息搜索.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export function normalizeMessageSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** 消息正文 + 工具卡片可搜索文本 */
export function messageSearchHaystack(message: AiChatMessage): string {
  const parts: string[] = [message.content || ""];
  if (message.toolCards?.length) {
    for (const card of message.toolCards) {
      parts.push(card.tool, card.summary);
      for (const item of card.items || []) {
        parts.push(item.label);
        if (item.meta) parts.push(item.meta);
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

export function messageMatchesQuery(
  message: AiChatMessage,
  query: string,
): boolean {
  const q = normalizeMessageSearchQuery(query);
  if (!q) return true;
  return messageSearchHaystack(message).includes(q);
}

export function findMessageMatchIndices(
  messages: AiChatMessage[],
  query: string,
): number[] {
  const q = normalizeMessageSearchQuery(query);
  if (!q) return [];
  const indices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messageMatchesQuery(messages[i], q)) indices.push(i);
  }
  return indices;
}

export function wrapMatchPosition(
  position: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return ((position % total) + total) % total;
}

export type SearchHighlightPart = { text: string; match: boolean };

export function splitTextBySearchHighlight(
  text: string,
  query: string,
): SearchHighlightPart[] {
  const q = normalizeMessageSearchQuery(query);
  if (!q) return [{ text, match: false }];

  const parts: SearchHighlightPart[] = [];
  let remaining = text;
  let lowerRemaining = remaining.toLowerCase();
  while (remaining.length > 0) {
    const idx = lowerRemaining.indexOf(q);
    if (idx === -1) {
      parts.push({ text: remaining, match: false });
      break;
    }
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), match: false });
    parts.push({
      text: remaining.slice(idx, idx + q.length),
      match: true,
    });
    remaining = remaining.slice(idx + q.length);
    lowerRemaining = lowerRemaining.slice(idx + q.length);
  }
  return parts.length > 0 ? parts : [{ text, match: false }];
}
