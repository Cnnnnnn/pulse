/**
 * src/ai/prompt-cost.ts
 *
 * Prompt 请求侧成本测量 — 响应侧已有 llm-telemetry 记 totalTokens，
 * 这里补齐请求侧：对组装好的 prompt 按组成部分估 token，落内存 ring buffer，
 * 供诊断与 prompt 瘦身（few-shot / 记忆注入 / 工具说明的占比归因）。
 *
 * 估算是启发式（无 tokenizer 依赖）：CJK/全角 ≈ 1 token/字，其余 ≈ 4 字符/token。
 * 只用于相对占比与量级观察，不当作计费口径。
 *
 * 纯模块状态 + 无 Node 依赖（测试可直接读写 ring buffer）。
 */

export type PromptPart = {
  label: string;
  text: string;
};

export type PromptPartCost = {
  label: string;
  chars: number;
  estTokens: number;
  /** 占总量百分比（0-100，四舍五入；总量为 0 时为 0） */
  pct: number;
};

export type PromptCostBreakdown = {
  parts: PromptPartCost[];
  totalChars: number;
  totalTokens: number;
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let wide = 0;
  let narrow = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK 部首/标点/假名/统一表意、兼容表意、全角形式 ≈ 1 token/字；
    // 星位代理对高位（emoji 等）粗略按 1 token/UTF-16 单元计。
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0xd800 && code <= 0xdbff)
    ) {
      wide++;
    } else {
      narrow++;
    }
  }
  return wide + Math.ceil(narrow / 4);
}

/** 非空部件按序计量；空部件丢弃，避免 0% 噪声行 */
export function measurePromptParts(parts: PromptPart[]): PromptCostBreakdown {
  const nonEmpty = (parts || []).filter(
    (p) => p && typeof p.text === "string" && p.text.length > 0,
  );
  const partsCost: PromptPartCost[] = nonEmpty.map((p) => ({
    label: p.label,
    chars: p.text.length,
    estTokens: estimateTokens(p.text),
    pct: 0,
  }));
  const totalTokens = partsCost.reduce((s, p) => s + p.estTokens, 0);
  const totalChars = partsCost.reduce((s, p) => s + p.chars, 0);
  for (const p of partsCost) {
    p.pct = totalTokens > 0 ? Math.round((p.estTokens / totalTokens) * 100) : 0;
  }
  return { parts: partsCost, totalChars, totalTokens };
}

export function formatPromptCost(b: PromptCostBreakdown): string {
  const head = `prompt≈${b.totalTokens}tok/${b.totalChars}chars`;
  const body = b.parts
    .map((p) => `${p.label} ${p.estTokens}(${p.pct}%)`)
    .join(" · ");
  return body ? `${head} [${body}]` : head;
}

export type PromptCostRecord = {
  ts: number;
  /** 场景标识，如 assistant_fc / assistant_xml / ithome_summary */
  scene: string;
  breakdown: PromptCostBreakdown;
};

export const PROMPT_COST_MAX = 200;

const records: PromptCostRecord[] = [];

export function recordPromptCost(
  scene: string,
  breakdown: PromptCostBreakdown,
  ts: number = Date.now(),
): void {
  records.push({ ts, scene, breakdown });
  if (records.length > PROMPT_COST_MAX) {
    records.splice(0, records.length - PROMPT_COST_MAX);
  }
}

export function getPromptCostRecords(): PromptCostRecord[] {
  return [...records];
}

export function clearPromptCostRecords(): void {
  records.length = 0;
}
