/**
 * 每会话消息角色筛选 — sessionStorage.
 */
import type { MessageRoleFilter } from "./chat-message-filter.ts";

const KEY = "pulse-assistant-message-role-filter-v1";
const VALID: MessageRoleFilter[] = [
  "all",
  "user",
  "assistant",
  "system",
  "feedback_up",
  "feedback_down",
  "has_tools",
];

function readAll(): Record<string, MessageRoleFilter> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, MessageRoleFilter>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, MessageRoleFilter>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function normalizeFilter(value: string | undefined): MessageRoleFilter {
  return VALID.includes(value as MessageRoleFilter)
    ? (value as MessageRoleFilter)
    : "all";
}

export function loadMessageRoleFilterDraft(
  threadId: string | null,
): MessageRoleFilter {
  if (!threadId) return "all";
  return normalizeFilter(readAll()[threadId]);
}

export function saveMessageRoleFilterDraft(
  threadId: string | null,
  filter: MessageRoleFilter,
) {
  if (!threadId) return;
  const map = readAll();
  if (filter === "all") delete map[threadId];
  else map[threadId] = filter;
  writeAll(map);
}
