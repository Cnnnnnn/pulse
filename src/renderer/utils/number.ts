/**
 * src/renderer/utils/number.ts
 *
 * 数字格式化单一来源 (renderer 内共享).
 *
 * 2026-07-26: 抽出 formatCompact. UsageDashboard.tsx + UsageTrendChart.tsx 两份
 *   字节相同, 避免 K/M/B 格式漂移. (ai-leaderboard/format.ts 的 fmtDownloads/
 *   fmtVotes/fmtContext 走自己的紧凑格式, 跟这里 contract 不同, 不强合.)
 */

/** 大数 → 紧凑格式: 1234 → "1.2K" / 12345678 → "12.3M" / 1234567890 → "1.2B".
 *  小数量级 (10K/10M/10B 阈值) 用 2 位小数, 大数量级用 1 位 — 跟图表 axis 习惯一致. */
export function formatCompact(n: any): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 2 : 1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(n < 10_000_000_000 ? 2 : 1)}B`;
}
