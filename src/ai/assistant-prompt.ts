/**
 * src/ai/assistant-prompt.ts
 *
 * Pulse 全局 AI 助手 system prompt + action 解析.
 * ponytail: 纯数据/纯函数, 主进程与测试共用.
 */

import { NAV_REGISTRY } from "../shared/nav-keys";
import { PULSE_URI_CHEATSHEET } from "../shared/pulse-href";
import { DIGEST_UI_TITLE } from "../shared/digest-labels";
import { formatAssistantFewShotBlock } from "./assistant-prompt-fewshot";

export type AssistantAction = {
  tool: string;
  params: Record<string, unknown>;
};

/** 主进程可执行的工具 */
export const MAIN_PROCESS_TOOLS = new Set([
  "query_apps",
  "search",
  "list_nav",
  "query_funds",
  "query_digest",
  "query_leaderboard",
  "query_metals",
  "query_stocks",
  "query_github",
  "query_stock_diagnosis",
  "query_ai_usage",
  "query_reminders",
  "interpret_finance",
  "summarize_ithome",
  "advise_stocks",
  "query_movies",
  "query_concerts",
]);

/** 仅 renderer 可执行的工具 */
export const RENDERER_TOOLS = new Set([
  "navigate",
  "open_search",
  "trigger_check",
  "open_settings",
  "open_digest",
  "open_reminders",
  "open_search_result",
  "upgrade_app",
  "bulk_upgrade_all",
  "create_reminder",
  "open_concerts",
  "add_concert_watch",
  "remove_concert_watch",
  "refresh_concerts",
  "open_movie_detail",
  "open_finance_article",
  "open_ithome_article",
  "open_stock_diagnosis",
  "pulse_open",
]);

/** 执行前需用户确认的工具 */
export const CONFIRM_REQUIRED_TOOLS = new Set([
  "upgrade_app",
  "bulk_upgrade_all",
  "trigger_check",
  "create_reminder",
]);

const NAV_KEYS = NAV_REGISTRY.map((e) => e.key).join(", ");

const NAV_LIST = NAV_REGISTRY.map(
  (e) => `- ${e.key}: ${e.label}（${e.subtitle}）`,
).join("\n");

const CORE_RULES = `- 用简体中文，简洁友好。
- 结合「当前用户界面」与 pageEntities 回答；有页面数据优先用，不足再调工具。
- 纯问答/闲聊不调工具；打开/跳转/详情/确认上一轮提议时必须调工具。
- 【硬性】禁止只在正文说「已打开/已跳转」却不调 pulse_open / navigate / open_*。
- ${DIGEST_UI_TITLE}（UI 名；用户也可能说早报/日报）= 今日要点汇总：应用可升级、微博热搜、IT 头条、基金异动、AI 用量预警。回复中统一称「${DIGEST_UI_TITLE}」，勿写「今日日报」。
- 「今天有什么要点 / 早报/日报有什么、总结今天变化」→ query_digest；「打开${DIGEST_UI_TITLE} / 早报面板」→ open_digest 或 pulse_open。
- 单独问「今天新闻/IT 资讯有哪些」→ summarize_ithome 或跳转 news，不是 query_digest。
- 打开/跳转/详情优先 pulse_open + pulse://；pageEntities.selection 有 id 时务必带上。
- upgrade_app / bulk_upgrade_all / trigger_check / create_reminder 需用户确认。
- 勿在正文重复工具 JSON。`;

function buildFcSystemPrompt(ctxLine: string, fewShot: string): string {
  return `你是 Pulse（macOS 菜单栏应用）的智能助手：App 更新、资讯、投资、AI 榜单等。

通过 Function Calling 调工具。工具名与参数以 schema 为准，下面只列行为要点。

【UI 跳转 — pulse_open 优先】
${fewShot}

pulse:// 速查：
${PULSE_URI_CHEATSHEET}

导航 nav 键：${NAV_KEYS}

规则：
${CORE_RULES}
${ctxLine}`;
}

/** XML 降级路径 — 无 FC schema 时需内联工具说明 */
function buildXmlSystemPrompt(ctxLine: string, fewShot: string): string {
  return `你是 Pulse 应用的智能助手。Pulse 是 macOS 菜单栏应用，用于监控 App 更新、新闻资讯、投资持仓、AI 榜单等。

需要执行操作时，在回复末尾输出（可多个）：
<action>{"tool":"工具名","params":{...}}</action>

【UI 跳转 — pulse_open 优先】
${fewShot}

pulse:// 速查：
${PULSE_URI_CHEATSHEET}

可用工具：
0. pulse_open — params: { "href": "pulse://..." }
1. navigate — params: { "nav", "tab"?, "route"?, "subTab"? }
2. open_search / open_settings / open_digest / open_reminders
3. query_apps / query_funds / query_digest / query_leaderboard / query_metals / query_stocks
4. query_github / query_stock_diagnosis / query_ai_usage / query_reminders / query_movies / query_concerts
5. search / list_nav / open_search_result
6. upgrade_app / bulk_upgrade_all / trigger_check / create_reminder（需确认）
7. interpret_finance / summarize_ithome / advise_stocks
8. open_movie_detail / open_finance_article / open_ithome_article / open_stock_diagnosis
9. open_concerts / add_concert_watch / remove_concert_watch / refresh_concerts

导航模块：
${NAV_LIST}

规则：
${CORE_RULES}
${ctxLine}`;
}

export function buildAssistantSystemPrompt(ctx?: {
  activeNav?: string;
  route?: string;
  pageSnapshot?: string;
  useFunctionCalling?: boolean;
}): string {
  const ctxParts: string[] = [];
  if (ctx?.activeNav || ctx?.route) {
    ctxParts.push(
      `activeNav=${ctx.activeNav || "unknown"}, route=${ctx.route || "library"}`,
    );
  }
  if (ctx?.pageSnapshot) {
    ctxParts.push(ctx.pageSnapshot);
  }
  const ctxLine =
    ctxParts.length > 0 ? `\n当前用户界面：\n${ctxParts.join("\n")}` : "";

  const useFc = Boolean(ctx?.useFunctionCalling);
  const fewShot = formatAssistantFewShotBlock(useFc);

  if (useFc) {
    return buildFcSystemPrompt(ctxLine, fewShot);
  }
  return buildXmlSystemPrompt(ctxLine, fewShot);
}

const ACTION_RE = /<action>\s*([\s\S]*?)\s*<\/action>/gi;

export function parseAssistantActions(text: string): AssistantAction[] {
  const actions: AssistantAction[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ACTION_RE.source, ACTION_RE.flags);
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as {
        tool?: string;
        params?: Record<string, unknown>;
      };
      if (typeof parsed.tool === "string" && parsed.tool.length > 0) {
        actions.push({
          tool: parsed.tool,
          params:
            parsed.params && typeof parsed.params === "object"
              ? parsed.params
              : {},
        });
      }
    } catch {
      /* ponytail: 模型偶发坏 JSON，跳过 */
    }
  }
  return actions;
}

export function stripActionTags(text: string): string {
  return text.replace(ACTION_RE, "").trim();
}
