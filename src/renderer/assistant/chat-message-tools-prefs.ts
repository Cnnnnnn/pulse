/**
 * 消息工具面板展开状态 — sessionStorage.
 */
const KEY = "pulse-assistant-message-tools-open-v1";

export function loadMessageToolsOpen(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  try {
    return sessionStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveMessageToolsOpen(open: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (open) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, "0");
  } catch {
    /* quota */
  }
}
