/**
 * 助手消息点赞/点踩切换与统计.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export type MessageFeedback = "up" | "down";

export type FeedbackStats = { up: number; down: number };

export function nextMessageFeedback(
  current: MessageFeedback | undefined,
  vote: MessageFeedback,
): MessageFeedback | undefined {
  return current === vote ? undefined : vote;
}

export function summarizeMessageFeedback(
  messages: AiChatMessage[],
): FeedbackStats {
  let up = 0;
  let down = 0;
  for (const m of messages) {
    if (m.feedback === "up") up++;
    else if (m.feedback === "down") down++;
  }
  return { up, down };
}

export function formatFeedbackSummary(stats: FeedbackStats): string {
  if (stats.up === 0 && stats.down === 0) return "";
  const parts: string[] = [];
  if (stats.up > 0) parts.push(`赞 ${stats.up}`);
  if (stats.down > 0) parts.push(`踩 ${stats.down}`);
  return parts.join(" · ");
}

export function countEmptyThreads(
  threads: { messages: AiChatMessage[] }[],
): number {
  return threads.filter((t) => t.messages.length === 0).length;
}
