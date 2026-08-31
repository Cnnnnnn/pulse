/**
 * 每会话是否附带页面上下文 — sessionStorage.
 */
const KEY = "pulse-assistant-attach-context-v1";

function readAll(): Record<string, boolean> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, boolean>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function loadAttachPageContext(threadId: string | null): boolean {
  if (!threadId) return true;
  const map = readAll();
  return map[threadId] !== false;
}

export function saveAttachPageContext(threadId: string | null, attach: boolean) {
  if (!threadId) return;
  const map = readAll();
  if (attach) delete map[threadId];
  else map[threadId] = false;
  writeAll(map);
}
