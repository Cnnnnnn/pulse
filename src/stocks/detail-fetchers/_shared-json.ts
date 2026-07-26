/**
 * src/stocks/detail-fetchers/_shared-json.ts
 *
 * detail-fetchers 共享的 JSON 解析 helper.
 *
 * 2026-07-26: 抽出 safeJsonParse. 4 个 fetcher 的本地实现字节相同:
 *   - news-buzz.ts:113 safeParse
 *   - capital-flow.ts:59 safeParse
 *   - profitability.ts:87 safeJsonParse
 *   - valuation.ts:146 safeJsonParse
 */

/** 安全 JSON.parse: 失败返回 null（不抛错，调用方按 null/undefined 走 fallback 分支）。 */
export function safeJsonParse(s: any): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
