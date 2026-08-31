/**
 * 按当前 nav 排序的快捷操作芯片.
 */
import type { AiChatAction } from "../../shared/ipc-contracts.ts";
import { DIGEST_QUERY_PROMPT, DIGEST_UI_TITLE } from "../../shared/digest-labels.ts";

export type QuickAction = {
  id: string;
  label: string;
  message?: string;
  action?: AiChatAction;
};

const ALL_ACTIONS: QuickAction[] = [
  { id: "updates", label: "查更新", message: "有哪些应用需要更新？" },
  { id: "digest", label: DIGEST_UI_TITLE, message: DIGEST_QUERY_PROMPT },
  { id: "funds", label: "基金盈亏", message: "我的基金盈亏怎样？" },
  { id: "check", label: "检查更新", action: { tool: "trigger_check", params: {} } },
  { id: "search", label: "全局搜索", action: { tool: "open_search", params: {} } },
  { id: "concerts", label: "演出票价", message: "我监控的演出票价怎样？" },
  { id: "refresh-concerts", label: "刷新演出", action: { tool: "refresh_concerts", params: {} } },
];

const NAV_PRIORITY: Record<string, string[]> = {
  versions: ["updates", "check", "search"],
  home: ["digest", "updates", "funds", "concerts"],
  invest: ["funds", "updates", "search"],
  news: ["digest", "search", "updates"],
  concerts: ["concerts", "refresh-concerts", "updates"],
  github: ["updates", "search", "digest"],
  movies: ["digest", "search", "updates"],
  "ai-leaderboard": ["search", "digest", "updates"],
  "ai-usage": ["digest", "updates", "search"],
};

export function getQuickActionsForNav(
  activeNav: string,
  max = 7,
): QuickAction[] {
  const priority = NAV_PRIORITY[activeNav] || [
    "updates",
    "digest",
    "search",
    "funds",
  ];
  const byId = new Map(ALL_ACTIONS.map((a) => [a.id, a]));
  const out: QuickAction[] = [];
  for (const id of priority) {
    const action = byId.get(id);
    if (action) out.push(action);
  }
  for (const action of ALL_ACTIONS) {
    if (out.length >= max) break;
    if (!out.some((x) => x.id === action.id)) out.push(action);
  }
  return out.slice(0, max);
}
