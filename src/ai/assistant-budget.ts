/**
 * src/ai/assistant-budget.ts
 *
 * Agent 循环预算 — 四维约束（轮数 / 工具调用数 / 耗时 / token）.
 *
 * 纯函数模块（无副作用、无 IO），默认值刻意对齐改造前的既有上限，使接入后
 * 行为不变；后续收紧或放宽只需改 `DEFAULT_BUDGET` 或经 `clampBudget` 从配置注入。
 */

export type AgentBudget = {
  /** 最多 LLM 轮次 */
  maxRounds: number;
  /** 单次对话累计工具调用数上限 */
  maxToolCalls: number;
  /** 单次对话墙上时钟上限 (ms) */
  maxElapsedMs: number;
  /** 单次对话累计 token 上限 */
  maxTokens: number;
};

export type BudgetUsage = {
  rounds: number;
  toolCalls: number;
  tokens: number;
  /** 对话开始时间戳 (ms) */
  startedAt: number;
};

export type BudgetExhaustedReason = "rounds" | "tool_calls" | "elapsed" | "tokens";

export type BudgetVerdict =
  | { kind: "continue" }
  | {
      kind: "exhausted";
      reason: BudgetExhaustedReason;
      /**
       * 耗尽后是否仍做一次「无 tools」综合调用把已有结果汇总。
       * elapsed 为 false —— 已超时就不该再发起新的 LLM 请求。
       */
      synthesize: boolean;
    };

/**
 * 默认预算。
 *
 * ⚠️ 这组值是**有意的行为变更**（Step 5，2026-09-16 经用户确认）：
 * - `maxRounds: 8` —— 改造前为固定 4 轮，复杂查询编排会被硬截断，且截断提示
 *   形似失败（「已连续执行多轮查询, 本轮到此」）。放宽到 8 轮覆盖绝大多数编排。
 * - `maxToolCalls: 48` = 每轮并发上限 6（`MAX_PARALLEL_TOOLS`）× 8 轮。
 * - `maxElapsedMs: 180_000` —— 改造前无总耗时约束，理论最坏 = 4 轮 ×（LLM 单次
 *   超时 120s + 工具超时 15s）≈ 540s。180s 是**有意的收紧**：不让用户等超过 3 分钟；
 *   超限走硬终止（不再发起 LLM 请求，直接返回已收集结果）。
 * - `maxTokens` 暂取宽松值 —— 流式路径当前不解析 usage（`chat-fc-stream.ts` 零
 *   usage 处理），token 维度需待流式回传接入后才真正生效。
 */
export const DEFAULT_BUDGET: AgentBudget = {
  maxRounds: 8,
  maxToolCalls: 48,
  maxElapsedMs: 180_000,
  maxTokens: 1_000_000,
};

export const MIN_ROUNDS = 1;
export const MAX_ROUNDS_LIMIT = 20;
export const MIN_TOOL_CALLS = 1;
export const MAX_TOOL_CALLS_LIMIT = 100;
export const MIN_ELAPSED_MS = 10_000;
export const MAX_ELAPSED_MS_LIMIT = 600_000;
export const MIN_TOKENS = 10_000;
export const MAX_TOKENS_LIMIT = 2_000_000;

export function createUsage(now: number): BudgetUsage {
  return { rounds: 0, toolCalls: 0, tokens: 0, startedAt: now };
}

export function recordRound(usage: BudgetUsage): BudgetUsage {
  return { ...usage, rounds: usage.rounds + 1 };
}

export function recordToolCalls(usage: BudgetUsage, n: number): BudgetUsage {
  const add = typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  return add === 0 ? usage : { ...usage, toolCalls: usage.toolCalls + add };
}

export function recordTokens(usage: BudgetUsage, n: unknown): BudgetUsage {
  const add = typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  return add === 0 ? usage : { ...usage, tokens: usage.tokens + add };
}

/**
 * 判定是否继续。耗尽判定按「严重度」排序：elapsed 最先（不可恢复），
 * 其余按成本排序。达到上限即视为耗尽（`>=`）。
 */
export function verdict(
  usage: BudgetUsage,
  budget: AgentBudget,
  now: number,
): BudgetVerdict {
  if (now - usage.startedAt >= budget.maxElapsedMs) {
    return { kind: "exhausted", reason: "elapsed", synthesize: false };
  }
  if (usage.tokens >= budget.maxTokens) {
    return { kind: "exhausted", reason: "tokens", synthesize: true };
  }
  if (usage.toolCalls >= budget.maxToolCalls) {
    return { kind: "exhausted", reason: "tool_calls", synthesize: true };
  }
  if (usage.rounds >= budget.maxRounds) {
    return { kind: "exhausted", reason: "rounds", synthesize: true };
  }
  return { kind: "continue" };
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 把任意来源（state.json / IPC payload）的配置钳制进合法区间。
 * 非法或缺省字段回退到 `DEFAULT_BUDGET` 对应值，不抛错。
 */
export function clampBudget(raw: unknown): AgentBudget {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    maxRounds: clampInt(o.maxRounds, MIN_ROUNDS, MAX_ROUNDS_LIMIT, DEFAULT_BUDGET.maxRounds),
    maxToolCalls: clampInt(
      o.maxToolCalls,
      MIN_TOOL_CALLS,
      MAX_TOOL_CALLS_LIMIT,
      DEFAULT_BUDGET.maxToolCalls,
    ),
    maxElapsedMs: clampInt(
      o.maxElapsedMs,
      MIN_ELAPSED_MS,
      MAX_ELAPSED_MS_LIMIT,
      DEFAULT_BUDGET.maxElapsedMs,
    ),
    maxTokens: clampInt(
      o.maxTokens,
      MIN_TOKENS,
      MAX_TOKENS_LIMIT,
      DEFAULT_BUDGET.maxTokens,
    ),
  };
}
