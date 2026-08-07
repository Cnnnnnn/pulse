/**
 * src/renderer/components/nav-status.ts
 *
 * nav 未读 badge + 实时 status 摘要的单一真源 (Phase 9 外壳重构抽出).
 *
 * 背景: 之前 getBadge/getStatus 锁在 HomeGrid.tsx 里 (行 177-296), 直接 read signal.value.
 *   IconRail / NavDrawer / Dashboard 都要复用这套逻辑, 抽成纯函数 + ctx 注入:
 *   - 纯函数: getBadge(key, ctx) / getStatus(key, ctx), 易测, 无 signal 直接耦合.
 *   - collectNavStatusCtx(): 在组件 render 期调用, read 所有 signal (.value) 注册 Preact
 *     依赖, 返回 ctx 对象喂给纯函数. 响应式由调用方承担, 本模块保持纯.
 *
 * 同时收口 nav 相关纯 helper: greeting / fmtTime / fmtDate (Dashboard Hero 复用).
 */

import { ithomeArticles, ithomeDayStats } from "../ithome/store.ts";
import { ithomeUnreadBadge } from "../ithome/store.ts";
import { wechatHotUnreadBadge, wechatHotItems } from "../wechat-hot/store.ts";
import { fundUnreadBadge, totalMetrics, holdings } from "../funds/fundStore.ts";
import { aiUsageNavBadge, aiUsageSnapshot, aiUsageActiveProvider } from "../store/ai-usage-store.ts";
import { githubProjects } from "../store/github-projects-store.ts";
import { quoteCache } from "../metals/metalStore.ts";
import { comparePoolCount } from "../stocks/comparePool.ts";
import { results as stocksResults } from "../stocks/stockStore.ts";
import { results as checkResults, apps as checkApps } from "../store.ts";
import { gamesHasNewFree, gamesHasNewDrop } from "../games/gamesStore.ts";
import { todayShanghaiDateKey, articlesForDate } from "../ithome/news-utils.ts";

// ─── ctx 类型 ──────────────────────────────────────

/** 给 getBadge/getStatus 注入的数据快照 (调用方 read signal 后组装). */
export interface NavStatusCtx {
  // badge 源
  ithomeUnread: number;
  wechatHotUnread: number;
  fundUnread: number;
  aiUsageNavBadge: number;
  gamesHasNew: boolean;
  // news status 源
  ithomeDayStats: Record<string, { count?: number }> | null;
  ithomeArticles: any;
  wechatHotItems: any;
  // invest status 源
  holdings: any;
  totalMetrics: { todayProfit?: number } | null;
  quoteCache: any;
  comparePoolCount: number;
  stocksResults: any;
  // ai-usage status 源
  aiUsageActiveProvider: any;
  aiUsageSnapshot: any;
  // versions status 源
  checkResults: any;
  checkApps: any;
  // github status 源
  githubProjects: any;
}

/**
 * 在组件 render 期调用: read 所有 nav 相关 signal, 注册 Preact 依赖, 返回 ctx.
 * 调用方拿 ctx 喂给 getBadge/getStatus. 本函数有副作用 (signal read), 不要在纯函数里调.
 */
export function collectNavStatusCtx(): NavStatusCtx {
  return {
    ithomeUnread: ithomeUnreadBadge.value || 0,
    wechatHotUnread: wechatHotUnreadBadge.value || 0,
    fundUnread: fundUnreadBadge.value || 0,
    aiUsageNavBadge: aiUsageNavBadge.value || 0,
    gamesHasNew: !!(gamesHasNewFree.value || gamesHasNewDrop.value),
    ithomeDayStats: ithomeDayStats.value,
    ithomeArticles: ithomeArticles.value,
    wechatHotItems: wechatHotItems.value,
    holdings: holdings.value,
    totalMetrics: totalMetrics.value,
    quoteCache: quoteCache.value,
    comparePoolCount: comparePoolCount.value || 0,
    stocksResults: stocksResults.value,
    aiUsageActiveProvider: aiUsageActiveProvider.value,
    aiUsageSnapshot: aiUsageSnapshot.value,
    checkResults: checkResults.value,
    checkApps: checkApps.value,
    githubProjects: githubProjects.value,
  };
}

// ─── badge ─────────────────────────────────────────

/**
 * nav 未读角标数. 返回 null 表示不渲染角标 (0 也返回 null).
 * 'news' = ithome + wechat-hot 之和 (P-N+ 合并后).
 * 'games' = 有新免费活动/心愿单降价时返回 1 (红点语义), 否则 null.
 */
export function getBadge(key: string, ctx: NavStatusCtx): number | null {
  switch (key) {
    case "news":
      return ctx.ithomeUnread + ctx.wechatHotUnread || null;
    case "invest":
      return ctx.fundUnread || null;
    case "ai-usage":
      return ctx.aiUsageNavBadge || null;
    case "games":
      return ctx.gamesHasNew ? 1 : null;
    default:
      return null;
  }
}

/**
 * 按 section 聚合未读总数 (IconRail section 图标角标用).
 * news section = news + games; holdings = invest + ai-usage; system = versions.
 */
export function sectionBadge(sectionId: string, ctx: NavStatusCtx): number {
  switch (sectionId) {
    case "news": {
      const news = ctx.ithomeUnread + ctx.wechatHotUnread;
      const games = ctx.gamesHasNew ? 1 : 0;
      return news + games;
    }
    case "holdings":
      return ctx.fundUnread + ctx.aiUsageNavBadge;
    case "system":
      return 0; // versions 无未读角标语义
    default:
      return 0;
  }
}

// ─── status 摘要 ───────────────────────────────────

/** nav 实时状态摘要字符串 (tile/卡片副标题). 空 数据返回 "—". 未知 key 返回 null. */
export function getStatus(key: string, ctx: NavStatusCtx): string | null {
  switch (key) {
    case "news": {
      const today = todayShanghaiDateKey();
      const newsCount =
        ctx.ithomeDayStats?.[today]?.count ?? articlesForDate(ctx.ithomeArticles, today).length ?? 0;
      const hotCount = ctx.wechatHotItems?.length ?? 0;
      const parts: string[] = [];
      if (newsCount > 0) parts.push(`今日 ${newsCount} 条`);
      if (hotCount > 0) parts.push(`${hotCount} 热搜`);
      if (parts.length === 0) return "—";
      return parts.join(" · ");
    }
    case "invest": {
      // 投资 nav 合并: status 按 funds → metals → stocks 优先级下探.
      const pool = ctx.comparePoolCount || 0;
      if (ctx.holdings && ctx.holdings.length > 0) {
        const pnl = ctx.totalMetrics?.todayProfit ?? 0;
        const sign = pnl >= 0 ? "+" : "−";
        return `基金 今日 ${sign}¥${Math.abs(pnl).toFixed(2)} · 对比池 ${pool}`;
      }
      const q = ctx.quoteCache?.data?.["AU9999"];
      if (q) return `黄金 ¥${q.price.toFixed(2)}/克 · 对比池 ${pool}`;
      const sCount = ctx.stocksResults?.length || 0;
      if (sCount > 0) return `选股 ${sCount} 条 · 对比池 ${pool}`;
      return "—";
    }
    case "ai-usage": {
      const provider = ctx.aiUsageActiveProvider;
      const snap = ctx.aiUsageSnapshot?.[provider];
      const w = snap?.windows?.weekly ?? snap?.windows?.["5h"] ?? null;
      if (w?.usedPercent != null && w.usedPercent >= 0) {
        return `已用 ${Math.round(w.usedPercent)}%`;
      }
      if (w?.remaining != null && w.total > 0) {
        const used = Math.round((1 - w.remaining / w.total) * 100);
        return `已用 ${used}%`;
      }
      return "—";
    }
    case "versions": {
      const results = ctx.checkResults;
      const total = results instanceof Map ? results.size : 0;
      const updatable =
        total > 0
          ? Array.from(results!.values()).filter((r: any) => r && r.has_update).length
          : 0;
      const appsCount = ctx.checkApps?.length ?? 0;
      if (total === 0 && appsCount === 0) return "未配置应用";
      return `${updatable}/${total} 可更新`;
    }
    case "github": {
      const n = ctx.githubProjects?.length ?? 0;
      return n > 0 ? `已收录 ${n} 个` : "尚未收录";
    }
    case "games":
      return "Steam / Epic 实时 · 主机示例";
    case "ai-leaderboard":
      return "—";
    default:
      return null;
  }
}

// ─── 纯 helper (Dashboard Hero 复用) ───────────────

/** 时段问候语 (Hero 复用). */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** HH:MM (Hero 时钟复用). */
export function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** M 月 D 日 · 周X (Hero 日期复用). */
export function fmtDate(d: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdays[d.getDay()]}`;
}
