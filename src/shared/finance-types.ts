/**
 * 财经 article 共享类型 — fetcher → aggregator → news-store → IPC 串起单一形状。
 *
 * renderer 侧 financeList 仍为 any（避免跨进程类型耦合），main 流水线用此类型，
 * 可在 tsconfig.app.strict 下提前暴露字段拼写 / 缺字段类 bug（如 D3 曾经的写死配色）。
 */

export interface FinArticle {
  id: string;
  source: string;
  sourceKey: string;
  title: string;
  summary: string;
  body: string;
  bodyFetchedAt: number;
  url: string;
  pubDate: string;
  dateKey: string;
  category: string;
  tags: string[];
  popularity: number;
  isRed: boolean;
  fetchedAt: number;
  readAt: number;
  /** 返回列表时附加的收藏标记（非落盘字段）。 */
  isFavorited?: boolean;
  /** 配图 URL（RSS 当前无图；预留字段，详情页有图才渲染）。 */
  image?: string;
  /** 配图图注。 */
  imageCaption?: string;
}
