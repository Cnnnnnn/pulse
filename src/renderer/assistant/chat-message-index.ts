/**
 * 消息索引导航与可见性筛选.
 */
import type { AiChatMessage } from "../../shared/ipc-contracts";
import {
  messageMatchesRoleFilter,
  type MessageRoleFilter,
} from "./chat-message-filter.ts";
import { messageMatchesQuery } from "./chat-message-search.ts";

export function findFirstUserMessageIndex(messages: AiChatMessage[]): number {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

export function findLastUserMessageIndex(messages: AiChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

/** 从 fromIndex 向 prev/next 找相邻用户消息（不含 fromIndex 本身） */
export function findAdjacentUserMessageIndex(
  messages: AiChatMessage[],
  fromIndex: number,
  direction: "prev" | "next",
): number {
  if (direction === "prev") {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }
  for (let i = fromIndex + 1; i < messages.length; i++) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

/** 视口中心最近的消息索引（用于相邻用户跳转锚点） */
export function findScrollAnchorMessageIndex(
  container: HTMLElement | null,
  messageCount: number,
): number {
  if (!container || messageCount <= 0) return -1;
  const containerRect = container.getBoundingClientRect();
  const mid = containerRect.top + containerRect.height / 2;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < messageCount; i++) {
    const el = container.querySelector(`[data-msg-index="${i}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function resolveAdjacentUserMessageIndex(
  messages: AiChatMessage[],
  anchorIndex: number,
  direction: "prev" | "next",
): number {
  const start = anchorIndex >= 0 ? anchorIndex : messages.length;
  const adjacent = findAdjacentUserMessageIndex(messages, start, direction);
  if (adjacent >= 0) return adjacent;
  return direction === "prev"
    ? findLastUserMessageIndex(messages)
    : findFirstUserMessageIndex(messages);
}

export function findFirstAssistantMessageIndex(
  messages: AiChatMessage[],
): number {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

export function findLastAssistantMessageIndex(
  messages: AiChatMessage[],
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

export function findAdjacentAssistantMessageIndex(
  messages: AiChatMessage[],
  fromIndex: number,
  direction: "prev" | "next",
): number {
  if (direction === "prev") {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return i;
    }
    return -1;
  }
  for (let i = fromIndex + 1; i < messages.length; i++) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

export function resolveAdjacentAssistantMessageIndex(
  messages: AiChatMessage[],
  anchorIndex: number,
  direction: "prev" | "next",
): number {
  const start = anchorIndex >= 0 ? anchorIndex : messages.length;
  const adjacent = findAdjacentAssistantMessageIndex(messages, start, direction);
  if (adjacent >= 0) return adjacent;
  return direction === "prev"
    ? findLastAssistantMessageIndex(messages)
    : findFirstAssistantMessageIndex(messages);
}

export type VisibleMessageFilter = {
  roleFilter: MessageRoleFilter;
  searchQuery: string;
};

export function getVisibleMessageIndices(
  messages: AiChatMessage[],
  filter: VisibleMessageFilter,
): number[] {
  const indices: number[] = [];
  const hasSearch = !!filter.searchQuery.trim();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!messageMatchesRoleFilter(m, filter.roleFilter)) continue;
    if (hasSearch && !messageMatchesQuery(m, filter.searchQuery)) continue;
    indices.push(i);
  }
  return indices;
}

export function hasActiveMessageViewFilter(filter: VisibleMessageFilter): boolean {
  return filter.roleFilter !== "all" || !!filter.searchQuery.trim();
}
