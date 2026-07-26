/**
 * src/shared/ai-leaderboard-trending.ts
 *
 * HuggingFace Trending 分数计算 (跨进程共享).
 *
 * 2026-07-26 (code-simplifier audit B6): 之前 main + renderer 各一份字节相同的
 *   实现, renderer 端注释明说 "can't cross-process require" 故复制. 实际计算只
 *   依赖 Number / Date / Math.log10, 无 electron/node 依赖, 可以放 shared 让两边
 *   都 import. 抽出来避免公式漂移 (HF view 列头排序 / store columnValue / main
 *   ranking 三处都必须用同一个公式).
 *
 * age 优先级: lastModified (活跃度) → createdAt (首次发布) → null.
 *
 * @param downloads 全时累计下载量
 * @param lastModified ISO 日期串 (HF 字段) 或 null
 * @param createdAt   ISO 日期串 (HF 字段) 或 null
 * @param now         可选, 注入测试用 (epoch ms); 默认 Date.now()
 * @returns {number|null} trending 分数 (越大越 "最近火"), null = 不参与 trending
 *
 * Phase 7: export-only（renderer + main 共享, 禁止 module.exports）.
 */

export function computeTrendingScore(
  downloads: any,
  lastModified: any,
  createdAt: any,
  now: number = Date.now(),
): number | null {
  const dl = Number(downloads);
  if (!Number.isFinite(dl) || dl < 1000) return null;
  const refNow = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const dateStr =
    typeof lastModified === "string" && lastModified ? lastModified
      : typeof createdAt === "string" && createdAt ? createdAt
        : null;
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  const ageDays = (refNow - t) / 86_400_000;
  if (ageDays <= 0 || ageDays > 365) return null;
  return Math.log10(dl + 1) / Math.log10(ageDays + 2);
}
