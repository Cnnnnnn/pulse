/**
 * 多会话线程 — localStorage 持久化.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: AiChatMessage[];
  /** default | fast | custom（配合 modelCustom） */
  modelMode?: "default" | "fast" | "custom";
  modelCustom?: string;
  /** 置顶会话排在列表前 */
  pinned?: boolean;
};

const THREADS_KEY = "pulse-assistant-threads-v2";
const LEGACY_KEY = "pulse-assistant-chat-v1";
const MAX_THREADS = 20;
export const MAX_MESSAGES_PER_THREAD = 40;

function newId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessages(messages: AiChatMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.content?.trim());
  if (!first) return "新对话";
  const raw = first.content.trim();
  return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
}

function sanitizeMessages(raw: unknown): AiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant" || m.role === "system") &&
        typeof m.content === "string",
    )
    .map((m) => {
      const msg = m as AiChatMessage;
      const next: AiChatMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (typeof msg.ts === "number") next.ts = msg.ts;
      if (msg.feedback === "up" || msg.feedback === "down") {
        next.feedback = msg.feedback;
      }
      if (msg.role !== "system") return next;
      if (msg.systemAction) next.systemAction = msg.systemAction;
      if (Array.isArray(msg.systemItems) && msg.systemItems.length > 0) {
        next.systemItems = msg.systemItems.filter(
          (it) => it && typeof it.text === "string",
        );
      }
      return next;
    });
}

export function loadThreads(): { threads: ChatThread[]; activeId: string | null } {
  if (typeof localStorage === "undefined") {
    return { threads: [], activeId: null };
  }
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        activeId?: string;
        threads?: ChatThread[];
      };
      const threads = (parsed.threads || [])
        .filter((t) => t && typeof t.id === "string")
        .map((t) => ({
          id: t.id,
          title: typeof t.title === "string" ? t.title : "对话",
          updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : 0,
          modelMode:
            t.modelMode === "fast"
              ? ("fast" as const)
              : t.modelMode === "custom"
                ? ("custom" as const)
                : undefined,
          modelCustom:
            typeof t.modelCustom === "string" ? t.modelCustom : undefined,
          pinned: !!t.pinned,
          messages: sanitizeMessages(t.messages),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_THREADS);
      const activeId =
        parsed.activeId && threads.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : threads[0]?.id || null;
      return { threads, activeId };
    }
  } catch {
    /* fall through to legacy */
  }

  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const messages = sanitizeMessages(JSON.parse(legacy));
      if (messages.length > 0) {
        const thread: ChatThread = {
          id: newId(),
          title: titleFromMessages(messages),
          updatedAt: Date.now(),
          messages,
        };
        return { threads: [thread], activeId: thread.id };
      }
    }
  } catch {
    /* noop */
  }

  const thread: ChatThread = {
    id: newId(),
    title: "新对话",
    updatedAt: Date.now(),
    messages: [],
  };
  return { threads: [thread], activeId: thread.id };
}

export function saveThreads(threads: ChatThread[], activeId: string | null) {
  if (typeof localStorage === "undefined") return;
  try {
    const sorted = [...threads]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS);
    localStorage.setItem(
      THREADS_KEY,
      JSON.stringify({ activeId, threads: sorted }),
    );
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* quota */
  }
}

export function createThread(): ChatThread {
  return {
    id: newId(),
    title: "新对话",
    updatedAt: Date.now(),
    messages: [],
  };
}

export function touchThread(thread: ChatThread, messages: AiChatMessage[]): ChatThread {
  return {
    ...thread,
    messages: messages.slice(-MAX_MESSAGES_PER_THREAD),
    title:
      thread.title === "新对话" && messages.length > 0
        ? titleFromMessages(messages)
        : thread.title,
    updatedAt: Date.now(),
  };
}

export function normalizeThreadTitle(title: string): string {
  const t = title.trim();
  if (!t) return "新对话";
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

export function filterThreads(
  threads: ChatThread[],
  query: string,
): ChatThread[] {
  const q = query.trim().toLowerCase();
  const matched = !q
    ? threads
    : threads.filter((t) => {
        if (t.title.toLowerCase().includes(q)) return true;
        return t.messages.some((m) =>
          (m.content || "").toLowerCase().includes(q),
        );
      });
  return sortThreadsForDisplay(matched);
}

export function sortThreadsForDisplay(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => {
    const pinDelta = Number(!!b.pinned) - Number(!!a.pinned);
    if (pinDelta !== 0) return pinDelta;
    return b.updatedAt - a.updatedAt;
  });
}
