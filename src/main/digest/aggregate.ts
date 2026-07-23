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

const SECTION_ORDER = ["updates", "hot", "news", "funds", "ai_usage", "worldcup"] as const;

const MAX_LINE_LEN = 60;
const UPDATES_CAP = 3;
const HOT_CAP = 3;
const NEWS_CAP = 1;
const FUNDS_CAP = 2;
const AI_USAGE_CAP = 1;
const WORLDUP_CAP = 1;
const AI_USAGE_THRESHOLD_PCT = 80;
const FUND_DELTA_THRESHOLD_PCT = 1;

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
type WorldcupItem = { home: string; away: string; kickoff: string };

type Section =
  | { kind: "updates"; items: UpdateItem[] }
  | { kind: "hot"; items: HotItem[] }
  | { kind: "news"; items: NewsItem[] }
  | { kind: "funds"; items: FundItem[] }
  | { kind: "ai_usage"; items: AiUsageItem[] }
  | { kind: "worldcup"; items: WorldcupItem[] };

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

function sectionWorldcup(wc: any): Section | null {
  if (!wc || !Array.isArray(wc.today)) return null;
  const first = wc.today[0];
  return first ? { kind: "worldcup", items: [{ home: first.home, away: first.away, kickoff: first.kickoff }] } : null;
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
    case "worldcup":
      return `• 比赛: ${first.home} vs ${first.away}`;
    default:
      return null;
  }
}

export type AggregateResult = {
  date: string;
  sections: Section[];
  lines: string[];
};

/**
 * Pure aggregator.
 * @param state  shape: {apps, wechatHot, ithome_news, funds, ai_usage, worldcup}
 * @param opts
 */
export function aggregate(state: any, opts: { now?: Date } = {}): AggregateResult {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const s = state || {};

  const builders = [
    () => sectionUpdates(s.apps),
    () => sectionHot(s.wechatHot),
    () => sectionNews(s.ithome_news),
    () => sectionFunds(s.funds),
    () => sectionAiUsage(s.ai_usage),
    () => sectionWorldcup(s.worldcup),
  ];

  const sections: Section[] = [];
  for (const build of builders) {
    const section = safe(build as any, null);
    if (section) sections.push(section);
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

module.exports = { aggregate, MAX_LINES, SECTION_ORDER, MAX_LINE_LEN, ymd };