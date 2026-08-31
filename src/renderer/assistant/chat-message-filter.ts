/**
 * 消息角色筛选.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export type MessageRoleFilter =
  | "all"
  | "user"
  | "assistant"
  | "system"
  | "feedback_up"
  | "feedback_down"
  | "has_tools";

export function messageMatchesRoleFilter(
  message: AiChatMessage,
  filter: MessageRoleFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "feedback_up") return message.feedback === "up";
  if (filter === "feedback_down") return message.feedback === "down";
  if (filter === "has_tools") {
    return !!(message.toolCards && message.toolCards.length > 0);
  }
  return message.role === filter;
}

export function countMessagesForRoleFilter(
  messages: AiChatMessage[],
  filter: MessageRoleFilter,
): number {
  if (filter === "all") return messages.length;
  return messages.filter((m) => messageMatchesRoleFilter(m, filter)).length;
}
