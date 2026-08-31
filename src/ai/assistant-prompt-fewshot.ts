/**
 * 助手 few-shot 工具调用示例 — FC / XML 降级共用.
 */
import { DIGEST_QUERY_PROMPT, DIGEST_UI_TITLE } from "../shared/digest-labels";

type FewShotAction = {
  tool: string;
  params: Record<string, unknown>;
};

export type AssistantFewShotExample = {
  user: string;
  priorAssistant?: string;
  action: FewShotAction;
  note?: string;
};

export const ASSISTANT_FEW_SHOT_EXAMPLES: AssistantFewShotExample[] = [
  {
    user: "打开应用列表",
    action: {
      tool: "pulse_open",
      params: { href: "pulse://nav/versions" },
    },
  },
  {
    user: "八仙!",
    action: {
      tool: "pulse_open",
      params: { href: "pulse://movies/detail?title=八仙" },
    },
    note: "pageEntities.selection.movie.id 存在时用 movieId，否则 title",
  },
  {
    user: "有哪些应用需要更新？",
    action: { tool: "query_apps", params: {} },
  },
  {
    user: "需要",
    priorAssistant: "要不要打开电影页面看看？",
    action: {
      tool: "pulse_open",
      params: { href: "pulse://nav/movies" },
    },
  },
  {
    user: "我的基金盈亏怎样？",
    action: { tool: "query_funds", params: {} },
  },
  {
    user: "打开基金页面",
    action: {
      tool: "pulse_open",
      params: { href: "pulse://nav/invest?tab=funds" },
    },
  },
  {
    user: DIGEST_QUERY_PROMPT,
    action: { tool: "query_digest", params: {} },
    note: "问内容用 query_digest，不要 open_digest",
  },
  {
    user: "今天日报有什么？",
    action: { tool: "query_digest", params: {} },
    note: "日报=口语别名；回复统一称「今日要点」",
  },
  {
    user: `打开${DIGEST_UI_TITLE}`,
    action: {
      tool: "pulse_open",
      params: { href: "pulse://overlay/digest" },
    },
  },
];

export function formatAssistantFewShotBlock(useFunctionCalling: boolean): string {
  const lines = ["【工具调用示例 — 照此执行，禁止只口头说「已打开」】"];
  for (const ex of ASSISTANT_FEW_SHOT_EXAMPLES) {
    const prior =
      ex.priorAssistant != null
        ? `（上轮: ${ex.priorAssistant}）`
        : "";
    const payload = JSON.stringify(ex.action);
    if (useFunctionCalling) {
      lines.push(`· 用户「${ex.user}」${prior} → 调用 ${ex.action.tool} ${JSON.stringify(ex.action.params)}`);
    } else {
      lines.push(
        `· 用户「${ex.user}」${prior}\n<action>${payload}</action>`,
      );
    }
    if (ex.note) lines.push(`  ${ex.note}`);
  }
  return lines.join("\n");
}
