import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGET,
  MAX_TOKENS_LIMIT,
  MAX_TOOL_CALLS_LIMIT,
  MAX_ROUNDS_LIMIT,
  clampBudget,
  createUsage,
  recordRound,
  recordTokens,
  recordToolCalls,
  verdict,
  type AgentBudget,
} from "../../src/ai/assistant-budget";
import { MAX_ROUNDS } from "../../src/ai/assistant-agent";

const T0 = 1_000_000;

function budgetOf(over: Partial<AgentBudget> = {}): AgentBudget {
  return { ...DEFAULT_BUDGET, ...over };
}

describe("assistant-budget — 默认值基线（Step 5 已生效）", () => {
  it("maxRounds 为 8，且 MAX_ROUNDS 由它派生（单一来源）", () => {
    expect(DEFAULT_BUDGET.maxRounds).toBe(8);
    expect(MAX_ROUNDS).toBe(DEFAULT_BUDGET.maxRounds);
  });

  it("maxToolCalls = 每轮并发上限 6 × 8 轮", () => {
    expect(DEFAULT_BUDGET.maxToolCalls).toBe(48);
  });

  it("maxElapsedMs 为 180s —— 相对改造前（无总耗时约束）是有意收紧", () => {
    // 改造前理论最坏 ≈ 4 轮 × (LLM 120s + 工具 15s) = 540s；180s 是有意的产品收紧
    expect(DEFAULT_BUDGET.maxElapsedMs).toBe(180_000);
  });

  it("maxTokens 暂为宽松值（流式路径尚未回传 usage）", () => {
    expect(DEFAULT_BUDGET.maxTokens).toBe(1_000_000);
  });
});

describe("assistant-budget — usage 累加", () => {
  it("createUsage 初始化为零", () => {
    expect(createUsage(T0)).toEqual({
      rounds: 0,
      toolCalls: 0,
      tokens: 0,
      startedAt: T0,
    });
  });

  it("record* 不可变：返回新对象且原对象不变", () => {
    const u0 = createUsage(T0);
    const u1 = recordRound(u0);
    const u2 = recordToolCalls(u1, 3);
    const u3 = recordTokens(u2, 500);

    expect(u0).toEqual({ rounds: 0, toolCalls: 0, tokens: 0, startedAt: T0 });
    expect(u1).not.toBe(u0);
    expect(u3).toEqual({ rounds: 1, toolCalls: 3, tokens: 500, startedAt: T0 });
    expect(u2).toEqual({ rounds: 1, toolCalls: 3, tokens: 0, startedAt: T0 });
  });

  it("非法增量被忽略（0 / 负数 / NaN / 非数值）", () => {
    const u = createUsage(T0);
    expect(recordToolCalls(u, 0)).toBe(u);
    expect(recordToolCalls(u, -5)).toBe(u);
    expect(recordToolCalls(u, Number.NaN)).toBe(u);
    expect(recordToolCalls(u, "3" as unknown)).toBe(u);
    expect(recordTokens(u, 0)).toBe(u);
    expect(recordTokens(u, Number.NaN)).toBe(u);
    expect(recordTokens(u, undefined)).toBe(u);
  });
});

describe("assistant-budget — verdict 四维", () => {
  it("未达任一上限时继续", () => {
    const u = { rounds: 3, toolCalls: 23, tokens: 999, startedAt: T0 };
    expect(verdict(u, budgetOf(), T0 + 1000)).toEqual({ kind: "continue" });
  });

  it("轮数达到上限即耗尽，且应当综合收尾", () => {
    const u = { rounds: 4, toolCalls: 0, tokens: 0, startedAt: T0 };
    expect(verdict(u, budgetOf({ maxRounds: 4 }), T0)).toEqual({
      kind: "exhausted",
      reason: "rounds",
      synthesize: true,
    });
  });

  it("工具调用数达到上限即耗尽", () => {
    const u = { rounds: 1, toolCalls: 24, tokens: 0, startedAt: T0 };
    expect(verdict(u, budgetOf({ maxToolCalls: 24 }), T0)).toEqual({
      kind: "exhausted",
      reason: "tool_calls",
      synthesize: true,
    });
  });

  it("token 达到上限即耗尽", () => {
    const u = { rounds: 1, toolCalls: 1, tokens: 120_000, startedAt: T0 };
    expect(verdict(u, budgetOf({ maxTokens: 120_000 }), T0)).toEqual({
      kind: "exhausted",
      reason: "tokens",
      synthesize: true,
    });
  });

  it("耗时超限为硬终止，不做综合调用", () => {
    const u = { rounds: 0, toolCalls: 0, tokens: 0, startedAt: T0 };
    expect(verdict(u, budgetOf({ maxElapsedMs: 10_000 }), T0 + 10_000)).toEqual({
      kind: "exhausted",
      reason: "elapsed",
      synthesize: false,
    });
  });

  it("多维度同时超限时，elapsed 优先（硬终止语义最强）", () => {
    const u = { rounds: 99, toolCalls: 99, tokens: 999_999, startedAt: T0 };
    const v = verdict(u, budgetOf({ maxElapsedMs: 5_000 }), T0 + 9_000);
    expect(v).toEqual({ kind: "exhausted", reason: "elapsed", synthesize: false });
  });

  it("耗时差 1ms 未达上限时不触发", () => {
    const u = { rounds: 0, toolCalls: 0, tokens: 0, startedAt: T0 };
    expect(verdict(u, budgetOf({ maxElapsedMs: 10_000 }), T0 + 9_999)).toEqual({
      kind: "continue",
    });
  });
});

describe("assistant-budget — clampBudget", () => {
  it("空/非法输入回退到默认值", () => {
    expect(clampBudget(undefined)).toEqual(DEFAULT_BUDGET);
    expect(clampBudget(null)).toEqual(DEFAULT_BUDGET);
    expect(clampBudget("bad")).toEqual(DEFAULT_BUDGET);
    expect(clampBudget([1, 2])).toEqual(DEFAULT_BUDGET);
    expect(clampBudget({})).toEqual(DEFAULT_BUDGET);
  });

  it("越界值被钳制到区间边界", () => {
    const low = clampBudget({
      maxRounds: 0,
      maxToolCalls: -10,
      maxElapsedMs: 1,
      maxTokens: 1,
    });
    expect(low.maxRounds).toBe(1);
    expect(low.maxToolCalls).toBe(1);
    expect(low.maxElapsedMs).toBe(10_000);
    expect(low.maxTokens).toBe(10_000);

    const high = clampBudget({
      maxRounds: 9999,
      maxToolCalls: 9999,
      maxElapsedMs: 9_999_999,
      maxTokens: 9_999_999,
    });
    expect(high.maxRounds).toBe(MAX_ROUNDS_LIMIT);
    expect(high.maxToolCalls).toBe(MAX_TOOL_CALLS_LIMIT);
    expect(high.maxElapsedMs).toBe(600_000);
    expect(high.maxTokens).toBe(MAX_TOKENS_LIMIT);
  });

  it("非法字段类型逐个回退，不影响其它字段", () => {
    const b = clampBudget({ maxRounds: "8", maxToolCalls: Number.NaN, maxTokens: 50_000 });
    expect(b.maxRounds).toBe(DEFAULT_BUDGET.maxRounds);
    expect(b.maxToolCalls).toBe(DEFAULT_BUDGET.maxToolCalls);
    expect(b.maxTokens).toBe(50_000);
  });

  it("合法值原样采纳（含小数向下取整）", () => {
    const b = clampBudget({
      maxRounds: 8,
      maxToolCalls: 30,
      maxElapsedMs: 120_000,
      maxTokens: 200_000,
    });
    expect(b).toEqual({
      maxRounds: 8,
      maxToolCalls: 30,
      maxElapsedMs: 120_000,
      maxTokens: 200_000,
    });
    expect(clampBudget({ maxRounds: 8.9 }).maxRounds).toBe(8);
  });
});
