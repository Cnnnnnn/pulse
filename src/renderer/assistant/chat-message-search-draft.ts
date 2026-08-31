/**
 * 每会话对话内搜索词 — sessionStorage.
 */
const KEY = "pulse-assistant-message-search-v1";

function readAll(): Record<string, string> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, string>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function loadMessageSearchDraft(threadId: string | null): string {
  if (!threadId) return "";
  return readAll()[threadId] || "";
}

export function saveMessageSearchDraft(threadId: string | null, query: string) {
  if (!threadId) return;
  const map = readAll();
  if (!query.trim()) delete map[threadId];
  else map[threadId] = query;
  writeAll(map);
}

export function clearMessageSearchDraft(threadId: string | null) {
  if (!threadId) return;
  const map = readAll();
  delete map[threadId];
  writeAll(map);
}
