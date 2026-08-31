/**
 * src/renderer/assistant/assistant-store.ts
 *
 * 全局 AI 助手状态（多会话 + 发送）.
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import { activeNav } from "../nav/navStore.ts";
import { currentRoute } from "../store/route-store.ts";
import { isAiReadyLocal, needsConfig } from "../store/ai-store.ts";
import { showToast } from "../store/toast-store.ts";
import { analyzeUiActionPipeline, ASSISTANT_UI_EVAL_CASES, runAssistantUiEval } from "../../ai/assistant-ui-eval.ts";
import {
  formatEvalValidationFailures,
  mergeEvalCandidatesForPaste,
} from "../../ai/assistant-eval-export.ts";
import {
  assistantTextBeforeLastUser,
} from "../../ai/assistant-nav-infer.ts";
import {
  captureEvalCandidateFromDownvote,
  clearEvalCandidates,
  clearUiTraceEvents,
  exportEvalCandidatesText,
  formatUiTraceSummary,
  formatUiTraceTitle,
  listEvalCandidates,
  recordUiTurnTrace,
  removeEvalCandidateByTs,
  summarizeUiTrace,
} from "./assistant-ui-trace.ts";
import { executeRendererActions } from "./assistant-actions.ts";
import {
  collectPageContext,
  formatPageContextForPrompt,
} from "./page-context.ts";
import {
  loadThreads,
  saveThreads,
  createThread,
  touchThread,
  normalizeThreadTitle,
  titleFromMessages,
  type ChatThread,
} from "./chat-threads.ts";
import { messagesToMarkdown, copyTextToClipboard, downloadChatMarkdown, messagesForShare, sanitizeExportFilename, type ShareMessagesOptions } from "./chat-export.ts";
import {
  ackProactiveSignals,
  ackProactiveKind,
  buildProactiveHint,
  injectProactiveSystemMessage,
  isProactiveKind,
} from "./assistant-proactive.ts";
import { proactiveKindFromMessage } from "./assistant-proactive-sync.ts";
import {
  loadAttachPageContext,
  saveAttachPageContext,
} from "./chat-attach-context.ts";
import {
  loadExportIncludeSystem,
  saveExportIncludeSystem,
  loadExportIncludeTimestamps,
  saveExportIncludeTimestamps,
} from "./chat-export-prefs.ts";
import { nextMessageFeedback, type MessageFeedback, formatFeedbackSummary, summarizeMessageFeedback } from "./chat-message-feedback.ts";
import {
  formatThreadStatsTitle,
  summarizeThreadStats,
} from "./chat-thread-stats.ts";
import type {
  AiChatMessage,
  AiChatAction,
  AiChatToolCard,
} from "../../shared/ipc-contracts";

export const globalChatOpen = signal(false);
export const chatThreads = signal<ChatThread[]>([]);
export const activeThreadId = signal<string | null>(null);
export const chatSessionsOpen = signal(false);
export const chatMessages = signal<AiChatMessage[]>([]);
export const chatLoading = signal(false);
export const chatStreaming = signal(false);
export const chatStatus = signal<string | null>(null);
export const chatError = signal<string | null>(null);
export const chatRetryText = signal<string | null>(null);
export const chatBudgetHint = signal<string | null>(null);
export const chatUiTraceSummary = signal<string | null>(null);
export const chatUiTraceTitle = signal<string>("");
export const chatUiTraceWarn = signal(false);
export const chatProactiveHint = signal<string | null>(null);
export const chatSessionQuery = signal("");
export const chatAttachPageContext = signal(true);
export const chatExportIncludeSystem = signal(loadExportIncludeSystem());
export const chatExportIncludeTimestamps = signal(loadExportIncludeTimestamps());

let _hydrated = false;

type UiPipelineSnapshot = {
  userText: string;
  modelActions: AiChatAction[];
  pipeline: ReturnType<typeof analyzeUiActionPipeline>;
  activeNav?: string;
};

const uiPipelineByAssistantTs = new Map<number, UiPipelineSnapshot>();

function rememberUiPipeline(ts: number, snap: UiPipelineSnapshot) {
  uiPipelineByAssistantTs.set(ts, snap);
  if (uiPipelineByAssistantTs.size > 60) {
    const oldest = uiPipelineByAssistantTs.keys().next().value;
    if (oldest != null) uiPipelineByAssistantTs.delete(oldest);
  }
}

function buildShareExportOpts(): ShareMessagesOptions {
  return buildShareExportOptsForMessages(chatMessages.value);
}

function buildShareExportOptsForMessages(
  msgs: AiChatMessage[],
  subset = false,
): ShareMessagesOptions {
  const thread = chatThreads.value.find((t) => t.id === activeThreadId.value);
  const feedback = formatFeedbackSummary(summarizeMessageFeedback(msgs));
  const stats = formatThreadStatsTitle(summarizeThreadStats(msgs));
  const baseTitle = thread?.title || "Pulse AI 助手对话";
  return {
    excludeSystem: !chatExportIncludeSystem.value,
    includeTimestamps: chatExportIncludeTimestamps.value,
    title: subset ? `${baseTitle}（节选）` : baseTitle,
    exportedAt: Date.now(),
    statsLine: feedback ? `${stats} · ${feedback}` : stats,
  };
}

function persistActiveThread() {
  const id = activeThreadId.value;
  if (!id) return;
  const msgs = chatMessages.value;
  chatThreads.value = chatThreads.value.map((t) =>
    t.id === id ? touchThread(t, msgs) : t,
  );
  saveThreads(chatThreads.value, id);
}

export function hydrateChatHistory() {
  if (_hydrated || typeof localStorage === "undefined") return;
  _hydrated = true;
  const { threads, activeId } = loadThreads();
  chatThreads.value = threads;
  activeThreadId.value = activeId;
  const active = threads.find((t) => t.id === activeId);
  chatMessages.value = active?.messages || [];
}

export function refreshProactiveState() {
  chatProactiveHint.value = buildProactiveHint();
  const synced = injectProactiveSystemMessage(chatMessages.value);
  const before = JSON.stringify(chatMessages.value);
  if (JSON.stringify(synced) !== before) {
    chatMessages.value = synced;
    persistActiveThread();
  }
}

function prepareGlobalChatOpen() {
  hydrateChatHistory();
  syncAttachPageContextForThread(activeThreadId.value);
  refreshProactiveState();
  globalChatOpen.value = true;
  void refreshChatBudgetHint();
  refreshChatUiTraceSummary();
}

export function refreshChatUiTraceSummary() {
  const stats = summarizeUiTrace();
  const evalCount = listEvalCandidates().length;
  chatUiTraceSummary.value = formatUiTraceSummary(stats, evalCount) || null;
  chatUiTraceTitle.value = formatUiTraceTitle(stats, evalCount);
  chatUiTraceWarn.value =
    stats.totalTurns >= 5 && stats.inferFallbackRate > 0.3;
}

export function clearChatUiTraceData() {
  clearUiTraceEvents();
  refreshChatUiTraceSummary();
}

export function clearChatEvalCandidatesData() {
  clearEvalCandidates();
  refreshChatUiTraceSummary();
}

export async function copyEvalCandidatesExport(): Promise<boolean> {
  const text = exportEvalCandidatesText();
  if (text.startsWith("// 暂无")) {
    showToast("暂无 eval 候选", "info");
    return false;
  }
  const ok = await copyTextToClipboard(text);
  if (ok) {
    showToast(`已复制 ${listEvalCandidates().length} 条 eval 候选`, "success");
  }
  return ok;
}

export async function copyMergedEvalCandidatesExport(): Promise<boolean> {
  const candidates = listEvalCandidates().map((c) => ({
    id: c.id,
    userText: c.userText,
    assistantText: c.assistantText,
    activeNav: c.activeNav,
    modelActions: c.modelActions,
    pipeline: c.pipeline,
  }));
  if (candidates.length === 0) {
    showToast("暂无 eval 候选", "info");
    return false;
  }
  const { text, added, skipped } = mergeEvalCandidatesForPaste(
    candidates,
    ASSISTANT_UI_EVAL_CASES,
  );
  if (added.length === 0) {
    showToast(`无新候选（${skipped.length} 条已与 golden 重复）`, "info");
    return false;
  }
  const validation = runAssistantUiEval(added);
  if (validation.failed.length > 0) {
    const detail = formatEvalValidationFailures(validation.results.filter((r) => !r.pass));
    showToast(
      `${validation.failed.length} 条候选未通过 eval，未复制${detail ? `\n${detail}` : ""}`,
      "error",
      6000,
    );
    return false;
  }
  const ok = await copyTextToClipboard(text);
  if (ok) {
    const skipNote =
      skipped.length > 0 ? `，跳过 ${skipped.length} 条重复` : "";
    showToast(
      `已复制 ${added.length} 条新 golden case（eval ${validation.passed}/${validation.total}）${skipNote}`,
      "success",
    );
  }
  return ok;
}

export function openGlobalChat() {
  prepareGlobalChatOpen();
}

export function dismissProactiveSystemKind(kind: string) {
  if (!isProactiveKind(kind)) return;
  ackProactiveKind(kind);
  chatMessages.value = chatMessages.value.filter(
    (m) => proactiveKindFromMessage(m) !== kind,
  );
  chatProactiveHint.value = buildProactiveHint();
  persistActiveThread();
}

export function ackProactiveHintAction(id: string) {
  if (id === "concert" || id === "apps" || id === "github") {
    ackProactiveKind(id);
  }
  chatProactiveHint.value = buildProactiveHint();
}

export type ThreadModelConfig = {
  mode: "default" | "fast" | "custom";
  custom: string;
};

export function setActiveThreadModel(
  mode: "default" | "fast" | "custom",
  custom = "",
) {
  const id = activeThreadId.value;
  if (!id) return;
  chatThreads.value = chatThreads.value.map((t) =>
    t.id === id
      ? {
          ...t,
          modelMode: mode === "default" ? undefined : mode,
          modelCustom: mode === "custom" ? custom.trim() : undefined,
        }
      : t,
  );
  saveThreads(chatThreads.value, id);
}

export function getActiveThreadModelConfig(): ThreadModelConfig {
  const id = activeThreadId.value;
  const thread = chatThreads.value.find((t) => t.id === id);
  if (thread?.modelMode === "fast") return { mode: "fast", custom: "" };
  if (thread?.modelMode === "custom") {
    return { mode: "custom", custom: thread.modelCustom || "" };
  }
  return { mode: "default", custom: "" };
}

/** @deprecated use getActiveThreadModelConfig */
export function getActiveThreadModel(): "default" | "fast" {
  const cfg = getActiveThreadModelConfig();
  return cfg.mode === "fast" ? "fast" : "default";
}

function resolveChatModelOption(): string | undefined {
  const cfg = getActiveThreadModelConfig();
  if (cfg.mode === "fast") return "__fast__";
  if (cfg.mode === "custom" && cfg.custom) return cfg.custom;
  return undefined;
}

export function dismissProactiveHint() {
  ackProactiveSignals();
  chatProactiveHint.value = null;
}

export async function refreshChatBudgetHint() {
  if (typeof api.tokenBudgetGet !== "function") {
    chatBudgetHint.value = null;
    return;
  }
  try {
    const r = await api.tokenBudgetGet();
    const limit = r?.config?.dailyLimit ?? 0;
    if (!r?.ok || limit <= 0) {
      chatBudgetHint.value = null;
      return;
    }
    const used = r.todaySpend ?? 0;
    const pct = Math.round((used / limit) * 100);
    if (pct >= 80) {
      chatBudgetHint.value = `今日 Token 已用 ${pct}%（${used.toLocaleString()} / ${limit.toLocaleString()}）`;
    } else {
      chatBudgetHint.value = null;
    }
  } catch {
    chatBudgetHint.value = null;
  }
}

export function closeGlobalChat() {
  persistActiveThread();
  globalChatOpen.value = false;
  chatSessionsOpen.value = false;
}

export function toggleGlobalChat() {
  if (!globalChatOpen.value) {
    prepareGlobalChatOpen();
  } else {
    closeGlobalChat();
  }
}

export function toggleChatSessions() {
  chatSessionsOpen.value = !chatSessionsOpen.value;
  if (!chatSessionsOpen.value) chatSessionQuery.value = "";
}

export function renameChatThread(id: string, title: string) {
  if (chatLoading.value) return;
  const normalized = normalizeThreadTitle(title);
  chatThreads.value = chatThreads.value.map((t) =>
    t.id === id ? { ...t, title: normalized, updatedAt: Date.now() } : t,
  );
  saveThreads(chatThreads.value, activeThreadId.value);
}

export function retitleChatThreadFromMessages(id?: string) {
  if (chatLoading.value) return false;
  const targetId = id || activeThreadId.value;
  if (!targetId) return false;
  const thread = chatThreads.value.find((t) => t.id === targetId);
  if (!thread) return false;
  const msgs =
    targetId === activeThreadId.value ? chatMessages.value : thread.messages;
  const title = titleFromMessages(msgs);
  if (title === thread.title) return false;
  renameChatThread(targetId, title);
  return true;
}

export function retitleAllChatThreads(): number {
  if (chatLoading.value) return 0;
  persistActiveThread();
  let updated = 0;
  chatThreads.value = chatThreads.value.map((t) => {
    const msgs =
      t.id === activeThreadId.value ? chatMessages.value : t.messages;
    if (msgs.length === 0) return t;
    const title = titleFromMessages(msgs);
    if (title === t.title) return t;
    updated++;
    return { ...t, title, updatedAt: Date.now() };
  });
  if (updated > 0) saveThreads(chatThreads.value, activeThreadId.value);
  return updated;
}

export function togglePinChatThread(id: string) {
  if (chatLoading.value) return;
  chatThreads.value = chatThreads.value.map((t) =>
    t.id === id ? { ...t, pinned: !t.pinned, updatedAt: Date.now() } : t,
  );
  saveThreads(chatThreads.value, activeThreadId.value);
}

export async function resendFromUserMessage(index: number) {
  if (chatLoading.value) return;
  const text = truncateChatFromUserMessage(index);
  if (!text) return;
  chatRetryText.value = text;
  await sendChatMessage(text, { skipUserAppend: true });
}

export function truncateChatFromUserMessage(index: number): string | null {
  if (chatLoading.value) return null;
  const msgs = chatMessages.value;
  const m = msgs[index];
  if (!m || m.role !== "user") return null;
  const text = m.content.trim();
  if (!text) return null;
  chatMessages.value = msgs.slice(0, index);
  chatError.value = null;
  persistActiveThread();
  return text;
}

export function setAttachPageContext(attach: boolean) {
  chatAttachPageContext.value = attach;
  saveAttachPageContext(activeThreadId.value, attach);
}

export function setExportIncludeSystem(include: boolean) {
  chatExportIncludeSystem.value = include;
  saveExportIncludeSystem(include);
}

export function setExportIncludeTimestamps(include: boolean) {
  chatExportIncludeTimestamps.value = include;
  saveExportIncludeTimestamps(include);
}

export function syncAttachPageContextForThread(threadId: string | null) {
  chatAttachPageContext.value = loadAttachPageContext(threadId);
}

export function clearProactiveSystemMessages() {
  if (chatLoading.value) return;
  const next = chatMessages.value.filter((m) => !proactiveKindFromMessage(m));
  if (next.length === chatMessages.value.length) return;
  chatMessages.value = next;
  persistActiveThread();
}

export function deleteMessageAt(index: number) {
  if (chatLoading.value) return;
  const msgs = chatMessages.value;
  if (index < 0 || index >= msgs.length) return;
  chatMessages.value = msgs.filter((_, i) => i !== index);
  chatError.value = null;
  persistActiveThread();
}

export function setMessageFeedback(index: number, vote: MessageFeedback) {
  if (chatLoading.value) return;
  const msgs = chatMessages.value;
  if (index < 0 || index >= msgs.length) return;
  const m = msgs[index];
  if (m.role !== "assistant") return;
  const feedback = nextMessageFeedback(m.feedback, vote);
  chatMessages.value = msgs.map((msg, i) =>
    i === index ? { ...msg, feedback } : msg,
  );
  persistActiveThread();

  if (feedback === "down" && m.ts) {
    const snap = uiPipelineByAssistantTs.get(m.ts);
    if (snap) {
      captureEvalCandidateFromDownvote({
        userText: snap.userText,
        assistantText: m.content || "",
        modelActions: snap.modelActions,
        pipeline: snap.pipeline,
        activeNav: snap.activeNav,
        ts: m.ts,
      });
      refreshChatUiTraceSummary();
    }
  }

  if (feedback === "up" && m.ts) {
    removeEvalCandidateByTs(m.ts);
    refreshChatUiTraceSummary();
  }
}

export function clearMessageFeedback() {
  if (chatLoading.value) return;
  const hasFeedback = chatMessages.value.some((m) => m.feedback);
  if (!hasFeedback) return;
  chatMessages.value = chatMessages.value.map((m) =>
    m.feedback ? { ...m, feedback: undefined } : m,
  );
  persistActiveThread();
}

export function clearNegativeMessageFeedback() {
  if (chatLoading.value) return;
  const hasDown = chatMessages.value.some((m) => m.feedback === "down");
  if (!hasDown) return;
  chatMessages.value = chatMessages.value.map((m) =>
    m.feedback === "down" ? { ...m, feedback: undefined } : m,
  );
  persistActiveThread();
}

export function clearPositiveMessageFeedback() {
  if (chatLoading.value) return;
  const hasUp = chatMessages.value.some((m) => m.feedback === "up");
  if (!hasUp) return;
  chatMessages.value = chatMessages.value.map((m) =>
    m.feedback === "up" ? { ...m, feedback: undefined } : m,
  );
  persistActiveThread();
}

export function duplicateChatThread(sourceId?: string) {
  if (chatLoading.value) return;
  persistActiveThread();
  const srcId = sourceId || activeThreadId.value;
  if (!srcId) return;
  const src = chatThreads.value.find((t) => t.id === srcId);
  if (!src) return;
  const t = createThread();
  t.title = normalizeThreadTitle(
    src.title === "新对话" ? "新对话（副本）" : `${src.title}（副本）`,
  );
  t.messages = [...src.messages];
  t.modelMode = src.modelMode;
  t.modelCustom = src.modelCustom;
  t.pinned = false;
  chatThreads.value = [t, ...chatThreads.value];
  activeThreadId.value = t.id;
  chatMessages.value = injectProactiveSystemMessage(t.messages);
  chatProactiveHint.value = buildProactiveHint();
  chatError.value = null;
  chatRetryText.value = null;
  chatSessionsOpen.value = false;
  saveThreads(chatThreads.value, t.id);
}

export function newChatThread() {
  if (chatLoading.value) return;
  persistActiveThread();
  const t = createThread();
  chatThreads.value = [t, ...chatThreads.value];
  activeThreadId.value = t.id;
  chatMessages.value = [];
  chatError.value = null;
  chatRetryText.value = null;
  syncAttachPageContextForThread(t.id);
  saveThreads(chatThreads.value, t.id);
}

export function switchChatThread(id: string) {
  if (chatLoading.value || id === activeThreadId.value) return;
  persistActiveThread();
  activeThreadId.value = id;
  const t = chatThreads.value.find((x) => x.id === id);
  chatMessages.value = injectProactiveSystemMessage(t?.messages || []);
  chatProactiveHint.value = buildProactiveHint();
  syncAttachPageContextForThread(id);
  chatError.value = null;
  chatRetryText.value = null;
  chatSessionsOpen.value = false;
  saveThreads(chatThreads.value, id);
}

export function deleteChatThread(id: string) {
  if (chatLoading.value) return;
  const rest = chatThreads.value.filter((t) => t.id !== id);
  if (rest.length === 0) {
    const t = createThread();
    chatThreads.value = [t];
    activeThreadId.value = t.id;
    chatMessages.value = [];
  } else if (activeThreadId.value === id) {
    activeThreadId.value = rest[0].id;
    chatMessages.value = injectProactiveSystemMessage(rest[0].messages);
    chatThreads.value = rest;
    syncAttachPageContextForThread(rest[0].id);
  } else {
    chatThreads.value = rest;
  }
  saveThreads(chatThreads.value, activeThreadId.value);
}

export function pruneEmptyChatThreads(): number {
  if (chatLoading.value) return 0;
  persistActiveThread();
  const threads = chatThreads.value;
  const emptyCount = threads.filter((t) => t.messages.length === 0).length;
  if (emptyCount === 0) return 0;

  const nonEmpty = threads.filter((t) => t.messages.length > 0);
  let next: ChatThread[];
  if (nonEmpty.length > 0) {
    next = nonEmpty;
  } else {
    const keepId = activeThreadId.value || threads[0]?.id;
    if (!keepId || threads.length <= 1) return 0;
    next = threads.filter((t) => t.id === keepId);
  }

  const removed = threads.length - next.length;
  if (removed <= 0) return 0;

  chatThreads.value = next;
  if (!next.some((t) => t.id === activeThreadId.value)) {
    const target = next[0];
    activeThreadId.value = target.id;
    chatMessages.value = injectProactiveSystemMessage(target.messages);
    syncAttachPageContextForThread(target.id);
  }
  saveThreads(chatThreads.value, activeThreadId.value);
  return removed;
}

export function clearChatHistory() {
  if (chatLoading.value) return;
  chatMessages.value = [];
  chatError.value = null;
  chatRetryText.value = null;
  persistActiveThread();
}

export async function copyChatConversation() {
  const shareOpts = buildShareExportOpts();
  const md = messagesToMarkdown(messagesForShare(chatMessages.value, shareOpts), shareOpts);
  if (!md) {
    showToast("当前对话为空", "info", 2000);
    return;
  }
  const ok = await copyTextToClipboard(md);
  showToast(ok ? "已复制对话到剪贴板" : "复制失败", ok ? "info" : "error", 2500);
}

export async function copyChatMessageSubset(indices: number[]) {
  const picked = indices
    .map((i) => chatMessages.value[i])
    .filter((m): m is AiChatMessage => !!m);
  if (picked.length === 0) {
    showToast("没有可复制的消息", "info", 2000);
    return;
  }
  const shareOpts = buildShareExportOptsForMessages(picked, true);
  const md = messagesToMarkdown(messagesForShare(picked, shareOpts), shareOpts);
  if (!md) {
    showToast("匹配内容为空", "info", 2000);
    return;
  }
  const ok = await copyTextToClipboard(md);
  showToast(
    ok ? `已复制 ${picked.length} 条匹配消息` : "复制失败",
    ok ? "info" : "error",
    2500,
  );
}

export function exportChatConversation() {
  const shareOpts = buildShareExportOpts();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeExportFilename(shareOpts.title || "pulse-chat")}-${date}.md`;
  const ok = downloadChatMarkdown(
    chatMessages.value,
    filename,
    shareOpts,
  );
  showToast(ok ? "已导出 Markdown 文件" : "导出失败", ok ? "info" : "error", 2500);
}

export function exportChatMessageSubset(indices: number[]) {
  const picked = indices
    .map((i) => chatMessages.value[i])
    .filter((m): m is AiChatMessage => !!m);
  if (picked.length === 0) {
    showToast("没有可导出的消息", "info", 2000);
    return;
  }
  const shareOpts = buildShareExportOptsForMessages(picked, true);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeExportFilename(shareOpts.title || "pulse-chat")}-matches-${date}.md`;
  const ok = downloadChatMarkdown(
    picked,
    filename,
    shareOpts,
  );
  showToast(
    ok ? `已导出 ${picked.length} 条匹配消息` : "导出失败",
    ok ? "info" : "error",
    2500,
  );
}

export async function retryLastMessage() {
  const text = chatRetryText.value;
  if (!text || chatLoading.value) return;
  chatError.value = null;
  await sendChatMessage(text);
}

export function findLastUserMessageIndex(messages: AiChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

export { findFirstUserMessageIndex } from "./chat-message-index.ts";

export async function regenerateLastResponse() {
  if (chatLoading.value) return;
  const idx = findLastUserMessageIndex(chatMessages.value);
  if (idx < 0) return;
  const userText = chatMessages.value[idx]?.content?.trim();
  if (!userText) return;
  chatMessages.value = chatMessages.value.slice(0, idx + 1);
  chatError.value = null;
  chatRetryText.value = userText;
  persistActiveThread();
  await sendChatMessage(userText, { skipUserAppend: true });
}

export async function copyChatMessage(message: AiChatMessage) {
  const text = message.content?.trim();
  if (!text) {
    showToast("消息为空", "info", 2000);
    return;
  }
  const ok = await copyTextToClipboard(text);
  showToast(ok ? "已复制" : "复制失败", ok ? "info" : "error", 2000);
}

export async function openGlobalChatWithMessage(text?: string) {
  prepareGlobalChatOpen();
  const trimmed = (text || "").trim();
  if (trimmed) await sendChatMessage(trimmed);
}

export async function cancelChat() {
  if (!chatLoading.value) return;
  try {
    if (typeof api.aiChatCancel === "function") {
      await api.aiChatCancel();
    }
  } catch {
    /* best effort */
  }
  chatLoading.value = false;
  chatStreaming.value = false;
  chatStatus.value = null;
  showToast("已停止生成", "info", 2000);
}

export async function sendChatMessage(
  text: string,
  opts?: { skipUserAppend?: boolean },
) {
  const trimmed = text.trim();
  if (!trimmed || chatLoading.value) return;

  if (needsConfig()) {
    showToast("请先在设置中配置 AI（Provider + API Key）", "warn", 5000);
    return;
  }

  if (!activeThreadId.value) {
    newChatThread();
  }

  const userMsg: AiChatMessage = {
    role: "user",
    content: trimmed,
    ts: Date.now(),
  };
  const nextHistory = opts?.skipUserAppend
    ? [...chatMessages.value]
    : [...chatMessages.value, userMsg];
  if (!opts?.skipUserAppend) {
    chatMessages.value = nextHistory;
    persistActiveThread();
  }
  chatLoading.value = true;
  chatStreaming.value = false;
  chatStatus.value = "思考中…";
  chatError.value = null;
  chatRetryText.value = trimmed;

  const assistantIndex = nextHistory.length;
  const assistantTs = Date.now();
  chatMessages.value = [
    ...nextHistory,
    { role: "assistant", content: "", ts: assistantTs },
  ];

  let unsubDelta: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;
  if (typeof api.onAiChatDelta === "function") {
    unsubDelta = api.onAiChatDelta((payload) => {
      if (!payload || typeof payload.delta !== "string") return;
      chatStreaming.value = true;
      chatStatus.value = null;
      chatMessages.value = chatMessages.value.map((m, idx) =>
        idx === assistantIndex
          ? { ...m, content: (m.content || "") + payload.delta }
          : m,
      );
    });
  }
  if (typeof api.onAiChatStatus === "function") {
    unsubStatus = api.onAiChatStatus((payload) => {
      if (!payload || typeof payload.status !== "string") return;
      if (!chatStreaming.value) {
        chatStatus.value = payload.status;
      }
    });
  }

  const pageCtx = collectPageContext();
  const attach = chatAttachPageContext.value;

  try {
    const apiMessages = nextHistory
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
    const resp = await api.aiChat({
      messages: apiMessages,
      stream: true,
      model: resolveChatModelOption(),
      context: attach
        ? {
            activeNav: activeNav.value,
            route: currentRoute.value,
            pageSnapshot: formatPageContextForPrompt(pageCtx),
            pageData: pageCtx as unknown as Record<string, unknown>,
          }
        : {
            activeNav: activeNav.value,
            route: currentRoute.value,
          },
    });

    if (!resp || !resp.ok) {
      const reason = (resp && resp.reason) || "unknown";
      if (reason === "cancelled") {
        const partial = chatMessages.value[assistantIndex]?.content || "";
        if (partial) {
          chatMessages.value = nextHistory.concat([
            { role: "assistant", content: partial },
          ]);
          persistActiveThread();
        } else {
          chatMessages.value = nextHistory;
          persistActiveThread();
        }
        return;
      }
      chatError.value = reasonToMessage(reason);
      chatMessages.value = nextHistory;
      persistActiveThread();
      return;
    }

    const toolCards: AiChatToolCard[] =
      resp.toolResults && resp.toolResults.length > 0
        ? resp.toolResults.map((t) => ({
            tool: t.tool,
            summary: t.summary,
            items: t.items,
          }))
        : [];

    const finalText = resp.text || chatMessages.value[assistantIndex]?.content || "";

    chatMessages.value = nextHistory.concat([
      {
        role: "assistant",
        content: finalText,
        ts: assistantTs,
        toolCards: toolCards.length > 0 ? toolCards : undefined,
      },
    ]);
    persistActiveThread();
    chatRetryText.value = null;
    void refreshChatBudgetHint();

    const lastUserText =
      [...apiMessages].reverse().find((m) => m.role === "user")?.content || trimmed;
    const modelActions = (resp.actions as AiChatAction[]) || [];
    const priorAssistant = assistantTextBeforeLastUser(apiMessages);
    const pipeline = analyzeUiActionPipeline(lastUserText, modelActions, {
      priorAssistantText: priorAssistant,
      assistantText: finalText,
      activeNav: activeNav.value,
    });
    recordUiTurnTrace(lastUserText, pipeline, {
      activeNav: activeNav.value,
      assistantText: finalText,
    });
    refreshChatUiTraceSummary();
    rememberUiPipeline(assistantTs, {
      userText: lastUserText,
      modelActions,
      pipeline,
      activeNav: activeNav.value,
    });

    if (pipeline.actions.length > 0) {
      await executeRendererActions(pipeline.actions);
    }
  } catch (err: any) {
    chatError.value = err instanceof Error ? err.message : String(err);
    chatMessages.value = nextHistory;
    persistActiveThread();
  } finally {
    if (unsubDelta) unsubDelta();
    if (unsubStatus) unsubStatus();
    chatLoading.value = false;
    chatStreaming.value = false;
    chatStatus.value = null;
  }
}

function reasonToMessage(reason: string): string {
  switch (reason) {
    case "api_key_missing":
      return "未配置 API Key，请前往设置 → AI 配置";
    case "config_missing":
    case "unsupported_provider":
    case "model_missing":
      return "AI 配置不完整，请前往设置 → AI 配置";
    case "budget_exceeded":
      return "今日 Token 预算已用尽";
    case "empty_messages":
      return "消息为空";
    case "cancelled":
      return "已取消";
    case "llm_failed":
      return "AI 请求失败，请稍后重试";
    default:
      return `请求失败: ${reason}`;
  }
}

export { isAiReadyLocal, needsConfig };
