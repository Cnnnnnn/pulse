/**
 * 助手多模型路由 — 简单问答走轻量模型，省 token / 延迟.
 */
import { assistantTextBeforeLastUser } from "./assistant-nav-infer";
import { DEFAULT_MODELS, FAST_MODELS } from "./default-models";
import { wantsUiTool } from "../shared/pulse-infer-registry";

const TOOL_INTENT_RE =
  /查|搜|搜索|更新|升级|基金|股票|选股|早报|日报|digest|榜单|排行|提醒|日程|检查|安装|打开|导航|跳转|用量|token|诊断|github|黄金|白银|贵金属|金属|行情|盈亏|持仓|电影|热映|上映|演出|导出|设置|模块|解读|摘要|总结|分析|有哪些|列出|帮我找|帮我搜|待更新|release|详情|场次|文章|片名/i;

const SIMPLE_GREETING_RE =
  /^(你好|您好|hi|hello|hey|谢谢|感谢|辛苦了|再见|拜拜|ok|okay|嗯|哦)[\s!！。.?？~～]*$/i;

const AFFIRM_ONLY_RE =
  /^(需要|要|好的?|是的?|可以|行|嗯|好呀|当然可以|帮我开|打开吧|去吧)[\s!！。.?？~～]*$/i;

const GREETING_PLUS_INTENT_RE =
  /^(你好|您好|hi|hello|hey)[，,!\s]+.{2,}(打开|跳转|查|搜|看看|去|进入)/i;

export function pickFastModel(providerId: string): string {
  try {
    const stateStore: any = require("../main/state-store.js");
    const cfg = stateStore.loadAISessionsConfig?.();
    const custom = cfg?.assistantFastModel;
    if (typeof custom === "string" && custom.trim()) {
      return custom.trim();
    }
  } catch {
    /* ponytail: 读配置失败回退内置默认 */
  }
  return FAST_MODELS[providerId] || DEFAULT_MODELS[providerId as keyof typeof DEFAULT_MODELS] || "";
}

export function lastUserText(
  messages: Array<{ role: string; content: string }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content.trim();
    }
  }
  return "";
}

function fastPathUiIntent(
  text: string,
  messages: Array<{ role: string; content: string }>,
): boolean {
  const prior = assistantTextBeforeLastUser(messages);
  if (
    wantsUiTool({
      userText: text,
      priorAssistantText: prior,
    })
  ) {
    return true;
  }
  if (AFFIRM_ONLY_RE.test(text) && /(要不要|打开|跳转|页面|看看|去)/.test(prior)) {
    return true;
  }
  return false;
}

/**
 * 是否可走轻量模型直答（跳过 FC / 多轮 Agent）.
 */
export function shouldUseFastAssistantPath(
  messages: Array<{ role: string; content: string }>,
  primaryModel: string,
  fastModel: string,
): boolean {
  if (!fastModel || fastModel === primaryModel) return false;

  const text = lastUserText(messages);
  if (!text) return false;
  if (text.length > 120) return false;
  if (TOOL_INTENT_RE.test(text)) return false;
  if (GREETING_PLUS_INTENT_RE.test(text)) return false;
  if (fastPathUiIntent(text, messages)) return false;

  const turns = messages.filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && m.content?.trim(),
  );
  if (turns.length > 8) return false;

  if (SIMPLE_GREETING_RE.test(text)) return true;

  const simpleQaRe =
    /^(你(能|会|可以)|pulse|助手).*(什么|哪些|怎么|如何)|^(什么是|介绍一下).{0,20}$/i;
  if (simpleQaRe.test(text)) return true;

  if (text.length <= 40 && !/[?？]/.test(text) && turns.length <= 2) {
    return true;
  }

  return false;
}

module.exports = {
  pickFastModel,
  lastUserText,
  shouldUseFastAssistantPath,
};
