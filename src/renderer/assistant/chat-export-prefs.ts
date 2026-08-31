/**
 * 复制/导出是否包含 system 消息 — sessionStorage.
 */
const SYSTEM_KEY = "pulse-assistant-export-include-system-v1";
const TIMESTAMPS_KEY = "pulse-assistant-export-include-timestamps-v1";

export function loadExportIncludeSystem(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SYSTEM_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveExportIncludeSystem(include: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (include) sessionStorage.setItem(SYSTEM_KEY, "1");
    else sessionStorage.removeItem(SYSTEM_KEY);
  } catch {
    /* quota */
  }
}

export function loadExportIncludeTimestamps(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(TIMESTAMPS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveExportIncludeTimestamps(include: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (include) sessionStorage.setItem(TIMESTAMPS_KEY, "1");
    else sessionStorage.removeItem(TIMESTAMPS_KEY);
  } catch {
    /* quota */
  }
}
