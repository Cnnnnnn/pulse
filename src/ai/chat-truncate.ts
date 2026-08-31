/**
 * 裁剪发给 LLM 的历史消息，避免上下文过长.
 */
export const MAX_LLM_MESSAGES = 18;
export const KEEP_RECENT_MESSAGES = 12;
export const SUMMARY_MAX_LINES = 8;
export const SUMMARY_USER_CHARS = 80;
export const SUMMARY_ASSISTANT_CHARS = 120;

export function summarizeOmittedTurns<T extends { role: string; content: string }>(
  messages: T[],
): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (!m?.content?.trim()) continue;
    if (m.role === "user") {
      lines.push(`· 用户：${m.content.trim().slice(0, SUMMARY_USER_CHARS)}`);
    } else if (m.role === "assistant") {
      const oneLine = m.content.trim().replace(/\s+/g, " ");
      lines.push(`· 助手：${oneLine.slice(0, SUMMARY_ASSISTANT_CHARS)}`);
    }
    if (lines.length >= SUMMARY_MAX_LINES) break;
  }
  return lines.join("\n");
}

export type HistorySummarySource = "extractive" | "llm";

export function buildOmittedHistoryNoteFromSummary<T extends { role: string; content: string }>(
  omittedCount: number,
  summary: string,
  source: HistorySummarySource = "extractive",
): T {
  const label = source === "llm" ? "LLM 压缩" : "摘要";
  const body =
    summary.length > 0
      ? `[系统] 此前 ${omittedCount} 条对话${label}（更早内容已省略）：\n${summary}\n请结合以下最近消息与当前页面上下文回答。`
      : `[系统] 此前还有 ${omittedCount} 条对话已省略以节省上下文。请基于最近消息与当前页面上下文回答。`;
  return {
    role: "user",
    content: body,
  } as T;
}

export function buildOmittedHistoryNote<T extends { role: string; content: string }>(
  omitted: T[],
  omittedCount: number,
): T {
  const summary = summarizeOmittedTurns(omitted);
  return buildOmittedHistoryNoteFromSummary(omittedCount, summary, "extractive");
}

export function trimMessagesForLlm<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  if (!Array.isArray(messages) || messages.length <= MAX_LLM_MESSAGES) {
    return messages;
  }
  const omittedCount = messages.length - KEEP_RECENT_MESSAGES;
  const omitted = messages.slice(0, omittedCount);
  const recent = messages.slice(-KEEP_RECENT_MESSAGES);
  const note = buildOmittedHistoryNote(omitted, omittedCount);
  return [note, ...recent];
}

module.exports = {
  trimMessagesForLlm,
  summarizeOmittedTurns,
  buildOmittedHistoryNote,
  MAX_LLM_MESSAGES,
  KEEP_RECENT_MESSAGES,
};
