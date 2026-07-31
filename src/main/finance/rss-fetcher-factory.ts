/**
 * src/main/finance/rss-fetcher-factory.ts
 *
 * 财经 RSS fetcher 工厂 — 消除 eastmoney / wallstreetcn / stats 三个 fetcher 的重复样板。
 * 三者仅差异在：id / label / url / 是否需放大 maxBodyBytes / 归一化后处理（stats 按 pubDate 降序裁剪）。
 *
 * 工厂产出与既有 fetcher 完全一致的契约：{ id, label, fetch, normalize }，
 * 且保留 dual-export（module.exports）供 requireMain / aggregator 的 CJS 消费。
 */

import { fetchText } from "./http";
import { parseIthomeRss } from "../ithome/rss-parser";
import {
  deriveCategory,
  BROWSER_UA,
  FIN_FETCH_TIMEOUT_MS,
} from "./config";
import { mainLog } from "../log";
import type { FinArticle } from "../../shared/finance-types";

export interface RssFetcherConfig {
  /** 源 key（同时作为 article id 前缀与 deriveCategory 的 sourceKey）。 */
  id: string;
  /** 展示名（写入 article.source）。 */
  label: string;
  /** RSS 地址。 */
  url: string;
  /** 字节上限（国家统计局 RSS 4.5MB 需调大）。 */
  maxBodyBytes?: number;
  /**
   * 截断告警阈值：body 长度低于此值即告警（B4，仅 stats 用）。
   * 用于察觉「服务端降级 / 被截断」导致的条目骤减。
   */
  warnBelowBytes?: number;
  /**
   * 归一化后处理钩子（如 stats 的 sort + slice）。
   * 入参为已构造好的 article 数组，返回最终数组。
   */
  postProcess?: (items: FinArticle[]) => FinArticle[];
}

export interface FetchResult {
  ok: boolean;
  raw?: string;
  error?: string;
}

export interface RssFetcher {
  id: string;
  label: string;
  fetch: (opts?: any) => Promise<FetchResult>;
  normalize: (raw: any) => FinArticle[];
}

export function createRssFetcher(cfg: RssFetcherConfig): RssFetcher {
  const sourceKey = cfg.id;

  async function fetch(opts: any = {}): Promise<FetchResult> {
    const r = await fetchText(cfg.url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      timeoutMs: opts.timeoutMs || FIN_FETCH_TIMEOUT_MS,
      maxBodyBytes: cfg.maxBodyBytes,
    });
    if (!r.ok) return { ok: false, error: r.error };
    // B4：body 显著短于预期 → 大概率被截断 / 服务端降级，告警以便察觉条目骤减
    if (
      cfg.warnBelowBytes != null &&
      typeof r.body === "string" &&
      r.body.length < cfg.warnBelowBytes
    ) {
      mainLog.warn(
        `[finance/${cfg.id}] RSS body 长度 ${r.body.length} 字节 < 告警阈值 ${cfg.warnBelowBytes}，可能被截断`,
      );
    }
    return { ok: true, raw: r.body };
  }

  function buildArticle(it: any, now: number): FinArticle {
    const { category, tags } = deriveCategory(
      sourceKey,
      it.title,
      it.excerpt || "",
    );
    return {
      id: `${sourceKey}:${it.id}`,
      source: cfg.label,
      sourceKey,
      title: it.title,
      summary: it.excerpt || "",
      body: "",
      bodyFetchedAt: 0,
      url: it.link || "",
      pubDate: it.pubDate || "",
      dateKey: it.dateKey || "",
      category,
      tags,
      popularity: 0,
      isRed: false,
      fetchedAt: now,
      readAt: 0,
    };
  }

  function normalize(raw: any): FinArticle[] {
    const xml = typeof raw === "string" ? raw : "";
    const items = parseIthomeRss(xml);
    const out: FinArticle[] = [];
    const now = Date.now();
    for (const it of items) {
      if (!it || !it.id || !it.title) continue;
      out.push(buildArticle(it, now));
    }
    return cfg.postProcess ? cfg.postProcess(out) : out;
  }

  return { id: cfg.id, label: cfg.label, fetch, normalize };
}
