/**
 * src/ai/prompt-registry.js
 *
 * AI prompt 注册中心 — 3 个 prompt(ithome 摘要 + worldcup 赛前/赛后)。
 * 默认值 = 此前硬编码原值(零行为变化); 用户可在 Settings 改。
 * 存储: state.json.ai_prompts (state-store.loadAiPrompts/saveAiPrompts)。
 *
 * worldcup 的"内容指引"(分三段...) 并入 system 字段(本就是角色描述一部分)。
 */

const stateStore = require("../main/state-store");

const DEFAULT_PROMPTS = {
  ithome_summary: {
    system: "你是科技新闻编辑，擅长把 IT 资讯浓缩成清晰的中文摘要。",
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文。",
      "2. 只输出给用户看的正文，禁止思考过程或 XML/HTML 标签。",
      "3. 严格按以下四行格式输出（每行一项，行首为固定标签，不要编号列表）：",
      "摘要：<80–150 字，概括核心事实与背景>",
      "关键词：<3–5 个词，用顿号分隔>",
      "所属领域：<如 消费电子、人工智能、政策监管、游戏 等>",
      "影响方面：<说明可能影响的用户群体、行业或产品方向>",
    ].join("\n"),
  },
  worldcup_prematch: {
    system: [
      "你是资深足球分析师。用简体中文写赛前预测，语气专业但易懂，200–350 字。",
      "分三段：对阵看点、关键球员/战术、预测比分与理由。不要编造具体伤病除非用户数据里有。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文，禁止英文段落。",
      "2. 只输出给用户看的正文，禁止输出思考过程、分析步骤、XML/HTML 标签。",
      "3. 禁止输出思考过程或任何 XML 标签，只写正文。",
      "4. 直接开始写正文，不要前言或元说明。",
    ].join("\n"),
  },
  worldcup_postmatch: {
    system: [
      "你是资深足球评论员。用简体中文写赛后总结，250–400 字。",
      "包含：比赛进程、进球/关键瞬间解读、双方表现评价、出线或晋级影响（如适用）。",
      "基于给定比分与进球者，不要编造未提供的进球。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文，禁止英文段落。",
      "2. 只输出给用户看的正文，禁止输出思考过程、分析步骤、XML/HTML 标签。",
      "3. 禁止输出思考过程或任何 XML 标签，只写正文。",
      "4. 直接开始写正文，不要前言或元说明。",
    ].join("\n"),
  },
};

const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

/**
 * 解析某个 prompt: 有用户配置(且 system 非空)用配置, 否则用默认.
 * 整体替换语义: 用户配了该 key 就用 {system, rules} 整体,
 * 不做 system/rules 分别 fallback (避免混搭).
 * @param {string} key  prompt id
 * @returns {{ system: string, rules: string }}
 */
function resolvePrompt(key) {
  const def = DEFAULT_PROMPTS[key];
  if (!def) throw new Error(`unknown prompt key: ${key}`);
  const userPrompts = stateStore.loadAiPrompts();
  const user = userPrompts && userPrompts[key];
  // 整体替换语义: 用户配了该 key 且 system 非空 → 整体用用户配置;
  // system 为空(用户清空了) → 回退默认 (不做 system/rules 分别 fallback).
  if (
    user &&
    typeof user.system === "string" &&
    user.system.trim() &&
    typeof user.rules === "string"
  ) {
    return { system: user.system, rules: user.rules };
  }
  return { system: def.system, rules: def.rules };
}

module.exports = { DEFAULT_PROMPTS, resolvePrompt, PROMPT_KEYS };
