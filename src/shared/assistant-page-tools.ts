/**
 * 按当前页面裁剪助手 FC 工具集 — 减少工具幻觉.
 */

export type AssistantPageCtx = {
  activeNav?: string;
  investTab?: string;
  newsSubTab?: string;
  route?: string;
};

/** 任意页都保留的核心工具 */
export const ASSISTANT_GLOBAL_CORE_TOOLS = [
  "pulse_open",
  "navigate",
  "open_search",
  "open_settings",
  "open_digest",
  "open_reminders",
  "list_nav",
  "search",
  "query_digest",
  "create_reminder",
  "query_reminders",
] as const;

/** 页面专属工具（与 GLOBAL_CORE 合并） */
const PAGE_EXTRA_TOOLS: Record<string, readonly string[]> = {
  movies: ["query_movies", "open_movie_detail"],
  concerts: [
    "query_concerts",
    "open_concerts",
    "add_concert_watch",
    "remove_concert_watch",
    "refresh_concerts",
  ],
  "invest:funds": ["query_funds", "query_metals", "query_stocks"],
  "invest:metals": ["query_metals", "query_funds", "query_stocks"],
  "invest:stocks": [
    "query_stocks",
    "query_stock_diagnosis",
    "open_stock_diagnosis",
    "advise_stocks",
    "query_funds",
    "query_metals",
  ],
  invest: ["query_funds", "query_metals", "query_stocks", "advise_stocks"],
  "news:finance": [
    "interpret_finance",
    "open_finance_article",
    "summarize_ithome",
    "open_ithome_article",
  ],
  "news:ithome": [
    "summarize_ithome",
    "open_ithome_article",
    "interpret_finance",
    "open_finance_article",
  ],
  "news:wechat-hot": [],
  news: ["summarize_ithome", "open_ithome_article", "interpret_finance", "open_finance_article"],
  versions: [
    "query_apps",
    "trigger_check",
    "upgrade_app",
    "bulk_upgrade_all",
    "open_search_result",
    "query_github",
  ],
  home: ["query_apps", "query_github", "query_funds"],
  github: ["query_github"],
  "ai-leaderboard": ["query_leaderboard"],
  "ai-usage": ["query_ai_usage"],
};

export function resolveAssistantPageKey(ctx: AssistantPageCtx): string | null {
  const nav = ctx.activeNav?.trim();
  if (!nav) return null;
  if (nav === "invest") {
    const tab = ctx.investTab?.trim();
    if (tab === "funds" || tab === "metals" || tab === "stocks") {
      return `invest:${tab}`;
    }
    return "invest";
  }
  if (nav === "news") {
    const sub = ctx.newsSubTab?.trim();
    if (sub === "ithome" || sub === "finance" || sub === "wechat-hot") {
      return `news:${sub}`;
    }
    return "news";
  }
  return nav;
}

export function resolveToolNamesForPage(ctx: AssistantPageCtx): Set<string> {
  const pageKey = resolveAssistantPageKey(ctx);
  const extras =
    (pageKey && PAGE_EXTRA_TOOLS[pageKey]) ||
    (ctx.activeNav && PAGE_EXTRA_TOOLS[ctx.activeNav]) ||
    [];
  const names = new Set<string>(ASSISTANT_GLOBAL_CORE_TOOLS);
  for (const t of extras) names.add(t);
  return names;
}

export function extractFcPageContext(
  pageData?: Record<string, unknown>,
  fallback?: AssistantPageCtx,
): AssistantPageCtx {
  const pd = pageData || {};
  return {
    activeNav:
      (typeof pd.activeNav === "string" ? pd.activeNav : undefined) ||
      fallback?.activeNav,
    route:
      (typeof pd.route === "string" ? pd.route : undefined) || fallback?.route,
    investTab:
      typeof pd.investTab === "string" ? pd.investTab : fallback?.investTab,
    newsSubTab:
      typeof pd.newsSubTab === "string" ? pd.newsSubTab : fallback?.newsSubTab,
  };
}

export function pageToolProfileLabel(ctx: AssistantPageCtx): string {
  return resolveAssistantPageKey(ctx) || ctx.activeNav || "unknown";
}
