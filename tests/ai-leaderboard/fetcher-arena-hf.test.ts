/**
 * tests/ai-leaderboard/fetcher-arena-hf.test.ts
 *
 * 验证 fetcher-arena 的官方 HuggingFace 数据集主源路径（v2.8x）：
 *  - hfRowToModel：ELO 量级（rating/vote_count）与 agent 量级（score×100）映射
 *  - fetchOneBoardHf("text")：rating schema → flat {score,ci,votes}
 *  - fetchOneBoardHf("agent")：6 个 per-signal config 合并成 scores[]（6 维、×100、sessions）
 * 通过 vi.mock 接管 fetchJson，无真实网络。
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";

// 接管 ai-leaderboard/normalize 的 fetchJson：按 URL 里的 config= + category= 返回 HF /filter 形状
const hfPages: Record<string, any[]> = {};
vi.mock("../../src/main/ai-leaderboard/normalize", () => ({
  fetchJson: vi.fn(async (url: string) => {
    const cm = url.match(/config=([^&]+)/);
    const config = cm ? decodeURIComponent(cm[1]) : "";
    const wm = url.match(/where=([^&]+)/);
    let category = "overall";
    if (wm) {
      const m = decodeURIComponent(wm[1]).match(/='([^']+)/);
      if (m) category = m[1];
    }
    const key = `${config}|${category}`;
    const rows = (hfPages[key] || hfPages[config] || []).map((row, i) => ({ row_idx: i, row, truncated_cells: [] }));
    return { rows, num_rows_total: rows.length, num_rows_per_page: 100, partial: false };
  }),
  BROWSER_UA: "test-ua",
}));

import { hfRowToModel, fetchOneBoardHf } from "../../src/main/ai-leaderboard/fetcher-arena.ts";

beforeEach(() => {
  for (const k of Object.keys(hfPages)) delete hfPages[k];
});

describe("hfRowToModel", () => {
  it("ELO schema：rating/rating_lower/rating_upper/vote_count → flat {score,ci,votes}", () => {
    const m = hfRowToModel(
      { model_name: "claude-fable-5", organization: "anthropic", license: "Proprietary", rating: 1507.3, rating_lower: 1500.9, rating_upper: 1513.7, variance: 10.6, vote_count: 14646, rank: 1, category: "overall" },
      false,
    );
    expect(m.model).toBe("claude-fable-5");
    expect(m.vendor).toBe("anthropic");
    expect(m.score).toBe(1507.3);
    expect(m.ci).toBeCloseTo((1513.7 - 1500.9) / 2, 5);
    expect(m.votes).toBe(14646);
    expect(m.rank).toBe(1);
  });

  it("agent schema：score 0-1 → ×100 百分位（0.1272 → 12.72）", () => {
    const m = hfRowToModel(
      { model_name: "Claude Fable 5 (High)", organization: "anthropic", license: "Proprietary", score: 0.1272, score_ci_lower: 0.1072, score_ci_upper: 0.1472, observation_count: 831160, session_count: 23549, rank: 1, category: "overall" },
      true,
    );
    expect(m._agentScore).toBeCloseTo(12.72, 5);
    expect(m._agentCi).toBeCloseTo((0.1472 - 0.1072) / 2 * 100, 5);
    expect(m._sessions).toBe(23549);
  });
});

describe("fetchOneBoardHf", () => {
  it("text：6 个 category 子榜合并成 categories map（top-level = overall）", async () => {
    // overall 与 coding 给不同分数，验证合并 + overall 占顶层
    hfPages["text_style_control|overall"] = [
      { model_name: "claude-fable-5", organization: "anthropic", license: "Proprietary", rating: 1507.3, rating_lower: 1500.9, rating_upper: 1513.7, vote_count: 14646, rank: 1, category: "overall", leaderboard_publish_date: "2026-07-21" },
      { model_name: "gpt-5-5", organization: "openai", license: "Proprietary", rating: 1490.0, rating_lower: 1485.0, rating_upper: 1495.0, vote_count: 9000, rank: 2, category: "overall", leaderboard_publish_date: "2026-07-21" },
    ];
    hfPages["text_style_control|coding"] = [
      { model_name: "claude-fable-5", organization: "anthropic", license: "Proprietary", rating: 1553.0, rating_lower: 1543.0, rating_upper: 1563.0, vote_count: 3992, rank: 1, category: "coding", leaderboard_publish_date: "2026-07-21" },
    ];
    // 其余 4 个 category 留空（mock 返回 []）→ 验证缺失 category 不崩
    const res = await fetchOneBoardHf("text");
    expect(res).toBeTruthy();
    expect(res.meta.leaderboard).toBe("text");
    expect(res.meta.last_updated).toBe("2026-07-21");
    expect(res.models.length).toBe(2);
    const a = res.models[0];
    expect(a.model).toBe("claude-fable-5");
    expect(a.score).toBe(1507.3); // 顶层 = overall
    expect(a.votes).toBe(14646);
    expect(a.rank).toBe(1);
    expect(a.categories).toBeTruthy();
    expect(a.categories.overall.score).toBe(1507.3);
    expect(a.categories.coding.score).toBe(1553.0); // coding 子榜不同分数
    expect(a.categories.coding.votes).toBe(3992);
    expect(a.dimensions).toBeUndefined();
    // gpt-5-5 只有 overall（无 coding）→ coding 切片缺失，渲染端会过滤掉
    expect(res.models[1].categories.overall.score).toBe(1490.0);
    expect(res.models[1].categories.coding).toBeUndefined();
  });

  it("agent：6 个 per-signal config 合并成 scores[]（6 维、×100、sessions）", async () => {
    const models = [
      { name: "Claude Fable 5 (High)", org: "anthropic", rank: 1, sessions: 23549 },
      { name: "GPT 5.5 (xHigh)", org: "openai", rank: 2, sessions: 15991 },
    ];
    // 6 个 config，每个 2 行（同 2 模型），score 各异
    const configs: Record<string, number[]> = {
      agent: [0.1272, 0.1012], // Net Improvement
      agent_task_outcome_explicit: [0.1067, 0.0725], // Confirmed Success
      agent_praise_complaint: [0.2394, 0.2353],
      agent_steerability: [0.1462, 0.0971],
      agent_bash_recovery_steps: [0.1297, 0.0874],
      agent_tool_hallucination: [0.0139, 0.0139],
    };
    for (const [config, scores] of Object.entries(configs)) {
      hfPages[config] = models.map((m, i) => ({
        model_name: m.name, organization: m.org, license: "Proprietary",
        score: scores[i], score_ci_lower: scores[i] - 0.01, score_ci_upper: scores[i] + 0.01,
        observation_count: 1000, session_count: m.sessions, rank: m.rank,
        category: "overall", leaderboard_publish_date: "2026-07-21",
      }));
    }
    const res = await fetchOneBoardHf("agent");
    expect(res).toBeTruthy();
    expect(res.meta.leaderboard).toBe("agent");
    expect(res.models.length).toBe(2);
    const a = res.models[0];
    expect(a.model).toBe("Claude Fable 5 (High)");
    expect(a.sessions).toBe(23549);
    expect(a.scores.length).toBe(6);
    // 维度顺序对齐 AGENT_DIMENSIONS
    expect(a.scores.map((s: any) => s.name)).toEqual([
      "Net Improvement", "Confirmed Success", "Praise vs Complaint",
      "Steerability", "Bash Recovery", "Tool Hallucination",
    ]);
    // ×100 量级：Net Improvement 0.1272 → 12.72
    expect(a.scores[0].score).toBeCloseTo(12.72, 5);
    expect(a.scores[4].score).toBeCloseTo(12.97, 5); // Bash Recovery
  });

  it("未知 board / 空 config → 返回 null（走快照兜底）", async () => {
    const res = await fetchOneBoardHf("nope-board");
    expect(res).toBeNull();
  });
});
