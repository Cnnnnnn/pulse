/**
 * 解析提醒触发时间（ISO / 毫秒 / +1h / +1d）.
 */
export function parseReminderTriggerAt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > Date.now() - 60_000) {
    return raw;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    const rel = s.match(/^\+(\d+)(h|d|m)$/i);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2].toLowerCase();
      const ms =
        unit === "d" ? n * 86_400_000 : unit === "m" ? n * 60_000 : n * 3_600_000;
      return Date.now() + ms;
    }
    const t = Date.parse(s);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function formatReminderWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN");
  } catch {
    return String(ms);
  }
}
