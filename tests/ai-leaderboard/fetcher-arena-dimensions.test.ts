/**
 * tests/ai-leaderboard/fetcher-arena-dimensions.test.ts
 *
 * fetcher-arena normalize() 的 agent 维度分支单测（node env，不依赖 happy-dom）。
 * 锁定：agent 模型（带 scores[]）→ arena["agent"].dimensions 存 6 维 + sessions；
 *       其它 board（flat score）走原分支，不受影响。
 */

// @vitest-environment node

import { describe, it, expect } from "vitest";
import { normalize } from "../../src/main/ai-leaderboard/fetcher-arena.ts";

describe("fetcher-arena normalize — agent 维度分支", () => {
  it("agent 模型带 scores[] → 落盘 dimensions + sessions，头条 score=Net Improvement", () => {
    const raw = {
      boards: {
        agent: {
          meta: { leaderboard: "agent", last_updated: "Jul 21, 2026" },
          models: [
            {
              rank: 1,
              model: "Claude Fable 5 (High)",
              vendor: "Anthropic",
              license: "proprietary",
              scores: [
                { name: "Net Improvement", score: 12.72, ci: 2 },
                { name: "Confirmed Success", score: 10.67, ci: 3.84 },
                { name: "Praise vs Complaint", score: 23.94, ci: 7.42 },
                { name: "Steerability", score: 14.62, ci: 3.8 },
                { name: "Bash Recovery", score: 12.97, ci: 1.3 },
                { name: "Tool Hallucination", score: 1.39, ci: 0.17 },
              ],
              sessions: 23549,
            },
          ],
        },
      },
    };
    const out = normalize(raw);
    expect(out.length).toBe(1);
    const a = out[0].arena.agent;
    expect(a.score).toBe(12.72); // 头条 = Net Improvement
    expect(a.sessions).toBe(23549);
    expect(Object.keys(a.dimensions)).toEqual([
      "Net Improvement", "Confirmed Success", "Praise vs Complaint",
      "Steerability", "Bash Recovery", "Tool Hallucination",
    ]);
    expect(a.dimensions["Confirmed Success"].score).toBe(10.67);
    expect(a.dimensions["Tool Hallucination"].ci).toBe(0.17);
  });

  it("非 agent board（flat score）走原分支，不写 dimensions", () => {
    const raw = {
      boards: {
        text: {
          meta: { last_updated: "Jul 16, 2026" },
          models: [{ rank: 1, model: "GPT-Z", vendor: "OpenAI", score: 1450, ci: 5, votes: 1000 }],
        },
      },
    };
    const out = normalize(raw);
    const t = out[0].arena.text;
    expect(t.score).toBe(1450);
    expect(t.votes).toBe(1000);
    expect(t.dimensions).toBeUndefined();
    expect(t.sessions).toBeUndefined();
  });

  it("agent 维度数 != 6 时跳过该模型（保守，防 RSC 错位）", () => {
    const raw = {
      boards: {
        agent: {
          meta: { leaderboard: "agent" },
          models: [
            { rank: 9, model: "Weird", vendor: "X", scores: [{ name: "Net Improvement", score: 1, ci: 1 }], sessions: 1 },
          ],
        },
      },
    };
    const out = normalize(raw);
    // 维度数 != 6 → 该模型无合格 score，被 `!Number.isFinite(score)` 过滤
    expect(out.length).toBe(0);
  });
});
