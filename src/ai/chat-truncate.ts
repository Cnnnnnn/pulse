/**
 * 裁剪发给 LLM 的历史消息，避免上下文过长.
 */
export const MAX_LLM_MESSAGES = 18;
export const KEEP_RECENT_MESSAGES = 12;
/** P1-7: 发给 LLM 的上下文 token 预算 (估算值, 给输出留富余) */
export const MAX_LLM_TOKENS = 12_000;
export const SUMMARY_MAX_LINES = 8;
export const SUMMARY_USER_CHARS = 80;
export const SUMMARY_ASSISTANT_CHARS = 120;

/** P1-7: 估算文本 token 数 (CJK≈1 token/字符, 其它≈0.25) — 保守高估避免超窗 */
export function estimateTokens(text: unknown): number {
  const s = typeof text === "string" ? text : "";
  if (!s) return 0;
  const cjk = (s.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  const other = s.length - cjk;
  return Math.ceil(cjk + other * 0.25);
}

/** P1-7: 估算消息数组 token 总数 (每条 +4 分隔/role 开销) */
export function estimateMessagesTokens<T extends { role: string; content: string }>(
  messages: T[],
): number {
  let total = 0;
  for (const m of messages) {
    if (!m || !m.content) continue;
    total += estimateTokens(m.content) + 4;
  }
  return total;
}

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

/** P1-7: 计算需省略的前缀长度 (0 = 无需裁剪). 条数 + token 双维度. */
export function computeTrimStart<T extends { role: string; content: string }>(
  messages: T[],
): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  const totalTokens = estimateMessagesTokens(messages);
  if (messages.length <= MAX_LLM_MESSAGES && totalTokens <= MAX_LLM_TOKENS) {
    return 0;
  }
  let start = 0;
  const maxStart = messages.length - 1; // 至少保留最后 1 条
  while (start < maxStart) {
    const rest = messages.slice(start);
    const countOk = rest.length <= KEEP_RECENT_MESSAGES;
    const tokensOk = estimateMessagesTokens(rest) <= MAX_LLM_TOKENS;
    if (countOk && tokensOk) break;
    start++;
  }
  return start;
}

export function trimMessagesForLlm<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  const start = computeTrimStart(messages);
  if (start === 0) return messages;
  const omitted = messages.slice(0, start);
  const recent = messages.slice(start);
  const note = buildOmittedHistoryNote(omitted, start);
  return [note, ...recent];
}

module.exports = {
  trimMessagesForLlm,
  summarizeOmittedTurns,
  buildOmittedHistoryNote,
  computeTrimStart,
  estimateTokens,
  estimateMessagesTokens,
  MAX_LLM_MESSAGES,
  KEEP_RECENT_MESSAGES,
  MAX_LLM_TOKENS,
};
