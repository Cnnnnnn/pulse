import { describe, expect, it, beforeEach } from "vitest";
import {
  recordLlmCall,
  recordLlmOutcome,
  getLlmTelemetry,
  clearLlmTelemetry,
  summarizeLlmTelemetry,
} from "../../src/ai/llm-telemetry";

describe("llm-telemetry", () => {
  beforeEach(() => clearLlmTelemetry());

  it("records / retrieves / clears calls", () => {
    recordLlmCall({
      ts: 0,
      providerId: "openai",
      model: "gpt-4o",
      latencyMs: 100,
      reason: "ok",
      ok: true,
    });
    expect(getLlmTelemetry()).toHaveLength(1);
    clearLlmTelemetry();
    expect(getLlmTelemetry()).toHaveLength(0);
  });

  it("summarizeLlmTelemetry 聚合 ok/failed/latency/tokens/provider", () => {
    recordLlmCall({
      ts: 0, providerId: "openai", model: "gpt-4o",
      latencyMs: 200, totalTokens: 100, reason: "ok", ok: true,
    });
    recordLlmCall({
      ts: 0, providerId: "openai", model: "gpt-4o",
      latencyMs: 400, totalTokens: 50, reason: "llm_failed", ok: false,
    });
    recordLlmCall({
      ts: 0, providerId: "anthropic", model: "claude-sonnet-4-5",
      latencyMs: 600, totalTokens: 30, reason: "ok", ok: true,
    });
    const s = summarizeLlmTelemetry();
    expect(s.total).toBe(3);
    expect(s.ok).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.avgLatencyMs).toBe(400);
    expect(s.totalTokens).toBe(180);
    expect(s.byProvider.openai.calls).toBe(2);
    expect(s.byProvider.openai.failed).toBe(1);
    expect(s.byProvider.anthropic.calls).toBe(1);
  });

  it("recordLlmOutcome 自动算 latency", () => {
    const t0 = Date.now() - 50;
    recordLlmOutcome({
      t0,
      providerId: "openai",
      model: "gpt-4o",
      ok: true,
      reason: "ok",
      totalTokens: 10,
    });
    const rec = getLlmTelemetry()[0];
    expect(rec.latencyMs).toBeGreaterThanOrEqual(49);
    expect(rec.totalTokens).toBe(10);
    expect(rec.reason).toBe("ok");
  });
});
