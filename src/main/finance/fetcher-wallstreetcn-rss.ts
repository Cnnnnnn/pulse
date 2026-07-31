/**
 * src/main/finance/fetcher-wallstreetcn-rss.ts
 *
 * 华尔街见闻 RSS（全球 / 宏观）。content-type 误标为 text/html，但结构是标准 RSS，
 * 复用 ithome/rss-parser 按 <item> 解析即可（不依赖 content-type）。
 *
 * 导出范式：fetch() + normalize()，由 rss-fetcher-factory 统一产出。
 */

import { createRssFetcher } from "./rss-fetcher-factory";
import { SOURCE_URLS } from "./config";

const f = createRssFetcher({
  id: "wallstreetcn",
  label: "华尔街见闻",
  url: SOURCE_URLS.wallstreetcn,
});

export const id = f.id;
export const label = f.label;
export const fetch = f.fetch;
export const normalize = f.normalize;

module.exports = { id, label, fetch, normalize };
