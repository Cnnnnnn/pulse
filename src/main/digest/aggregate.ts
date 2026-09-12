/**
 * src/main/digest/aggregate.ts
 *
 * Phase I1+I5: pure aggregator — given state + opts, return
 *   { date: 'YYYY-MM-DD', sections: [{kind, items}], lines: [string] }
 *
 * - sections: full data for drawer UI (no cap)
 * - lines:   ≤ MAX_LINES strings for push notification (truncated to 60 chars)
 *
 * Each section kind is built independently with try/catch; one failing source
 * does NOT break others. Order is fixed via SECTION_ORDER for stable priority.
 */

const MAX_LINES = 6;

const SECTION_ORDER = [
  "updates",
  "hot",
  "news",
  "funds",
  "ai_usage",
  "ai_movers",
  "github_releases",
] as const;

const MAX_LINE_LEN = 60;
const UPDATES_CAP = 3;
const HOT_CAP = 3;
const NEWS_CAP = 1;
const FUNDS_CAP = 2;
const AI_USAGE_CAP = 1;
const AI_USAGE_THRESHOLD_PCT = 80;
const FUND_DELTA_THRESHOLD_PCT = 1;
const AI_MOVERS_CAP = 3;
const GITHUB_RELEASES_CAP = 3;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function truncate(s: unknown, max: number = MAX_LINE_LEN): string {
  let str: string;
  if (typeof s !== "string") str = String(s || "");
  else str = s;
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const r = fn();
    return r == null ? fallback : r;
  } catch {
    return fallback;
  }
}

type UpdateItem = { name: string; latest_version: string; installed_version: string };
type HotItem = { title: string };
type NewsItem = { title: string; url: string };
type FundItem = { code: string; name: string; today_change_pct: number };
type AiUsageItem = { provider: string; percent: number };
type AiMoverItem = {
  model: string;
  vendor: string;
  board: string;
  from: number | null;
  to: number;
  delta: number | null;
  is_new: boolean;
};
type GithubReleaseItem = {
  name: string;
  owner: string;
  repo: string;
  latest_version: string;
};

type Section =
  | { kind: "updates"; items: UpdateItem[] }
  | { kind: "hot"; items: HotItem[] }
  | { kind: "news"; items: NewsItem[] }
  | { kind: "funds"; items: FundItem[] }
  | { kind: "ai_usage"; items: AiUsageItem[] }
  | { kind: "ai_movers"; items: AiMoverItem[] }
  | { kind: "github_releases"; items: GithubReleaseItem[] };

function sectionUpdates(apps: any): Section | null {
  if (!apps || typeof apps !== "object") return null;
  const items: UpdateItem[] = [];
  for (const a of Object.values(apps) as any[]) {
    if (a && a.has_update && a.name) {
      items.push({
        name: a.name,
        latest_version: a.latest_version || "",
        installed_version: a.installed_version || "",
      });
      if (items.length >= UPDATES_CAP) break;
    }
  }
  return items.length ? { kind: "updates", items } : null;
}

function sectionHot(wechatHot: any): Section | null {
  if (!wechatHot || !Array.isArray(wechatHot.items)) return null;
  const items = wechatHot.items.slice(0, HOT_CAP).filter((x: any) => x && x.title);
  return items.length ? { kind: "hot", items } : null;
}

function sectionNews(ithome: any): Section | null {
  if (!ithome || !Array.isArray(ithome.articles)) return null;
  const first = ithome.articles.find((x: any) => x && x.title);
  return first ? { kind: "news", items: [{ title: first.title, url: first.url || "" }] } : null;
}

function sectionFunds(funds: any): Section | null {
  if (!funds || !Array.isArray(funds.holdings)) return null;
  const items: FundItem[] = [];
  for (const h of funds.holdings) {
    if (
      h && h.code &&
      typeof h.today_change_pct === "number" &&
      Math.abs(h.today_change_pct) > FUND_DELTA_THRESHOLD_PCT
    ) {
      items.push({
        code: h.code,
        name: h.name || h.code,
        today_change_pct: h.today_change_pct,
      });
      if (items.length >= FUNDS_CAP) break;
    }
  }
  return items.length ? { kind: "funds", items } : null;
}

function sectionAiUsage(aiUsage: any): Section | null {
  if (!aiUsage || !aiUsage.providers || typeof aiUsage.providers !== "object") return null;
  const items: AiUsageItem[] = [];
  for (const [provider, snap] of Object.entries(aiUsage.providers) as [string, any][]) {
    if (
      snap && typeof snap.percent === "number" &&
      snap.percent > AI_USAGE_THRESHOLD_PCT
    ) {
      items.push({ provider, percent: snap.percent });
      if (items.length >= AI_USAGE_CAP) break;
    }
  }
  return items.length ? { kind: "ai_usage", items } : null;
}

/**
 * v3.1: AI 榜单异动 — 读 arena 磁盘缓存最新两份快照 diff (纯读, 无网络).
 * state 里没有对应键: 数据源是 ai-leaderboard-cache/ 目录, 直接从 cache 模块拿.
 */
function sectionAiMovers(): Section | null {
  const { computeAiMovers } = require("./ai-movers.ts");
  const payload = computeAiMovers({ maxItems: AI_MOVERS_CAP });
  const items: AiMoverItem[] = Array.isArray(payload && payload.items)
    ? payload.items.filter(
        (it: any) => it && it.model && it.board &&
          (it.is_new ? typeof it.to === "number" : typeof it.from === "number" && typeof it.to === "number"),
      )
    : [];
  return items.length ? { kind: "ai_movers", items } : null;
}

/**
 * v3.1: GitHub 收录更新 — renderer 检查完 release 后经 briefing:ingest-github-releases
 * 推到 state.github_releases_digest, 这里只读.
 */
function sectionGithubReleases(digest: any): Section | null {
  if (!digest || !Array.isArray(digest.items)) return null;
  const items: GithubReleaseItem[] = [];
  for (const it of digest.items) {
    if (it && it.repo && it.latest_version) {
      items.push({
        name: it.name || it.repo,
        owner: it.owner || "",
        repo: it.repo,
        latest_version: it.latest_version,
      });
      if (items.length >= GITHUB_RELEASES_CAP) break;
    }
  }
  return items.length ? { kind: "github_releases", items } : null;
}

function lineFor(s: Section): string | null {
  const first = s.items[0] as any;
  switch (s.kind) {
    case "updates":
      return first.installed_version
        ? `• ${first.name} ${first.installed_version} → ${first.latest_version}`
        : `• ${first.name} ${first.latest_version}`;
    case "hot":
      return `• 热搜: ${truncate(first.title, 50)}`;
    case "news":
      return `• 新闻: ${truncate(first.title, 50)}`;
    case "funds": {
      const sign = first.today_change_pct >= 0 ? "+" : "";
      return `• 基金: ${first.name} ${sign}${first.today_change_pct.toFixed(1)}%`;
    }
    case "ai_usage":
      return `• AI 用量: ${first.provider} ${first.percent}%`;
    case "ai_movers":
      return first.is_new
        ? `• AI 榜单: ${first.model} 新上榜 (${first.board}榜 #${first.to})`
        : `• AI 榜单: ${first.model} ${first.board}榜 #${first.from}→#${first.to}`;
    case "github_releases":
      return `• GitHub: ${first.name} ${first.latest_version}`;
    default:
      return null;
  }
}

type AggregateResult = {
  date: string;
  sections: Section[];
  lines: string[];
};

/**
 * Pure aggregator.
 * @param state  shape: {apps, wechatHot, ithome_news, funds, ai_usage, github_releases_digest}
 *                — ai_movers 不走 state, 直接读 ai-leaderboard 磁盘缓存
 * @param opts
 * @param opts.subscribed  v3.0 alpha: subset of SECTION_ORDER. undefined/empty → 全选 (向后兼容)
 */
export function aggregate(
  state: any,
  opts: { now?: Date; subscribed?: readonly string[] } = {},
): AggregateResult {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const s = state || {};

  const subscribed =
    Array.isArray(opts.subscribed) && opts.subscribed.length > 0
      ? new Set(opts.subscribed)
      : null;

  const builders = [
    () => sectionUpdates(s.apps),
    () => sectionHot(s.wechatHot),
    () => sectionNews(s.ithome_news),
    () => sectionFunds(s.funds),
    () => sectionAiUsage(s.ai_usage),
    () => sectionAiMovers(),
    () => sectionGithubReleases(s.github_releases_digest),
  ];

  const sections: Section[] = [];
  for (const build of builders) {
    const section = safe(build as () => Section | null, null);
    if (!section) continue;
    if (subscribed && !subscribed.has(section.kind)) continue;
    sections.push(section);
  }

  const lines: string[] = [];
  for (const section of sections) {
    const line = lineFor(section);
    if (line && lines.length < MAX_LINES) {
      lines.push(truncate(line));
    }
    if (lines.length >= MAX_LINES) break;
  }

  return { date: ymd(now), sections, lines };
}

export { MAX_LINES, SECTION_ORDER, MAX_LINE_LEN, ymd };

