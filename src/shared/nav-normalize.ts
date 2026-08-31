/**
 * nav key 规范化 — renderer / 主进程共用.
 */
import { LEGACY_NAV_ALIAS, NAV_REGISTRY } from "./nav-keys";

const NAV_KEYS = new Set(["home", ...NAV_REGISTRY.map((e) => e.key)]);

const LABEL_TO_NAV = new Map<string, string>();
for (const e of NAV_REGISTRY) {
  LABEL_TO_NAV.set(e.key, e.key);
  LABEL_TO_NAV.set(e.label.toLowerCase(), e.key);
  if (e.homeTitle) LABEL_TO_NAV.set(e.homeTitle.toLowerCase(), e.key);
  if (e.subtitle) LABEL_TO_NAV.set(e.subtitle.toLowerCase(), e.key);
}

const ALIAS_RULES: Array<{ re: RegExp; nav: string }> = [
  { re: /应用(列表|更新|监控)?|版本(检查|页|监控)?|更新列表/, nav: "versions" },
  { re: /github|开源项目/i, nav: "github" },
  { re: /ai\s*榜单|模型榜单|大模型排名/i, nav: "ai-leaderboard" },
  { re: /电影|热映/, nav: "movies" },
  { re: /演出|演唱会|票价监控/, nav: "concerts" },
  { re: /基金/, nav: "invest" },
  { re: /贵金属|黄金|白银|金属行情/, nav: "invest" },
  { re: /股票|选股/, nav: "invest" },
  { re: /投资(页|模块)?/, nav: "invest" },
  { re: /新闻|资讯|it之家|微博/, nav: "news" },
  { re: /ai\s*用量|coding\s*plan|token\s*用量/i, nav: "ai-usage" },
  { re: /首页|概览|仪表盘|dashboard/i, nav: "home" },
];

export function normalizeNavKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (NAV_KEYS.has(lower)) return lower;
  const aliased = LEGACY_NAV_ALIAS[lower] || LEGACY_NAV_ALIAS[trimmed];
  if (aliased) return aliased;
  const fromLabel = LABEL_TO_NAV.get(lower);
  if (fromLabel) return fromLabel;
  for (const e of NAV_REGISTRY) {
    if (
      e.label.includes(trimmed) ||
      trimmed.includes(e.label) ||
      (e.homeTitle && (e.homeTitle.includes(trimmed) || trimmed.includes(e.homeTitle)))
    ) {
      return e.key;
    }
  }
  for (const rule of ALIAS_RULES) {
    if (rule.re.test(trimmed)) return rule.nav;
  }
  return "";
}
