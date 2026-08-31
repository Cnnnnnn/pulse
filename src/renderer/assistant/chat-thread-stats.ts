/**
 * 会话消息统计.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export type ThreadMessageStats = {
  total: number;
  user: number;
  assistant: number;
  system: number;
  turns: number;
};

export function summarizeThreadStats(
  messages: AiChatMessage[],
): ThreadMessageStats {
  let user = 0;
  let assistant = 0;
  let system = 0;
  for (const m of messages) {
    if (m.role === "user") user++;
    else if (m.role === "assistant") assistant++;
    else if (m.role === "system") system++;
  }
  const turns = messages.filter(
    (m) => m.role === "user" && m.content?.trim(),
  ).length;
  return {
    total: messages.length,
    user,
    assistant,
    system,
    turns,
  };
}

export function formatThreadStatsLabel(stats: ThreadMessageStats): string {
  if (stats.total === 0) return "空对话";
  if (stats.turns > 0) {
    return `${stats.total} 条 · ${stats.turns} 轮`;
  }
  return `${stats.total} 条`;
}

export function formatThreadStatsTitle(stats: ThreadMessageStats): string {
  return [
    `共 ${stats.total} 条消息`,
    stats.turns > 0 ? `${stats.turns} 轮对话` : null,
    stats.user > 0 ? `用户 ${stats.user}` : null,
    stats.assistant > 0 ? `助手 ${stats.assistant}` : null,
    stats.system > 0 ? `系统 ${stats.system}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
