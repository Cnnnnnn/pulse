import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_OPEN_MS,
  isLlmOpen,
  recordLlmSuccess,
  recordLlmFailure,
  resetLlmBreaker,
  defaultRetryable,
  withRetryBackoff,
} from "../../src/ai/llm-circuit-breaker";

describe("llm-circuit-breaker", () => {
  beforeEach(() => resetLlmBreaker());
  afterEach(() => {
    resetLlmBreaker();
    vi.useRealTimers();
  });

  it("closed 状态累积失败, 达阈值后 open", () => {
    expect(isLlmOpen("openai")).toBe(false);
    recordLlmFailure("openai");
    recordLlmFailure("openai");
    expect(isLlmOpen("openai")).toBe(false); // 未到阈值
    recordLlmFailure("openai");
    expect(isLlmOpen("openai")).toBe(true);
    expect(BREAKER_FAILURE_THRESHOLD).toBe(3);
  });

  it("recordLlmSuccess 重置为 closed", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordLlmFailure("openai");
    expect(isLlmOpen("openai")).toBe(true);
    recordLlmSuccess("openai");
    expect(isLlmOpen("openai")).toBe(false);
  });

  it("open 满 BREAKER_OPEN_MS 后 half-open 放行, 探测失败重新 open", () => {
    vi.useFakeTimers();
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordLlmFailure("openai");
    expect(isLlmOpen("openai")).toBe(true);
    vi.advanceTimersByTime(BREAKER_OPEN_MS + 1);
    expect(isLlmOpen("openai")).toBe(false); // half-open 放行一次探测
    recordLlmFailure("openai"); // 探测失败
    expect(isLlmOpen("openai")).toBe(true); // 重新 open
    vi.useRealTimers();
  });

  it("defaultRetryable 只对 network/timeout/5xx 重试", () => {
    expect(defaultRetryable({ status: 502 })).toBe(true);
    expect(defaultRetryable({ status: 500 })).toBe(true);
    expect(defaultRetryable({ error: "network" })).toBe(true);
    expect(defaultRetryable({ error: "timeout" })).toBe(true);
    expect(defaultRetryable({ status: 401 })).toBe(false);
    expect(defaultRetryable({ status: 200 })).toBe(false);
  });

  it("withRetryBackoff 对 retryable 结果退避重试, 成功即停", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });
    const onRetry = vi.fn();
    const r = await withRetryBackoff(() => fn(), {
      attempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
      onRetry,
    });
    expect(r).toEqual({ status: 200 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("withRetryBackoff 用完 attempts 返回最后结果", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 502 });
    const r = await withRetryBackoff(() => fn(), {
      attempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
    });
    expect(r).toEqual({ status: 502 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("withRetryBackoff 非 retryable 立即返回不重试", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 401 });
    const r = await withRetryBackoff(() => fn(), { attempts: 3, baseDelayMs: 1 });
    expect(r).toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
