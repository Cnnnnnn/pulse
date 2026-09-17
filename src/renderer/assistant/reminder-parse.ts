/**
 * 解析提醒触发时间（ISO / 毫秒 / +1h / +1d）.
 */
import { parseReminderTime } from "../../shared/reminder-time";

export function parseReminderTriggerAt(raw: unknown): number | null {
  const now = Date.now();
  const at = parseReminderTime(raw, now);
  return at !== null && at >= now - 60_000 ? at : null;
}

export function formatReminderWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN");
  } catch {
    return String(ms);
  }
}
