/**
 * src/renderer/wechat-hot/utils.js
 *
 * Shared display formatters.
 */

export function formatTime(ms) {
  if (typeof ms !== "number" || ms <= 0) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatCooldown(remainingMs) {
  if (typeof remainingMs !== "number" || remainingMs <= 0) return "";
  return `冷却 ${Math.ceil(remainingMs / 1000)}s`;
}
