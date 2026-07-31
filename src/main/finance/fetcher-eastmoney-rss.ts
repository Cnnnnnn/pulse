/**
 * src/main/finance/fetcher-eastmoney-rss.ts
 *
 * 东方财富 RSS（实时 A 股 / 基金）。HTTP（非 HTTPS），需 UA。
 * 复用 ithome/rss-parser 的结构化解析（不依赖 content-type，按 <item> 解析）。
 *
 * 导出范式（对齐 ai-leaderboard）：fetch() + normalize()，由 rss-fetcher-factory 统一产出。
 */

import { createRssFetcher } from "./rss-fetcher-factory";
import { SOURCE_URLS } from "./config";

const f = createRssFetcher({
  id: "eastmoney",
  label: "东方财富",
  url: SOURCE_URLS.eastmoney,
});

export const id = f.id;
export const label = f.label;
export const fetch = f.fetch;
export const normalize = f.normalize;

module.exports = { id, label, fetch, normalize };
