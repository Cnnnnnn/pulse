import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  analyzeUiActionPipeline,
  assistantClaimsUiAction,
} from "../../src/ai/assistant-ui-eval";
import {
  captureEvalCandidateFromDownvote,
  classifyUiTraceEvent,
  clearEvalCandidates,
  clearUiTraceEvents,
  formatUiTraceSummary,
  formatUiTraceTitle,
  listEvalCandidates,
  listUiTraceEvents,
  recordUiTurnTrace,
  summarizeUiTrace,
} from "../../src/renderer/assistant/assistant-ui-trace";

describe("assistant-ui-trace", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.store[key] = value;
      },
      removeItem(key: string) {
        delete this.store[key];
      },
    });
    clearUiTraceEvents();
    clearEvalCandidates();
  });

  it("recordUiTurnTrace tracks infer_fallback", () => {
    const pipeline = analyzeUiActionPipeline("打开应用列表页面", [], {
      activeNav: "home",
    });
    expect(pipeline.inferFallback).toBe(true);
    const event = recordUiTurnTrace("打开应用列表页面", pipeline, {
      activeNav: "home",
    });
    expect(event.kind).toBe("infer_fallback");
    expect(classifyUiTraceEvent(pipeline)).toBe("infer_fallback");
    const stats = summarizeUiTrace(listUiTraceEvents());
    expect(stats.inferFallback).toBe(1);
    expect(stats.totalTurns).toBe(1);
  });

  it("recordUiTurnTrace tracks model_ui_tool when model called navigate", () => {
    const pipeline = analyzeUiActionPipeline(
      "打开应用列表",
      [{ tool: "navigate", params: { nav: "versions" } }],
    );
    expect(pipeline.inferFallback).toBe(false);
    recordUiTurnTrace("打开应用列表", pipeline);
    expect(summarizeUiTrace().modelUiTool).toBe(1);
  });

  it("captureEvalCandidateFromDownvote persists to localStorage", () => {
    const pipeline = analyzeUiActionPipeline("八仙!", [], {
      activeNav: "movies",
      assistantText: "已经为你打开详情",
    });
    const candidate = captureEvalCandidateFromDownvote({
      userText: "八仙!",
      assistantText: "已经为你打开详情",
      modelActions: [],
      pipeline,
      activeNav: "movies",
      ts: 123,
    });
    expect(candidate).not.toBeNull();
    expect(listEvalCandidates()).toHaveLength(1);
    expect(listEvalCandidates()[0].pipeline.inferFallback).toBe(true);
  });

  it("formatUiTraceSummary includes claim repair and eval candidates", () => {
    const line = formatUiTraceSummary(
      {
        totalTurns: 10,
        modelUiTool: 6,
        inferFallback: 3,
        claimRepair: 1,
        inferFallbackRate: 0.3,
      },
      2,
    );
    expect(line).toContain("兜底 3(30%)");
    expect(line).toContain("修复 1");
    expect(line).toContain("候选 2");
  });

  it("formatUiTraceTitle lists breakdown", () => {
    const title = formatUiTraceTitle(
      {
        totalTurns: 5,
        modelUiTool: 3,
        inferFallback: 2,
        claimRepair: 0,
        inferFallbackRate: 0.4,
      },
      1,
    );
    expect(title).toContain("模型调工具: 3");
    expect(title).toContain("点踩 Eval 候选: 1");
  });
});
