/**
 * src/renderer/assistant/GlobalChatDrawer.tsx
 *
 * 全局 AI 助手右侧对话抽屉.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { DrawerShell } from "../components/DrawerShell.tsx";
import {
  globalChatOpen,
  closeGlobalChat,
  chatMessages,
  chatThreads,
  activeThreadId,
  chatSessionsOpen,
  chatLoading,
  chatStreaming,
  chatStatus,
  chatError,
  chatRetryText,
  chatBudgetHint,
  chatUiTraceSummary,
  chatUiTraceTitle,
  clearChatUiTraceData,
  clearChatEvalCandidatesData,
  copyEvalCandidatesExport,
  copyMergedEvalCandidatesExport,
  sendChatMessage,
  clearChatHistory,
  cancelChat,
  retryLastMessage,
  newChatThread,
  duplicateChatThread,
  toggleChatSessions,
  truncateChatFromUserMessage,
  copyChatConversation,
  exportChatConversation,
  needsConfig,
  getActiveThreadModelConfig,
  setActiveThreadModel,
  chatAttachPageContext,
  setAttachPageContext,
  syncAttachPageContextForThread,
  clearProactiveSystemMessages,
  chatExportIncludeSystem,
  setExportIncludeSystem,
  chatExportIncludeTimestamps,
  setExportIncludeTimestamps,
  clearMessageFeedback,
  clearNegativeMessageFeedback,
  clearPositiveMessageFeedback,
  findFirstUserMessageIndex,
  findLastUserMessageIndex,
  copyChatMessageSubset,
  exportChatMessageSubset,
} from "./assistant-store.ts";
import { proactiveKindFromMessage } from "./assistant-proactive-sync.ts";
import { ChatQuickActionsBar } from "./ChatQuickActionsBar.tsx";
import { setActiveNav, activeNav } from "../nav/navStore.ts";
import { navigateTo } from "../store/route-store.ts";
import { getChatSuggestions } from "./chat-suggestions.ts";
import { ChatToolCards } from "./ChatToolCards.tsx";
import { CollapsibleMessageContent } from "./CollapsibleMessageContent.tsx";
import "./global-chat.css";
import { ChatSystemMessage } from "./ChatSystemMessage.tsx";
import { listAssistantModelPresets, isModelLikelyForProvider, resolveAssistantProviderId, formatThreadModelLabel } from "./assistant-model-presets.ts";
import { ChatMessageActions } from "./ChatMessageActions.tsx";
import { ChatSessionsPanel } from "./ChatSessionsPanel.tsx";
import { ChatMessageTools } from "./ChatMessageTools.tsx";
import {
  IconInfo,
  IconMoreHorizontal,
  IconSparkles,
  IconX,
  IconArrowUp,
} from "../components/icons.tsx";
import {
  collectPageContext,
  formatPageContextBadge,
  formatPageContextSnippet,
} from "./page-context.ts";
import {
  formatFeedbackSummary,
  summarizeMessageFeedback,
} from "./chat-message-feedback.ts";
import {
  countMessagesForRoleFilter,
  messageMatchesRoleFilter,
  type MessageRoleFilter,
} from "./chat-message-filter.ts";
import {
  messageMatchesQuery,
  wrapMatchPosition,
} from "./chat-message-search.ts";
import {
  getVisibleMessageIndices,
  hasActiveMessageViewFilter,
  findScrollAnchorMessageIndex,
  resolveAdjacentUserMessageIndex,
  findFirstAssistantMessageIndex,
  findLastAssistantMessageIndex,
  resolveAdjacentAssistantMessageIndex,
} from "./chat-message-index.ts";
import {
  formatThreadStatsLabel,
  formatThreadStatsTitle,
  summarizeThreadStats,
} from "./chat-thread-stats.ts";
import {
  clearChatDraft,
  loadChatDraft,
  saveChatDraft,
} from "./chat-input-draft.ts";
import {
  clearMessageSearchDraft,
  loadMessageSearchDraft,
  saveMessageSearchDraft,
} from "./chat-message-search-draft.ts";
import {
  loadMessageRoleFilterDraft,
  saveMessageRoleFilterDraft,
} from "./chat-message-filter-draft.ts";
import { saveMessageToolsOpen } from "./chat-message-tools-prefs.ts";
import {
  appendQuoteToDraft,
  formatQuotedMessage,
} from "./chat-message-quote.ts";
import { aiSessionsConfig } from "../store/ai-store.ts";
import {
  AssistantQueuePanel,
  getAssistantQueueGroups,
} from "./AssistantQueuePanel.tsx";

export function GlobalChatDrawer() {
  const open = globalChatOpen.value;
  const messages = chatMessages.value;
  const threads = chatThreads.value;
  const currentThreadId = activeThreadId.value;
  const sessionsOpen = chatSessionsOpen.value;
  const loading = chatLoading.value;
  const streaming = chatStreaming.value;
  const status = chatStatus.value;
  const error = chatError.value;
  const retryText = chatRetryText.value;
  const budgetHint = chatBudgetHint.value;
  const uiTraceSummary = chatUiTraceSummary.value;
  const uiTraceTitle = chatUiTraceTitle.value;
  const threadModel = getActiveThreadModelConfig();
  const modelPresets = listAssistantModelPresets(aiSessionsConfig.value);
  const customModelMismatch =
    threadModel.mode === "custom" &&
    threadModel.custom.trim() &&
    !isModelLikelyForProvider(
      threadModel.custom,
      resolveAssistantProviderId(aiSessionsConfig.value),
    );
  const notReady = needsConfig();
  const suggestions = getChatSuggestions(activeNav.value);
  const modelLabel = formatThreadModelLabel(aiSessionsConfig.value, threadModel);
  const pageContextBadge = formatPageContextBadge(collectPageContext());
  const attachPageContext = chatAttachPageContext.value;
  const exportIncludeSystem = chatExportIncludeSystem.value;
  const exportIncludeTimestamps = chatExportIncludeTimestamps.value;
  const hasProactiveSystem = messages.some((m) => proactiveKindFromMessage(m));
  const exportHint = exportIncludeSystem ? "含系统提醒" : "不含系统提醒";
  const feedbackSummary = formatFeedbackSummary(
    summarizeMessageFeedback(messages),
  );
  const feedbackStats = summarizeMessageFeedback(messages);
  const threadStats = summarizeThreadStats(messages);
  const threadStatsLabel = formatThreadStatsLabel(threadStats);
  const threadStatsTitle = formatThreadStatsTitle(threadStats);
  const queueCount = getAssistantQueueGroups().reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const lastAssistantIdx = loading
    ? -1
    : (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") return i;
        }
        return -1;
      })();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevThreadRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(messages.length);
  const searchRef = useRef<HTMLInputElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [activeMatchPos, setActiveMatchPos] = useState(0);
  const [roleFilter, setRoleFilter] = useState<MessageRoleFilter>("all");
  const [messageToolsOpen, setMessageToolsOpen] = useState(false);
  const [surface, setSurface] = useState<"queue" | "chat">("queue");

  const roleFilterCount = countMessagesForRoleFilter(messages, roleFilter);

  const viewFilter = { roleFilter, searchQuery: messageQuery };
  const hasViewFilter = hasActiveMessageViewFilter(viewFilter);
  const visibleIndices = hasViewFilter
    ? getVisibleMessageIndices(messages, viewFilter)
    : [];
  const matchIndices = messageQuery.trim()
    ? getVisibleMessageIndices(messages, viewFilter)
    : [];
  const presentationMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => {
      if (message.role !== "system") return true;
      if (roleFilter === "system" || messageQuery.trim()) return true;
      return !proactiveKindFromMessage(message);
    });
  const activeMessageIndex =
    matchIndices.length > 0
      ? matchIndices[wrapMatchPosition(activeMatchPos, matchIndices.length)]
      : -1;

  function searchClassForIndex(index: number): string {
    const q = messageQuery.trim();
    if (!q) return "";
    const hit = messageMatchesQuery(messages[index], q);
    const active = index === activeMessageIndex;
    let cls = "";
    if (!hit) cls += " is-search-dim";
    if (hit) cls += " is-search-hit";
    if (active) cls += " is-search-active";
    return cls;
  }

  function gotoMatch(delta: number) {
    if (matchIndices.length === 0) return;
    setActiveMatchPos((pos) => wrapMatchPosition(pos + delta, matchIndices.length));
  }

  function clearMessageSearch() {
    setMessageQuery("");
    setActiveMatchPos(0);
    if (currentThreadId) clearMessageSearchDraft(currentThreadId);
  }

  function updateMessageQuery(query: string) {
    setMessageQuery(query);
    setActiveMatchPos(0);
    if (currentThreadId) saveMessageSearchDraft(currentThreadId, query);
  }

  const activeThread = threads.find((t) => t.id === currentThreadId);

  function scrollMessagesToBottom() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowScrollDown(false);
  }

  function scrollMessagesToTop() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setShowScrollUp(false);
    setShowScrollDown(el.scrollHeight - el.clientHeight > 48);
  }

  function scrollToMessageIndex(index: number) {
    if (index < 0) return;
    const el = listRef.current?.querySelector(`[data-msg-index="${index}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function jumpToLastUserMessage() {
    scrollToMessageIndex(findLastUserMessageIndex(messages));
  }

  function jumpToFirstUserMessage() {
    scrollToMessageIndex(findFirstUserMessageIndex(messages));
  }

  function jumpToAdjacentUserMessage(direction: "prev" | "next") {
    const anchor = findScrollAnchorMessageIndex(listRef.current, messages.length);
    const idx = resolveAdjacentUserMessageIndex(messages, anchor, direction);
    scrollToMessageIndex(idx);
  }

  function resetMessageViewFilters() {
    setRoleFilter("all");
    clearMessageSearch();
    if (currentThreadId) saveMessageRoleFilterDraft(currentThreadId, "all");
  }

  function jumpToFirstAssistantMessage() {
    scrollToMessageIndex(findFirstAssistantMessageIndex(messages));
  }

  function jumpToLastAssistantMessage() {
    scrollToMessageIndex(findLastAssistantMessageIndex(messages));
  }

  function jumpToAdjacentAssistantMessage(direction: "prev" | "next") {
    const anchor = findScrollAnchorMessageIndex(listRef.current, messages.length);
    const idx = resolveAdjacentAssistantMessageIndex(messages, anchor, direction);
    scrollToMessageIndex(idx);
  }

  function handleQuoteMessage(index: number) {
    const m = messages[index];
    if (!m?.content?.trim()) return;
    const quote = formatQuotedMessage(m.content);
    const el = inputRef.current;
    if (!el) return;
    const next = appendQuoteToDraft(el.value, quote);
    el.value = next;
    if (currentThreadId) saveChatDraft(currentThreadId, next);
    el.focus();
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, currentThreadId]);

  useEffect(() => {
    const prev = prevThreadRef.current;
    if (prev && prev !== currentThreadId && inputRef.current) {
      saveChatDraft(prev, inputRef.current.value);
    }
    if (open && currentThreadId && inputRef.current) {
      inputRef.current.value = loadChatDraft(currentThreadId);
    }
    if (prev && prev !== currentThreadId) {
      saveMessageSearchDraft(prev, messageQuery);
      saveMessageRoleFilterDraft(prev, roleFilter);
    }
    if (open && currentThreadId) {
      setMessageQuery(loadMessageSearchDraft(currentThreadId));
      setRoleFilter(loadMessageRoleFilterDraft(currentThreadId));
      setActiveMatchPos(0);
    }
    if (currentThreadId) {
      syncAttachPageContextForThread(currentThreadId);
    }
    prevThreadRef.current = currentThreadId;
  }, [currentThreadId, open]);

  useEffect(() => {
    if (!open) return;
    return () => {
      if (currentThreadId) {
        saveMessageSearchDraft(currentThreadId, messageQuery);
        saveMessageRoleFilterDraft(currentThreadId, roleFilter);
      }
    };
  }, [open, currentThreadId, messageQuery, roleFilter]);

  useEffect(() => {
    if (!messageQuery.trim() || activeMessageIndex < 0) return;
    const el = listRef.current?.querySelector(
      `[data-msg-index="${activeMessageIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messageQuery, activeMessageIndex]);

  useEffect(() => {
    if (matchIndices.length === 0) {
      setActiveMatchPos(0);
      return;
    }
    setActiveMatchPos((pos) =>
      Math.min(wrapMatchPosition(pos, matchIndices.length), matchIndices.length - 1),
    );
  }, [messageQuery, messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const messageCountIncreased = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (nearBottom || messageCountIncreased || loading || streaming) {
      el.scrollTop = el.scrollHeight;
      setShowScrollDown(false);
      if (messageCountIncreased && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const current = listRef.current;
          if (!current) return;
          current.scrollTop = current.scrollHeight;
          setShowScrollDown(false);
        });
      }
    }
  }, [messages, loading, streaming]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;
    function onScroll() {
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      const nearTop = el.scrollTop < 48;
      setShowScrollDown(!nearBottom);
      setShowScrollUp(!nearTop && el.scrollHeight > el.clientHeight + 48);
    }
    el.addEventListener("scroll", onScroll);
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        newChatThread();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        jumpToLastUserMessage();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        jumpToFirstUserMessage();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "ArrowUp") {
        e.preventDefault();
        jumpToAdjacentUserMessage("prev");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "ArrowDown") {
        e.preventDefault();
        jumpToAdjacentUserMessage("next");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        resetMessageViewFilters();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        jumpToLastAssistantMessage();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        jumpToFirstAssistantMessage();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        jumpToAdjacentAssistantMessage("prev");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        jumpToAdjacentAssistantMessage("next");
        return;
      }
      if (e.key === "End") {
        const active = document.activeElement;
        if (active === searchRef.current || active === inputRef.current) return;
        e.preventDefault();
        scrollMessagesToBottom();
        return;
      }
      if (e.key === "Home") {
        const active = document.activeElement;
        if (active === searchRef.current || active === inputRef.current) return;
        e.preventDefault();
        scrollMessagesToTop();
      }
      if (e.key === "Escape" && loading) {
        e.preventDefault();
        void cancelChat();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading]);

  useEffect(() => {
    if (open) setSurface("queue");
  }, [open]);

  function handleSubmit(e: Event) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const text = el.value;
    el.value = "";
    if (currentThreadId) clearChatDraft(currentThreadId);
    setSurface("chat");
    void sendChatMessage(text);
  }

  function handleEditUserMessage(index: number) {
    const text = truncateChatFromUserMessage(index);
    const el = inputRef.current;
    if (!text || !el) return;
    el.value = text;
    if (currentThreadId) saveChatDraft(currentThreadId, text);
    el.focus();
  }

  function handleClearChatHistory() {
    if (
      messages.length > 0 &&
      !window.confirm("确定清空当前对话？此操作不可撤销。")
    ) {
      return;
    }
    clearChatHistory();
  }

  function insertPageContextSnippet() {
    const snippet = formatPageContextSnippet(collectPageContext());
    const el = inputRef.current;
    if (!el) return;
    const next = el.value.trim() ? `${el.value.trim()}\n${snippet} ` : `${snippet} `;
    el.value = next;
    if (currentThreadId) saveChatDraft(currentThreadId, next);
    el.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function goAiSettings() {
    closeGlobalChat();
    setActiveNav("versions");
    navigateTo("settings", "ai");
  }

  const showTyping = loading && !streaming && status;
  const showCursor = loading && streaming;

  return (
    <DrawerShell
      open={open}
      onClose={closeGlobalChat}
      drawerClass="global-chat-drawer"
      bodyClass="global-chat-drawer__body"
      showOverlay
      overlayClass="global-chat-overlay"
      usePortal
      ariaLabel="AI 助手对话"
      header={(
        <header class="drawer-header global-chat-drawer__header">
          <div class="global-chat-drawer__header-top">
            <div class="global-chat-drawer__title-row">
              <span class="global-chat-drawer__assistant-mark" aria-hidden="true">
                <IconSparkles size={16} />
              </span>
              <h2 class="drawer-title">AI 助手</h2>
              {activeThread && (
                <div class="global-chat-session-switcher">
                  <button
                    type="button"
                    class="global-chat-session-switcher__orb"
                    onClick={toggleChatSessions}
                    disabled={loading}
                    title="切换会话"
                    aria-label={`切换会话：${activeThread.title}`}
                    aria-expanded={sessionsOpen}
                    aria-controls="global-chat-sessions-panel"
                  >
                    <IconSparkles size={15} />
                    {sessionsOpen && <span class="global-chat-session-switcher__orb-ring" aria-hidden="true" />}
                  </button>
                  <span class="global-chat-session-switcher__title" title={activeThread.title}>
                    {activeThread.title}
                  </span>
                </div>
              )}
              {messages.length > 0 && (
                <span
                  class="global-chat-drawer__stats"
                  title={threadStatsTitle}
                >
                  {threadStatsLabel}
                </span>
              )}
            </div>
            <div class="global-chat-drawer__header-actions">
              <button
                type="button"
                class="global-chat-drawer__new-btn"
                onClick={newChatThread}
                disabled={loading}
                title="新建对话"
              >
                新对话
              </button>
              <details class="global-chat-more">
                <summary aria-label="更多助手操作">
                  <IconMoreHorizontal size={16} />
                </summary>
                <div class="global-chat-more__menu">
                  <div class="drawer-actions global-chat-drawer__model-row">
                    <select
                      class="global-chat-drawer__model-select"
                      value={threadModel.mode}
                      disabled={loading}
                      title="本会话使用的模型"
                      onChange={(e) => {
                        const mode = (e.currentTarget as HTMLSelectElement).value as
                          | "default"
                          | "fast"
                          | "custom";
                        setActiveThreadModel(mode, threadModel.custom);
                      }}
                    >
                      <option value="default">默认模型</option>
                      <option value="fast">轻量模型</option>
                      <option value="custom">自定义</option>
                    </select>
                    <span class="global-chat-drawer__model-label" title="当前会话模型">
                      {modelLabel}
                    </span>
                    {threadModel.mode === "custom" && (
                      <input
                        class={`global-chat-drawer__model-input${customModelMismatch ? " global-chat-drawer__model-input--warn" : ""}`}
                        type="text"
                        list="assistant-model-presets"
                        value={threadModel.custom}
                        disabled={loading}
                        placeholder="模型名"
                        title={
                          customModelMismatch
                            ? "该模型 ID 与当前 Provider 可能不匹配"
                            : "自定义模型 ID"
                        }
                        onInput={(e) =>
                          setActiveThreadModel(
                            "custom",
                            (e.currentTarget as HTMLInputElement).value,
                          )
                        }
                      />
                    )}
                    {modelPresets.length > 0 && (
                      <datalist id="assistant-model-presets">
                        {modelPresets.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  <div class="global-chat-more__actions">
                    <button type="button" class="global-chat-drawer__hdr-btn" onClick={() => duplicateChatThread()} disabled={messages.length === 0 || loading}>副本</button>
                    <button type="button" class="global-chat-drawer__hdr-btn" onClick={() => void copyChatConversation()} disabled={messages.length === 0 || loading} title={`复制对话（${exportHint}）`}>复制</button>
                    <button type="button" class="global-chat-drawer__hdr-btn" onClick={exportChatConversation} disabled={messages.length === 0 || loading} title={`导出 Markdown（${exportHint}）`}>导出</button>
                    <button type="button" class="global-chat-drawer__hdr-btn" onClick={clearProactiveSystemMessages} disabled={!hasProactiveSystem || loading}>清提醒</button>
                    <button type="button" class="global-chat-drawer__clear" onClick={handleClearChatHistory} disabled={messages.length === 0 || loading}>清空</button>
                  </div>
                  <div class="global-chat-more__toggles">
                    <label class="global-chat-export-toggle" title="复制/导出时是否包含系统提醒">
                      <input type="checkbox" checked={exportIncludeSystem} disabled={loading} onChange={(e) => setExportIncludeSystem((e.target as HTMLInputElement).checked)} />
                      含提醒
                    </label>
                    <label class="global-chat-export-toggle" title="复制/导出时是否包含消息时间">
                      <input type="checkbox" checked={exportIncludeTimestamps} disabled={loading} onChange={(e) => setExportIncludeTimestamps((e.target as HTMLInputElement).checked)} />
                      含时间
                    </label>
                  </div>
                </div>
              </details>
              <button
                type="button"
                class="drawer-icon-btn"
                onClick={closeGlobalChat}
                aria-label="关闭"
              >
                <IconX size={16} />
              </button>
            </div>
          </div>
        </header>
      )}
      footer={
        <>
          {surface === "chat" && !notReady && <ChatQuickActionsBar disabled={loading} />}
          <div class="global-chat-input-meta">
            <span class="global-chat-page-badge" title="当前页面上下文会自动带给 AI">
              <IconInfo size={12} />
              {pageContextBadge}
            </span>
            <span class="global-chat-input-hint">⌘⇧↑/↓ 用户问 · ⌘⌥↑/↓ 助手答 · ⌘⇧L 重置</span>
            {messages.length > 0 && (
              <ChatMessageTools
                open={messageToolsOpen}
                onToggle={(isOpen) => {
                  setMessageToolsOpen(isOpen);
                  saveMessageToolsOpen(isOpen);
                }}
                loading={loading}
                roleFilter={roleFilter}
                roleFilterCount={roleFilterCount}
                hasViewFilter={hasViewFilter}
                visibleIndices={visibleIndices}
                messageQuery={messageQuery}
                matchIndices={matchIndices}
                activeMatchPos={activeMatchPos}
                searchRef={searchRef}
                onRoleFilterChange={(value) => {
                  setRoleFilter(value);
                  if (currentThreadId) saveMessageRoleFilterDraft(currentThreadId, value);
                }}
                onReset={resetMessageViewFilters}
                onCopyVisible={() => void copyChatMessageSubset(visibleIndices)}
                onExportVisible={() => exportChatMessageSubset(visibleIndices)}
                onQueryChange={updateMessageQuery}
                onGotoMatch={gotoMatch}
                onClearSearch={() => {
                  clearMessageSearch();
                  inputRef.current?.focus();
                }}
                onCopyMatches={() => void copyChatMessageSubset(matchIndices)}
                onExportMatches={() => exportChatMessageSubset(matchIndices)}
              />
            )}
            <details class="global-chat-input-more">
              <summary>选项</summary>
              <div class="global-chat-input-more__menu">
                <label class="global-chat-attach-toggle" title="发送时是否附带页面快照与数据">
                  <input
                    type="checkbox"
                    checked={attachPageContext}
                    disabled={loading}
                    onChange={(e) =>
                      setAttachPageContext((e.target as HTMLInputElement).checked)
                    }
                  />
                  附带页面
                </label>
                <button
                  type="button"
                  class="global-chat-context-insert"
                  disabled={loading || notReady}
                  onClick={insertPageContextSnippet}
                  title="在输入框插入当前页面摘要"
                >
                  插入上下文
                </button>
                {uiTraceSummary && (
                  <span
                    class="global-chat-ui-trace-actions"
                    title={uiTraceTitle}
                  >
                    <span class="global-chat-ui-trace-actions__label">
                      {uiTraceSummary}
                    </span>
                    <button
                      type="button"
                      class="global-chat-feedback-clear"
                      disabled={loading}
                      title="清除 UI 跳转统计"
                      onClick={clearChatUiTraceData}
                    >
                      清统计
                    </button>
                    {uiTraceSummary.includes("候选") && (
                      <>
                        <button
                          type="button"
                          class="global-chat-feedback-clear"
                          disabled={loading}
                          title="复制 eval 候选为 golden case 片段"
                          onClick={() => void copyEvalCandidatesExport()}
                        >
                          导出候选
                        </button>
                        <button
                          type="button"
                          class="global-chat-feedback-clear"
                          disabled={loading}
                          title="去重 + eval 校验通过后复制到 ASSISTANT_UI_EVAL_CASES"
                          onClick={() => void copyMergedEvalCandidatesExport()}
                        >
                          合并入库
                        </button>
                        <button
                          type="button"
                          class="global-chat-feedback-clear"
                          disabled={loading}
                          title="清除点踩 Eval 候选"
                          onClick={clearChatEvalCandidatesData}
                        >
                          清候选
                        </button>
                      </>
                    )}
                  </span>
                )}
                {feedbackSummary && (
                  <span
                    class="global-chat-feedback-summary"
                    title="当前会话反馈统计"
                  >
                    {feedbackSummary}
                    {feedbackStats.up > 0 && (
                      <button
                        type="button"
                        class="global-chat-feedback-clear"
                        disabled={loading}
                        title="仅清除点赞"
                        onClick={clearPositiveMessageFeedback}
                      >
                        清除赞
                      </button>
                    )}
                    {feedbackStats.down > 0 && (
                      <button
                        type="button"
                        class="global-chat-feedback-clear"
                        disabled={loading}
                        title="仅清除点踩"
                        onClick={clearNegativeMessageFeedback}
                      >
                        清除踩
                      </button>
                    )}
                    <button
                      type="button"
                      class="global-chat-feedback-clear"
                      disabled={loading}
                      title="清除当前会话所有反馈"
                      onClick={clearMessageFeedback}
                    >
                      清除
                    </button>
                  </span>
                )}
              </div>
            </details>
          </div>
          <form class="global-chat-input" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            class="global-chat-input__field"
            placeholder={notReady ? "请先配置 AI…" : "问我任何事，例如：有哪些应用需要更新？"}
            rows={2}
            disabled={loading || notReady}
            onInput={(e) => {
              if (currentThreadId) {
                saveChatDraft(
                  currentThreadId,
                  (e.currentTarget as HTMLTextAreaElement).value,
                );
              }
            }}
            onKeyDown={handleKeyDown}
          />
          {loading ? (
            <button
              type="button"
              class="global-chat-input__stop"
              onClick={() => void cancelChat()}
              aria-label="停止生成"
              title="Esc 也可停止"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              class="global-chat-input__send"
              disabled={notReady}
              aria-label="发送"
            >
              <IconArrowUp size={16} />
            </button>
          )}
        </form>
        </>
      }
    >
      {notReady && (
        <div class="global-chat-context-strip" role="status">
        <span class="global-chat-context-strip__icon" aria-hidden="true">
          <IconInfo size={14} />
        </span>
        <span class="global-chat-context-strip__label">
          当前页面：{pageContextBadge}
        </span>
        <span class={`global-chat-context-strip__status${notReady ? " is-not-ready" : ""}`}>
          {notReady ? "需要配置 AI" : "已就绪，可开始对话"}
        </span>
        {notReady && (
          <button type="button" class="global-chat-context-strip__action" onClick={goAiSettings}>
            前往设置
          </button>
        )}
        </div>
      )}

      {budgetHint && (
        <div class="global-chat-budget-hint" role="status">
          {budgetHint}
        </div>
      )}

      <div class="assistant-surface-tabs" role="tablist" aria-label="助手工作区">
        <button
          type="button"
          role="tab"
          aria-selected={surface === "queue"}
          class={`assistant-surface-tabs__tab${surface === "queue" ? " is-active" : ""}`}
          onClick={() => setSurface("queue")}
        >
          待处理
          <span class="assistant-surface-tabs__count">{queueCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === "chat"}
          class={`assistant-surface-tabs__tab${surface === "chat" ? " is-active" : ""}`}
          onClick={() => setSurface("chat")}
        >
          对话
        </button>
      </div>

      {surface === "queue" ? (
        <AssistantQueuePanel />
      ) : (
        <>
          {sessionsOpen && <ChatSessionsPanel />}

          <div class="global-chat-messages-wrap">
      <div class="global-chat-messages" ref={listRef}>
        {presentationMessages.length === 0 && !loading && (
          <div class="global-chat-empty">
            <p class="global-chat-empty__title">你好，我是 Pulse 助手</p>
            <p class="global-chat-empty__hint">
              我可以帮你查询应用更新、搜索内容、切换页面、触发检查等。
            </p>
            <ul class="global-chat-suggestions">
              {suggestions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => void sendChatMessage(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {roleFilter !== "all" && roleFilterCount === 0 && !loading && (
          <div class="global-chat-filter-empty">当前筛选下无消息</div>
        )}
        {presentationMessages.map(({ message: m, index: i }) => {
          if (!messageMatchesRoleFilter(m, roleFilter)) return null;
          if (m.role === "system") {
            return (
              <div
                key={i}
                data-msg-index={i}
                class={`global-chat-msg-wrap${searchClassForIndex(i)}`}
              >
                <ChatSystemMessage message={m} highlightQuery={messageQuery} />
              </div>
            );
          }
          const isLastAssistant =
            m.role === "assistant" && i === messages.length - 1 && showCursor;
          const canRegenerate =
            m.role === "assistant" &&
            i === lastAssistantIdx &&
            !!m.content?.trim();
          const canResendFromTurn =
            m.role === "user" && !!m.content?.trim();
          return (
            <div
              key={i}
              data-msg-index={i}
              class={`global-chat-msg global-chat-msg--${m.role}${searchClassForIndex(i)}`}
            >
              {m.content ? (
                <div class="global-chat-msg__bubble">
                  {m.role === "assistant" ? (
                    <>
                      <CollapsibleMessageContent
                        role="assistant"
                        content={m.content}
                        highlightQuery={messageQuery}
                      />
                      {isLastAssistant && (
                        <span class="global-chat-cursor" aria-hidden="true" />
                      )}
                    </>
                  ) : (
                    <CollapsibleMessageContent
                      role="user"
                      content={m.content}
                      highlightQuery={messageQuery}
                    />
                  )}
                </div>
              ) : isLastAssistant ? (
                <div class="global-chat-msg__bubble">
                  <span class="global-chat-cursor" aria-hidden="true" />
                </div>
              ) : null}
              <ChatMessageActions
                message={m}
                messageIndex={i}
                canRegenerate={canRegenerate}
                canResendFromTurn={canResendFromTurn}
                canEditUserMessage={canResendFromTurn}
                canQuote={!!m.content?.trim()}
                canFeedback={m.role === "assistant" && !!m.content?.trim()}
                canDelete={!loading}
                onEditUserMessage={handleEditUserMessage}
                onQuoteMessage={handleQuoteMessage}
                disabled={loading}
              />
              {m.toolCards && m.toolCards.length > 0 && (
                <ChatToolCards cards={m.toolCards} />
              )}
            </div>
          );
        })}
        {showTyping && (
          <div class="global-chat-msg global-chat-msg--assistant">
            <div class="global-chat-msg__bubble global-chat-msg__bubble--typing">
              {status}
            </div>
          </div>
        )}
      </div>
      {showScrollUp && (
        <button
          type="button"
          class="global-chat-scroll-up"
          onClick={scrollMessagesToTop}
          aria-label="回到顶部"
        >
          ↑ 回到顶部
        </button>
      )}
      {showScrollDown && (
        <button
          type="button"
          class="global-chat-scroll-down"
          onClick={scrollMessagesToBottom}
          aria-label="回到底部"
        >
          ↓ 回到底部
        </button>
      )}
          </div>
        </>
      )}

      {error && (
        <div class="global-chat-error" role="alert">
          <span>{error}</span>
          {retryText && (
            <button
              type="button"
              class="global-chat-error__retry"
              onClick={() => void retryLastMessage()}
              disabled={loading}
            >
              重试
            </button>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
