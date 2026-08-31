/**
 * 历史会话列表面板 — 搜索 + 重命名 + 切换 + 批量清理.
 */
import { useState } from "preact/hooks";
import {
  chatThreads,
  activeThreadId,
  chatLoading,
  chatSessionQuery,
  switchChatThread,
  deleteChatThread,
  renameChatThread,
  togglePinChatThread,
  pruneEmptyChatThreads,
  retitleChatThreadFromMessages,
  retitleAllChatThreads,
} from "./assistant-store.ts";
import { filterThreads } from "./chat-threads.ts";
import { countEmptyThreads, formatFeedbackSummary, summarizeMessageFeedback } from "./chat-message-feedback.ts";
import { formatThreadStatsLabel, summarizeThreadStats } from "./chat-thread-stats.ts";
import { showToast } from "../store/toast-store.ts";
import { IconEdit, IconPin, IconRotateCcw, IconTrash } from "../components/icons.tsx";

function formatThreadTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function requestDeleteThread(id: string, title: string, messageCount: number) {
  if (
    messageCount > 0 &&
    !window.confirm(`确定删除「${title}」？此操作不可撤销。`)
  ) {
    return;
  }
  deleteChatThread(id);
}

function handlePruneEmptyThreads(emptyCount: number) {
  if (emptyCount <= 0) return;
  if (!window.confirm(`确定删除 ${emptyCount} 个空会话？`)) return;
  const removed = pruneEmptyChatThreads();
  showToast(
    removed > 0 ? `已删除 ${removed} 个空会话` : "没有可清理的空会话",
    removed > 0 ? "info" : "warn",
    2500,
  );
}

function handleRetitleThread(id: string) {
  const ok = retitleChatThreadFromMessages(id);
  showToast(
    ok ? "已根据首条消息更新标题" : "标题已是最新",
    ok ? "info" : "warn",
    2200,
  );
}

function handleRetitleAllThreads() {
  const count = retitleAllChatThreads();
  showToast(
    count > 0 ? `已更新 ${count} 个会话标题` : "没有需要更新的标题",
    count > 0 ? "info" : "warn",
    2500,
  );
}

export function ChatSessionsPanel() {
  const threads = chatThreads.value;
  const currentThreadId = activeThreadId.value;
  const loading = chatLoading.value;
  const query = chatSessionQuery.value;
  const filtered = filterThreads(threads, query);
  const emptyCount = countEmptyThreads(threads);
  const canPruneEmpty =
    emptyCount > 0 && (emptyCount > 1 || threads.some((t) => t.messages.length > 0));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  function startRename(id: string, title: string) {
    setEditingId(id);
    setEditTitle(title);
  }

  function commitRename() {
    if (!editingId) return;
    renameChatThread(editingId, editTitle);
    setEditingId(null);
    setEditTitle("");
  }

  if (threads.length === 0) return null;

  return (
    <div id="global-chat-sessions-panel" class="global-chat-sessions-wrap">
      <div class="global-chat-sessions-search">
        <input
          class="global-chat-sessions-search__input"
          type="search"
          value={query}
          placeholder="搜索会话…"
          disabled={loading}
          onInput={(e) => {
            chatSessionQuery.value = (e.currentTarget as HTMLInputElement).value;
          }}
        />
        {canPruneEmpty && (
          <button
            type="button"
            class="global-chat-sessions-prune"
            disabled={loading}
            title="删除所有无消息的空会话"
            onClick={() => handlePruneEmptyThreads(emptyCount)}
          >
            清空空会话 ({emptyCount})
          </button>
        )}
        <button
          type="button"
          class="global-chat-sessions-prune"
          disabled={loading || threads.every((t) => t.messages.length === 0)}
          title="根据各会话首条用户消息批量重命名"
          onClick={handleRetitleAllThreads}
        >
          全部自动命名
        </button>
      </div>
      <div class="global-chat-sessions" role="listbox" aria-label="历史会话">
        {filtered.length === 0 && (
          <div class="global-chat-sessions__empty">无匹配会话</div>
        )}
        {filtered.map((t) => {
          const threadFeedback = formatFeedbackSummary(
            summarizeMessageFeedback(t.messages),
          );
          const threadStats = formatThreadStatsLabel(
            summarizeThreadStats(t.messages),
          );
          return (
          <div
            key={t.id}
            class={`global-chat-session${t.id === currentThreadId ? " is-active" : ""}`}
            role="option"
            aria-selected={t.id === currentThreadId}
          >
            {editingId === t.id ? (
              <form
                class="global-chat-session__edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <input
                  class="global-chat-session__edit-input"
                  type="text"
                  value={editTitle}
                  maxLength={48}
                  autoFocus
                  onInput={(e) =>
                    setEditTitle((e.currentTarget as HTMLInputElement).value)
                  }
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditTitle("");
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                class="global-chat-session__main"
                onClick={() => switchChatThread(t.id)}
                disabled={loading}
              >
                <span class="global-chat-session__title">
                  {t.pinned && <IconPin size={12} />}
                  {t.title}
                </span>
                <span class="global-chat-session__meta">
                  {threadStats}
                  {threadFeedback ? ` · ${threadFeedback}` : ""}
                  {" · "}
                  {formatThreadTime(t.updatedAt)}
                </span>
              </button>
            )}
            {editingId !== t.id && (
              <div class="global-chat-session__side">
                <button
                  type="button"
                  class={`global-chat-session__pin${t.pinned ? " is-pinned" : ""}`}
                  onClick={() => togglePinChatThread(t.id)}
                  disabled={loading}
                  aria-label={t.pinned ? `取消置顶 ${t.title}` : `置顶 ${t.title}`}
                  title={t.pinned ? "取消置顶" : "置顶"}
                >
                  <IconPin size={14} />
                </button>
                <button
                  type="button"
                  class="global-chat-session__retitle"
                  onClick={() => handleRetitleThread(t.id)}
                  disabled={loading || t.messages.length === 0}
                  aria-label={`根据消息自动命名 ${t.title}`}
                  title="根据首条用户消息自动命名"
                >
                  <IconRotateCcw size={14} />
                </button>
                <button
                  type="button"
                  class="global-chat-session__rename"
                  onClick={() => startRename(t.id, t.title)}
                  disabled={loading}
                  aria-label={`重命名 ${t.title}`}
                  title="重命名"
                >
                  <IconEdit size={14} />
                </button>
                {threads.length > 1 && (
                  <button
                    type="button"
                    class="global-chat-session__delete"
                    onClick={() =>
                      requestDeleteThread(t.id, t.title, t.messages.length)
                    }
                    disabled={loading}
                    aria-label={`删除 ${t.title}`}
                    title="删除会话"
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
