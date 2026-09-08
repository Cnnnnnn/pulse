/**
 * src/ai/sanitize-llm-output.ts
 *
 * 清理 LLM 输出：去掉思考链标签内容，保留给用户看的正文。
 */

import { MINIMAX_TOOL_BLOCK_RE, MINIMAX_TAG_RE } from "./minimax-tool-markup";

const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "<" + "/" + "think" + ">";

function thinkBlockRe() {
  const esc = THINK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(THINK_OPEN + "[\\s\\S]*?" + esc, "gi");
}

function thinkOpenRe() {
  const esc = THINK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + esc + "[\\s\\S]*", "i");
}

const REASONING_BLOCK_RES = [
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  /<analysis>[\s\S]*?<\/analysis>/gi,
];

function hasCjk(text: any) {
  return /[\u3400-\u9fff]/.test(text);
}

function stripThinkTags(text: any) {
  let out = text.replace(thinkBlockRe(), "");
  out = out.replace(thinkOpenRe(), "");
  return out;
}

/**
 * @param {string} raw
 * @param {{ emptyFallback?: string }} [opts]
 * @returns {string}
 */
export function sanitizeLlmOutput(raw: any, opts: any = {}) {
  const emptyFallback =
    opts.emptyFallback || "（未生成可用中文内容，请点「重新总结」重试）";
  if (!raw || typeof raw !== "string") return emptyFallback;

  let text = raw.trim();
  for (const re of REASONING_BLOCK_RES) {
    text = text.replace(re, "");
  }
  text = stripThinkTags(text);
  // MiniMax M2/M3 原生工具标记漏进 content 的清洗 (FC 续轮不带 tools 参数时触发)
  text = text
    .replace(MINIMAX_TOOL_BLOCK_RE, "")
    .replace(MINIMAX_TAG_RE, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (!text) return emptyFallback;
  if (!hasCjk(text) && text.length > 80) {
    return emptyFallback;
  }
  return text;
}

