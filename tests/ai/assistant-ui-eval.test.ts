import { describe, expect, it } from "vitest";
import { buildAssistantSystemPrompt } from "../../src/ai/assistant-prompt";
import {
  ASSISTANT_UI_EVAL_CASES,
  actionToPulseOpenExample,
  analyzeUiActionPipeline,
  assistantClaimsUiAction,
  inferFromClaimedAssistantText,
  runAssistantUiEval,
  runUiEvalCase,
  formatUiEvalReport,
} from "../../src/ai/assistant-ui-eval";
import { PULSE_URI_CHEATSHEET } from "../../src/shared/pulse-href";

describe("assistant-ui-eval golden cases", () => {
  it("all cases pass", () => {
    const report = runAssistantUiEval();
    if (report.failed.length > 0) {
      const lines = report.results
        .filter((r) => !r.pass)
        .map(
          (r) =>
            `  ${r.id}: expected ${JSON.stringify(r.expected)} got ${JSON.stringify(r.actual)}`,
        );
      expect.fail(
        `${report.failed.length}/${report.total} failed:\n${lines.join("\n")}`,
      );
    }
    expect(report.passed).toBe(report.total);
    expect(report.total).toBeGreaterThanOrEqual(15);
  });

  it("covers key regression tags", () => {
    const tags = new Set(ASSISTANT_UI_EVAL_CASES.flatMap((c) => c.tags ?? []));
    for (const t of ["nav", "movie", "affirmation", "claim", "negative", "pulse_open"]) {
      expect(tags.has(t), `missing tag ${t}`).toBe(true);
    }
  });

  it("runUiEvalCase reports failure details", () => {
    const r = runUiEvalCase({
      id: "should-fail",
      userText: "你好",
      expect: { tool: "navigate", params: { nav: "movies" } },
    });
    expect(r.pass).toBe(false);
  });

  it("analyzeUiActionPipeline flags infer_fallback", () => {
    const p = analyzeUiActionPipeline("打开应用列表", []);
    expect(p.inferFallback).toBe(true);
    expect(p.finalUi).toEqual({ tool: "navigate", params: { nav: "versions" } });
  });

  it("formatUiEvalReport 输出通过数与 tag 覆盖", () => {
    const report = runAssistantUiEval();
    const text = formatUiEvalReport(report);
    expect(text).toContain("passed");
    expect(text).toContain("tags(");
    expect(text).not.toContain("失败");
  });

  it("formatUiEvalReport 输出失败详情", () => {
    const report = runAssistantUiEval([
      {
        id: "should-fail",
        userText: "你好",
        expect: { tool: "navigate", params: { nav: "movies" } },
      },
    ]);
    const text = formatUiEvalReport(report);
    expect(text).toContain("失败 1 条");
  });
});

describe("assistantClaimsUiAction", () => {
  it("detects claimed navigation without tool", () => {
    expect(assistantClaimsUiAction("已经为你打开电影页面")).toBe(true);
    expect(assistantClaimsUiAction("为你打开《八仙！》的详情")).toBe(true);
    expect(assistantClaimsUiAction("基金今日上涨 2%")).toBe(false);
  });

  it("inferFromClaimedAssistantText repairs missing action", () => {
    const fixed = inferFromClaimedAssistantText("好的", "已经为你打开电影页面", []);
    expect(fixed).toEqual({ tool: "navigate", params: { nav: "movies" } });
  });

  it("skips when model already called a UI tool", () => {
    const fixed = inferFromClaimedAssistantText(
      "好的",
      "已经为你打开电影页面",
      [{ tool: "navigate", params: { nav: "movies" } }],
    );
    expect(fixed).toBeNull();
  });
});

describe("pulse_open prompt & examples", () => {
  it("system prompt prioritizes pulse_open and cheat sheet", () => {
    const p = buildAssistantSystemPrompt({ useFunctionCalling: true });
    expect(p).toContain("pulse_open");
    expect(p).toContain("pulse://nav/versions");
    expect(p).toContain("禁止只在正文说「已打开");
    expect(p).toContain("打开应用列表");
    expect(p).toContain(PULSE_URI_CHEATSHEET.split("\n")[0]);
  });

  it("actionToPulseOpenExample round-trips navigate", () => {
    expect(
      actionToPulseOpenExample({
        tool: "navigate",
        params: { nav: "movies" },
      }),
    ).toEqual({
      tool: "pulse_open",
      params: { href: "pulse://nav/movies" },
    });
  });
});
