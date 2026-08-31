/**
 * Pulse 助手 UI 深链 — 通用目标格式.
 *
 * 约定：所有「打开/跳转」最终可表达为 pulse:// URI，再映射到具体 renderer 工具。
 * 加新跳转能力只需：1) 扩展 parse/actionTo  2) 在 assistant-action-handlers.ts 注册 handler
 */
import { DIGEST_UI_TITLE } from "./digest-labels";

export type PulseUiAction = {
  tool: string;
  params: Record<string, unknown>;
};

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!qs) return out;
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

export function parsePulseHref(href: string): PulseUiAction | null {
  const raw = String(href || "").trim();
  if (!raw.startsWith("pulse://")) return null;
  const rest = raw.slice("pulse://".length);
  const qIdx = rest.indexOf("?");
  const path = (qIdx >= 0 ? rest.slice(0, qIdx) : rest).replace(/\/+$/, "");
  const query = parseQuery(qIdx >= 0 ? rest.slice(qIdx + 1) : "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0] === "nav") {
    const nav = parts[1];
    if (!nav) return null;
    const params: Record<string, unknown> = { nav };
    if (query.tab) params.tab = query.tab;
    if (query.route) params.route = query.route;
    if (query.subTab) params.subTab = query.subTab;
    if (parts[2] === "route" && parts[3]) params.route = parts[3];
    return { tool: "navigate", params };
  }

  if (parts[0] === "movies" && parts[1] === "detail") {
    const params: Record<string, unknown> = {};
    if (query.movieId) params.movieId = query.movieId;
    if (query.title) params.title = query.title;
    if (query.q) params.q = query.q;
    return { tool: "open_movie_detail", params };
  }

  if (parts[0] === "news" && parts[1] === "finance" && parts[2] === "article") {
    const params: Record<string, unknown> = {};
    if (query.id) params.id = query.id;
    if (query.title) params.title = query.title;
    return { tool: "open_finance_article", params };
  }

  if (parts[0] === "news" && parts[1] === "ithome" && parts[2] === "article") {
    const params: Record<string, unknown> = {};
    if (query.id) params.id = query.id;
    if (query.title) params.title = query.title;
    return { tool: "open_ithome_article", params };
  }

  if (parts[0] === "invest" && parts[1] === "stocks" && parts[2] === "diagnosis") {
    const params: Record<string, unknown> = {};
    if (query.code) params.code = query.code;
    if (query.name) params.name = query.name;
    if (query.q) params.q = query.q;
    return { tool: "open_stock_diagnosis", params };
  }

  if (parts[0] === "overlay") {
    const overlay = parts[1];
    if (overlay === "search") return { tool: "open_search", params: {} };
    if (overlay === "digest") return { tool: "open_digest", params: {} };
    if (overlay === "reminders") return { tool: "open_reminders", params: {} };
  }

  if (parts[0] === "settings") {
    return {
      tool: "open_settings",
      params: { tab: query.tab === "ai" ? "ai" : "general" },
    };
  }

  if (parts[0] === "concerts") {
    return { tool: "open_concerts", params: {} };
  }

  return null;
}

export function actionToPulseHref(action: PulseUiAction): string | null {
  const { tool, params } = action;
  switch (tool) {
    case "navigate": {
      const nav = typeof params.nav === "string" ? params.nav : "";
      if (!nav) return null;
      let href = `pulse://nav/${nav}`;
      const q: string[] = [];
      if (typeof params.tab === "string") q.push(`tab=${encodeURIComponent(params.tab)}`);
      if (typeof params.route === "string") {
        href = `pulse://nav/${nav}/route/${params.route}`;
      }
      if (typeof params.subTab === "string") {
        q.push(`subTab=${encodeURIComponent(params.subTab)}`);
      }
      return q.length > 0 ? `${href}?${q.join("&")}` : href;
    }
    case "open_movie_detail": {
      const q: string[] = [];
      if (typeof params.movieId === "string") q.push(`movieId=${encodeURIComponent(params.movieId)}`);
      if (typeof params.title === "string") q.push(`title=${encodeURIComponent(params.title)}`);
      return q.length > 0 ? `pulse://movies/detail?${q.join("&")}` : "pulse://movies/detail";
    }
    case "open_finance_article": {
      const q: string[] = [];
      if (typeof params.id === "string") q.push(`id=${encodeURIComponent(params.id)}`);
      if (typeof params.title === "string") q.push(`title=${encodeURIComponent(params.title)}`);
      return q.length > 0 ? `pulse://news/finance/article?${q.join("&")}` : null;
    }
    case "open_ithome_article": {
      const q: string[] = [];
      if (typeof params.id === "string") q.push(`id=${encodeURIComponent(params.id)}`);
      if (typeof params.title === "string") q.push(`title=${encodeURIComponent(params.title)}`);
      return q.length > 0 ? `pulse://news/ithome/article?${q.join("&")}` : null;
    }
    case "open_stock_diagnosis": {
      const q: string[] = [];
      if (typeof params.code === "string") q.push(`code=${encodeURIComponent(params.code)}`);
      if (typeof params.name === "string") q.push(`name=${encodeURIComponent(params.name)}`);
      return q.length > 0 ? `pulse://invest/stocks/diagnosis?${q.join("&")}` : null;
    }
    case "open_search":
      return "pulse://overlay/search";
    case "open_digest":
      return "pulse://overlay/digest";
    case "open_reminders":
      return "pulse://overlay/reminders";
    case "open_settings":
      return `pulse://settings?tab=${params.tab === "ai" ? "ai" : "general"}`;
    case "open_concerts":
      return "pulse://concerts";
    default:
      return null;
  }
}

export function normalizeUiAction(action: PulseUiAction): PulseUiAction {
  if (action.tool === "pulse_open") {
    const href =
      typeof action.params.href === "string"
        ? action.params.href
        : typeof action.params.url === "string"
          ? action.params.url
          : "";
    const parsed = parsePulseHref(href);
    if (parsed) return parsed;
  }
  if (typeof action.params.href === "string") {
    const parsed = parsePulseHref(action.params.href);
    if (parsed) return parsed;
  }
  return action;
}

export const ASSISTANT_UI_TOOLS = [
  "navigate",
  "open_search",
  "open_digest",
  "open_reminders",
  "open_settings",
  "open_concerts",
  "open_movie_detail",
  "open_finance_article",
  "open_ithome_article",
  "open_stock_diagnosis",
  "pulse_open",
] as const;

const UI_TOOL_SET = new Set<string>(ASSISTANT_UI_TOOLS);

export function isAssistantUiTool(tool: string): boolean {
  return UI_TOOL_SET.has(tool);
}

export type UiInferContext = {
  userText: string;
  priorAssistantText?: string;
  assistantText?: string;
  activeNav?: string;
};

/** pulse:// 速查 — prompt 与 eval 共用 */
export const PULSE_URI_CHEATSHEET = [
  "pulse://nav/home — 首页",
  "pulse://nav/versions — 应用列表 / 版本检查",
  "pulse://nav/versions/route/library — 应用库",
  "pulse://nav/versions/route/diagnostics — 诊断工具",
  "pulse://nav/github — GitHub 收录",
  "pulse://nav/movies — 电影",
  "pulse://nav/invest?tab=funds — 基金",
  "pulse://nav/invest?tab=stocks — 股票",
  "pulse://nav/invest?tab=metals — 贵金属",
  "pulse://nav/news?subTab=ithome — IT 资讯",
  "pulse://nav/news?subTab=finance — 财经新闻",
  "pulse://nav/news?subTab=wechat-hot — 微博热搜",
  "pulse://movies/detail?title=片名 — 电影详情",
  "pulse://news/finance/article?title=关键词 — 财经文章",
  "pulse://news/ithome/article?title=关键词 — IT 文章",
  "pulse://invest/stocks/diagnosis?code=600519 — 股票诊断",
  "pulse://overlay/search — 全局搜索",
  `pulse://overlay/digest — ${DIGEST_UI_TITLE}（应用更新/热搜/资讯/基金/用量）`,
  "pulse://overlay/reminders — 提醒",
  "pulse://settings?tab=ai — AI 设置",
  "pulse://concerts — 演出监控",
].join("\n");
