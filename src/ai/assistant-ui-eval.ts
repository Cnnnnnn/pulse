/**
 * 助手 UI 跳转 golden eval — 测推断兜底与 action 规范化（不调用 LLM）.
 */
import type { AssistantAction } from "./assistant-prompt";
import { mergeEvalCases } from "./assistant-eval-export";
import { ensureUiActions } from "./assistant-nav-infer";
import {
  actionToPulseHref,
  isAssistantUiTool,
  normalizeUiAction,
  type UiInferContext,
} from "../shared/pulse-href";

export type AssistantUiEvalCase = {
  id: string;
  userText: string;
  /** 模型原始 actions，默认 [] */
  modelActions?: AssistantAction[];
  context?: Omit<UiInferContext, "userText">;
  /** normalize 后的首个 UI action；null 表示不应产生 UI 跳转 */
  expect: AssistantAction | null;
  tags?: string[];
};

/** 助手正文声称已执行 UI 操作，但未附带 tool call */
const CLAIMED_UI_RE =
  /(已经|已)(为你|帮您)?(打开|跳转|切换|带到)|已打开.{0,12}页(?!面)|为你打开《[^》]+》/;

export function assistantClaimsUiAction(text: string): boolean {
  return CLAIMED_UI_RE.test(String(text || "").trim());
}

export function normalizeEvalAction(
  action: AssistantAction | null | undefined,
): AssistantAction | null {
  if (!action) return null;
  return normalizeUiAction(action);
}

export function pickPrimaryUiAction(
  actions: AssistantAction[],
): AssistantAction | null {
  for (const raw of actions) {
    const a = normalizeUiAction(raw);
    if (isAssistantUiTool(a.tool) && a.tool !== "pulse_open") return a;
  }
  return null;
}

export function actionsMatchEval(
  expected: AssistantAction | null,
  actual: AssistantAction | null,
): boolean {
  const e = normalizeEvalAction(expected);
  const a = normalizeEvalAction(actual);
  if (e === null && a === null) return true;
  if (!e || !a) return false;
  if (e.tool !== a.tool) return false;
  const eKeys = Object.keys(e.params).sort();
  const aKeys = Object.keys(a.params).sort();
  if (eKeys.join() !== aKeys.join()) return false;
  for (const k of eKeys) {
    if (e.params[k] !== a.params[k]) return false;
  }
  return true;
}

export type UiEvalCaseResult = {
  id: string;
  pass: boolean;
  expected: AssistantAction | null;
  actual: AssistantAction | null;
  actions: AssistantAction[];
};

export type UiActionPipelineResult = {
  actions: AssistantAction[];
  modelUi: AssistantAction | null;
  finalUi: AssistantAction | null;
  inferFallback: boolean;
  claimRepair: boolean;
};

export function analyzeUiActionPipeline(
  userText: string,
  modelActions: AssistantAction[],
  opts?: Omit<UiInferContext, "userText">,
): UiActionPipelineResult {
  const modelUi = pickPrimaryUiAction(modelActions);
  const actions = ensureUiActions(userText, modelActions, opts);
  const finalUi = pickPrimaryUiAction(actions);
  const inferFallback = !modelUi && finalUi !== null;
  const claimRepair =
    inferFallback &&
    !!opts?.assistantText &&
    assistantClaimsUiAction(opts.assistantText);
  return {
    actions,
    modelUi,
    finalUi,
    inferFallback,
    claimRepair,
  };
}

export function runUiEvalCase(caseDef: AssistantUiEvalCase): UiEvalCaseResult {
  const actions = ensureUiActions(
    caseDef.userText,
    caseDef.modelActions ?? [],
    caseDef.context,
  );
  const actual = pickPrimaryUiAction(actions);
  const expected = normalizeEvalAction(caseDef.expect);
  return {
    id: caseDef.id,
    pass: actionsMatchEval(expected, actual),
    expected,
    actual,
    actions,
  };
}

export type UiEvalReport = {
  total: number;
  passed: number;
  failed: AssistantUiEvalCase[];
  results: UiEvalCaseResult[];
};

export function runAssistantUiEval(
  cases: AssistantUiEvalCase[] = ASSISTANT_UI_EVAL_CASES,
): UiEvalReport {
  const results = cases.map(runUiEvalCase);
  const failed = results
    .filter((r) => !r.pass)
    .map((r) => cases.find((c) => c.id === r.id)!)
    .filter(Boolean);
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed,
    results,
  };
}

/** golden cases + 点踩候选合并后跑 eval（本地验证用） */
export function runAssistantUiEvalMerged(
  extraCases: AssistantUiEvalCase[],
  baseCases: AssistantUiEvalCase[] = ASSISTANT_UI_EVAL_CASES,
): UiEvalReport {
  const { merged } = mergeEvalCases(baseCases, extraCases);
  return runAssistantUiEval(merged);
}

export { PULSE_URI_CHEATSHEET } from "../shared/pulse-href";

export const ASSISTANT_UI_EVAL_CASES: AssistantUiEvalCase[] = [
  {
    id: "nav-versions-open",
    userText: "打开应用列表页面",
    expect: { tool: "navigate", params: { nav: "versions" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-github-jump",
    userText: "跳转到 GitHub",
    expect: { tool: "navigate", params: { nav: "github" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-funds-tab",
    userText: "打开基金页面",
    expect: { tool: "navigate", params: { nav: "invest", tab: "funds" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-news-finance",
    userText: "打开财经新闻",
    expect: { tool: "navigate", params: { nav: "news", subTab: "finance" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-news-wechat",
    userText: "打开微博热搜",
    expect: { tool: "navigate", params: { nav: "news", subTab: "wechat-hot" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-settings",
    userText: "打开设置页面",
    expect: { tool: "open_settings", params: { tab: "general" } },
    tags: ["nav", "user-open"],
  },
  {
    id: "nav-overlay-search",
    userText: "打开全局搜索",
    expect: { tool: "open_search", params: {} },
    tags: ["nav", "user-open"],
  },
  {
    id: "no-nav-apps-query",
    userText: "有哪些应用需要更新？",
    expect: null,
    tags: ["negative"],
  },
  {
    id: "no-nav-funds-query",
    userText: "我的基金盈亏怎样？",
    expect: null,
    tags: ["negative"],
  },
  {
    id: "affirm-movies-offer",
    userText: "需要",
    context: { priorAssistantText: "要不要打开电影页面看看？" },
    expect: { tool: "navigate", params: { nav: "movies" } },
    tags: ["affirmation"],
  },
  {
    id: "affirm-negative",
    userText: "好的",
    context: { priorAssistantText: "今天天气不错" },
    expect: null,
    tags: ["affirmation", "negative"],
  },
  {
    id: "claim-nav-movies",
    userText: "嗯",
    context: { assistantText: "已经为你打开电影页面" },
    expect: { tool: "navigate", params: { nav: "movies" } },
    tags: ["claim"],
  },
  {
    id: "movie-detail-short-title",
    userText: "八仙!",
    context: { activeNav: "movies" },
    expect: { tool: "open_movie_detail", params: { title: "八仙" } },
    tags: ["movie"],
  },
  {
    id: "movie-detail-assistant-claim",
    userText: "八仙",
    context: { assistantText: "为你打开《八仙！》的详情页面" },
    expect: { tool: "open_movie_detail", params: { title: "八仙" } },
    tags: ["movie", "claim"],
  },
  {
    id: "stock-diagnosis-code",
    userText: "看看600519诊断",
    context: { activeNav: "invest" },
    expect: { tool: "open_stock_diagnosis", params: { code: "600519" } },
    tags: ["stock"],
  },
  {
    id: "pulse-open-versions",
    userText: "打开应用列表",
    modelActions: [
      {
        tool: "pulse_open",
        params: { href: "pulse://nav/versions" },
      },
    ],
    expect: { tool: "navigate", params: { nav: "versions" } },
    tags: ["pulse_open", "normalize"],
  },
  {
    id: "pulse-open-movie",
    userText: "八仙",
    context: { activeNav: "movies" },
    modelActions: [
      {
        tool: "pulse_open",
        params: { href: "pulse://movies/detail?title=八仙" },
      },
    ],
    expect: { tool: "open_movie_detail", params: { title: "八仙" } },
    tags: ["pulse_open", "movie"],
  },
  {
    id: "no-duplicate-nav",
    userText: "打开应用列表",
    modelActions: [{ tool: "navigate", params: { nav: "versions" } }],
    expect: { tool: "navigate", params: { nav: "versions" } },
    tags: ["dedupe"],
  },
  {
    id: "nav-alias-normalize",
    userText: "打开版本检查",
    modelActions: [{ tool: "navigate", params: { nav: "版本检查" } }],
    expect: { tool: "navigate", params: { nav: "versions" } },
    tags: ["normalize"],
  },
  {
    id: "digest-query-on-movies-page",
    userText: "今天早报有什么?",
    context: {
      activeNav: "movies",
      assistantText: "已经为你打开今日早报",
      priorAssistantText: "为你打开《八仙！》的详情页面",
    },
    expect: null,
    tags: ["digest", "negative", "movies"],
  },
  {
    id: "digest-open-explicit",
    userText: "打开今日早报",
    expect: { tool: "open_digest", params: {} },
    tags: ["digest", "user-open"],
  },
  {
    id: "digest-affirm-offer",
    userText: "好的",
    context: { priorAssistantText: "要不要打开今日早报看看？" },
    expect: { tool: "open_digest", params: {} },
    tags: ["digest", "affirmation"],
  },
  {
    id: "digest-query-daily-report-alias",
    userText: "今天日报有什么?",
    context: {
      activeNav: "movies",
      assistantText: "已经为你打开今日日报",
    },
    expect: null,
    tags: ["digest", "negative", "alias"],
  },
  {
    id: "digest-query-jinri-yaodian",
    userText: "今天有什么要点?",
    expect: null,
    tags: ["digest", "query", "alias"],
  },
  {
    id: "digest-open-jinri-yaodian",
    userText: "打开今日要点",
    expect: { tool: "open_digest", params: {} },
    tags: ["digest", "user-open"],
  },
];

/** 模型声称已跳转但无 UI tool — 应触发兜底推断 */
export function inferFromClaimedAssistantText(
  userText: string,
  assistantText: string,
  modelActions: AssistantAction[] = [],
  context?: Omit<UiInferContext, "userText" | "assistantText">,
): AssistantAction | null {
  if (!assistantClaimsUiAction(assistantText)) return null;
  if (pickPrimaryUiAction(modelActions.map(normalizeUiAction))) return null;
  return pickPrimaryUiAction(
    ensureUiActions(userText, modelActions, {
      ...context,
      assistantText,
    }),
  );
}

/** 将 canonical action 转为 pulse_open（供 prompt 示例） */
export function actionToPulseOpenExample(action: AssistantAction): AssistantAction | null {
  const href = actionToPulseHref(normalizeUiAction(action));
  if (!href) return null;
  return { tool: "pulse_open", params: { href } };
}
