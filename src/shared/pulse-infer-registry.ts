/**
 * Pulse UI 推断规则表 — 每条规则产出 pulse:// href，再经 parsePulseHref 执行.
 * 加新推断：在此注册一条 { id, priority, infer } 即可.
 */
import { NAV_REGISTRY } from "./nav-keys";
import { parsePulseHref, type UiInferContext } from "./pulse-href";

/** 用户口语：早报 / 日报 / 今日要点（UI 名见 digest-labels） */
export const DIGEST_TERM_RE = /早报|日报|digest|今日要点|今天要点/i;

export type PulseInferMatchContext = UiInferContext & {
  user: string;
  prior: string;
  reply: string;
};

type PulseInferRule = {
  id: string;
  /** 数字越小越先匹配 */
  priority: number;
  infer: (ctx: PulseInferMatchContext) => string | null;
};

const OPEN_INTENT_RE =
  /(打开|跳转|切换到|去看看|进入|切到).{0,24}(页|页面|模块|板块|标签)?/i;
const OPEN_SHORT_RE = /^(打开|去|跳转|切换到|进入)/i;
const AFFIRM_RE =
  /^(需要|要|好的?|是的?|可以|行|嗯|好呀|当然可以|帮我开|打开吧|去吧|ok|yes)[\s!！。.?？~～]*$/i;
const OFFER_NAV_RE =
  /(要不要|是否需要|需要我|是否|要不要我|帮你?).{0,24}打开|打开.{0,16}(页|页面|看看)|去.{0,8}(页|页面)|切到.{0,12}(页|页面)/;
const CLAIMED_NAV_RE =
  /(已经|已)(为你|帮您)?(打开|跳转|切换|带到)(?!.{0,20}详情)|已打开.{0,12}页(?!面)/;
const MOVIE_DETAIL_INTENT_RE =
  /详情|场次|影点|排片|看电影|点开看|打开.{0,12}详情/;
const CLAIMED_MOVIE_DETAIL_RE =
  /为你打开《[^》]+》|打开《[^》]+》.{0,12}详情/;
const ARTICLE_DETAIL_INTENT_RE =
  /详情|这篇文章|这篇|解读|摘要|正文|打开.{0,12}(文章|详情)/;
const CLAIMED_ARTICLE_DETAIL_RE =
  /为你打开.{0,20}(文章|详情)|打开.{0,12}(文章|详情|这篇)/;
const STOCK_DIAGNOSIS_INTENT_RE =
  /诊断|怎么样|分析|看看.{0,8}股|个股|走势/;
const STOCK_CODE_RE = /\b(\d{6})\b/;

const NAV_ALIAS_RULES: Array<{
  re: RegExp;
  nav: string;
  tab?: string;
  route?: string;
  subTab?: string;
}> = [
  { re: /应用(列表|更新|监控)?|版本(检查|页|监控)?|更新列表/, nav: "versions" },
  { re: /github|开源项目/i, nav: "github" },
  { re: /ai\s*榜单|模型榜单|大模型排名/i, nav: "ai-leaderboard" },
  { re: /电影|热映/, nav: "movies" },
  { re: /演出|演唱会|票价监控/, nav: "concerts" },
  { re: /基金/, nav: "invest", tab: "funds" },
  { re: /贵金属|黄金|白银|金属行情/, nav: "invest", tab: "metals" },
  { re: /股票|选股/, nav: "invest", tab: "stocks" },
  { re: /投资(页|模块)?/, nav: "invest" },
  { re: /新闻|资讯|it之家|微博/, nav: "news" },
  { re: /ai\s*用量|coding\s*plan|token\s*用量/i, nav: "ai-usage" },
  { re: /首页|概览|仪表盘|dashboard/i, nav: "home" },
  { re: /诊断/, nav: "versions", route: "diagnostics" },
  { re: /应用库|已安装/, nav: "versions", route: "library" },
];

export function expandInferContext(ctx: UiInferContext): PulseInferMatchContext {
  return {
    ...ctx,
    user: ctx.userText.trim(),
    prior: (ctx.priorAssistantText || "").trim(),
    reply: (ctx.assistantText || "").trim(),
  };
}

export function extractQuotedTitle(text: string): string | null {
  const book = text.match(/[《「『]([^》」』]+)[》」』]/);
  if (book?.[1]) {
    return book[1].replace(/[!！?？。.\s]/g, "").trim() || null;
  }
  return null;
}

export function extractShortLabel(text: string): string | null {
  const cleaned = text.trim().replace(/[!！?？。.\s]/g, "");
  if (
    cleaned.length >= 2 &&
    cleaned.length <= 20 &&
    !/(打开|跳转|页面|详情|怎么样|如何|需要|可以|文章|资讯|诊断|股票)/.test(cleaned) &&
    !/[?？]|有什么|哪些|多少|吗$|呢$/.test(text) &&
    !/早报|日报|要点|提醒|基金|更新|应用|搜索|设置|新闻|资讯|github|榜单|演出|用量|检查/i.test(
      cleaned,
    )
  ) {
    return cleaned;
  }
  return null;
}

export function extractMovieTitle(text: string): string | null {
  return extractQuotedTitle(text) || extractShortLabel(text);
}

function hasNavigateIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (OPEN_INTENT_RE.test(t)) return true;
  if (OPEN_SHORT_RE.test(t) && t.length <= 40) return true;
  return false;
}

/** 问今日要点内容 → query_digest，勿 open_digest */
export function isDigestQueryIntent(text: string): boolean {
  const t = text.trim();
  if (/^(今天|今日).{0,10}(有什么|哪些|啥).{0,8}要点/.test(t)) return true;
  if (!DIGEST_TERM_RE.test(t)) return false;
  if (
    /(?:^|[，,!\s])不要打开|别打开|不用打开|不要弹|别弹/.test(t) &&
    !/要不要/.test(t)
  ) {
    return true;
  }
  return (
    /(有什么|啥|哪些|怎么样|如何|总结|摘要|讲讲|介绍|内容|变化)/.test(t) ||
    /^(查|查询).{0,12}(早报|日报|digest)/i.test(t)
  );
}

/** 明确打开今日要点面板 → open_digest / pulse://overlay/digest */
export function isDigestOpenIntent(text: string): boolean {
  const t = text.trim();
  if (!DIGEST_TERM_RE.test(t)) return false;
  if (isDigestQueryIntent(t)) return false;
  if (/(打开|跳转|去看|进入)/.test(t)) return true;
  if (/要不要.{0,12}打开.{0,12}(早报|日报|今日要点|今天要点)/.test(t)) return true;
  if (/^(去|看一?下).{0,8}(早报|日报|今日要点|今天要点|digest)/i.test(t)) return true;
  if (/看看.{0,8}(早报|日报|今日要点|今天要点)/.test(t) && !/(有什么|啥|内容)/.test(t)) {
    return true;
  }
  return false;
}

function matchNavAlias(text: string): (typeof NAV_ALIAS_RULES)[number] | null {
  for (const rule of NAV_ALIAS_RULES) {
    if (rule.re.test(text)) return rule;
  }
  for (const e of NAV_REGISTRY) {
    if (text.includes(e.label) || (e.homeTitle && text.includes(e.homeTitle))) {
      return { re: /.*/, nav: e.key };
    }
  }
  return null;
}

function navHrefFromAlias(hit: (typeof NAV_ALIAS_RULES)[number]): string {
  if (hit.route) return `pulse://nav/${hit.nav}/route/${hit.route}`;
  const q: string[] = [];
  if (hit.tab) q.push(`tab=${encodeURIComponent(hit.tab)}`);
  if (hit.subTab) q.push(`subTab=${encodeURIComponent(hit.subTab)}`);
  const base = `pulse://nav/${hit.nav}`;
  return q.length > 0 ? `${base}?${q.join("&")}` : base;
}

/** 从自然语言匹配页面级 pulse://nav/… 或 overlay */
export function navHrefFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  if (/设置/.test(t) && /(打开|去|跳转|页面)/.test(t)) {
    const tab = /ai|模型|provider/i.test(t) ? "ai" : "general";
    return `pulse://settings?tab=${tab}`;
  }
  if (DIGEST_TERM_RE.test(t) && isDigestOpenIntent(t)) {
    return "pulse://overlay/digest";
  }
  if (/提醒|待办/.test(t) && /(打开|跳转|去看|进入|查看)/.test(t)) {
    return "pulse://overlay/reminders";
  }
  if (/搜索/.test(t) && /(打开|全局)/.test(t)) return "pulse://overlay/search";
  if (/(应用库|已安装)/.test(t) && /(打开|去|跳转|看看)/.test(t)) {
    return "pulse://nav/versions/route/library";
  }
  if (/诊断/.test(t) && /(打开|去|跳转|页面|工具)/.test(t) && !/股票|个股/.test(t)) {
    return "pulse://nav/versions/route/diagnostics";
  }
  if (/微博|热搜/.test(t) && /(打开|去|跳转|看看)/.test(t)) {
    return "pulse://nav/news?subTab=wechat-hot";
  }
  if (/(财经新闻|财经资讯)/.test(t) && /(打开|去|跳转)/.test(t)) {
    return "pulse://nav/news?subTab=finance";
  }
  if (/(it资讯|it之家|科技新闻)/i.test(t) && /(打开|去|跳转)/.test(t)) {
    return "pulse://nav/news?subTab=ithome";
  }

  const hit = matchNavAlias(t);
  if (!hit) return null;
  return navHrefFromAlias(hit);
}

function isFinanceArticleContext(text: string, activeNav?: string): boolean {
  if (/财经|finance|股市|基金|债券|宏观/.test(text)) return true;
  if (activeNav === "news") return /解读|摘要|财经/.test(text);
  return false;
}

function isIthomeArticleContext(text: string, activeNav?: string): boolean {
  if (/it之家|it资讯|科技新闻|资讯文章|ithome/i.test(text)) return true;
  if (activeNav === "news" && /资讯|新闻|文章/.test(text)) return true;
  return false;
}

function hasArticleDetailIntent(
  text: string,
  user: string,
  prior: string,
  isUser: boolean,
): boolean {
  return (
    ARTICLE_DETAIL_INTENT_RE.test(text) ||
    CLAIMED_ARTICLE_DETAIL_RE.test(text) ||
    (isUser &&
      AFFIRM_RE.test(user) &&
      /(文章|详情|这篇|解读)/.test(prior)) ||
    (isUser && text === user && text.length <= 24 && /详情|这篇/.test(prior))
  );
}

function articleHref(
  kind: "finance" | "ithome",
  text: string,
  user: string,
): string | null {
  const idMatch = text.match(/\bid[=:]\s*([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) {
    return `pulse://news/${kind}/article?id=${encodeURIComponent(idMatch[1])}`;
  }
  const title = extractQuotedTitle(text) || extractShortLabel(user);
  if (!title) return null;
  return `pulse://news/${kind}/article?title=${encodeURIComponent(title)}`;
}

const NON_MOVIE_SHORT_USER_RE =
  /[?？]|有什么|哪些|多少|吗$|呢$|早报|日报|要点|提醒|基金|股票|更新|应用|搜索|设置|新闻|资讯|github|榜单|演出|用量|检查/i;

const PULSE_INFER_RULES: PulseInferRule[] = [
  {
    id: "overlay-digest",
    priority: 5,
    infer: (ctx: PulseInferMatchContext) => {
      if (ctx.user && isDigestOpenIntent(ctx.user)) {
        return "pulse://overlay/digest";
      }
      if (
        ctx.reply &&
        /已经.{0,12}打开.{0,12}(早报|日报|今日要点)/.test(ctx.reply) &&
        !isDigestQueryIntent(ctx.user)
      ) {
        return "pulse://overlay/digest";
      }
      if (
        ctx.prior &&
        AFFIRM_RE.test(ctx.user) &&
        isDigestOpenIntent(ctx.prior)
      ) {
        return "pulse://overlay/digest";
      }
      return null;
    },
  },
  {
    id: "overlay-reminders",
    priority: 6,
    infer: (ctx: PulseInferMatchContext) => {
      for (const text of [ctx.user, ctx.reply, ctx.prior]) {
        if (!text || !/提醒|待办/.test(text)) continue;
        if (/(有什么|啥|哪些|怎么样|如何)/.test(text)) continue;
        if (/(打开|跳转|去看|进入|查看|我的)/.test(text)) {
          return "pulse://overlay/reminders";
        }
      }
      return null;
    },
  },
  {
    id: "movie-detail",
    priority: 10,
    infer: (ctx: PulseInferMatchContext) => {
      if (isDigestQueryIntent(ctx.user)) return null;
      const onMovies = ctx.activeNav === "movies";
      const candidates: Array<{ text: string; isUser: boolean }> = [
        { text: ctx.reply, isUser: false },
        { text: ctx.user, isUser: true },
        { text: ctx.prior, isUser: false },
      ];
      for (const { text, isUser } of candidates) {
        if (!text) continue;
        const title = extractMovieTitle(text);
        if (!title) continue;
        const ok =
          MOVIE_DETAIL_INTENT_RE.test(text) ||
          CLAIMED_MOVIE_DETAIL_RE.test(text) ||
          (onMovies &&
            isUser &&
            ctx.user.length <= 20 &&
            !NON_MOVIE_SHORT_USER_RE.test(ctx.user)) ||
          (isUser &&
            AFFIRM_RE.test(ctx.user) &&
            /《/.test(ctx.prior) &&
            /(详情|电影|片)/.test(ctx.prior));
        if (ok) {
          return `pulse://movies/detail?title=${encodeURIComponent(title)}`;
        }
      }
      return null;
    },
  },
  {
    id: "finance-article",
    priority: 20,
    infer: (ctx: PulseInferMatchContext) => {
      const candidates: Array<{ text: string; isUser: boolean }> = [
        { text: ctx.reply, isUser: false },
        { text: ctx.user, isUser: true },
        { text: ctx.prior, isUser: false },
      ];
      for (const { text, isUser } of candidates) {
        if (!text || !isFinanceArticleContext(text, ctx.activeNav)) continue;
        if (!hasArticleDetailIntent(text, ctx.user, ctx.prior, isUser)) continue;
        const href = articleHref("finance", text, ctx.user);
        if (href) return href;
      }
      return null;
    },
  },
  {
    id: "ithome-article",
    priority: 21,
    infer: (ctx: PulseInferMatchContext) => {
      const candidates: Array<{ text: string; isUser: boolean }> = [
        { text: ctx.reply, isUser: false },
        { text: ctx.user, isUser: true },
        { text: ctx.prior, isUser: false },
      ];
      for (const { text, isUser } of candidates) {
        if (!text || !isIthomeArticleContext(text, ctx.activeNav)) continue;
        if (!hasArticleDetailIntent(text, ctx.user, ctx.prior, isUser)) continue;
        const href = articleHref("ithome", text, ctx.user);
        if (href) return href;
      }
      return null;
    },
  },
  {
    id: "stock-diagnosis",
    priority: 30,
    infer: (ctx: PulseInferMatchContext) => {
      const onStocks =
        ctx.activeNav === "invest" ||
        /股票|个股|诊断/.test(`${ctx.user} ${ctx.prior} ${ctx.reply}`);
      const candidates = [ctx.reply, ctx.user, ctx.prior].filter(Boolean);
      for (const text of candidates) {
        const code = text.match(STOCK_CODE_RE)?.[1];
        if (code && (STOCK_DIAGNOSIS_INTENT_RE.test(text) || onStocks)) {
          return `pulse://invest/stocks/diagnosis?code=${encodeURIComponent(code)}`;
        }
        if (!onStocks) continue;
        const name = extractQuotedTitle(text) || extractShortLabel(ctx.user);
        if (name && (STOCK_DIAGNOSIS_INTENT_RE.test(text) || text === ctx.user)) {
          return `pulse://invest/stocks/diagnosis?name=${encodeURIComponent(name)}`;
        }
      }
      return null;
    },
  },
  {
    id: "nav-user-open",
    priority: 100,
    infer: (ctx: PulseInferMatchContext) => {
      if (!hasNavigateIntent(ctx.user)) return null;
      return navHrefFromText(ctx.user);
    },
  },
  {
    id: "nav-affirmation",
    priority: 110,
    infer: (ctx: PulseInferMatchContext) => {
      if (!AFFIRM_RE.test(ctx.user) || !ctx.prior) return null;
      if (OFFER_NAV_RE.test(ctx.prior)) return navHrefFromText(ctx.prior);
      if (!/(打开|跳转|看看|去|页面|页)/.test(ctx.prior)) return null;
      return navHrefFromText(ctx.prior);
    },
  },
  {
    id: "nav-claim",
    priority: 120,
    infer: (ctx: PulseInferMatchContext) => {
      if (!ctx.reply || !CLAIMED_NAV_RE.test(ctx.reply)) return null;
      if (MOVIE_DETAIL_INTENT_RE.test(ctx.reply) || CLAIMED_MOVIE_DETAIL_RE.test(ctx.reply)) {
        return null;
      }
      if (isDigestQueryIntent(ctx.user) && DIGEST_TERM_RE.test(ctx.reply)) {
        return null;
      }
      return navHrefFromText(ctx.reply);
    },
  },
].sort((a, b) => a.priority - b.priority);

export function inferPulseHref(ctx: UiInferContext): string | null {
  const full = expandInferContext(ctx);
  for (const rule of PULSE_INFER_RULES) {
    const href = rule.infer(full);
    if (href) return href;
  }
  return null;
}

export function inferUiActionFromContext(
  ctx: UiInferContext,
): { tool: string; params: Record<string, unknown> } | null {
  const href = inferPulseHref(ctx);
  if (!href) return null;
  return parsePulseHref(href);
}

/** 是否应强制 FC 调用 UI 工具（与推断规则表一致） */
export function wantsUiTool(ctx: UiInferContext): boolean {
  return inferPulseHref(ctx) !== null;
}

/** 供测试 / 调试：规则表 id 列表 */
export const PULSE_INFER_RULE_IDS = PULSE_INFER_RULES.map((r) => r.id);
