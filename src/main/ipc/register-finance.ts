/**
 * src/main/ipc/register-finance.ts
 *
 * 财经模块 IPC 边界。通过 ctx.safeHandle 注册 12 个 channel：
 *   finance:refresh-news     拉全部启用源写 state → {ok, added, total, ts, errorsPerSource}
 *   finance:get-news         入参 {category?, sort?, search?} → 过滤后列表
 *   finance:get-article      入参 {id} → {ok, article}（body 为空直接返回，不做远程拉取）
 *   finance:get-related      入参 {id, limit?} → 相关推荐（同标签优先 + 同分类补全）
 *   finance:refresh-quotes   拉指数+汇率写 state
 *   finance:get-quotes       返回 market_quotes 缓存
 *   finance:toggle-favorite  入参 {id}
 *   finance:mark-read        入参 {id}
 *   finance:interpret        入参 {id, force?} → AI 结构化解读（缓存 finance_ai.json）
 *   finance:interpret-clear  入参 {id} → 清除单篇 AI 解读缓存
 *   finance:aggregate        入参 {category?, force?} → 跨新闻聚合洞察（缓存 finance_ai.json）
 *
 * 入参遵循 Pulse 既有 sanitize 约定（白名单校验）。不向渲染进程暴露原始 fetch。
 */

import type {} from "electron";
import * as newsStore from "../finance/news-store";
import * as quoteStore from "../finance/quote-store";
import { FIN_CATEGORIES } from "../finance/config";
import * as financeInterpret from "../../ai/finance-news-interpret";
import type {
  FinanceGetNewsOptions,
  FinanceRefreshOptions,
  IpcChannelMap,
} from "../../shared/ipc-contracts";

export const NEWS_UPDATED_CHANNEL = "finance:news-updated";
export const QUOTES_UPDATED_CHANNEL = "finance:quotes-updated";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sanitizeRefreshOpts(opts: unknown): FinanceRefreshOptions {
  if (!opts || typeof opts !== "object") return {};
  const input = opts as Record<string, unknown>;
  return {
    force: input.force === true,
    timeoutMs:
      typeof input.timeoutMs === "number" ? input.timeoutMs : undefined,
  };
}

function sanitizeGetArgs(args: unknown): FinanceGetNewsOptions {
  if (!args || typeof args !== "object") return {};
  const input = args as Record<string, unknown>;
  // D5：category 限制在 FIN_CATEGORIES ∪ {all}，越界回退 "all"
  const allowedCategories = new Set<string>(["all", ...FIN_CATEGORIES]);
  const category =
    typeof input.category === "string" && allowedCategories.has(input.category)
      ? input.category
      : "all";
  const sort = input.sort === "popularity" ? "popularity" : "time";
  const search = typeof input.search === "string" ? input.search : "";
  return { category, sort, search };
}

export function registerFinanceHandlers(ctx: any) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  function broadcast(channel: string, payload: unknown) {
    if (typeof sendToRenderer === "function") {
      try {
        sendToRenderer(channel, payload);
      } catch {
        /* noop */
      }
    }
  }

  safeHandle(
    "finance:refresh-news",
    async (
      _evt: unknown,
      opts: IpcChannelMap["finance:refresh-news"]["args"][0],
    ) => {
    try {
      const out = await newsStore.refresh(undefined, sanitizeRefreshOpts(opts));
      broadcast(NEWS_UPDATED_CHANNEL, out);
      return out;
    } catch (err: any) {
      return {
        ok: false,
        reason: (err && err.reason) || "threw",
        message: errMsg(err),
      };
    }
    },
  );

  safeHandle(
    "finance:get-news",
    async (
      _evt: unknown,
      args: IpcChannelMap["finance:get-news"]["args"][0],
    ) => {
    try {
      return newsStore.getFiltered(undefined, sanitizeGetArgs(args));
    } catch (err: any) {
      return {
        ok: false,
        reason: "threw",
        message: errMsg(err),
        items: [],
      };
    }
    },
  );

  // E2：各分类文章计数（含「全部」），供分类 tab 展示数量。
  safeHandle("finance:categories", async () => {
    try {
      return newsStore.getCategoryCounts(undefined);
    } catch {
      return { all: 0 };
    }
  });

  safeHandle(
    "finance:get-article",
    async (
      _evt: unknown,
      args: IpcChannelMap["finance:get-article"]["args"][0],
    ) => {
    try {
      const id = args && args.id;
      const art = newsStore.getArticle(undefined, id);
      if (!art) return { ok: false, reason: "article_not_found" };
      return { ok: true, article: art };
    } catch (err: any) {
      return { ok: false, reason: "threw", message: errMsg(err) };
    }
    },
  );

  // 相关推荐（同标签优先 + 同分类补全）。列表为空 / 深链直达时详情页回退用，
  // 避免为算几条相关而全量拉取分类列表。
  safeHandle(
    "finance:get-related",
    async (
      _evt: unknown,
      args: IpcChannelMap["finance:get-related"]["args"][0],
    ) => {
    const id = args && args.id;
    if (!id || typeof id !== "string") return [];
    const limit = typeof args.limit === "number" && args.limit > 0
      ? Math.min(args.limit, 50)
      : 5;
    try {
      return newsStore.getRelated(undefined, id, limit);
    } catch {
      return [];
    }
    },
  );

  safeHandle(
    "finance:refresh-quotes",
    async (
      _evt: unknown,
      opts: IpcChannelMap["finance:refresh-quotes"]["args"][0],
    ) => {
    try {
      const out = await quoteStore.refreshQuotes(
        undefined,
        sanitizeRefreshOpts(opts),
      );
      broadcast(QUOTES_UPDATED_CHANNEL, out);
      return out;
    } catch (err: any) {
      return {
        ok: false,
        reason: (err && err.reason) || "threw",
        message: errMsg(err),
      };
    }
    },
  );

  safeHandle("finance:get-quotes", async () => {
    try {
      return quoteStore.loadQuotes(undefined);
    } catch (err: any) {
      return {
        ok: false,
        reason: "threw",
        message: errMsg(err),
        indices: {},
        fx: {},
      };
    }
  });

  safeHandle(
    "finance:toggle-favorite",
    async (
      _evt: unknown,
      args: IpcChannelMap["finance:toggle-favorite"]["args"][0],
    ) => {
    const id = args && args.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      const out = newsStore.toggleFavorite(undefined, id);
      if (out && out.ok) broadcast(NEWS_UPDATED_CHANNEL, { favoriteChanged: id });
      return out;
    } catch (err: any) {
      return { ok: false, reason: "threw", message: errMsg(err) };
    }
    },
  );

  safeHandle(
    "finance:mark-read",
    async (
      _evt: unknown,
      args: IpcChannelMap["finance:mark-read"]["args"][0],
    ) => {
    const id = args && args.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      return newsStore.markRead(undefined, id);
    } catch (err: any) {
      return { ok: false, reason: "threw", message: errMsg(err) };
    }
    },
  );

  // 财经新闻 AI 解读（复用全局 chatCompletion / token-budget）。结果缓存到
  // 独立 sidecar finance_ai.json，不碰 state.json 的 PRESERVE_FIELDS。
  safeHandle(
    "finance:interpret",
    async (
      _evt: unknown,
      opts: IpcChannelMap["finance:interpret"]["args"][0],
    ) => {
    try {
      return await financeInterpret.fetchFinanceInterpret(opts || {});
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );

  // 清除单篇 AI 解读缓存（重新解读前调用）。
  safeHandle(
    "finance:interpret-clear",
    async (
      _evt: unknown,
      opts: IpcChannelMap["finance:interpret-clear"]["args"][0],
    ) => {
    const id = opts && opts.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      const ok = financeInterpret.clearFinanceInterpret(
        id,
        opts && opts.statePath,
      );
      return ok ? { ok: true } : { ok: false, reason: "clear_failed" };
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );

  // 跨新闻聚合（P2）。基于近期本地文章做主题/共识/分歧/信号聚合，结果按批次 hash 缓存
  // 到独立 sidecar finance_ai.json（与单篇解读同文件、不同 key），不碰 state.json。
  safeHandle(
    "finance:aggregate",
    async (
      _evt: unknown,
      opts: IpcChannelMap["finance:aggregate"]["args"][0],
    ) => {
    try {
      return await financeInterpret.fetchFinanceAggregate(opts || {});
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );
}

module.exports = {
  registerFinanceHandlers,
  NEWS_UPDATED_CHANNEL,
  QUOTES_UPDATED_CHANNEL,
};
