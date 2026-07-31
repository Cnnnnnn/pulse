/**
 * src/renderer/finance/finance-text.ts
 *
 * 详情正文分段 + 相关推荐派生，两个纯函数（无副作用、可单测、列表/详情复用）。
 */

import type { FinArticle } from "../../shared/finance-types.ts";

/**
 * 将正文原始字符串分段为段落数组。
 * - 按空行（连续 2+ 个换行）分段；
 * - 段内软换行（单换行）合并为空格；
 * - 空段丢弃。
 * 返回空数组表示「无正文」，调用方应回退到 summary。
 */
export function segmentBody(raw?: string, summary?: string): string[] {
  const text = raw && raw.trim();
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((b: string) =>
      b
        .split(/\n+/)
        .map((s: string) => s.trim())
        .filter(Boolean)
        .join(" "),
    )
    .map((s: string) => s.trim())
    .filter(Boolean);
}

/**
 * 从候选池派生「相关推荐」：同标签优先，同分类（其余）补全，截断到 limit。
 * 纯前端派生，避免为算几条相关而全量拉取分类列表。
 */
export function deriveRelated(
  current: FinArticle,
  pool: FinArticle[],
  limit = 5,
): FinArticle[] {
  const tags = current.tags ?? [];
  const sameTag = pool.filter(
    (x) => x.id !== current.id && (x.tags ?? []).some((t) => tags.includes(t)),
  );
  const fill = pool.filter(
    (x) => x.id !== current.id && !sameTag.some((y) => y.id === x.id),
  );
  return [...sameTag, ...fill].slice(0, limit);
}
