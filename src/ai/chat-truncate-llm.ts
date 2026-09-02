/**
 * 长会话历史 LLM 摘要 — 失败时回退抽取式摘要（chat-truncate.ts）.
 */
import { chatCompletion, resolveSharedAiConfig } from "./shared-llm";
import { pickFastModel } from "./assistant-model-route";
import {
  buildOmittedHistoryNote,
  buildOmittedHistoryNoteFromSummary,
  summarizeOmittedTurns,
  computeTrimStart,
} from "./chat-truncate";

export const LLM_SUMMARY_MIN_OMITTED = 4;
export const LLM_SUMMARY_TRANSCRIPT_CHARS = 6000;
export const LLM_SUMMARY_MAX_CHARS = 500;

const SUMMARY_SYSTEM_PROMPT =
  "你是 Pulse 助手会话摘要器。用简体中文输出 3-6 条要点（· 开头），概括：用户意图、已查询/已打开的内容、待办、关键结论。不要编造，不要复述最近几条 verbatim。最多 400 字。";

export type TrimMessagesOpts = {
  /** 默认读配置；显式 false 强制抽取式摘要 */
  useLlmSummary?: boolean;
  isAborted?: () => boolean;
};

function isLlmHistorySummaryEnabled(): boolean {
  try {
    const stateStore: any = require("../main/state-store.js");
    const cfg = stateStore.loadAISessionsConfig?.();
    if (cfg?.assistantLlmHistorySummary === false) return false;
  } catch {
    /* ponytail: 读配置失败时保持默认开启 */
  }
  return true;
}

function formatTranscript<T extends { role: string; content: string }>(
  messages: T[],
): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (!m?.content?.trim()) continue;
    const role = m.role === "assistant" ? "助手" : "用户";
    lines.push(`${role}：${m.content.trim()}`);
  }
  return lines.join("\n").slice(0, LLM_SUMMARY_TRANSCRIPT_CHARS);
}

export async function summarizeOmittedTurnsWithLlm<
  T extends { role: string; content: string },
>(omitted: T[], opts: TrimMessagesOpts = {}): Promise<string | null> {
  if (omitted.length < LLM_SUMMARY_MIN_OMITTED) return null;
  if (opts.isAborted?.()) return null;

  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) return null;

  const fastModel = pickFastModel(resolved.providerId as string);
  const model = fastModel || (resolved.model as string);
  const transcript = formatTranscript(omitted);
  if (!transcript.trim()) return null;

  const llm = await chatCompletion(
    [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: transcript },
    ],
    { model },
  );

  if (!llm.ok || !llm.text?.trim()) return null;
  return llm.text.trim().slice(0, LLM_SUMMARY_MAX_CHARS);
}

export async function trimMessagesForLlmAsync<
  T extends { role: string; content: string },
>(messages: T[], opts: TrimMessagesOpts = {}): Promise<T[]> {
  const start = computeTrimStart(messages);
  if (start === 0) return messages;
  const omittedCount = start;
  const omitted = messages.slice(0, start);
  const recent = messages.slice(start);

  if (opts.isAborted?.()) {
    return [buildOmittedHistoryNote(omitted, omittedCount) as T, ...recent];
  }

  let summary = summarizeOmittedTurns(omitted);
  let source: "extractive" | "llm" = "extractive";

  if (opts.useLlmSummary !== false && isLlmHistorySummaryEnabled()) {
    const llmSummary = await summarizeOmittedTurnsWithLlm(omitted, opts);
    if (llmSummary) {
      summary = llmSummary;
      source = "llm";
    }
  }

  const note = buildOmittedHistoryNoteFromSummary(omittedCount, summary, source);
  return [note as T, ...recent];
}
