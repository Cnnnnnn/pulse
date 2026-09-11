/**
 * src/ai/assistant-memory-auto.ts
 *
 * 从会话自动沉淀长期记忆 — 抽屉关闭时对最近 user turn 做一次轻量抽取。
 * 与手动 remember_fact 互补：这里是「用户没说记住，但明显是偏好/事实」的补录。
 *
 * 约束：
 * - 只抽「用户稳定偏好/事实」，不抽临时问题、工具结果、一次性任务
 * - 与已有 memory 文本去重
 * - 单次最多 3 条，失败静默
 */
import { chatCompletion, resolveSharedAiConfig } from "./shared-llm";
import { pickFastModel } from "./assistant-model-route";
import { addMemory, listMemory, type MemoryStore } from "./assistant-memory";
import { textContentOf } from "./multimodal";

export const AUTO_EXTRACT_MAX_USER_TURNS = 8;
export const AUTO_EXTRACT_MAX_FACTS = 3;

const SYSTEM_PROMPT =
  "你是 Pulse 助手的长期记忆抽取器。从用户消息里挑出「稳定偏好/事实」，" +
  "忽略一次性问题、工具输出、系统提示。只输出严格 JSON，不要 markdown fence。" +
  'JSON schema: {"facts":["短句1","短句2"]}。每条 ≤40 字，简体中文，1-3 条；没有值得记的就输出 {"facts":[]}。';

export function collectRecentUserTexts(
  messages: Array<{ role?: unknown; content?: unknown }>,
  limit = AUTO_EXTRACT_MAX_USER_TURNS,
): string[] {
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    const text = textContentOf(m.content).trim();
    if (!text) continue;
    // 过短的（如「嗯」「继续」）没有记忆价值
    if (text.length < 4) continue;
    out.unshift(text);
  }
  return out;
}

export function parseAutoExtractResponse(text: unknown): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.facts)) return [];
  return parsed.facts
    .filter((f: unknown) => typeof f === "string" && f.trim())
    .map((f: string) => f.trim().slice(0, 80))
    .slice(0, AUTO_EXTRACT_MAX_FACTS);
}

/** 启发式：消息里是否像偏好/事实（减少无谓 LLM 调用） */
export function looksLikePreference(text: string): boolean {
  return /记住|记一下|以后|下次|我喜欢|我不喜欢|别再|不要|偏好|习惯|默认|总是|一直|公司|团队|项目名/.test(
    text,
  );
}

export type AutoExtractResult = {
  ok: boolean;
  added: number;
  facts?: string[];
  reason?: string;
};

/**
 * 从最近 user 消息抽取并写入记忆。
 * store 注入便于测试；默认走 state-store。
 */
export async function autoExtractMemories(
  messages: Array<{ role?: unknown; content?: unknown }>,
  opts: { store?: MemoryStore } = {},
): Promise<AutoExtractResult> {
  const store = opts.store;
  const userTexts = collectRecentUserTexts(messages);
  if (userTexts.length === 0) {
    return { ok: true, added: 0, facts: [] };
  }

  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) {
    return { ok: false, added: 0, reason: resolved.reason };
  }
  const fastModel = pickFastModel(resolved.providerId as string);
  const model = fastModel || (resolved.model as string);

  const existing = listMemory(store).map((i) => i.text);
  const llm = await chatCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "已有记忆（不要重复）：",
          existing.length ? existing.map((t) => `- ${t}`).join("\n") : "（无）",
          "",
          "最近用户消息：",
          userTexts.map((t, i) => `${i + 1}. ${t}`).join("\n"),
        ].join("\n"),
      },
    ],
    { model },
  );
  if (!llm.ok) {
    return { ok: false, added: 0, reason: llm.reason };
  }

  const facts = parseAutoExtractResponse(llm.text).filter(
    (f) => !existing.some((e) => e === f || e.includes(f) || f.includes(e)),
  );
  let added = 0;
  for (const fact of facts) {
    const item = addMemory(fact, store);
    if (item) added += 1;
  }
  return { ok: true, added, facts };
}
