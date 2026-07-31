/**
 * src/main/finance/aggregator.ts
 *
 * 财经新闻聚合：默认 sources 全开，由 renderer 切视图决定拉哪些（对齐 ai-leaderboard）。
 * 单源失败不阻断其余源，错误汇总到 errorsPerSource。
 */

import * as eastmoney from "./fetcher-eastmoney-rss";
import * as wallstreetcn from "./fetcher-wallstreetcn-rss";
import * as stats from "./fetcher-stats-rss";
import { SOURCE_LABELS } from "./config";
import type { FinArticle } from "../../shared/finance-types";

export interface AggregateOpts {
  sources?: Record<string, boolean>;
  force?: boolean;
  timeoutMs?: number;
}

export interface AggregateResult {
  items: FinArticle[];
  errorsPerSource: Record<string, string>;
}

const FETCHERS: Record<string, any> = {
  eastmoney,
  wallstreetcn,
  stats,
};

/**
 * 聚合全部启用源。每个源内部 try/catch，失败仅记错误，不影响其它源。
 */
export async function aggregateNews(opts: AggregateOpts = {}): Promise<AggregateResult> {
  const sources = opts.sources || {
    eastmoney: true,
    wallstreetcn: true,
    stats: true,
  };
  const items: FinArticle[] = [];
  const errorsPerSource: Record<string, string> = {};

  for (const [key, fetcher] of Object.entries(FETCHERS)) {
    if (!sources[key]) continue;
    try {
      const res = await fetcher.fetch({ timeoutMs: opts.timeoutMs });
      if (!res || !res.ok || !res.raw) {
        errorsPerSource[key] = (res && res.error) || "fetch_failed";
        continue;
      }
      const normalized = fetcher.normalize(res.raw) || [];
      for (const it of normalized) items.push(it);
    } catch (err: any) {
      errorsPerSource[key] = err && err.message ? err.message : "threw";
    }
  }
  return { items, errorsPerSource };
}

export const SOURCE_NAMES = SOURCE_LABELS;

module.exports = { aggregateNews, SOURCE_NAMES };
