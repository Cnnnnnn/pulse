/**
 * src/main/finance/fetcher-stats-rss.ts
 *
 * 国家统计局 RSS（宏观官方源）。单次 4.5MB / 500 条，体量极大。
 * 处理策略：
 *   - fetch 调大 maxBodyBytes（6MB）拉全量
 *   - normalize 后处理按 pubDate 裁剪到最近 N 条（STATS_MAX_ITEMS），降低内存与写入压力
 *   - 缓存 ≥6h 由 news-store.refresh 控制（stale 时不重新拉取）
 *
 * 导出范式：fetch() + normalize()，由 rss-fetcher-factory 统一产出（postProcess 承担裁剪）。
 */

import { createRssFetcher } from "./rss-fetcher-factory";
import {
  SOURCE_URLS,
  STATS_MAX_ITEMS,
  STATS_MAX_BODY_BYTES,
  STATS_WARN_BELOW_BYTES,
} from "./config";

const f = createRssFetcher({
  id: "stats",
  label: "国家统计局",
  url: SOURCE_URLS.stats,
  // B4：提到 10MB 留足余量，避免 ~4.5MB 原始 + XML 开销逼近上限被截断
  maxBodyBytes: STATS_MAX_BODY_BYTES,
  // B4：body 显著短于 4MB → 告警（察觉截断 / 服务端降级）
  warnBelowBytes: STATS_WARN_BELOW_BYTES,
  // 国家统计局 RSS 单次 500 条，体量大 → 按 pubDate 降序裁剪到最近 N 条。
  postProcess: (items: any[]) => {
    items.sort((a: any, b: any) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });
    return items.slice(0, STATS_MAX_ITEMS);
  },
});

export const id = f.id;
export const label = f.label;
export const fetch = f.fetch;
export const normalize = f.normalize;

module.exports = { id, label, fetch, normalize };
