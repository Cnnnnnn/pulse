/**
 * src/renderer/utils/date.ts
 *
 * 日期格式化单一来源 (renderer 内共享).
 *
 * 2026-07-26: 抽出 fmtDateIso (YYYY-MM-DD). 内容与下列 4 处既有实现逐字一致,
 *   避免 ISO→本地日期格式漂移:
 *   - src/renderer/ai-leaderboard/format.ts:58 fmtDate
 *   - src/renderer/games/AchievementsPanel.tsx:49 fmtDate
 *   - src/renderer/games/BadgeWall.tsx:14 fmtDate
 *   - src/renderer/games/EventBanner.tsx:38 fmtDate
 *
 * Phase 4: export-only（renderer 共享，禁止 module.exports）。
 */

/** ISO 时间 → YYYY-MM-DD（本地，纯展示，无效返回空串）。 */
export function fmtDateIso(iso: any): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
