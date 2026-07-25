/**
 * tests/renderer/ai-leaderboard-agent-dimensions.test.tsx
 *
 * Agent 榜 6 维细分「按维度排名」行为测试（vitest + happy-dom，纯本地）。
 * 覆盖：
 *  - 默认（Net Improvement 头条）排序
 *  - 切到任一维度（Confirmed Success / Tool Hallucination ...）重排
 *  - columnValue 在 agent board 下 elo→选中维度、votes→sessions
 *  - getDisplayed 仅保留有 arena["agent"].score 的模型
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    getLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
    refreshLeaderboard: vi.fn(async () => ({ ok: true, items: [], sources: {}, attribution: [], stale: false, fromCache: false, fetchedAt: null, count: 0 })),
  },
}));

import * as store from "../../src/renderer/ai-leaderboard/aiLeaderboardStore.ts";
import { AGENT_DIMENSIONS, AGENT_DIMENSION_DEFAULT } from "../../src/renderer/ai-leaderboard/types.ts";

/** 构造带 agent 6 维切片 + sessions 的模型。 */
function mkAgent(id: string, name: string, dims: Record<string, number>, sessions: number) {
  const dimensions: Record<string, { score: number; ci: number }> = {};
  for (const d of AGENT_DIMENSIONS) {
    dimensions[d] = { score: dims[d], ci: Math.abs(dims[d]) * 0.2 };
  }
  return {
    id,
    name,
    vendor: "other",
    vendorRaw: null,
    category: "llm",
    license: null,
    arena: {
      agent: {
        rank: 0,
        score: dims[AGENT_DIMENSION_DEFAULT], // 头条 = Net Improvement
        ci: 1,
        votes: 0,
        sessions,
        dimensions,
      },
    },
    aa: null,
    openrouter: null,
    livebench: null,
    modelsdev: null,
    huggingface: null,
    sources: { arena: "live", aa: "none", openrouter: "none" },
    isSample: false,
    fetchedAt: null,
  };
}

const A = mkAgent("a", "Alpha", { "Net Improvement": 12, "Confirmed Success": 30, "Praise vs Complaint": 5, "Steerability": 10, "Bash Recovery": 8, "Tool Hallucination": 2 }, 2000);
const B = mkAgent("b", "Beta", { "Net Improvement": 5, "Confirmed Success": 50, "Praise vs Complaint": 9, "Steerability": 4, "Bash Recovery": 3, "Tool Hallucination": 7 }, 800);

beforeEach(() => {
  localStorage.clear();
  store.activeView.value = "arena";
  store.activeBoard.value = "agent";
  store.activeAgentDim.value = AGENT_DIMENSION_DEFAULT;
  store.sortDir.value = "desc";
  store.sortKey.value = null;
  store.activeVendor.value = "all";
  store.licenseFilter.value = "all";
  store.searchQuery.value = "";
  store.items.value = [];
});

describe("Agent 榜 维度排名", () => {
  it("默认按 Net Improvement 头条排序（A > B）", () => {
    store.items.value = [B, A];
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["a", "b"]);
  });

  it("切到 Confirmed Success 后按该维度重排（B > A）", () => {
    store.items.value = [B, A];
    store.setAgentDim("Confirmed Success");
    expect(store.activeAgentDim.value).toBe("Confirmed Success");
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["b", "a"]);
  });

  it("切到 Tool Hallucination 后按该维度重排（B > A）", () => {
    store.items.value = [B, A];
    store.setAgentDim("Tool Hallucination");
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["b", "a"]);
  });

  it("columnValue elo 在 agent board 下返回选中维度分数", () => {
    store.activeAgentDim.value = "Steerability";
    expect(store.columnValue(A, "arena", "elo")).toBe(10);
    store.activeAgentDim.value = AGENT_DIMENSION_DEFAULT;
    expect(store.columnValue(A, "arena", "elo")).toBe(12);
  });

  it("columnValue votes 在 agent board 下返回 sessions 而非 0 票数", () => {
    expect(store.columnValue(A, "arena", "votes")).toBe(2000);
    expect(store.columnValue(B, "arena", "votes")).toBe(800);
  });

  it("getDisplayed 仅保留有 arena.agent.score 的模型", () => {
    const noAgent = { ...A, id: "x", arena: {} };
    store.items.value = [A, B, noAgent];
    const rows = store.getDisplayed();
    expect(rows.map((r: any) => r.id)).toEqual(["a", "b"]);
  });

  it("非 agent board 时 columnValue votes 仍返回 votes 字段", () => {
    store.activeBoard.value = "text";
    const textModel = { ...A, arena: { text: { rank: 1, score: 1400, ci: 5, votes: 1234 } } };
    expect(store.columnValue(textModel, "arena", "votes")).toBe(1234);
  });
});
