/**
 * src/ai/readme-parse.js
 *
 * GitHub 优秀项目收录 — README 智能解析。
 * 复用 shared-llm.chatCompletion (统一的 provider / model / API Key / token 预算)，
 * 把 README + 元数据发给 LLM，解析出结构化 JSON：
 *   summary / usage / features / scenarios / tags。
 *
 * 2026-07-15 v2.80: 新增。
 */

const { chatCompletion } = require("./shared-llm");

const MAX_README_CHARS = 14000;

const SYSTEM_PROMPT = `你是一个资深的技术项目分析师。用户会给你一个 GitHub 开源项目的名称、简介和 README 原文。
请仔细阅读，提取对"是否值得收藏 / 如何使用"最有价值的信息。
你必须只输出一个 JSON 对象（不要包含任何 markdown 代码围栏或额外解释文字），结构严格如下：
{
  "summary": "一句话说明这个项目是什么、解决什么问题（中文，≤40字）",
  "usage": "清晰的使用方法：安装命令、快速开始步骤、关键 API / 命令。用换行(\\n)分隔步骤，代码用反引号包裹，例如 \\\`npm i x\\\`。",
  "features": ["核心作用与功能 1", "核心作用与功能 2"],
  "scenarios": ["适用场景 1", "适用场景 2"],
  "tags": ["关键词1", "关键词2"]
}
要求：
- features / scenarios / tags 各 3-6 条，每条简洁（≤24字）。
- 信息必须来自 README，不要编造。
- 若 README 信息不足，可基于项目名与简介合理推断，但不要夸大。`;

function buildMessages({ projectName, description, readme }) {
  const user = [
    `项目名称: ${projectName || "未知"}`,
    `项目简介: ${description || "（无）"}`,
    "",
    "=== README 原文 ===",
    readme || "（无 README 内容）",
  ].join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

function parseJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const asStrArray = (v) =>
    Array.isArray(v)
      ? v.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      : [];
  return {
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
    usage: typeof obj.usage === "string" ? obj.usage.trim() : "",
    features: asStrArray(obj.features).slice(0, 8),
    scenarios: asStrArray(obj.scenarios).slice(0, 8),
    tags: asStrArray(obj.tags).slice(0, 10),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.projectName
 * @param {string} [opts.description]
 * @param {string} opts.readme
 * @returns {Promise<{ok:boolean, reason?:string, error?:string, result?:object}>}
 */
async function parseReadme(opts) {
  const readme = opts && opts.readme ? String(opts.readme) : "";
  const truncated =
    readme.length > MAX_README_CHARS
      ? `${readme.slice(0, MAX_README_CHARS)}\n…(README 已截断)`
      : readme;
  const messages = buildMessages({
    projectName: opts && opts.projectName,
    description: opts && opts.description,
    readme: truncated,
  });
  const llm = await chatCompletion(messages, opts && opts.llmOpts);
  if (!llm.ok) {
    return { ok: false, reason: llm.reason || "llm_failed", error: llm.error };
  }
  const result = parseJson(llm.text);
  if (!result) return { ok: false, reason: "parse_failed" };
  return { ok: true, result };
}

module.exports = {
  SYSTEM_PROMPT,
  buildMessages,
  parseJson,
  parseReadme,
};
