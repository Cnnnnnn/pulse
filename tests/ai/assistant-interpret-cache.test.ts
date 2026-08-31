import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ToolResult } from "../../src/ai/assistant-tools";
import {
  ASSISTANT_INTERPRET_CACHE_TTL_MS,
  clearInterpretCache,
  getInterpretCache,
  interpretCacheKey,
  setInterpretCache,
  withInterpretCache,
} from "../../src/ai/assistant-interpret-cache";

describe("assistant-interpret-cache", () => {
  beforeEach(() => {
    clearInterpretCache();
    vi.useRealTimers();
  });

  it("interpretCacheKey is stable for same inputs", () => {
    const a = interpretCacheKey("interpret_finance", { id: "abc" });
    const b = interpretCacheKey("interpret_finance", { id: "abc" });
    expect(a).toBe(b);
  });

  it("withInterpretCache returns cached result on second call", async () => {
    const key = interpretCacheKey("advise_stocks", { intent: "balanced", freeText: "" });
    let calls = 0;
    const mk = async (): Promise<ToolResult> => {
      calls++;
      return { tool: "advise_stocks", ok: true, summary: "ok" };
    };
    const r1 = await withInterpretCache(key, mk);
    const r2 = await withInterpretCache(key, mk);
    expect(calls).toBe(1);
    expect(r1.summary).toBe("ok");
    expect(r2.summary).toContain("助手会话缓存");
  });

  it("does not cache failed results", async () => {
    const key = interpretCacheKey("summarize_ithome", { id: "x" });
    await withInterpretCache(key, async () => ({
      tool: "summarize_ithome",
      ok: false,
      summary: "fail",
    }));
    expect(getInterpretCache(key)).toBeNull();
  });

  it("expires after TTL", () => {
    vi.useFakeTimers();
    const key = "test:1";
    setInterpretCache(key, { tool: "t", ok: true, summary: "a" });
    expect(getInterpretCache(key)?.summary).toBe("a");
    vi.advanceTimersByTime(ASSISTANT_INTERPRET_CACHE_TTL_MS + 1);
    expect(getInterpretCache(key)).toBeNull();
  });
});
