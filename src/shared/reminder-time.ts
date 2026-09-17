/** 解析 ISO、毫秒时间戳或 +1h / +1d / +30m；业务时间范围由调用方校验。 */
export function parseReminderTime(raw: unknown, now = Date.now()): number | null {
  let at: number;
  if (typeof raw === "number") {
    at = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    const value = raw.trim();
    const relative = value.match(/^\+(\d+)(h|d|m)$/i);
    if (relative) {
      const unit = relative[2].toLowerCase();
      const multiplier = unit === "d" ? 86_400_000 : unit === "m" ? 60_000 : 3_600_000;
      at = now + Number(relative[1]) * multiplier;
    } else {
      at = Date.parse(value);
    }
  } else {
    return null;
  }
  return Number.isFinite(at) && Number.isFinite(new Date(at).getTime()) ? at : null;
}
