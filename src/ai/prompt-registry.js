/**
 * src/ai/prompt-registry.js
 *
 * AI prompt 注册中心 — ithome / worldcup / 升级建议 / app 分类.
 * 默认值 = 此前硬编码原值; 用户可在 Settings 改 (含可选 few-shot).
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
    fewShot: "",
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
    fewShot: "",
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
    fewShot: "",
  },
  upgrade_advice: {
    system: [
      "你是 macOS 应用升级顾问。根据 release notes、版本变化和使用频次，",
      "帮用户判断「该不该现在升级」。语气简洁、务实，不夸大风险也不盲目推荐。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或额外文字。",
      "2. JSON schema:",
      '   {"recommendation":"upgrade"|"wait"|"skip","confidence":"high"|"medium"|"low",',
      '    "summary":"一句话建议，≤80字","reasons":["理由1","理由2"]}',
      "3. recommendation 含义: upgrade=建议现在升; wait=不急可等等; skip=建议跳过此版本。",
      "4. 很久没用(cold)的非关键 app → 倾向 wait/skip; 安全/崩溃修复 → 倾向 upgrade。",
      "5. changelog 为空时根据版本号和使用频次保守判断，confidence 降为 medium/low。",
    ].join("\n"),
    fewShot: "",
  },
  changelog_summary: {
    system: [
      "你是 macOS 应用 release notes 编辑。从多段 changelog 中提炼用户最关心的要点，",
      "忽略琐碎 bugfix 堆砌，优先安全修复、新功能、破坏性变更。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或额外文字。",
      "2. JSON schema:",
      '   {"oneLiner":"一句话总览，≤60字","highlights":["要点1","要点2","要点3"]}',
      "3. highlights 必须 1–3 条，每条 ≤50 字，简体中文。",
      "4. changelog 极少时保守概括，不编造未提及的功能。",
    ].join("\n"),
    fewShot: "",
  },
  category_classify: {
    system: "你是一个 app 分类助手。",
    rules: [
      "你只能输出以下 categoryId 之一: {{CATEGORY_IDS}}",
      "对每个 app 选最合适的一个。",
      '输出严格 JSON 格式: {"appName": "categoryId", ...}',
      "不要任何额外文字、markdown fence 或注释。",
    ].join("\n"),
    fewShot: "",
  },
};

const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

/**
 * @param {string} key
 * @returns {{ system: string, rules: string, fewShot: string }}
 */
function resolvePrompt(key) {
  const def = DEFAULT_PROMPTS[key];
  if (!def) throw new Error(`unknown prompt key: ${key}`);
  const userPrompts = stateStore.loadAiPrompts();
  const user = userPrompts && userPrompts[key];
  if (
    user &&
    typeof user.system === "string" &&
    user.system.trim() &&
    typeof user.rules === "string"
  ) {
    return {
      system: user.system,
      rules: user.rules,
      fewShot: typeof user.fewShot === "string" ? user.fewShot : "",
    };
  }
  return {
    system: def.system,
    rules: def.rules,
    fewShot: def.fewShot || "",
  };
}

module.exports = { DEFAULT_PROMPTS, resolvePrompt, PROMPT_KEYS };
