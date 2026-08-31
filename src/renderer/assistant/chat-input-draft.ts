/**
 * 每会话输入框草稿 — sessionStorage 暂存.
 */
const DRAFT_KEY = "pulse-assistant-input-drafts-v1";

function readAll(): Record<string, string> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
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
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function loadChatDraft(threadId: string | null): string {
  if (!threadId) return "";
  return readAll()[threadId] || "";
}

export function saveChatDraft(threadId: string | null, text: string) {
  if (!threadId) return;
  const map = readAll();
  const trimmed = text;
  if (!trimmed.trim()) {
    delete map[threadId];
  } else {
    map[threadId] = trimmed;
  }
  writeAll(map);
}

export function clearChatDraft(threadId: string | null) {
  if (!threadId) return;
  const map = readAll();
  delete map[threadId];
  writeAll(map);
}
