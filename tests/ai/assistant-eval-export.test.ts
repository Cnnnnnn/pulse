import { describe, expect, it } from "vitest";
import {
  candidateToEvalCase,
  evalCaseFingerprint,
  formatEvalCandidateAsCase,
  formatEvalCandidatesBlock,
  formatEvalValidationFailures,
  mergeEvalCandidatesForPaste,
  mergeEvalCases,
  summarizeEvalCandidates,
} from "../../src/ai/assistant-eval-export";
import {
  ASSISTANT_UI_EVAL_CASES,
  runAssistantUiEval,
  runAssistantUiEvalMerged,
} from "../../src/ai/assistant-ui-eval";

describe("assistant-eval-export", () => {
  it("formatEvalCandidateAsCase emits eval case shape", () => {
    const block = formatEvalCandidateAsCase(
      {
        id: "1",
        userText: "打开应用列表",
        activeNav: "home",
        pipeline: {
          inferFallback: true,
          finalUi: { tool: "navigate", params: { nav: "versions" } },
        },
      },
      0,
    );
    expect(block).toContain('userText: "打开应用列表"');
    expect(block).toContain("infer_fallback");
    expect(block).toContain("navigate");
  });

  it("formatEvalCandidatesBlock handles empty", () => {
    expect(formatEvalCandidatesBlock([])).toContain("暂无");
  });

  it("summarizeEvalCandidates counts fallback", () => {
    expect(
      summarizeEvalCandidates([
        { id: "1", userText: "a", pipeline: { inferFallback: true } },
        { id: "2", userText: "b", pipeline: { inferFallback: false } },
      ]),
    ).toBe("2 条候选 · 1 条兜底");
  });

  it("mergeEvalCases dedupes by userText + expect", () => {
    const base = [
      {
        id: "a",
        userText: "打开应用列表",
        expect: { tool: "navigate", params: { nav: "versions" } },
      },
    ];
    const incoming = [
      {
        id: "b",
        userText: "打开应用列表",
        expect: { tool: "navigate", params: { nav: "versions" } },
      },
      {
        id: "c",
        userText: "打开 GitHub",
        expect: { tool: "navigate", params: { nav: "github" } },
      },
    ];
    const { added, skipped, merged } = mergeEvalCases(base, incoming);
    expect(added).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(merged).toHaveLength(2);
    expect(evalCaseFingerprint(base[0])).toBe(evalCaseFingerprint(incoming[0]));
  });

  it("mergeEvalCandidatesForPaste skips existing golden cases", () => {
    const existing = ASSISTANT_UI_EVAL_CASES[0];
    const { text, added, skipped } = mergeEvalCandidatesForPaste(
      [
        {
          id: "1",
          userText: existing.userText,
          pipeline: { finalUi: existing.expect ?? null },
        },
      ],
      ASSISTANT_UI_EVAL_CASES,
    );
    expect(added).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(text).toContain("无新候选");
  });

  it("candidateToEvalCase maps downvote pipeline to eval shape", () => {
    const c = candidateToEvalCase(
      {
        id: "1",
        userText: "八仙!",
        activeNav: "movies",
        assistantText: "已打开",
        pipeline: {
          inferFallback: true,
          finalUi: { tool: "open_movie_detail", params: { title: "八仙" } },
        },
      },
      0,
    );
    expect(c?.expect?.tool).toBe("open_movie_detail");
    expect(c?.tags).toContain("infer_fallback");
    expect(c?.context?.activeNav).toBe("movies");
  });

  it("formatEvalValidationFailures summarizes mismatch", () => {
    const msg = formatEvalValidationFailures([
      {
        id: "case-a",
        expected: { tool: "navigate", params: { nav: "movies" } },
        actual: null,
      },
    ]);
    expect(msg).toContain("case-a");
    expect(msg).toContain("navigate");
  });

  it("merge path blocks invalid expect via runAssistantUiEval", () => {
    const bad = [
      {
        id: "bad-nav",
        userText: "打开应用列表",
        expect: { tool: "navigate", params: { nav: "movies" } },
        tags: ["downvote"],
      },
    ];
    const report = runAssistantUiEval(bad);
    expect(report.failed.length).toBe(1);
  });

  it("runAssistantUiEvalMerged passes for valid new candidates", () => {
    const extra = [
      {
        id: "merge-test-github",
        userText: "去 GitHub 页",
        expect: { tool: "navigate", params: { nav: "github" } },
        tags: ["downvote"],
      },
    ];
    const report = runAssistantUiEvalMerged(extra);
    expect(report.passed).toBe(report.total);
    expect(report.total).toBe(ASSISTANT_UI_EVAL_CASES.length + 1);
  });
});
