/**
 * 助手 UI action 推断 — 薄封装，规则表见 src/shared/pulse-infer-registry.ts
 */
import type { AssistantAction } from "./assistant-prompt";
import { normalizeNavKey } from "../shared/nav-normalize";
import {
  inferUiActionFromContext,
  extractMovieTitle,
  type PulseInferMatchContext,
} from "../shared/pulse-infer-registry";
import {
  isAssistantUiTool,
  normalizeUiAction,
  type UiInferContext,
} from "../shared/pulse-href";

function hasUiAction(actions: AssistantAction[]): boolean {
  return actions.some((a) => {
    const n = normalizeUiAction(a);
    return isAssistantUiTool(n.tool) && n.tool !== "pulse_open";
  });
}

function pickTool(
  ctx: UiInferContext,
  tool: string,
): AssistantAction | null {
  const action = inferUiActionFromContext(ctx);
  return action?.tool === tool ? action : null;
}

export function assistantTextBeforeLastUser(
  history: Array<{ role: string; content: string }>,
): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role !== "user") continue;
    for (let j = i - 1; j >= 0; j--) {
      const m = history[j];
      if (m?.role === "assistant" && typeof m.content === "string") {
        return m.content.trim();
      }
      if (m?.role === "user") break;
    }
    break;
  }
  return "";
}

const NAV_LIKE_TOOLS = new Set([
  "navigate",
  "open_settings",
  "open_search",
  "open_digest",
  "open_reminders",
  "open_concerts",
]);

export function inferNavigateFromUserText(text: string): AssistantAction | null {
  const action = inferUiActionFromContext({ userText: text });
  if (!action || !NAV_LIKE_TOOLS.has(action.tool)) return null;
  return action;
}

export function inferNavigateFromAffirmation(
  userText: string,
  priorAssistantText: string,
): AssistantAction | null {
  const action = inferUiActionFromContext({
    userText,
    priorAssistantText,
  });
  if (!action || !NAV_LIKE_TOOLS.has(action.tool)) return null;
  return action;
}

export function inferNavigateFromAssistantClaim(
  assistantText: string,
): AssistantAction | null {
  const action = inferUiActionFromContext({
    userText: "",
    assistantText,
  });
  if (!action) return null;
  if (
    action.tool === "open_movie_detail" ||
    action.tool === "open_finance_article" ||
    action.tool === "open_ithome_article" ||
    action.tool === "open_stock_diagnosis"
  ) {
    return null;
  }
  return action;
}

export { extractMovieTitle };

export function inferOpenMovieDetail(
  userText: string,
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction | null {
  return pickTool({ userText, ...opts }, "open_movie_detail");
}

export function inferOpenFinanceArticle(
  userText: string,
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction | null {
  return pickTool({ userText, ...opts }, "open_finance_article");
}

export function inferOpenIthomeArticle(
  userText: string,
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction | null {
  return pickTool({ userText, ...opts }, "open_ithome_article");
}

export function inferOpenStockDiagnosis(
  userText: string,
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction | null {
  return pickTool({ userText, ...opts }, "open_stock_diagnosis");
}

export function ensureUiActions(
  userText: string,
  actions: AssistantAction[],
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction[] {
  const normalized = actions.map((a) => normalizeUiAction(a));
  return augmentRendererActions(userText, normalized, opts);
}

export function augmentRendererActions(
  userText: string,
  actions: AssistantAction[],
  opts?: Omit<UiInferContext, "userText">,
): AssistantAction[] {
  let out = actions.map((a) => {
    if (a.tool !== "navigate" || typeof a.params?.nav !== "string") return a;
    const nav = normalizeNavKey(a.params.nav);
    if (!nav) return a;
    const params: Record<string, unknown> = { ...a.params, nav };
    if (typeof a.params.subTab === "string") params.subTab = a.params.subTab;
    return { ...a, params };
  });

  if (!hasUiAction(out)) {
    const inferred = inferUiActionFromContext({ userText, ...opts });
    if (inferred) out = [...out, inferred];
  }

  return out;
}

export { normalizeNavKey };
export type { PulseInferMatchContext };
