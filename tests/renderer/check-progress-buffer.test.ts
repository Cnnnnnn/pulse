import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgressBuffer } from "../../src/renderer/check-progress-buffer.ts";

describe("createProgressBuffer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces progress events from one session into one flush", () => {
    const flush = vi.fn();
    const buffer = createProgressBuffer(flush);

    buffer.enqueue({ name: "A", _sessionId: "s1" });
    buffer.enqueue({ name: "B", _sessionId: "s1" });

    expect(flush).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(
      [
        { name: "A", _sessionId: "s1" },
        { name: "B", _sessionId: "s1" },
      ],
      "s1",
    );
  });

  it("keeps different session ids isolated", () => {
    const flush = vi.fn();
    const buffer = createProgressBuffer(flush);

    buffer.enqueue({ name: "A", _sessionId: "s1" });
    buffer.enqueue({ name: "B", _sessionId: "s2" });
    vi.runOnlyPendingTimers();

    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledWith([{ name: "A", _sessionId: "s1" }], "s1");
    expect(flush).toHaveBeenCalledWith([{ name: "B", _sessionId: "s2" }], "s2");
  });

  it("flushes immediately and cancels the scheduled timer", () => {
    const flush = vi.fn();
    const buffer = createProgressBuffer(flush);

    buffer.enqueue({ name: "A" });
    buffer.flush();
    vi.runOnlyPendingTimers();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ name: "A" }], undefined);
  });
});
